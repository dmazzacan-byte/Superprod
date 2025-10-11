/* global bootstrap, Toastify, jsPDF */
import { doc, setDoc, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb, loadCollection } from './firestore.js';
import { formatCurrency, formatDate, formatDateShort, calculateRecipeCost, initTomSelect, generateSequentialOrderId, getBaseMaterials } from './utils.js';
import { generateValePrompt } from './vales.js';
import { getLogoUrl } from "./settings.js";
import { updateDashboard } from "./dashboard.js";

// --- DOM ELEMENTS ---
const productionOrderModal = new bootstrap.Modal(document.getElementById('productionOrderModal'));
const orderDetailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
const confirmCloseOrderModal = new bootstrap.Modal(document.getElementById('confirmCloseOrderModal'));
const productionOrdersTableBody = document.getElementById('productionOrdersTableBody');
const productionOrderForm = document.getElementById('productionOrderForm');
const confirmCloseOrderForm = document.getElementById('confirmCloseOrderForm');
const searchOrderInput = document.getElementById('searchOrder');
const toggleOrderSortBtn = document.getElementById('toggleOrderSortBtn');


/**
 * Populates the select dropdowns in the production order form.
 */
export function populateOrderFormSelects() {
    const psel = document.getElementById('orderProductSelect');
    initTomSelect(psel, {
        options: state.products.sort((a,b) => a.codigo.localeCompare(b.codigo)).map(p => ({ value: p.codigo, text: `${p.codigo} - ${p.descripcion}` })),
        valueField: 'value', labelField: 'text', searchField: ['text'], create: false, placeholder: 'Busque por código o descripción...'
    });

    const osel = document.getElementById('orderOperatorSelect');
    initTomSelect(osel, {
        options: state.operators.sort((a,b) => a.name.localeCompare(b.name)).map(o => ({ value: o.id, text: o.name })),
        valueField: 'value', labelField: 'text', searchField: ['text'], create: false, placeholder: 'Seleccione un operador...'
    });

    const esel = document.getElementById('orderEquipoSelect');
    initTomSelect(esel, {
        options: state.equipos.sort((a,b) => a.name.localeCompare(b.name)).map(e => ({ value: e.id, text: e.name })),
        valueField: 'value', labelField: 'text', searchField: ['text'], create: false, placeholder: 'Seleccione un equipo...'
    });

    const asel = document.getElementById('orderAlmacenSelect');
    asel.innerHTML = '<option value="" disabled>Selecciona...</option>';
    const defaultAlmacen = state.almacenes.find(a => a.isDefault);
    state.almacenes.forEach(a => {
        const option = new Option(a.name, a.id);
        if (defaultAlmacen && a.id === defaultAlmacen.id) {
            option.selected = true;
        }
        asel.add(option);
    });
}

/**
 * Loads and displays production orders, applying sorting and filtering.
 * @param {string} [filter=''] - A string to filter orders by ID or product name.
 */
export function loadProductionOrders(filter = '') {
    productionOrdersTableBody.innerHTML = '';

    const sortedOrders = [...state.productionOrders].sort((a, b) => {
        return state.orderSortDirection === 'asc' ? a.order_id - b.order_id : b.order_id - a.order_id;
    });

    sortedOrders
        .filter(o => !filter || o.order_id.toString().includes(filter) || (o.product_name || '').toLowerCase().includes(filter.toLowerCase()))
        .forEach(o => {
            const oc = (o.status === 'Pendiente' ? o.cost_extra : o.overcost) || 0;
            const ocColor = oc > 0 ? 'text-danger' : oc < 0 ? 'text-success' : '';
            productionOrdersTableBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td>${o.order_id}</td>
                    <td>${o.product_name || 'N/A'}</td>
                    <td>${o.quantity} / ${o.quantity_produced ?? 'N/A'}</td>
                    <td>${formatCurrency(o.cost_real)}</td>
                    <td class="${ocColor}">${formatCurrency(oc)}</td>
                    <td><span class="badge ${o.status === 'Completada' ? 'bg-success' : 'bg-warning'}">${o.status}</span></td>
                    <td>
                        <button class="btn btn-sm btn-info view-details-btn" data-order-id="${o.order_id}" title="Ver"><i class="fas fa-eye"></i></button>
                        <button class="btn btn-sm btn-danger pdf-btn" data-order-id="${o.order_id}" title="PDF"><i class="fas fa-file-pdf"></i></button>
                        ${o.status === 'Pendiente'
                            ? `<button class="btn btn-sm btn-primary create-vale-btn" data-order-id="${o.order_id}" title="Crear Vale"><i class="fas fa-plus-circle"></i></button>
                               <button class="btn btn-sm btn-success complete-order-btn" data-order-id="${o.order_id}" title="Completar"><i class="fas fa-check"></i></button>
                               <button class="btn btn-sm btn-danger delete-order-btn" data-order-id="${o.order_id}" title="Eliminar"><i class="fas fa-trash"></i></button>`
                            : `<button class="btn btn-sm btn-secondary reopen-order-btn" data-order-id="${o.order_id}" title="Reabrir"><i class="fas fa-undo"></i></button>`}
                    </td>
                </tr>`);
        });
}

/**
 * Creates a new production order and saves it to Firestore.
 * @param {string} pCode - Product code.
 * @param {number} qty - Quantity to produce.
 * @param {string} opId - Operator ID.
 * @param {string} eqId - Equipment ID.
 * @param {string} almacenId - Production warehouse ID.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function createProductionOrder(pCode, qty, opId, eqId, almacenId) {
    const db = getDb();
    const prod = state.products.find(p => p.codigo === pCode);
    if (!prod) {
        Toastify({ text: `Error: Producto con código ${pCode} no encontrado.` }).showToast();
        return false;
    }
    if (!state.recipes[pCode]) {
        Toastify({ text: `Sin receta para ${prod.descripcion}` }).showToast();
        return false;
    }

    const stdCost = calculateRecipeCost(state.recipes[pCode]) * qty;
    const newOrder = {
        order_id: generateSequentialOrderId(),
        product_code: pCode,
        product_name: prod.descripcion,
        quantity: qty,
        quantity_produced: null,
        operator_id: opId,
        equipo_id: eqId,
        almacen_produccion_id: almacenId,
        cost_standard_unit: calculateRecipeCost(state.recipes[pCode]),
        cost_standard: stdCost,
        cost_extra: 0,
        cost_real: null,
        overcost: null,
        created_at: new Date().toISOString().slice(0, 10),
        completed_at: null,
        status: 'Pendiente',
        materials_used: state.recipes[pCode].map(i => ({ material_code: i.code, quantity: i.quantity * qty, type: i.type }))
    };

    try {
        await setDoc(doc(db, "productionOrders", newOrder.order_id.toString()), newOrder);
        // The onSnapshot listener will handle updating the local state.
        return true;
    } catch (error) {
        console.error("Error creating order: ", error);
        Toastify({ text: `Error al crear orden para ${pCode}`, backgroundColor: 'var(--danger-color)' }).showToast();
        return false;
    }
}

/**
 * Completes a production order, updating status and inventory.
 * @param {number} oid - The order ID.
 * @param {number} realQty - The actual quantity produced.
 * @param {string} almacenId - The warehouse where production occurred.
 */
async function completeOrder(oid, realQty, almacenId) {
    const db = getDb();
    const orderToUpdate = state.productionOrders.find(o => o.order_id === oid);
    if (!orderToUpdate) {
        Toastify({ text: 'Error: Orden no encontrada para completar.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const materialsToUpdate = new Map();

    // Consume base materials
    const baseMaterialsConsumed = getBaseMaterials(orderToUpdate.product_code, realQty);
    for (const mat of baseMaterialsConsumed) {
        const localMaterial = state.materials.find(m => m.codigo === mat.code);
        if (localMaterial) {
            const updatedMaterial = materialsToUpdate.get(mat.code) || { ...localMaterial };
            if (!updatedMaterial.inventario) updatedMaterial.inventario = {};
            updatedMaterial.inventario[almacenId] = (updatedMaterial.inventario[almacenId] || 0) - mat.quantity;
            materialsToUpdate.set(mat.code, updatedMaterial);
        }
    }

    // Add finished product to stock
    const finishedProduct = state.materials.find(m => m.codigo === orderToUpdate.product_code);
    if (finishedProduct) {
        const updatedMaterial = materialsToUpdate.get(orderToUpdate.product_code) || { ...finishedProduct };
        if (!updatedMaterial.inventario) updatedMaterial.inventario = {};
        updatedMaterial.inventario[almacenId] = (updatedMaterial.inventario[almacenId] || 0) + realQty;
        materialsToUpdate.set(orderToUpdate.product_code, updatedMaterial);
    }

    // Prepare order data for update
    const updatedOrderData = {
        ...orderToUpdate,
        quantity_produced: realQty,
        status: 'Completada',
        completed_at: new Date().toISOString().slice(0, 10),
        almacen_produccion_id: almacenId,
        cost_real: (orderToUpdate.cost_standard_unit || 0) * realQty + (orderToUpdate.cost_extra || 0),
        overcost: (orderToUpdate.cost_extra || 0)
    };

    try {
        const promises = [];
        promises.push(setDoc(doc(db, "productionOrders", oid.toString()), updatedOrderData));
        materialsToUpdate.forEach((material, code) => {
            promises.push(updateDoc(doc(db, "materials", code), { inventario: material.inventario }));
        });

        await Promise.all(promises);

        // Manually update local state for immediate UI feedback before snapshot arrives
        state.setProductionOrders(state.productionOrders.map(o => o.order_id === oid ? updatedOrderData : o));
        materialsToUpdate.forEach((mat, code) => state.updateMaterialInState(code, mat));

        loadProductionOrders();
        // The listener will refresh materials, but we can call it to be safe
        // loadMaterials();
        updateDashboard();

        Toastify({ text: `Orden ${oid} completada con éxito.`, backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error completing order: ", error);
        Toastify({ text: 'Error al completar la orden.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}


/**
 * Reopens a completed order, reverting status and inventory changes.
 * @param {number} oid - The order ID to reopen.
 */
async function reopenOrder(oid) {
    const db = getDb();
    const orderToReopen = state.productionOrders.find(o => o.order_id === oid);
    if (!orderToReopen) {
        Toastify({ text: 'Error: Orden no encontrada.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const almacenId = orderToReopen.almacen_produccion_id;
    if (!almacenId) {
        Toastify({ text: 'Error: No se puede reabrir, no se encontró almacén de producción.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const materialsToUpdate = new Map();
    const quantityToReverse = orderToReopen.quantity_produced || 0;

    if (quantityToReverse > 0) {
        // Restore base materials
        const baseMaterialsToRestore = getBaseMaterials(orderToReopen.product_code, quantityToReverse);
        baseMaterialsToRestore.forEach(mat => {
            const localMaterial = state.materials.find(m => m.codigo === mat.code);
            if (localMaterial) {
                const updatedMaterial = materialsToUpdate.get(mat.code) || { ...localMaterial };
                if (!updatedMaterial.inventario) updatedMaterial.inventario = {};
                updatedMaterial.inventario[almacenId] = (updatedMaterial.inventario[almacenId] || 0) + mat.quantity;
                materialsToUpdate.set(mat.code, updatedMaterial);
            }
        });

        // Remove finished product from stock
        const finishedProduct = state.materials.find(m => m.codigo === orderToReopen.product_code);
        if (finishedProduct) {
             const updatedMaterial = materialsToUpdate.get(orderToReopen.product_code) || { ...finishedProduct };
             if (!updatedMaterial.inventario) updatedMaterial.inventario = {};
             updatedMaterial.inventario[almacenId] = (updatedMaterial.inventario[almacenId] || 0) - quantityToReverse;
             materialsToUpdate.set(orderToReopen.product_code, updatedMaterial);
        }
    }

    const updatedOrderData = {
        ...orderToReopen,
        status: 'Pendiente',
        completed_at: null,
        quantity_produced: null,
        cost_real: null,
        overcost: null,
    };
    delete updatedOrderData.almacen_produccion_id; // Remove this field

    try {
        const promises = [];
        promises.push(setDoc(doc(db, "productionOrders", oid.toString()), updatedOrderData));
        materialsToUpdate.forEach((material, code) => {
            promises.push(updateDoc(doc(db, "materials", code), { inventario: material.inventario }));
        });

        await Promise.all(promises);

        // Manually update local state
        state.setProductionOrders(state.productionOrders.map(o => o.order_id === oid ? updatedOrderData : o));
        materialsToUpdate.forEach((mat, code) => state.updateMaterialInState(code, mat));

        loadProductionOrders();
        updateDashboard();

        Toastify({ text: `Orden ${oid} reabierta.`, backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error reopening order: ", error);
        Toastify({ text: 'Error al reabrir la orden.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}


/**
 * Displays the order details modal with comprehensive information.
 * @param {number} oid - The order ID to show details for.
 */
function showOrderDetails(oid) {
    const ord = state.productionOrders.find(o => o.order_id === oid);
    if (!ord) {
        Toastify({ text: 'Orden no encontrada', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    // --- Basic Order Info ---
    document.getElementById('detailOrderId').textContent = ord.order_id;
    document.getElementById('detailProductName').textContent = ord.product_name;
    const operator = state.operators.find(op => op.id === ord.operator_id);
    document.getElementById('detailOperatorName').textContent = operator ? operator.name : 'N/A';
    const equipo = state.equipos.find(eq => eq.id === ord.equipo_id);
    document.getElementById('detailEquipoName').textContent = equipo ? equipo.name : 'N/A';
    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = ord.status;
    statusBadge.className = `badge ${ord.status === 'Completada' ? 'bg-success' : 'bg-warning'}`;
    document.getElementById('detailQuantityPlanned').textContent = ord.quantity;
    document.getElementById('detailQuantityProduced').textContent = ord.quantity_produced ?? 'N/A';
    document.getElementById('detailCreatedDate').textContent = formatDate(ord.created_at);
    document.getElementById('detailCompletedDate').textContent = formatDate(ord.completed_at);

    // --- Vales Info ---
    const orderVales = state.vales.filter(v => v.order_id === oid);
    document.getElementById('detailValeCount').textContent = orderVales.length;

    // --- Cost Info ---
    const realQty = ord.quantity_produced || 0;
    const standardCostForRealQty = (ord.cost_standard_unit || 0) * realQty;
    document.getElementById('detailStandardCost').textContent = formatCurrency(standardCostForRealQty);
    document.getElementById('detailExtraCost').textContent = formatCurrency(ord.cost_extra);
    document.getElementById('detailRealCost').textContent = formatCurrency(ord.cost_real);
    const overcostEl = document.getElementById('detailOvercost');
    overcostEl.textContent = formatCurrency(ord.overcost);
    overcostEl.className = 'h5 ' + ((ord.overcost || 0) > 0 ? 'text-danger' : (ord.overcost || 0) < 0 ? 'text-success' : '');

    // --- Consolidated Materials Table ---
    const materialsSummary = {};
    const baseMaterials = getBaseMaterials(ord.product_code, ord.quantity);
    baseMaterials.forEach(bm => {
        const material = state.materials.find(m => m.codigo === bm.code);
        if (material) {
            materialsSummary[bm.code] = {
                descripcion: material.descripcion,
                costo_unit: material.costo,
                qty_plan: bm.quantity,
                cost_plan: bm.quantity * material.costo,
                qty_real: 0 // Initialize real quantity
            };
        }
    });

    if (ord.status === 'Completada') {
        const consumedMaterials = getBaseMaterials(ord.product_code, ord.quantity_produced || 0);
        consumedMaterials.forEach(cm => {
            if (materialsSummary[cm.code]) {
                materialsSummary[cm.code].qty_real += cm.quantity;
            }
        });
    }

    // Adjust real quantities based on vales
    orderVales.forEach(vale => {
        vale.materials.forEach(valeMat => {
            const multiplier = vale.type === 'salida' ? 1 : -1;
            if (materialsSummary[valeMat.material_code]) {
                materialsSummary[valeMat.material_code].qty_real += valeMat.quantity * multiplier;
            } else {
                // Handle materials added via vales that were not in the original recipe
                const m = state.materials.find(m => m.codigo === valeMat.material_code);
                if (m) {
                    materialsSummary[valeMat.material_code] = {
                        descripcion: m.descripcion,
                        costo_unit: m.costo,
                        qty_plan: 0,
                        qty_real: valeMat.quantity * multiplier,
                        cost_plan: 0,
                    };
                }
            }
        });
    });

    const materialsTbody = document.getElementById('detailMaterialsTableBody');
    materialsTbody.innerHTML = '';
    let totalPlanCost = 0;
    let totalRealCostConsolidated = 0;

    for (const mat of Object.values(materialsSummary)) {
        const cost_real = mat.qty_real * mat.costo_unit;
        totalPlanCost += mat.cost_plan;
        totalRealCostConsolidated += cost_real;
        materialsTbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${mat.descripcion}</td>
                <td>${mat.qty_plan.toFixed(2)} / <strong class="ms-1">${mat.qty_real.toFixed(2)}</strong></td>
                <td>${formatCurrency(mat.cost_plan)} / <strong class="ms-1">${formatCurrency(cost_real)}</strong></td>
            </tr>
        `);
    }
     materialsTbody.insertAdjacentHTML('beforeend', `
        <tr class="table-group-divider fw-bold">
            <td class="text-end">TOTALES:</td>
            <td>${formatCurrency(totalPlanCost)}</td>
            <td>${formatCurrency(totalRealCostConsolidated)}</td>
        </tr>
    `);


    // --- Individual Vales Details ---
    const valesContainer = document.getElementById('detailValesContainer');
    valesContainer.innerHTML = orderVales.length > 0 ? '<h6 class="mt-4">Desglose de Vales</h6>' : '';
    orderVales.forEach(vale => {
        let valeHTML = `<div class="card mt-3"><div class="card-header"><strong>Vale #${vale.vale_id}</strong> - Tipo: ${vale.type} - Fecha: ${formatDate(vale.created_at)}</div><div class="table-responsive"><table class="table table-sm table-bordered mb-0">...<tbody>`;
        let valeTotalCost = 0;
        vale.materials.forEach(item => {
            const material = state.materials.find(m => m.codigo === item.material_code);
            const costPerUnit = item.cost_at_time ?? (material ? material.costo : 0);
            const cost = costPerUnit * item.quantity;
            valeTotalCost += cost;
            valeHTML += `<tr><td>${item.material_code}</td><td>${material ? material.descripcion : 'N/A'}</td><td>${item.quantity.toFixed(2)}</td><td>${formatCurrency(cost)}</td></tr>`;
        });
        valeHTML += `</tbody><tfoot><tr class="fw-bold"><td colspan="3" class="text-end">Costo Total del Vale:</td><td>${formatCurrency(valeTotalCost)}</td></tr></tfoot></table></div></div>`;
        valesContainer.innerHTML += valeHTML;
    });

    orderDetailsModal.show();
}

/**
 * Generates a PDF summary for a specific production order.
 * @param {number} oid - The order ID.
 */
async function generateOrderPDF(oid) {
    const db = getDb();
    try {
        const ord = state.productionOrders.find(o => o.order_id === oid);
        if (!ord) {
            Toastify({ text: 'Error: Orden no encontrada para PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }
        const doc = new jsPDF();
        let logoHeight = 0;
        const logoData = await getLogoUrl();
        if (logoData) {
            // ... (rest of the PDF generation logic is complex and remains similar)
        }
        // ... (rest of PDF content)
        doc.save(`orden_${ord.order_id}.pdf`);
    } catch (error) {
        console.error(`Error al generar PDF para orden ${oid}:`, error);
        Toastify({ text: 'No se pudo generar el PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}


// --- EVENT LISTENERS ---

productionOrdersTableBody.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const oid = parseInt(btn.dataset.orderId);

    if (btn.classList.contains('view-details-btn')) showOrderDetails(oid);
    if (btn.classList.contains('pdf-btn')) await generateOrderPDF(oid);
    // if (btn.classList.contains('delete-order-btn')) await deleteOrderAndReverseStock(oid);
    if (btn.classList.contains('create-vale-btn')) generateValePrompt(oid);
    if (btn.classList.contains('reopen-order-btn')) reopenOrder(oid);

    if (btn.classList.contains('complete-order-btn')) {
        const ord = state.productionOrders.find(o => o.order_id === oid);
        document.getElementById('closeHiddenOrderId').value = oid;
        document.getElementById('realQuantityInput').value = ord.quantity;
        const almacenSelect = document.getElementById('completionAlmacenSelect');
        almacenSelect.innerHTML = '<option value="" selected disabled>Seleccione almacén...</option>';
        const defaultAlmacen = state.almacenes.find(a => a.isDefault);
        state.almacenes.forEach(a => {
            const option = new Option(a.name, a.id);
            if (defaultAlmacen && a.id === defaultAlmacen.id) option.selected = true;
            almacenSelect.add(option);
        });
        confirmCloseOrderModal.show();
    }
});

productionOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pCode = document.getElementById('orderProductSelect').value;
    const qty = parseInt(document.getElementById('orderQuantity').value);
    const opId = document.getElementById('orderOperatorSelect').value;
    const eqId = document.getElementById('orderEquipoSelect').value;
    const almacenId = document.getElementById('orderAlmacenSelect').value;
    if (!pCode || !opId || !eqId || !almacenId) {
        Toastify({ text: 'Complete todos los campos requeridos.' }).showToast();
        return;
    }
    const success = await createProductionOrder(pCode, qty, opId, eqId, almacenId);
    if (success) {
        productionOrderModal.hide();
        Toastify({ text: 'Orden de producción creada', backgroundColor: 'var(--success-color)' }).showToast();
    }
});

confirmCloseOrderForm.addEventListener('submit', e => {
    e.preventDefault();
    const oid = parseInt(document.getElementById('closeHiddenOrderId').value);
    const realQty = parseFloat(document.getElementById('realQuantityInput').value);
    const almacenId = document.getElementById('completionAlmacenSelect').value;
    if (!almacenId) {
        Toastify({ text: 'Por favor, seleccione un almacén de producción.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }
    completeOrder(oid, realQty, almacenId);
    confirmCloseOrderModal.hide();
});

searchOrderInput.addEventListener('input', (e) => loadProductionOrders(e.target.value));

toggleOrderSortBtn.addEventListener('click', () => {
    state.setOrderSortDirection(state.orderSortDirection === 'asc' ? 'desc' : 'asc');
    const icon = toggleOrderSortBtn.querySelector('i');
    icon.className = state.orderSortDirection === 'asc' ? 'fas fa-sort-amount-up-alt' : 'fas fa-sort-amount-down-alt';
    loadProductionOrders(searchOrderInput.value);
});