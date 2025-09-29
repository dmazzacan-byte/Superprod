const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Helper function to recursively fetch all recipes needed for a product.
 * This is to avoid having to fetch the entire recipes collection.
 * @param {string} productCode The product to get the recipe for.
 * @param {Map<string, any>} recipesCache A map to cache recipes already fetched.
 * @param {firestore.Transaction} transaction The firestore transaction.
 * @returns {Promise<any>} The recipe items.
 */
const getRecipe = async (productCode, recipesCache, transaction) => {
    if (recipesCache.has(productCode)) {
        return recipesCache.get(productCode);
    }
    const recipeRef = db.collection("recipes").doc(productCode);
    const recipeDoc = await transaction.get(recipeRef);
    if (!recipeDoc.exists) {
        return null;
    }
    const recipeData = recipeDoc.data();
    // Ensure recipeData and recipeData.items are valid
    if (!recipeData || !Array.isArray(recipeData.items)) {
        recipesCache.set(productCode, []); // Cache as empty recipe
        return [];
    }
    const recipe = recipeData.items;
    recipesCache.set(productCode, recipe);

    // Recursively fetch sub-recipes
    for (const item of recipe) {
        if (item.type === "product") {
            await getRecipe(item.code, recipesCache, transaction);
        }
    }
    return recipe;
};


/**
 * Server-side version of getBaseMaterials.
 * @param {string} productCode The product code to calculate materials for.
 * @param {number} requiredQty The quantity of the product required.
 * @param {Map<string, any>} recipesCache The cache of all known recipes.
 * @returns {Array<{code: string, quantity: number}>} A list of base materials and their quantities.
 */
const getBaseMaterials = (productCode, requiredQty, recipesCache) => {
    const baseMaterials = {};
    const recipe = recipesCache.get(productCode);

    if (!recipe) {
        return [];
    }

    recipe.forEach((ingredient) => {
        // Add validation for malformed ingredients within a recipe
        if (!ingredient || typeof ingredient.quantity !== "number" || !ingredient.code || !ingredient.type) {
            console.warn(`Skipping malformed ingredient in recipe for ${productCode}:`, JSON.stringify(ingredient));
            return; // Skips this iteration of the loop
        }

        const ingredientQty = ingredient.quantity * requiredQty;
        if (ingredient.type === "product") {
            const subMaterials = getBaseMaterials(
                ingredient.code,
                ingredientQty,
                recipesCache,
            );
            subMaterials.forEach((subMat) => {
                baseMaterials[subMat.code] =
                    (baseMaterials[subMat.code] || 0) + subMat.quantity;
            });
        } else {
            baseMaterials[ingredient.code] =
                (baseMaterials[ingredient.code] || 0) + ingredientQty;
        }
    });

    return Object.entries(baseMaterials).map(([code, quantity]) => ({
        code,
        quantity,
    }));
};

exports.completeOrder = functions.https.onCall(async (data, context) => {
    // 1. Authentication and Validation
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "The function must be called while authenticated.",
        );
    }

    const { orderId, realQty, almacenId } = data;

    if (!orderId || !realQty || !almacenId) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "The function must be called with arguments 'orderId', 'realQty', and 'almacenId'.",
        );
    }
    if (typeof realQty !== "number" || realQty < 0) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "The 'realQty' argument must be a non-negative number.",
        );
    }

    const orderRef = db.collection("productionOrders").doc(orderId.toString());

    try {
        await db.runTransaction(async (transaction) => {
            // 2. Fetch documents within the transaction
            const orderDoc = await transaction.get(orderRef);
            if (!orderDoc.exists) {
                throw new functions.https.HttpsError("not-found", `Order ${orderId} not found.`);
            }

            const orderData = orderDoc.data();
            if (!orderData.product_code || typeof orderData.product_code !== "string" || orderData.product_code.trim() === "") {
                throw new functions.https.HttpsError("failed-precondition", `Order ${orderId} has an invalid or missing product code.`);
            }
            if (orderData.status === "Completada") {
                throw new functions.https.HttpsError("failed-precondition", `Order ${orderId} is already completed.`);
            }

            const recipesCache = new Map();
            await getRecipe(orderData.product_code, recipesCache, transaction);

            // 3. Calculate material requirements
            const baseMaterialsConsumed = getBaseMaterials(orderData.product_code, realQty, recipesCache);
            const materialCodes = new Set(baseMaterialsConsumed.map((m) => m.code));
            if (orderData.product_code) {
                materialCodes.add(orderData.product_code); // Also fetch the finished product
            }

            const materialRefs = [...materialCodes].map((code) => db.collection("materials").doc(code));
            const materialDocs = await transaction.getAll(...materialRefs);
            const materialsMap = new Map(materialDocs.map((doc) => [doc.id, doc.data()]));

            // 4. Validate inventory levels
            for (const mat of baseMaterialsConsumed) {
                const materialData = materialsMap.get(mat.code);
                if (!materialData) {
                    throw new functions.https.HttpsError("not-found", `Material with code ${mat.code} not found.`);
                }
                const stock = materialData.inventario?.[almacenId] || 0;
                if (stock < mat.quantity) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        `Insufficient stock for ${materialData.descripcion} (${mat.code}). Required: ${mat.quantity.toFixed(2)}, Available: ${stock.toFixed(2)} in warehouse ${almacenId}.`,
                    );
                }
            }

            // 5. Perform atomic writes
            // a) Decrement raw materials
            for (const mat of baseMaterialsConsumed) {
                const newStock = (materialsMap.get(mat.code).inventario?.[almacenId] || 0) - mat.quantity;
                const updatePath = `inventario.${almacenId}`;
                transaction.update(db.collection("materials").doc(mat.code), { [updatePath]: newStock });
            }

            // b) Increment finished product
            const finishedProductRef = db.collection("materials").doc(orderData.product_code);
            const finishedProductData = materialsMap.get(orderData.product_code);
            if (finishedProductData) {
                const newStock = (finishedProductData.inventario?.[almacenId] || 0) + realQty;
                const updatePath = `inventario.${almacenId}`;
                transaction.update(finishedProductRef, { [updatePath]: newStock });
            }

            // c) Update the order itself
            const standardCostForRealQty = (orderData.cost_standard_unit || 0) * realQty;
            const finalCost = standardCostForRealQty + (orderData.cost_extra || 0);
            const overcost = orderData.cost_extra || 0;

            transaction.update(orderRef, {
                quantity_produced: realQty,
                status: "Completada",
                completed_at: new Date().toISOString().slice(0, 10),
                almacen_produccion_id: almacenId,
                cost_real: finalCost,
                overcost: overcost,
            });
        });

        console.log(`Transaction for order ${orderId} completed successfully.`);
        return { success: true, message: `Order ${orderId} completed successfully.` };
    } catch (error) {
        console.error(`Transaction for order ${orderId} failed:`, error);
        // Re-throw HttpsError to be caught by the client, or wrap other errors
        if (error instanceof functions.https.HttpsError) {
            throw error;
        } else {
            throw new functions.https.HttpsError("internal", "An unexpected error occurred while completing the order.", error.message);
        }
    }
});