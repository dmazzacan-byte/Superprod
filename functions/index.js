const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Calculates the standard cost of a given recipe.
 * This function recursively calculates the cost for nested products.
 * @param {Array} items The items in the recipe.
 * @param {Object} allRecipes All available recipes.
 * @param {Array} allMaterials All available materials.
 * @return {number} The calculated cost.
 */
function calculateRecipeCost(items, allRecipes, allMaterials) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  return items.reduce((acc, it) => {
    if (!it || !it.type || !it.code) return acc;

    if (it.type === "product") {
      const nestedRecipe = allRecipes[it.code];
      const costOfSubProduct = nestedRecipe ?
        calculateRecipeCost(nestedRecipe, allRecipes, allMaterials) : 0;
      return acc + (costOfSubProduct * it.quantity);
    } else {
      const material = allMaterials.find((m) => m.codigo === it.code);
      const costOfMaterial = material ? (material.costo || 0) : 0;
      return acc + (costOfMaterial * it.quantity);
    }
  }, 0);
}

/**
 * Recursively gets the base materials for a given product and quantity.
 * @param {string} productCode The code of the product.
 * @param {number} requiredQty The quantity of the product required.
 * @param {Object} allRecipes All available recipes.
 * @return {Array<{code: string, quantity: number}>} A list of base materials.
 */
function getBaseMaterials(productCode, requiredQty, allRecipes) {
  const baseMaterials = {};
  const recipe = allRecipes[productCode];

  if (!recipe) return [];

  recipe.forEach((ingredient) => {
    const ingredientQty = ingredient.quantity * requiredQty;
    if (ingredient.type === "product") {
      const subMaterials = getBaseMaterials(
          ingredient.code,
          ingredientQty,
          allRecipes,
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

  return Object.entries(baseMaterials)
      .map(([code, quantity]) => ({code, quantity}));
}


exports.completeOrder = functions.https.onCall(async (data, context) => {
  // 1. Authentication Check
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  // 2. Input validation
  const {orderId, realQty, almacenId} = data;
  if (!orderId || !realQty || !almacenId || realQty <= 0) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "The function must be called with correct arguments.",
    );
  }

  const orderRef = db.collection("productionOrders").doc(orderId.toString());

  try {
    // 3. Run as a transaction
    await db.runTransaction(async (transaction) => {
      // --- Fetch all required data within the transaction ---
      const orderDoc = await transaction.get(orderRef);

      if (!orderDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Order not found");
      }

      const orderData = orderDoc.data();

      if (orderData.status === "Completada") {
        // Order is already complete, no need to do anything.
        // Returning a success message as the state is what user wants.
        return {status: "success", message: "Order was already completed."};
      }

      const recipesSnapshot = await transaction.get(db.collection("recipes"));
      const allRecipes = {};
      recipesSnapshot.forEach((doc) => {
        allRecipes[doc.id] = doc.data().items;
      });

      const materialsSnapshot = await transaction.get(db.collection("materials"));
      const allMaterials = [];
      materialsSnapshot.forEach((doc) => {
        allMaterials.push({codigo: doc.id, ...doc.data()});
      });

      // --- Main Logic ---
      const baseMaterialsConsumed = getBaseMaterials(
          orderData.product_code,
          realQty,
          allRecipes,
      );

      // --- Update Material Stock ---
      const materialUpdatePromises = [];

      // a. Decrement stock for consumed materials
      for (const mat of baseMaterialsConsumed) {
        const materialRef = db.collection("materials").doc(mat.code);
        const stockUpdatePath = `inventario.${almacenId}`;
        materialUpdatePromises.push(transaction.update(materialRef, {
          [stockUpdatePath]: admin.firestore.FieldValue.increment(-mat.quantity),
        }));
      }

      // b. Increment stock for the finished product
      const finishedProductRef = db.collection("materials")
          .doc(orderData.product_code);
      const stockUpdatePath = `inventario.${almacenId}`;
      materialUpdatePromises.push(transaction.update(finishedProductRef, {
        [stockUpdatePath]: admin.firestore.FieldValue.increment(realQty),
      }));

      // --- Calculate Costs ---
      const standardCostForRealQty =
        (orderData.cost_standard_unit || 0) * realQty;
      const finalRealCost = standardCostForRealQty + (orderData.cost_extra || 0);
      const finalOvercost = orderData.cost_extra || 0;

      // --- Update Production Order ---
      transaction.update(orderRef, {
        quantity_produced: realQty,
        status: "Completada",
        completed_at: new Date().toISOString().slice(0, 10),
        almacen_produccion_id: almacenId,
        cost_real: finalRealCost,
        overcost: finalOvercost,
      });
    });

    // 4. Return success
    return {
      status: "success",
      message: `Order ${orderId} completed successfully.`,
    };
  } catch (error) {
    console.error("Error completing order:", error);
    // 5. Return error
    if (error instanceof functions.https.HttpsError) {
      throw error;
    } else {
      throw new functions.https.HttpsError(
          "internal",
          "An unexpected error occurred while completing the order.",
          error.message,
      );
    }
  }
});