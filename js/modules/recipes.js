/* global bootstrap, Toastify */
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { formatCurrency, calculateRecipeCost, initTomSelect } from './utils.js';

// --- DOM ELEMENTS ---
const addRecipeModal = new bootstrap.Modal(document.getElementById('addRecipeModal'));
const editRecipeModal = new bootstrap.Modal(document.getElementById('editRecipeModal'));
const recipesTableBody = document.getElementById('recipesTableBody');
const addRecipeForm = document.getElementById('addRecipeForm');
const editRecipeForm = document.getElementById('editRecipeForm');
const editRecipeModalElement = document.getElementById('editRecipeModal');

/**
 * Loads and displays the list of recipes in the table.
 */
export function loadRecipes() {
    recipesTableBody.innerHTML = '';
    const sortedProductIds = Object.keys(state.recipes).sort((a, b) => a.localeCompare(b));

    sortedProductIds.forEach(pid => {
        const prod = state.products.find(p => p.codigo === pid);
        if (!prod) {
            console.warn(`Recipe found for non-existent product code: ${pid}. Skipping.`);
            return;
        }
        const recipeItems = state.recipes[pid];
        if (!recipeItems) return;

        const cost = calculateRecipeCost(recipeItems);
        recipesTableBody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${prod.codigo}</td>
                <td>${prod.descripcion}</td>
                <td>${recipeItems.length}</td>
                <td>${formatCurrency(cost)}</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-btn me-2" data-product-id="${pid}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger delete-btn" data-product-id="${pid}" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`);
    });
}

/**
 * Populates the product select dropdown in the "Add Recipe" modal.
 * It only shows products that do not already have a recipe.
 */
export function populateRecipeProductSelect() {
    const selectElement = document.getElementById('recipeProductSelect');
    const availableProducts = state.products
        .filter(p => !state.recipes[p.codigo])
        .sort((a, b) => a.descripcion.localeCompare(b.descripcion));

    initTomSelect(selectElement, {
        options: availableProducts.map(p => ({ value: p.codigo, text: `${p.codigo} - ${p.descripcion}` })),
        valueField: 'value',
        labelField: 'text',
        searchField: ['text'],
        create: false,
        placeholder: 'Busque el producto para la receta...'
    });

    document.getElementById('recipeMaterials').innerHTML = '';
    // Set up the button for the "Add" modal specifically.
    document.getElementById('addMaterialToRecipeBtn').onclick = () => addRecipeMaterialField('recipeMaterials');
}

/**
 * Adds a new row for an ingredient to the recipe form.
 * @param {string} containerId - The ID of the container element for the ingredient fields.
 * @param {string} [mCode=''] - The material/product code to pre-select.
 * @param {number|string} [qty=''] - The quantity to pre-fill.
 * @param {string} [type='material'] - The type of ingredient ('material' or 'product').
 */
function addRecipeMaterialField(containerId, mCode = '', qty = '', type = 'material') {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.className = 'row g-2 mb-2 align-items-center material-field';

    const allItems = { material: state.materials, product: state.products };

    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-select form-select-sm type-select';
    ['material', 'product'].forEach(opt => {
        const o = new Option(opt === 'material' ? 'Material' : 'Producto', opt);
        typeSelect.appendChild(o);
    });
    typeSelect.value = type;

    const codeSelect = document.createElement('select');
    codeSelect.className = 'form-select form-select-sm code-select';

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'form-control form-control-sm desc-input';
    descInput.placeholder = 'Descripción';
    descInput.readOnly = true;

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.step = '0.0001';
    qtyInput.className = 'form-control form-control-sm qty-input';
    qtyInput.placeholder = 'Cantidad';
    if (qty) qtyInput.value = qty;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-danger remove-material-btn';
    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
    delBtn.onclick = () => row.remove();

    const updateDescription = () => {
        const currentType = typeSelect.value;
        const currentCode = codeSelect.value;
        const item = allItems[currentType].find(i => i.codigo === currentCode);
        descInput.value = item ? item.descripcion : '';
    };

    const populateCodeSelect = () => {
        let currentType = typeSelect.value;
        const list = allItems[currentType];
        const recipeProductCode = document.getElementById('editRecipeProductSelect')?.value || document.getElementById('recipeProductSelect')?.value;

        const options = list
            // Prevent recursive recipes
            .filter(item => !(currentType === 'product' && item.codigo === recipeProductCode))
            .sort((a,b) => a.descripcion.localeCompare(b.descripcion))
            .map(item => ({ value: item.codigo, text: `${item.codigo} - ${item.descripcion}` }));

        const tomSelectInstance = initTomSelect(codeSelect, {
            options: options,
            valueField: 'value',
            labelField: 'text',
            searchField: ['text'],
            create: false,
            placeholder: 'Busque un ingrediente...'
        });

        if (mCode) {
            tomSelectInstance.setValue(mCode, true);
        }
        updateDescription(); // Call after setting value
    };

    typeSelect.addEventListener('change', populateCodeSelect);
    codeSelect.addEventListener('change', updateDescription);

    const createCol = (className, element) => {
        const col = document.createElement('div');
        col.className = className;
        col.appendChild(element);
        return col;
    };

    // Additional elements for the edit modal simulation
    let reqQtyOutput, stockAlertOutput;
    if (containerId === 'editRecipeMaterials') {
        reqQtyOutput = document.createElement('div');
        reqQtyOutput.className = 'req-qty-output text-end pe-2 small';
        reqQtyOutput.style.paddingTop = '0.375rem';

        stockAlertOutput = document.createElement('div');
        stockAlertOutput.className = 'stock-alert-output small';
        stockAlertOutput.style.paddingTop = '0.375rem';
    }

    row.append(
        createCol('col-md-2', typeSelect),
        createCol('col-md-4', codeSelect),
        createCol('col-md-4', qtyInput),
        createCol('col-md-2 text-end', delBtn)
    );

    if (containerId === 'editRecipeMaterials') {
        const firstCol = row.children[0];
        const secondCol = row.children[1];
        const thirdCol = row.children[2];
        const fourthCol = row.children[3];

        firstCol.className = 'col-md-2';
        secondCol.className = 'col-md-3';
        thirdCol.className = 'col-md-2';
        fourthCol.className = 'col-md-1 text-end';

        row.insertBefore(createCol('col-md-2', reqQtyOutput), fourthCol);
        row.insertBefore(createCol('col-md-2', stockAlertOutput), fourthCol);
    }


    container.appendChild(row);
    populateCodeSelect();
}


/**
 * Handles the submission of the "Add Recipe" form.
 * @param {Event} e - The form submission event.
 */
async function handleAddRecipeSubmit(e) {
    e.preventDefault();
    const db = getDb();
    const pid = document.getElementById('recipeProductSelect').value;
    const items = [...document.querySelectorAll('#recipeMaterials .material-field')]
        .map(f => ({
            type: f.querySelector('.type-select').value,
            code: f.querySelector('.code-select').value,
            quantity: parseFloat(f.querySelector('.qty-input').value)
        }))
        .filter(i => i.code && !isNaN(i.quantity));

    if (!items.length) {
        Toastify({ text: 'Agregue al menos un ingrediente.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    try {
        await setDoc(doc(db, "recipes", pid), { items });
        state.updateRecipeInState(pid, items);
        loadRecipes();
        addRecipeModal.hide();
        Toastify({ text: 'Receta guardada.', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving recipe: ", error);
        Toastify({ text: 'Error al guardar receta.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

/**
 * Handles the submission of the "Edit Recipe" form.
 * @param {Event} e - The form submission event.
 */
async function handleEditRecipeSubmit(e) {
    e.preventDefault();
    const db = getDb();
    const pid = document.getElementById('editRecipeProductSelect').value;
    const items = [...document.querySelectorAll('#editRecipeMaterials .material-field')]
        .map(f => ({
            type: f.querySelector('.type-select').value,
            code: f.querySelector('.code-select').value,
            quantity: parseFloat(f.querySelector('.qty-input').value)
        }))
        .filter(i => i.code && !isNaN(i.quantity));

    if (!items.length) {
        Toastify({ text: 'Agrega al menos un ingrediente.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    try {
        await setDoc(doc(db, "recipes", pid), { items });
        state.updateRecipeInState(pid, items);
        loadRecipes();
        editRecipeModal.hide();
        Toastify({ text: 'Receta actualizada.', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error updating recipe: ", error);
        Toastify({ text: 'Error al actualizar receta.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

/**
 * Handles click events on the recipes table for edit and delete buttons.
 * @param {Event} e - The click event.
 */
async function handleRecipesTableClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const pid = btn.dataset.productId;
    const db = getDb();

    if (btn.classList.contains('delete-btn')) {
        if (confirm(`¿Eliminar receta para el producto ${pid}?`)) {
            try {
                await deleteDoc(doc(db, "recipes", pid));
                state.deleteRecipeFromState(pid);
                loadRecipes();
                Toastify({ text: 'Receta eliminada.', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting recipe: ", error);
                Toastify({ text: 'Error al eliminar receta.', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }

    if (btn.classList.contains('edit-btn')) {
        const prod = state.products.find(p => p.codigo === pid);
        if (!prod) {
            Toastify({ text: `Error: El producto para esta receta (código: ${pid}) ya no existe.`, duration: 5000, backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }

        // Populate the edit modal
        document.getElementById('editRecipeProductSelect').innerHTML = `<option value="${pid}">${prod.descripcion}</option>`;
        const container = document.getElementById('editRecipeMaterials');
        container.innerHTML = '';
        state.recipes[pid].forEach(i => addRecipeMaterialField('editRecipeMaterials', i.code, i.quantity, i.type));

        const almacenSelect = document.getElementById('recipeSimulationAlmacen');
        almacenSelect.innerHTML = '<option value="all">Todos los Almacenes</option>';
        state.almacenes.forEach(a => {
            almacenSelect.add(new Option(a.name, a.id));
        });

        document.getElementById('recipeSimulationQty').value = '';
        updateRecipeSimulation(); // Initial call to set up the view
        editRecipeModal.show();
    }
}

/**
 * Updates the recipe simulation section in the edit modal.
 * Calculates required quantities and checks for stock shortages.
 */
function updateRecipeSimulation() {
    const simQty = parseFloat(document.getElementById('recipeSimulationQty').value);
    const selectedAlmacenId = document.getElementById('recipeSimulationAlmacen').value;
    const materialRows = document.querySelectorAll('#editRecipeMaterials .material-field');

    materialRows.forEach(row => {
        const baseQtyInput = row.querySelector('.qty-input');
        const reqQtyOutput = row.querySelector('.req-qty-output');
        const stockAlertOutput = row.querySelector('.stock-alert-output');
        const type = row.querySelector('.type-select').value;
        const code = row.querySelector('.code-select').value;

        if (!reqQtyOutput || !stockAlertOutput) return;

        stockAlertOutput.textContent = '';
        stockAlertOutput.classList.remove('text-danger', 'fw-bold');

        if (isNaN(simQty) || simQty <= 0) {
            reqQtyOutput.textContent = '';
            return;
        }

        const baseQty = parseFloat(baseQtyInput.value);
        if (isNaN(baseQty)) {
            reqQtyOutput.textContent = '';
            return;
        }

        const requiredQty = baseQty * simQty;
        reqQtyOutput.textContent = `Req: ${requiredQty.toFixed(2)}`;

        if (type === 'material' && code) {
            const material = state.materials.find(m => m.codigo === code);
            if (material) {
                let totalStock = 0;
                if (material.inventario) {
                    totalStock = selectedAlmacenId === 'all'
                        ? Object.values(material.inventario).reduce((acc, val) => acc + val, 0)
                        : material.inventario[selectedAlmacenId] || 0;
                }

                if (totalStock < requiredQty) {
                    const shortfall = requiredQty - totalStock;
                    stockAlertOutput.textContent = `Faltan: ${shortfall.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    stockAlertOutput.classList.add('text-danger', 'fw-bold');
                } else {
                     stockAlertOutput.textContent = `Stock: ${totalStock.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                     stockAlertOutput.classList.remove('text-danger', 'fw-bold');
                     stockAlertOutput.classList.add('text-success');
                }
            }
        }
    });
}

// --- Event Listeners ---
addRecipeForm.addEventListener('submit', handleAddRecipeSubmit);
editRecipeForm.addEventListener('submit', handleEditRecipeSubmit);
recipesTableBody.addEventListener('click', handleRecipesTableClick);

// Use event delegation on the document for dynamically added remove buttons
document.addEventListener('click', e => {
    if (e.target.closest('.remove-material-btn')) {
        e.target.closest('.material-field').remove();
    }
    // Button to add fields in the *edit* modal
    if (e.target.id === 'addMaterialToEditRecipeBtn') {
        addRecipeMaterialField('editRecipeMaterials');
    }
});

// Listeners for the simulation section in the edit modal
document.getElementById('recipeSimulationQty')?.addEventListener('input', updateRecipeSimulation);
document.getElementById('recipeSimulationAlmacen')?.addEventListener('change', updateRecipeSimulation);

// Reset simulation fields when edit modal is closed
editRecipeModalElement.addEventListener('hidden.bs.modal', () => {
    document.getElementById('recipeSimulationQty').value = '';
    document.getElementById('recipeSimulationAlmacen').innerHTML = '';
});