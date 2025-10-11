/* global bootstrap, Toastify */
import { doc, updateDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { initTomSelect } from './utils.js';
import { loadMaterials } from './materials.js';

// --- DOM ELEMENTS ---
const traspasoModal = new bootstrap.Modal(document.getElementById('traspasoModal'));
const traspasoModalElement = document.getElementById('traspasoModal');
const traspasoForm = document.getElementById('traspasoForm');
const materialSelect = document.getElementById('traspasoMaterialSelect');
const origenSelect = document.getElementById('traspasoOrigenSelect');
const stockSpan = document.getElementById('traspasoStockOrigen');

/**
 * Updates the displayed stock in the transfer modal based on the selected material and origin warehouse.
 */
function updateTraspasoStock() {
    const materialId = materialSelect.value;
    const origenId = origenSelect.value;

    if (!materialId || !origenId) {
        stockSpan.textContent = '--';
        return;
    }

    const material = state.materials.find(m => m.codigo === materialId);
    if (material && material.inventario) {
        const stock = material.inventario[origenId] || 0;
        stockSpan.textContent = `${stock.toFixed(2)} ${material.unidad || ''}`;
    } else {
        stockSpan.textContent = '0.00';
    }
}

/**
 * Populates the transfer form selects with materials and warehouses.
 */
function populateTraspasoForm() {
    initTomSelect(materialSelect, {
        options: state.materials.sort((a, b) => a.descripcion.localeCompare(b.descripcion)).map(m => ({
            value: m.codigo,
            text: `${m.descripcion} (${m.codigo})`
        })),
        valueField: 'value',
        labelField: 'text',
        searchField: ['text'],
        create: false,
        placeholder: 'Busque un material para traspasar...'
    });

    const destinoSelect = document.getElementById('traspasoDestinoSelect');
    origenSelect.innerHTML = '<option value="" selected disabled>Seleccione origen...</option>';
    destinoSelect.innerHTML = '<option value="" selected disabled>Seleccione destino...</option>';

    state.almacenes.forEach(a => {
        origenSelect.add(new Option(a.name, a.id));
        destinoSelect.add(new Option(a.name, a.id));
    });

    updateTraspasoStock();
}

/**
 * Handles the submission of the transfer form.
 * @param {Event} e - The form submission event.
 */
async function handleTraspasoSubmit(e) {
    e.preventDefault();
    const db = getDb();

    const materialId = materialSelect.value;
    const origenId = origenSelect.value;
    const destinoId = document.getElementById('traspasoDestinoSelect').value;
    const cantidad = parseFloat(document.getElementById('traspasoCantidad').value);

    // --- Validation ---
    if (!materialId || !origenId || !destinoId || isNaN(cantidad)) {
        Toastify({ text: 'Por favor, complete todos los campos.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }
    if (origenId === destinoId) {
        Toastify({ text: 'El almacén de origen y destino no pueden ser el mismo.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }
    if (cantidad <= 0) {
        Toastify({ text: 'La cantidad a traspasar debe ser mayor que cero.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const material = state.materials.find(m => m.codigo === materialId);
    if (!material) {
        Toastify({ text: 'Error: Material no encontrado.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const stockOrigen = material.inventario?.[origenId] || 0;
    if (stockOrigen < cantidad) {
        Toastify({ text: `No hay suficiente stock en el almacén de origen. Disponible: ${stockOrigen.toFixed(2)}`, backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    // --- Logic ---
    const materialRef = doc(db, "materials", materialId);
    const newInventario = { ...material.inventario };
    newInventario[origenId] = (newInventario[origenId] || 0) - cantidad;
    newInventario[destinoId] = (newInventario[destinoId] || 0) + cantidad;

    const traspasoData = {
        materialId,
        origenId,
        destinoId,
        cantidad,
        createdAt: new Date().toISOString()
    };

    try {
        await updateDoc(materialRef, { inventario: newInventario });
        const docRef = await addDoc(collection(db, "traspasos"), traspasoData);

        // Update local state
        state.updateMaterialInState(materialId, { ...material, inventario: newInventario });
        // state.addTraspaso({ traspaso_id: docRef.id, ...traspasoData }); // Assuming you might want to track this locally

        loadMaterials();
        traspasoModal.hide();
        Toastify({ text: 'Traspaso realizado con éxito.', backgroundColor: 'var(--success-color)' }).showToast();
        traspasoForm.reset();

    } catch (error) {
        console.error("Error realizando el traspaso: ", error);
        Toastify({ text: 'Error al realizar el traspaso.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}


// --- Event Listeners ---
traspasoModalElement.addEventListener('show.bs.modal', populateTraspasoForm);
materialSelect?.addEventListener('change', updateTraspasoStock);
origenSelect?.addEventListener('change', updateTraspasoStock);
traspasoForm.addEventListener('submit', handleTraspasoSubmit);