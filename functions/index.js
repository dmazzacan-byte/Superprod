const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });

admin.initializeApp();
const db = admin.firestore();

// Helper function to get all documents from a collection
const loadCollection = async (collectionName) => {
    try {
        const snapshot = await db.collection(collectionName).get();
        const data = [];
        snapshot.forEach(doc => {
            const docData = doc.data();
            docData.id = doc.id; // Use a consistent ID field
            data.push(docData);
        });
        return data;
    } catch (error) {
        console.error(`Error loading collection ${collectionName}:`, error);
        throw new functions.https.HttpsError('internal', `Failed to load ${collectionName}.`);
    }
};

// Helper function to load recipes into a key-value object
const loadRecipesCollection = async () => {
    try {
        const snapshot = await db.collection('recipes').get();
        const recipesData = {};
        snapshot.forEach(doc => {
            recipesData[doc.id] = doc.data().items;
        });
        return recipesData;
    } catch (error) {
        console.error("Error loading recipes collection:", error);
        throw new functions.https.HttpsError('internal', 'Failed to load recipes.');
    }
};


// Helper function to get intermediate product codes
const getIntermediateProductCodes = (recipes) => {
    const intermediateProducts = new Set();
    Object.values(recipes).flat().forEach(ing => {
        if (ing && ing.type === 'product') {
            intermediateProducts.add(ing.code);
        }
    });
    return intermediateProducts;
};


// Helper function to calculate base materials for a product
const getBaseMaterials = (productCode, requiredQty, recipes) => {
    const baseMaterials = {};
    const recipe = recipes[productCode];

    if (!recipe) return [];

    recipe.forEach(ingredient => {
        const ingredientQty = ingredient.quantity * requiredQty;
        if (ingredient.type === 'product') {
            const subMaterials = getBaseMaterials(ingredient.code, ingredientQty, recipes);
            subMaterials.forEach(subMat => {
                baseMaterials[subMat.code] = (baseMaterials[subMat.code] || 0) + subMat.quantity;
            });
        } else {
            baseMaterials[ingredient.code] = (baseMaterials[ingredient.code] || 0) + ingredientQty;
        }
    });

    return Object.entries(baseMaterials).map(([code, quantity]) => ({ code, quantity }));
};


exports.getDashboardData = functions.runWith({ memory: '512MB', timeoutSeconds: 60 }).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { lowStockThreshold, almacenId } = data;

    try {
        // 1. Fetch all necessary data in parallel
        const [
            productionOrders,
            operators,
            equipos,
            materials,
            recipes,
            products,
            almacenes
        ] = await Promise.all([
            loadCollection('productionOrders'),
            loadCollection('operators'),
            loadCollection('equipos'),
            loadCollection('materials'),
            loadRecipesCollection(),
            loadCollection('products'),
            loadCollection('almacenes')
        ]);

        // 2. Perform Calculations
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const completedThisMonth = productionOrders.filter(o => {
            if (o.status !== 'Completada' || !o.completed_at) return false;
            // Handle both ISO string and Firestore Timestamp dates
            const orderDate = o.completed_at._seconds ? new Date(o.completed_at._seconds * 1000) : new Date(o.completed_at);
            return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
        });

        const pendingOrders = productionOrders.filter(o => o.status === 'Pendiente').length;

        const intermediateProducts = getIntermediateProductCodes(recipes);
        const finalProductOrdersThisMonth = completedThisMonth.filter(o => !intermediateProducts.has(o.product_code));

        // KPIs
        const totalProduction = finalProductOrdersThisMonth.reduce((acc, o) => acc + (o.quantity_produced || 0), 0);
        const totalRealCost = finalProductOrdersThisMonth.reduce((acc, o) => acc + (o.cost_real || 0), 0);
        const totalOvercost = completedThisMonth.reduce((acc, o) => acc + (o.overcost || 0), 0);

        const kpis = {
            pendingOrders: pendingOrders,
            completedOrders: completedThisMonth.length,
            totalProduction: totalProduction,
            totalRealCost: totalRealCost,
            totalOvercost: totalOvercost,
        };

        // Rankings
        const operatorStats = {};
        completedThisMonth.forEach(o => {
            const opId = o.operator_id;
            if (!operatorStats[opId]) {
                operatorStats[opId] = { name: operators.find(op => op.id === opId)?.name || opId, production: 0, overcost: 0 };
            }
            operatorStats[opId].production += o.quantity_produced || 0;
            operatorStats[opId].overcost += o.overcost || 0;
        });

        const equipoStats = {};
        completedThisMonth.forEach(o => {
            const eqId = o.equipo_id;
            if (!equipoStats[eqId]) {
                equipoStats[eqId] = { name: equipos.find(eq => eq.id === eqId)?.name || eqId, production: 0 };
            }
            equipoStats[eqId].production += o.quantity_produced || 0;
        });

        const rankings = {
            byProduction: Object.values(operatorStats).sort((a, b) => b.production - a.production),
            byOvercost: Object.values(operatorStats).sort((a, b) => b.overcost - a.overcost),
            byEquipo: Object.values(equipoStats).sort((a, b) => b.production - a.production)
        };

        // Low Stock Alerts
        const materialsInRecipes = new Set();
        for (const productId of Object.keys(recipes)) {
            const baseMats = getBaseMaterials(productId, 1, recipes);
            baseMats.forEach(mat => materialsInRecipes.add(mat.code));
        }

        const lowStockAlertsRaw = [];
        materials
            .filter(m => materialsInRecipes.has(m.id))
            .forEach(m => {
                if (!m.inventario) return;
                const almacenesToCheck = almacenId === 'all' ? Object.keys(m.inventario) : [almacenId];
                almacenesToCheck.forEach(almacenKey => {
                    if (m.inventario[almacenKey] < lowStockThreshold) {
                        const almacen = almacenes.find(a => a.id === almacenKey);
                        lowStockAlertsRaw.push({
                            material: m,
                            almacenName: almacen ? almacen.name : almacenKey,
                            stock: m.inventario[almacenKey]
                        });
                    }
                });
            });

        lowStockAlertsRaw.sort((a, b) => a.stock - b.stock);

        const affectedProductsByMaterial = {};
        lowStockAlertsRaw.forEach(alert => {
            const mCode = alert.material.id;
            if (!affectedProductsByMaterial[mCode]) {
                affectedProductsByMaterial[mCode] = new Set();
                Object.keys(recipes).forEach(productId => {
                    const baseMaterials = getBaseMaterials(productId, 1, recipes);
                    if (baseMaterials.some(bm => bm.code === mCode)) {
                        const product = products.find(p => p.id === productId);
                        if (product) {
                            affectedProductsByMaterial[mCode].add(product.descripcion);
                        }
                    }
                });
            }
        });

        const lowStockAlerts = lowStockAlertsRaw.map(alert => ({
            materialName: alert.material.descripcion,
            almacenName: alert.almacenName,
            stock: alert.stock,
            unit: alert.material.unidad,
            affectedProducts: [...affectedProductsByMaterial[alert.material.id]]
        }));

        // Chart Data
        const costMap = {};
        const prodMap = {};
        finalProductOrdersThisMonth.forEach(o => {
            if (!costMap[o.product_name]) {
                costMap[o.product_name] = { total_cost: 0, total_qty: 0 };
            }
            costMap[o.product_name].total_cost += o.cost_real || 0;
            costMap[o.product_name].total_qty += o.quantity_produced || 0;
            prodMap[o.product_name] = (prodMap[o.product_name] || 0) + (o.quantity_produced || 0);
        });

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const dailyProductionData = Array(daysInMonth).fill(0);
        const dailyOvercostData = Array(daysInMonth).fill(0);

        completedThisMonth.forEach(o => {
            const dayOfMonth = (o.completed_at._seconds ? new Date(o.completed_at._seconds * 1000) : new Date(o.completed_at)).getDate() - 1;
            dailyOvercostData[dayOfMonth] += o.overcost || 0;
        });

        finalProductOrdersThisMonth.forEach(o => {
            const dayOfMonth = (o.completed_at._seconds ? new Date(o.completed_at._seconds * 1000) : new Date(o.completed_at)).getDate() - 1;
            dailyProductionData[dayOfMonth] += o.quantity_produced || 0;
        });

        const topProd = Object.entries(prodMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);
        const topUnitCost = Object.entries(costMap).map(([name, data]) => ({ name, unit_cost: data.total_qty > 0 ? data.total_cost / data.total_qty : 0 })).sort((a, b) => b.unit_cost - a.unit_cost).slice(0, 5);

        const charts = {
            productionChart: { labels: topProd.map(x => x.name), data: topProd.map(x => x.qty) },
            dailyProductionChart: { data: dailyProductionData },
            costChart: { labels: topUnitCost.map(x => x.name), data: topUnitCost.map(x => x.unit_cost) },
            dailyOvercostChart: { data: dailyOvercostData }
        };

        // 3. Return combined result
        return {
            kpis,
            rankings,
            lowStockAlerts,
            charts
        };

    } catch (error) {
        console.error("Error in getDashboardData function:", error);
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred while fetching dashboard data.', error.message);
    }
});


exports.getReportsData = functions.runWith({ memory: '1GB', timeoutSeconds: 120 }).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { startDate, endDate, productId, operatorId, equipoId, almacenId } = data;

    try {
        const [
            productionOrders,
            operators,
            equipos,
            materials,
            recipes,
            vales
        ] = await Promise.all([
            loadCollection('productionOrders'),
            loadCollection('operators'),
            loadCollection('equipos'),
            loadCollection('materials'),
            loadRecipesCollection(),
            loadCollection('vales')
        ]);

        // 1. Filter Orders
        const filteredOrders = productionOrders.filter(o => {
            if (o.status !== 'Completada') return false;
            if (startDate && endDate) {
                const completedAt = o.completed_at._seconds ? new Date(o.completed_at._seconds * 1000) : new Date(o.completed_at);
                if (completedAt < new Date(startDate) || completedAt > new Date(endDate)) return false;
            }
            if (productId && productId !== 'all' && o.product_code !== productId) return false;
            if (operatorId && operatorId !== 'all' && o.operator_id !== operatorId) return false;
            if (equipoId && equipoId !== 'all' && o.equipo_id !== equipoId) return false;
            if (almacenId && almacenId !== 'all' && o.almacen_produccion_id !== almacenId) return false;
            return true;
        });

        const intermediateProductCodes = getIntermediateProductCodes(recipes);
        const finalOrders = filteredOrders.filter(o => !intermediateProductCodes.has(o.product_code));
        const intermediateOrders = filteredOrders.filter(o => intermediateProductCodes.has(o.product_code));

        // 2. Generate Reports
        // Detailed Orders Report
        const detailedOrdersReport = filteredOrders.map(o => ({
            order_id: o.order_id,
            product_name: o.product_name,
            operator_name: operators.find(op => op.id === o.operator_id)?.name || 'N/A',
            quantity_plan: o.quantity,
            quantity_real: o.quantity_produced || 0,
            cost_real: o.cost_real || 0,
            overcost: o.overcost || 0,
            status: o.status,
            completed_at: o.completed_at
        }));

        // Operator Reports
        const generateOperatorReport = (orders) => {
            const report = {};
            orders.forEach(o => {
                const op = operators.find(op => op.id === o.operator_id);
                const name = op ? op.name : o.operator_id;
                if (!report[name]) report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
                report[name].completed++;
                report[name].units += o.quantity_produced || 0;
                report[name].cost += o.cost_real || 0;
                report[name].over += o.overcost || 0;
            });
            return Object.entries(report).map(([name, data]) => ({ name, ...data }));
        };

        // Product Reports
        const generateProductReport = (orders) => {
            const report = {};
            orders.forEach(o => {
                const name = o.product_name;
                if (!report[name]) report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
                report[name].completed++;
                report[name].units += o.quantity_produced || 0;
                report[name].cost += o.cost_real || 0;
                report[name].over += o.overcost || 0;
            });
            return Object.entries(report).map(([name, data]) => ({ name, ...data }));
        };

        // Equipo Report
        const generateEquipoReport = (orders) => {
            const report = {};
            orders.forEach(o => {
                const eq = equipos.find(e => e.id === o.equipo_id);
                const name = eq ? eq.name : o.equipo_id;
                if (!report[name]) report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
                report[name].completed++;
                report[name].units += o.quantity_produced || 0;
                report[name].cost += o.cost_real || 0;
                report[name].over += o.overcost || 0;
            });
            return Object.entries(report).map(([name, data]) => ({ name, ...data }));
        };

        // Material Consumption Report
        const generateMaterialConsumptionReport = (orders) => {
            const report = {};
            const orderIds = new Set(orders.map(o => o.id));
            const relevantVales = vales.filter(v => orderIds.has(v.order_id.toString()));

            const addMaterialToReport = (materialCode, quantity) => {
                const material = materials.find(m => m.id === materialCode);
                if (!material) return;
                if (!report[materialCode]) report[materialCode] = { qty: 0, cost: 0, desc: material.descripcion };
                report[materialCode].qty += quantity;
                report[materialCode].cost += quantity * material.costo;
            };

            orders.forEach(o => {
                const baseMaterials = getBaseMaterials(o.product_code, o.quantity_produced || 0, recipes);
                baseMaterials.forEach(bm => addMaterialToReport(bm.code, bm.quantity));
            });

            relevantVales.forEach(vale => {
                const multiplier = vale.type === 'salida' ? 1 : -1;
                vale.materials.forEach(m => addMaterialToReport(m.material_code, m.quantity * multiplier));
            });
            return Object.values(report);
        };

        // 3. Return all reports
        return {
            detailedOrders: detailedOrdersReport,
            operatorReportFinal: generateOperatorReport(finalOrders),
            productReportFinal: generateProductReport(finalOrders),
            operatorReportIntermediate: generateOperatorReport(intermediateOrders),
            productReportIntermediate: generateProductReport(intermediateOrders),
            equipoReport: generateEquipoReport(filteredOrders),
            materialConsumption: generateMaterialConsumptionReport(filteredOrders)
        };

    } catch (error) {
        console.error("Error in getReportsData function:", error);
        throw new functions.https.HttpsError('internal', 'An unexpected error occurred while fetching report data.', error.message);
    }
});