/* global bootstrap, Toastify */
import * as state from './state.js';
import { getBaseMaterials, getIntermediateProductCodes, initTomSelect } from './utils.js';
import { createProductionOrder, loadProductionOrders } from './orders.js';

// --- DOM ELEMENTS ---
const materialCheckModal = new bootstrap.Modal(document.getElementById('materialCheckModal'));
const forecastEntriesContainer = document.getElementById('forecast-entries');
const addForecastEntryBtn = document.getElementById('addForecastEntryBtn');
const calculatePlanBtn = document.getElementById('calculatePlanBtn');
const createSelectedOrdersBtn = document.getElementById('createSelectedOrdersBtn');
const newPlanBtn = document.getElementById('newPlanBtn');


/**
 * Populates a select element with final products that have a recipe.
 * @param {HTMLElement} selectElement - The <select> element to populate.
 */
export function populatePlannerProductSelects(selectElement) {
    const intermediateProducts = getIntermediateProductCodes();

    const finalProductsWithRecipe = state.products.filter(p => {
        const hasRecipe = state.recipes[p.codigo] && state.recipes[p.codigo].length > 0;
        const isFinalProduct = !intermediateProducts.has(p.codigo);
        return hasRecipe && isFinalProduct;
    });

    initTomSelect(selectElement, {
        options: finalProductsWithRecipe.sort((a,b) => a.codigo.localeCompare(b.codigo)).map(p => ({ value: p.codigo, text: `${p.codigo} - ${p.descripcion}` })),
        valueField: 'value',
        labelField: 'text',
        searchField: ['text'],
        create: false,
        placeholder: 'Busque un producto final...'
    });
}

/**
 * Adds a new row to the forecast entry list.
 */
function addForecastEntryRow() {
    const newEntry = document.createElement('div');
    newEntry.className = 'row g-3 align-items-center forecast-entry mb-2';
    newEntry.innerHTML = `
        <div class="col-md-6">
            <select class="form-select forecast-product"></select>
        </div>
        <div class="col-md-4">
            <input type="number" class="form-control forecast-quantity" min="1" placeholder="Ej: 100">
        </div>
        <div class="col-md-2 d-flex align-items-end">
            <button type="button" class="btn btn-danger w-100 remove-forecast-btn"><i class="fas fa-trash"></i></button>
        </div>
    `;
    const newSelect = newEntry.querySelector('.forecast-product');
    populatePlannerProductSelects(newSelect);
    forecastEntriesContainer.appendChild(newEntry);
}

/**
 * Calculates gross requirements for all products by exploding the BOM for the initial forecast.
 * @param {Array<{productCode: string, quantity: number}>} initialForecast - The user's initial production forecast.
 * @returns {Map<string, number>} A map of product codes to their gross required quantities.
 */
function getGrossRequirements(initialForecast) {
    const grossRequirements = new Map();

    function explodeBOM(productCode, requiredQty) {
        // Add the product itself to the requirements
        const currentQty = grossRequirements.get(productCode) || 0;
        grossRequirements.set(productCode, currentQty + requiredQty);

        const recipe = state.recipes[productCode];
        if (!recipe) return; // Stop if a sub-product has no recipe

        // Recursively explode for sub-products
        recipe.forEach(ingredient => {
            if (ingredient.type === 'product') {
                const subProductQty = ingredient.quantity * requiredQty;
                explodeBOM(ingredient.code, subProductQty);
            }
        });
    }

    initialForecast.forEach(item => {
        explodeBOM(item.productCode, item.quantity);
    });

    return grossRequirements;
}

/**
 * Displays suggested production orders based on net requirements.
 * @param {Map<string, number>} grossRequirements - The gross requirements for all products.
 * @param {string} selectedAlmacenId - The warehouse ID selected for inventory calculation.
 */
function displaySuggestedOrders(grossRequirements, selectedAlmacenId) {
    const suggestedOrdersTbody = document.getElementById('suggestedOrdersTableBody');
    suggestedOrdersTbody.innerHTML = '';
    let suggestionsMade = false;

    grossRequirements.forEach((grossQty, productCode) => {
        const product = state.products.find(p => p.codigo === productCode);
        if (!product) return;

        const materialInfo = state.materials.find(m => m.codigo === productCode);
        let currentStock = 0;
        if (materialInfo && materialInfo.inventario) {
            currentStock = selectedAlmacenId === 'all'
                ? Object.values(materialInfo.inventario).reduce((a, b) => a + b, 0)
                : materialInfo.inventario[selectedAlmacenId] || 0;
        }
        const netRequirement = grossQty - currentStock;

        if (netRequirement > 0) {
            suggestionsMade = true;
            const roundedNetReq = Math.ceil(netRequirement);
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><input type="checkbox" class="suggestion-checkbox" data-product-code="${productCode}" checked></td>
                <td>${product.descripcion} (${productCode})</td>
                <td><input type="number" class="form-control form-control-sm suggested-order-qty" value="${roundedNetReq}" min="1" data-original-net-req="${roundedNetReq}"></td>
                <td>${currentStock.toFixed(2)}</td>
                <td>${grossQty.toFixed(2)}</td>
                <td><select class="form-select form-select-sm planner-operator-select"><option value="">Seleccione...</option>${state.operators.map(o => `<option value="${o.id}">${o.name}</option>`).join('')}</select></td>
                <td><select class="form-select form-select-sm planner-equipo-select"><option value="">Seleccione...</option>${state.equipos.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}</select></td>
            `;
            suggestedOrdersTbody.appendChild(row);
        }
    });

    const suggestedOrdersCard = document.getElementById('suggestedOrdersCard');
    suggestedOrdersCard.style.display = suggestionsMade ? 'block' : 'none';
    if (!suggestionsMade) {
        Toastify({ text: 'No se requiere producción nueva. El inventario actual satisface el pronóstico.', backgroundColor: 'var(--info-color)', duration: 5000 }).showToast();
    }
}

/**
 * Main function to calculate the production plan.
 */
function calculatePlan() {
    const selectedAlmacenId = document.getElementById('plannerAlmacenSelect').value;
    const entries = document.querySelectorAll('.forecast-entry');
    const forecast = [];
    let hasInvalidEntry = false;

    entries.forEach(entry => {
        const productCode = entry.querySelector('.forecast-product').value;
        const quantity = parseInt(entry.querySelector('.forecast-quantity').value, 10);

        if (productCode && quantity > 0) {
            const existing = forecast.find(f => f.productCode === productCode);
            if (existing) {
                existing.quantity += quantity;
            } else {
                forecast.push({ productCode, quantity });
            }
        } else if (productCode || quantity) {
            hasInvalidEntry = true;
        }
    });

    if (hasInvalidEntry || forecast.length === 0) {
        Toastify({ text: 'Por favor, complete todas las filas del pronóstico antes de calcular.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const grossRequirements = getGrossRequirements(forecast);

    // --- Check Raw Material Availability ---
    const totalRawMaterials = new Map();
    grossRequirements.forEach((qty, code) => {
        // We only care about raw materials here, not intermediate products
        if (!state.recipes[code]) {
            const baseMats = getBaseMaterials(code, qty);
             baseMats.forEach(mat => {
                const currentQty = totalRawMaterials.get(mat.code) || 0;
                totalRawMaterials.set(mat.code, currentQty + mat.quantity);
            });
        }
    });

    forecast.forEach(f => {
        const baseMats = getBaseMaterials(f.productCode, f.quantity);
        baseMats.forEach(mat => {
            const currentQty = totalRawMaterials.get(mat.code) || 0;
            totalRawMaterials.set(mat.code, currentQty + mat.quantity);
        });
    });


    if (totalRawMaterials.size === 0) {
        displaySuggestedOrders(grossRequirements, selectedAlmacenId);
        return;
    }

    // --- Display Material Check Modal ---
    let hasShortage = false;
    const fullBody = document.getElementById('materialFullTableBody');
    const shortageBody = document.getElementById('materialShortageTableBody');
    fullBody.innerHTML = '';
    shortageBody.innerHTML = '';

    Array.from(totalRawMaterials.entries()).sort((a,b) => a[0].localeCompare(b[0])).forEach(([code, requiredQty]) => {
        const material = state.materials.find(m => m.codigo === code);
        let stock = 0;
        if (material?.inventario) {
            stock = selectedAlmacenId === 'all'
                ? Object.values(material.inventario).reduce((a, b) => a + b, 0)
                : material.inventario[selectedAlmacenId] || 0;
        }
        const balance = stock - requiredQty;
        if (balance < 0) hasShortage = true;

        const rowHTML = `<tr><td>${code}</td><td>${material?.descripcion || 'N/A'}</td><td>${requiredQty.toFixed(2)}</td><td>${stock.toFixed(2)}</td><td class="${balance < 0 ? 'text-danger fw-bold' : ''}">${balance.toFixed(2)}</td></tr>`;
        fullBody.innerHTML += rowHTML;
        if (balance < 0) {
            shortageBody.innerHTML += `<tr><td>${code}</td><td>${material?.descripcion || 'N/A'}</td><td class="text-danger fw-bold">${(balance * -1).toFixed(2)}</td></tr>`;
        }
    });

    document.getElementById('materialShortageTable').style.display = hasShortage ? 'table' : 'none';
    document.querySelector('#materialCheckModal .alert-danger').style.display = hasShortage ? 'block' : 'none';
    document.querySelector('#materialCheckModal .alert-success').style.display = hasShortage ? 'none' : 'block';


    document.getElementById('continuePlanBtn').onclick = () => {
        materialCheckModal.hide();
        displaySuggestedOrders(grossRequirements, selectedAlmacenId);
    };

    materialCheckModal.show();
}

/**
 * Creates production orders for the selected suggestions.
 */
async function handleCreateSelectedOrders() {
    const checkedCheckboxes = [...document.querySelectorAll('.suggestion-checkbox:checked')];
    if (checkedCheckboxes.length === 0) {
        Toastify({ text: 'No hay órdenes sugeridas seleccionadas.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const plannerAlmacenId = document.getElementById('plannerAlmacenSelect').value;
    if (plannerAlmacenId === 'all') {
        Toastify({ text: 'Seleccione un almacén de producción específico.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    let createdCount = 0;
    for (const checkbox of checkedCheckboxes) {
        const row = checkbox.closest('tr');
        const operatorId = row.querySelector('.planner-operator-select').value;
        const equipoId = row.querySelector('.planner-equipo-select').value;
        const productCode = checkbox.dataset.productCode;
        const quantityToCreate = parseInt(row.querySelector('.suggested-order-qty').value, 10);

        if (!operatorId || !equipoId || isNaN(quantityToCreate) || quantityToCreate <= 0) {
            Toastify({ text: `Complete los datos para ${productCode}.`, backgroundColor: 'var(--warning-color)' }).showToast();
            continue;
        }

        const success = await createProductionOrder(productCode, quantityToCreate, operatorId, equipoId, plannerAlmacenId);
        if (success) {
            createdCount++;
            row.remove(); // Remove the row after successful creation
        }
    }

    if (createdCount > 0) {
        Toastify({ text: `${createdCount} órdenes de producción creadas.`, backgroundColor: 'var(--success-color)' }).showToast();
        loadProductionOrders(); // Refresh orders page
        if (document.getElementById('suggestedOrdersTableBody').children.length === 0) {
            document.getElementById('suggestedOrdersCard').style.display = 'none';
        }
    }
}

/**
 * Resets the demand planner interface to its initial state.
 */
function resetPlanner() {
    forecastEntriesContainer.innerHTML = '';
    addForecastEntryRow();
    document.getElementById('suggestedOrdersTableBody').innerHTML = '';
    document.getElementById('suggestedOrdersCard').style.display = 'none';
    Toastify({ text: 'Planificador reiniciado.', backgroundColor: 'var(--info-color)' }).showToast();
}


// --- Event Listeners ---
addForecastEntryBtn?.addEventListener('click', addForecastEntryRow);
calculatePlanBtn?.addEventListener('click', calculatePlan);
createSelectedOrdersBtn?.addEventListener('click', handleCreateSelectedOrders);
newPlanBtn?.addEventListener('click', resetPlanner);

forecastEntriesContainer?.addEventListener('click', (e) => {
    if (e.target.closest('.remove-forecast-btn')) {
        e.target.closest('.forecast-entry').remove();
    }
});