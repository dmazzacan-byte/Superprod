/* global bootstrap, Toastify */
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { renderPaginationControls } from './ui.js';
import { formatCurrency } from './utils.js';
import { products } from "./state.js";

// --- MODULE STATE ---
let materialsCurrentPage = 1;
let materialsItemsPerPage = 10;
let isEditingMaterial = false;
let currentMaterialCode = null;

// --- DOM ELEMENTS ---
const materialModal = new bootstrap.Modal(document.getElementById('materialModal'));
const materialModalElement = document.getElementById('materialModal');
const thead = document.getElementById('materialsTableHead');
const tbody = document.getElementById('materialsTableBody');
const searchInput = document.getElementById('searchMaterial');
const filterCheckbox = document.getElementById('filterMaterialsAsProducts');
const materialForm = document.getElementById('materialForm');

/**
 * Populates the inventory section of the material modal with inputs for each warehouse.
 * @param {object} [inventarioData={}] - The existing inventory data for the material.
 */
function populateMaterialInventario(inventarioData = {}) {
    const container = document.getElementById('materialInventario');
    container.innerHTML = '<label class="form-label">Existencia por Almacén</label>';

    if (state.almacenes.length === 0) {
        container.innerHTML += '<p class="text-muted small mt-1">No hay almacenes configurados. Por favor, añada al menos uno en la sección de Configuración.</p>';
        return;
    }

    state.almacenes.forEach(almacen => {
        const stock = inventarioData[almacen.id] || 0;
        container.insertAdjacentHTML('beforeend', `
            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text">${almacen.name}</span>
                <input type="number" class="form-control material-stock-input" data-almacen-id="${almacen.id}" value="${stock.toFixed(2)}" step="0.01" min="0" required>
            </div>
        `);
    });
}

/**
 * Loads and displays the list of materials with filtering, dynamic columns, and pagination.
 * @param {number} [page=materialsCurrentPage] - The page number to display.
 */
export function loadMaterials(page = materialsCurrentPage) {
    materialsCurrentPage = page;
    const filter = searchInput.value.toLowerCase();
    const showOnlyProducts = filterCheckbox.checked;

    thead.innerHTML = '';
    tbody.innerHTML = '';

    // Generate Headers dynamically based on warehouses
    let headerHtml = '<tr><th>Código</th><th>Descripción</th><th>Unidad</th>';
    state.almacenes.forEach(a => {
        headerHtml += `<th>Stock (${a.id})</th>`;
    });
    headerHtml += '<th>Stock Total</th><th>Costo</th><th>Acciones</th></tr>';
    thead.innerHTML = headerHtml;

    // Filter and Sort Materials
    let filteredMaterials = state.materials.sort((a, b) => a.codigo.localeCompare(b.codigo));

    if (showOnlyProducts) {
        const productCodes = new Set(products.map(p => p.codigo));
        filteredMaterials = filteredMaterials.filter(m => productCodes.has(m.codigo));
    }

    if (filter) {
        filteredMaterials = filteredMaterials.filter(m => m.codigo.toLowerCase().includes(filter) || m.descripcion.toLowerCase().includes(filter));
    }

    // Paginate
    const totalPages = Math.ceil(filteredMaterials.length / materialsItemsPerPage);
    if (materialsCurrentPage > totalPages) materialsCurrentPage = totalPages || 1;
    const startIndex = (materialsCurrentPage - 1) * materialsItemsPerPage;
    const endIndex = startIndex + materialsItemsPerPage;
    const paginatedMaterials = filteredMaterials.slice(startIndex, endIndex);

    // Generate Rows
    paginatedMaterials.forEach(m => {
        let rowHtml = `<tr>
            <td>${m.codigo}</td>
            <td>${m.descripcion}</td>
            <td>${m.unidad}</td>`;

        let totalStock = 0;
        state.almacenes.forEach(a => {
            const stock = m.inventario?.[a.id] || 0;
            rowHtml += `<td>${stock.toFixed(2)}</td>`;
            totalStock += stock;
        });

        rowHtml += `
            <td><strong>${totalStock.toFixed(2)}</strong></td>
            <td>${formatCurrency(m.costo)}</td>
            <td>
                <button class="btn btn-sm btn-warning edit-btn me-2" data-code="${m.codigo}" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger delete-btn" data-code="${m.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.insertAdjacentHTML('beforeend', rowHtml);
    });

    renderPaginationControls(
        'materialsPagination',
        materialsCurrentPage,
        totalPages,
        materialsItemsPerPage,
        (newPage) => loadMaterials(newPage),
        (newSize) => {
            materialsItemsPerPage = newSize;
            loadMaterials(1);
        }
    );
}

/**
 * Handles the submission of the material form for creating and editing materials.
 * @param {Event} e - The form submission event.
 */
async function handleMaterialFormSubmit(e) {
    e.preventDefault();
    const db = getDb();
    const code = document.getElementById('materialCode').value.trim().toUpperCase();
    const desc = document.getElementById('materialDescription').value.trim();
    const unit = document.getElementById('materialUnit').value.trim();
    const cost = parseFloat(document.getElementById('materialCost').value);

    if (!code || !desc) {
         Toastify({ text: 'Código y descripción son requeridos.', backgroundColor: 'var(--warning-color)' }).showToast();
         return;
    }
    if (isNaN(cost) || cost < 0) {
        Toastify({ text: 'Error: El costo debe ser un número positivo.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    // Collect inventory data from dynamic fields
    const inventario = {};
    document.querySelectorAll('.material-stock-input').forEach(input => {
        const almacenId = input.dataset.almacenId;
        const stock = parseFloat(input.value) || 0;
        if (almacenId) {
            inventario[almacenId] = stock < 0 ? 0 : stock;
        }
    });

    if (!isEditingMaterial) {
        const codeExists = state.materials.some(m => m.codigo === code) || state.products.some(p => p.codigo === code);
        if (codeExists) {
            Toastify({ text: `Error: El código ${code} ya existe como material o producto.`, backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }
    }

    const materialData = {
        descripcion: desc,
        unidad: unit,
        inventario: inventario,
        costo: cost
    };

    try {
        // When editing, merge to not overwrite warehouse data that might not be displayed.
        // When creating, overwrite completely.
        await setDoc(doc(db, "materials", code), materialData, { merge: isEditingMaterial });

        const localMaterial = state.materials.find(m => m.codigo === code);
        if (!localMaterial) {
            state.addMaterial({ codigo: code, ...materialData });
        } else {
            // Important: merge local data as well to preserve other warehouses' stock
            const newInventario = { ...localMaterial.inventario, ...materialData.inventario };
            state.updateMaterialInState(code, { ...materialData, inventario: newInventario });
        }

        loadMaterials();
        materialModal.hide();
        Toastify({ text: 'Material guardado', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving material: ", error);
        Toastify({ text: 'Error al guardar material', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

/**
 * Handles click events on the materials table for edit and delete buttons.
 * @param {Event} e - The click event.
 */
async function handleMaterialsTableClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const code = btn.dataset.code;
    const db = getDb();

    if (btn.classList.contains('delete-btn')) {
        if (confirm(`¿Eliminar material ${code}?`)) {
            try {
                await deleteDoc(doc(db, "materials", code));
                state.deleteMaterialFromState(code);
                loadMaterials();
                Toastify({ text: 'Material eliminado', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting material: ", error);
                Toastify({ text: 'Error al eliminar material', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }

    if (btn.classList.contains('edit-btn')) {
        isEditingMaterial = true;
        currentMaterialCode = code;
        const m = state.materials.find(m => m.codigo === code);
        if (m) {
            document.getElementById('materialCode').value = m.codigo;
            document.getElementById('materialDescription').value = m.descripcion;
            document.getElementById('materialUnit').value = m.unidad;
            document.getElementById('materialCost').value = m.costo;
            populateMaterialInventario(m.inventario || {});
            document.getElementById('materialCode').disabled = true;
            document.getElementById('materialModalLabel').textContent = 'Editar Material';
            materialModal.show();
        }
    }
}

/**
 * Resets the material modal form to its default state when hidden.
 */
function resetMaterialModal() {
    isEditingMaterial = false;
    currentMaterialCode = null;
    materialForm.reset();
    document.getElementById('materialInventario').innerHTML = '';
    document.getElementById('materialCode').disabled = false;
    document.getElementById('materialModalLabel').textContent = 'Añadir Material';
}


// --- Event Listeners ---
materialForm.addEventListener('submit', handleMaterialFormSubmit);
tbody.addEventListener('click', handleMaterialsTableClick);

// Populate inventory fields for new materials when modal is shown
materialModalElement.addEventListener('show.bs.modal', () => {
    if (!isEditingMaterial) {
        populateMaterialInventario();
    }
});

materialModalElement.addEventListener('hidden.bs.modal', resetMaterialModal);

searchInput.addEventListener('input', () => loadMaterials(1));
filterCheckbox.addEventListener('change', () => loadMaterials(1));