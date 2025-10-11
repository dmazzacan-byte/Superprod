/* global bootstrap, Toastify */
import { doc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { initTomSelect, generateValePDF } from './utils.js';
import { loadProductionOrders } from './orders.js';
import { loadMaterials } from './materials.js';

// --- DOM ELEMENTS ---
const valeModal = new bootstrap.Modal(document.getElementById('valeModal'));
const valeForm = document.getElementById('valeForm');
const valeMaterialsTableBody = document.getElementById('valeMaterialsTableBody');
const addFreeFormRowBtn = document.getElementById('addFreeFormValeRowBtn');

/**
 * Adds a row to the vale form for adding a material not in the original recipe.
 */
function addFreeFormValeRow() {
    const tr = document.createElement('tr');
    tr.classList.add('free-form-row');

    const codeCell = document.createElement('td');
    const descCell = document.createElement('td');
    const stockCell = document.createElement('td');
    const qtyCell = document.createElement('td');
    const actionCell = document.createElement('td');

    const codeSelect = document.createElement('select');
    const stockSpan = document.createElement('span');
    stockSpan.className = 'vale-material-stock small';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'form-control form-control-sm vale-material-qty';
    qtyInput.min = "0";
    qtyInput.step = "0.01";
    qtyInput.value = "0";
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.onclick = () => tr.remove();


    codeCell.appendChild(codeSelect);
    stockCell.appendChild(stockSpan);
    qtyCell.appendChild(qtyInput);
    actionCell.appendChild(deleteBtn);

    tr.append(codeCell, descCell, stockCell, qtyCell, actionCell);
    valeMaterialsTableBody.appendChild(tr);

    const tomSelectInstance = initTomSelect(codeSelect, {
        options: state.materials.sort((a,b) => a.descripcion.localeCompare(b.descripcion)).map(m => ({
            value: m.codigo,
            text: `${m.codigo} - ${m.descripcion}`
        })),
        valueField: 'value', labelField: 'text', searchField: ['text'], create: false, placeholder: 'Busque un material...'
    });

    if (tomSelectInstance) {
        tomSelectInstance.on('change', (selectedCode) => {
            const material = state.materials.find(m => m.codigo === selectedCode);
            if (material) {
                descCell.textContent = material.descripcion;
                const almacenId = document.getElementById('valeAlmacen').value;
                const stock = material.inventario ? (material.inventario[almacenId] || 0) : 0;
                stockSpan.textContent = `${stock.toFixed(2)} ${material.unidad}`;
                qtyInput.dataset.code = material.codigo;
            } else {
                descCell.textContent = '';
                stockSpan.textContent = '';
                delete qtyInput.dataset.code;
            }
        });
    }
}

/**
 * Updates the displayed stock for all materials in the vale modal based on the selected warehouse.
 */
function updateValeStockDisplay() {
    const selectedAlmacenId = document.getElementById('valeAlmacen').value;
    if (!selectedAlmacenId) return;

    document.querySelectorAll('#valeMaterialsTableBody tr').forEach(row => {
        const codeInput = row.querySelector('input[data-code]');
        const code = codeInput?.dataset.code;
        const stockCell = row.cells[2];

        if (code && stockCell) {
            const material = state.materials.find(m => m.codigo === code);
            if (material) {
                const stock = material.inventario ? (material.inventario[selectedAlmacenId] || 0) : 0;
                stockCell.innerHTML = `${stock.toFixed(2)} <small class="text-muted">${material.unidad}</small>`;
            }
        }

        // Also update free-form rows
        const freeFormSelect = row.querySelector('.ts-control');
        if(freeFormSelect){
             const selectedCode = row.querySelector('select').value;
             if(selectedCode){
                const material = state.materials.find(m => m.codigo === selectedCode);
                if (material) {
                    const stock = material.inventario ? (material.inventario[selectedAlmacenId] || 0) : 0;
                    row.querySelector('.vale-material-stock').textContent = `${stock.toFixed(2)} ${material.unidad}`;
                }
             }
        }
    });
}


/**
 * Opens and populates the "Create Vale" modal for a given production order.
 * @param {number} oid - The production order ID.
 */
export function generateValePrompt(oid) {
    const ord = state.productionOrders.find(o => o.order_id === oid);
    if (!ord) return;

    document.getElementById('valeOrderId').textContent = oid;
    document.getElementById('valeHiddenOrderId').value = oid;

    const almacenSelect = document.getElementById('valeAlmacen');
    almacenSelect.innerHTML = '<option value="" selected disabled>Seleccione un almacén...</option>';
    state.almacenes.forEach(a => {
        almacenSelect.add(new Option(a.name, a.id));
    });
    // Try to pre-select the order's production warehouse if it exists
    if (ord.almacen_produccion_id) {
        almacenSelect.value = ord.almacen_produccion_id;
    }


    almacenSelect.onchange = updateValeStockDisplay;

    valeMaterialsTableBody.innerHTML = '';

    // Add materials from the original recipe
    const recipeMaterials = new Set((ord.materials_used || []).map(m => m.material_code));
    recipeMaterials.forEach(code => {
        const m = state.materials.find(ma => ma.codigo === code);
        if (!m) return;
        valeMaterialsTableBody.insertAdjacentHTML('beforeend', `
            <tr class="existing-material-row">
                <td>${m.codigo}</td>
                <td>${m.descripcion}</td>
                <td>0.00 ${m.unidad}</td>
                <td><input type="number" class="form-control form-control-sm vale-material-qty" data-code="${code}" min="0" value="0" step="0.01"></td>
                <td></td>
            </tr>
        `);
    });

    valeMaterialsTableBody.insertAdjacentHTML('beforeend', '<tr><td colspan="5"><hr class="my-2"></td></tr>');

    document.getElementById('valeType').value = 'salida';
    updateValeStockDisplay();
    valeModal.show();
}

/**
 * Handles the submission of the vale form.
 * @param {Event} e - The form submission event.
 */
async function handleValeFormSubmit(e) {
    e.preventDefault();
    const db = getDb();
    const oid = parseInt(document.getElementById('valeHiddenOrderId').value);
    const type = document.getElementById('valeType').value;
    const almacenId = document.getElementById('valeAlmacen').value;

    if (!almacenId) {
        Toastify({ text: 'Por favor, seleccione un almacén.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const qtyInputs = [...document.querySelectorAll('.vale-material-qty')].filter(input => parseFloat(input.value) > 0);
    if (!qtyInputs.length) {
        Toastify({ text: 'No se ingresaron cantidades.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const materialsToUpdate = new Map();
    let hasError = false;

    const matsForVale = qtyInputs.map(input => {
        const code = input.dataset.code;
        const qty = parseFloat(input.value);
        if (!code) return null;

        const material = state.materials.find(m => m.codigo === code);
        if (!material) return null;

        const stockInAlmacen = material.inventario ? (material.inventario[almacenId] || 0) : 0;

        if (type === 'salida' && stockInAlmacen < qty) {
            const almacenName = state.almacenes.find(a => a.id === almacenId)?.name || almacenId;
            Toastify({ text: `Stock insuficiente para ${material.descripcion} en ${almacenName}.`, backgroundColor: 'var(--danger-color)', duration: 6000 }).showToast();
            hasError = true;
            return null;
        }

        const updatedMaterial = materialsToUpdate.get(code) || JSON.parse(JSON.stringify(material)); // Deep copy
        if (!updatedMaterial.inventario) updatedMaterial.inventario = {};

        const currentStock = updatedMaterial.inventario[almacenId] || 0;
        updatedMaterial.inventario[almacenId] = type === 'salida' ? currentStock - qty : currentStock + qty;
        materialsToUpdate.set(code, updatedMaterial);

        return { material_code: code, quantity: qty, cost_at_time: material.costo };
    }).filter(Boolean);

    if (hasError || !matsForVale.length) return;

    const totalCost = matsForVale.reduce((acc, m) => acc + (m.quantity * m.cost_at_time), 0) * (type === 'salida' ? 1 : -1);

    const orderIdx = state.productionOrders.findIndex(o => o.order_id === oid);
    const updatedOrderCost = state.productionOrders[orderIdx].cost_extra + totalCost;

    const seq = state.vales.filter(v => v.order_id === oid).length + 1;
    const valeId = `${oid}-${seq}`;

    const newVale = {
        vale_id: valeId, order_id: oid, type, almacenId,
        created_at: new Date().toISOString().slice(0, 10),
        materials: matsForVale, cost: totalCost
    };

    try {
        const promises = [];
        promises.push(setDoc(doc(db, "vales", valeId), newVale));
        promises.push(updateDoc(doc(db, "productionOrders", oid.toString()), { cost_extra: updatedOrderCost }));
        materialsToUpdate.forEach((material, code) => {
            promises.push(updateDoc(doc(db, "materials", code), { inventario: material.inventario }));
        });

        await Promise.all(promises);

        // Update local state immediately
        state.addVale(newVale);
        state.productionOrders[orderIdx].cost_extra = updatedOrderCost;
        materialsToUpdate.forEach((mat, code) => state.updateMaterialInState(code, mat));


        loadProductionOrders();
        loadMaterials();
        valeModal.hide();
        Toastify({ text: 'Vale guardado. Generando PDF...', backgroundColor: 'var(--success-color)' }).showToast();

        await generateValePDF(newVale);

    } catch (error) {
        console.error("Error saving vale: ", error);
        Toastify({ text: 'Error al guardar el vale.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

// --- Event Listeners ---
valeForm.addEventListener('submit', handleValeFormSubmit);
addFreeFormRowBtn.addEventListener('click', addFreeFormValeRow);