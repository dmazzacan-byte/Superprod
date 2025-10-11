/* ----------  APP STATE  ---------- */

// Este módulo centraliza el estado de la aplicación que antes se manejaba con variables globales.

// --- Local Data Collections ---
export let products = [];
export let recipes = {};
export let productionOrders = [];
export let operators = [];
export let equipos = [];
export let materials = [];
export let vales = [];
export let users = [];
export let almacenes = [];
export let traspasos = [];
export let maintenanceEvents = [];

// --- User & Session State ---
export let currentUserRole = null;
export let unsubscribeProductionOrders = null; // Listener de Firestore

// --- UI & Interaction State ---
export let orderSortDirection = 'desc'; // 'asc' or 'desc' for production orders table
export let isEditingProduct = false;
export let currentProductCode = null;
export let isEditingMaterial = false;
export let currentMaterialCode = null;
export let isEditingOperator = false;
export let currentOperatorId = null;
export let isEditingEquipo = false;
export let currentEquipoId = null;
export let isEditingAlmacen = false;
export let currentAlmacenId = null;
export let isEditingMaintenance = false;
export let isEditingUser = false;

// --- Chart Instances ---
export let costChartInstance = null;
export let productionChartInstance = null;
export let dailyProductionChartInstance = null;
export let dailyOvercostChartInstance = null;
export let availabilityChart = null;
export let downtimeByEquipmentChart = null;

// --- Setters to modify state ---

export function setProducts(newProducts) {
    products = newProducts;
}

export function setRecipes(newRecipes) {
    recipes = newRecipes;
}

export function setProductionOrders(newOrders) {
    productionOrders = newOrders;
}

export function setOperators(newOperators) {
    operators = newOperators;
}

export function setEquipos(newEquipos) {
    equipos = newEquipos;
}

export function setMaterials(newMaterials) {
    materials = newMaterials;
}

export function setVales(newVales) {
    vales = newVales;
}

export function setUsers(newUsers) {
    users = newUsers;
}

export function setAlmacenes(newAlmacenes) {
    almacenes = newAlmacenes.sort((a, b) => a.id.localeCompare(b.id));
}

export function setTraspasos(newTraspasos) {
    traspasos = newTraspasos;
}

export function setMaintenanceEvents(newEvents) {
    maintenanceEvents = newEvents;
}

export function setCurrentUserRole(role) {
    currentUserRole = role;
}

export function setUnsubscribeProductionOrders(unsubscribeFn) {
    unsubscribeProductionOrders = unsubscribeFn;
}

export function setOrderSortDirection(direction) {
    orderSortDirection = direction;
}

// --- Functions to add single items to state ---
export function addProduct(product) {
    products.push(product);
}

export function addMaterial(material) {
    materials.push(material);
}

export function addVale(vale) {
    vales.push(vale);
}

export function addOperator(operator) {
    operators.push(operator);
}

export function addEquipo(equipo) {
    equipos.push(equipo);
}

export function addAlmacen(almacen) {
    almacenes.push(almacen);
    almacenes.sort((a, b) => a.id.localeCompare(b.id)); // Keep sorted
}

export function addMaintenanceEvent(event) {
    maintenanceEvents.push(event);
}

export function addUser(user) {
    users.push(user);
}

// --- Functions to update or delete items ---
export function updateProductInState(code, updatedProduct) {
    const idx = products.findIndex(p => p.codigo === code);
    if (idx !== -1) {
        products[idx] = { ...products[idx], ...updatedProduct };
    }
}

export function deleteProductFromState(code) {
    products = products.filter(p => p.codigo !== code);
}

export function updateMaterialInState(code, updatedMaterial) {
    const idx = materials.findIndex(m => m.codigo === code);
    if (idx !== -1) {
        materials[idx] = { ...materials[idx], ...updatedMaterial };
    }
}

export function deleteMaterialFromState(code) {
    materials = materials.filter(m => m.codigo !== code);
}

export function updateRecipeInState(productId, items) {
    recipes[productId] = items;
}

export function deleteRecipeFromState(productId) {
    delete recipes[productId];
}

export function updateOperatorInState(id, updatedOperator) {
    const idx = operators.findIndex(op => op.id === id);
    if (idx !== -1) {
        operators[idx] = { id, ...updatedOperator };
    }
}

export function deleteOperatorFromState(id) {
    operators = operators.filter(op => op.id !== id);
}

export function updateEquipoInState(id, updatedEquipo) {
    const idx = equipos.findIndex(eq => eq.id === id);
    if (idx !== -1) {
        equipos[idx] = { id, ...updatedEquipo };
    }
}

export function deleteEquipoFromState(id) {
    equipos = equipos.filter(eq => eq.id !== id);
}

export function updateAlmacenInState(id, updatedAlmacen) {
    const idx = almacenes.findIndex(a => a.id === id);
    if (idx !== -1) {
        almacenes[idx] = { id, ...updatedAlmacen };
    }
}

export function deleteAlmacenFromState(id) {
    almacenes = almacenes.filter(a => a.id !== id);
}

export function updateUserInState(uid, updatedUser) {
    const idx = users.findIndex(u => u.uid === uid);
    if (idx > -1) {
        users[idx] = { uid, ...updatedUser };
    }
}

export function deleteUserFromState(uid) {
    users = users.filter(u => u.uid !== uid);
}

export function updateMaintenanceEventInState(id, updatedEvent) {
    const index = maintenanceEvents.findIndex(e => e.id === id);
    if (index > -1) {
        maintenanceEvents[index] = { ...maintenanceEvents[index], ...updatedEvent };
    }
}

export function deleteMaintenanceEventFromState(id) {
    maintenanceEvents = maintenanceEvents.filter(e => e.id !== id);
}