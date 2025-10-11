/* global bootstrap, Toastify */
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { renderPaginationControls } from './ui.js';
import { materials } from "./state.js";

// --- MODULE STATE ---
let productsCurrentPage = 1;
let productsItemsPerPage = 10;
let isEditingProduct = false;
let currentProductCode = null;


// --- DOM ELEMENTS ---
const productModal = new bootstrap.Modal(document.getElementById('productModal'));
const tbody = document.getElementById('productsTableBody');
const searchInput = document.getElementById('searchProduct');
const productForm = document.getElementById('productForm');
const productModalElement = document.getElementById('productModal');

/**
 * Loads and displays the list of products with filtering and pagination.
 * @param {number} [page=productsCurrentPage] - The page number to display.
 */
export function loadProducts(page = productsCurrentPage) {
    productsCurrentPage = page;
    const filter = searchInput.value.toLowerCase();

    const filteredProducts = state.products
        .sort((a, b) => a.codigo.localeCompare(b.codigo))
        .filter(p => !filter || p.codigo.toLowerCase().includes(filter) || p.descripcion.toLowerCase().includes(filter));

    const totalPages = Math.ceil(filteredProducts.length / productsItemsPerPage);
    if (productsCurrentPage > totalPages) productsCurrentPage = totalPages || 1;

    const startIndex = (productsCurrentPage - 1) * productsItemsPerPage;
    const endIndex = startIndex + productsItemsPerPage;
    const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

    tbody.innerHTML = '';
    paginatedProducts.forEach(p => {
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${p.codigo}</td>
                <td>${p.descripcion}</td>
                <td>${p.unidad || ''}</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-btn me-2" data-code="${p.codigo}" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger delete-btn" data-code="${p.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`);
    });

    renderPaginationControls(
        'productsPagination',
        productsCurrentPage,
        totalPages,
        productsItemsPerPage,
        (newPage) => loadProducts(newPage),
        (newSize) => {
            productsItemsPerPage = newSize;
            loadProducts(1); // Go to first page on size change
        }
    );
}

/**
 * Handles the submission of the product form for both creating and editing products.
 * @param {Event} e - The form submission event.
 */
async function handleProductFormSubmit(e) {
    e.preventDefault();
    const db = getDb();
    const code = document.getElementById('productCode').value.trim().toUpperCase();
    const desc = document.getElementById('productDescription').value.trim();
    const unit = document.getElementById('productUnit').value.trim();

    if (!code || !desc) {
        Toastify({ text: 'El código y la descripción son obligatorios.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    // Prevent creating a product with a code that already exists as a product or material
    if (!isEditingProduct) {
        const codeExists = state.products.some(p => p.codigo === code) || materials.some(m => m.codigo === code);
        if (codeExists) {
            Toastify({ text: `Error: El código ${code} ya existe como producto o material.`, backgroundColor: 'var(--danger-color)', duration: 5000 }).showToast();
            return;
        }
    }

    const productData = {
        descripcion: desc,
        unidad: unit
    };

    try {
        await setDoc(doc(db, "products", code), productData);

        if (isEditingProduct) {
            state.updateProductInState(currentProductCode, { codigo: code, ...productData });
             Toastify({ text: 'Producto actualizado.', backgroundColor: 'var(--success-color)' }).showToast();
        } else {
            state.addProduct({ codigo: code, ...productData });
             Toastify({ text: 'Producto guardado.', backgroundColor: 'var(--success-color)' }).showToast();
        }

        loadProducts(); // Refresh the table
        productModal.hide();
    } catch (error) {
        console.error("Error saving product: ", error);
        Toastify({ text: 'Error al guardar producto.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

/**
 * Handles click events on the products table, specifically for edit and delete buttons.
 * @param {Event} e - The click event.
 */
async function handleProductsTableClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const code = btn.dataset.code;
    const db = getDb();

    if (btn.classList.contains('delete-btn')) {
        if (confirm(`¿Está seguro de que desea eliminar el producto ${code}?`)) {
            try {
                await deleteDoc(doc(db, "products", code));
                state.deleteProductFromState(code);
                loadProducts();
                Toastify({ text: 'Producto eliminado.', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting product: ", error);
                Toastify({ text: 'Error al eliminar producto.', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }

    if (btn.classList.contains('edit-btn')) {
        isEditingProduct = true;
        currentProductCode = code;
        const p = state.products.find(p => p.codigo === code);
        if (p) {
            document.getElementById('productCode').value = p.codigo;
            document.getElementById('productDescription').value = p.descripcion;
            document.getElementById('productUnit').value = p.unidad || '';
            document.getElementById('productCode').disabled = true;
            document.getElementById('productModalLabel').textContent = 'Editar Producto';
            productModal.show();
        }
    }
}

/**
 * Resets the product modal form to its default state when it's hidden.
 */
function resetProductModal() {
    isEditingProduct = false;
    currentProductCode = null;
    productForm.reset();
    document.getElementById('productCode').disabled = false;
    document.getElementById('productModalLabel').textContent = 'Añadir Producto';
}

// --- Event Listeners ---
productForm.addEventListener('submit', handleProductFormSubmit);
tbody.addEventListener('click', handleProductsTableClick);
productModalElement.addEventListener('hidden.bs.modal', resetProductModal);
searchInput.addEventListener('input', () => loadProducts(1));