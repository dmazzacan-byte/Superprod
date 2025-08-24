import { updateDashboard, initializeDashboardListeners } from './dashboard.js';
import { loadMaterials, initializeMaterialsListeners } from './materials.js';
import { loadProducts, loadProductionOrders, initializeProductsListeners } from './products.js';

// Simulación de una base de datos local
export let products = JSON.parse(localStorage.getItem('products')) || [];
export let recipes = JSON.parse(localStorage.getItem('recipes')) || {};
export let productionOrders = JSON.parse(localStorage.getItem('productionOrders')) || [];
export let operators = JSON.parse(localStorage.getItem('operators')) || [];
export let materials = JSON.parse(localStorage.getItem('materials')) || [];

export function saveToLocalStorage() {
    localStorage.setItem('products', JSON.stringify(products));
    localStorage.setItem('recipes', JSON.stringify(recipes));
    localStorage.setItem('productionOrders', JSON.stringify(productionOrders));
    localStorage.setItem('operators', JSON.stringify(operators));
    localStorage.setItem('materials', JSON.stringify(materials));
    console.log('Datos guardados en el almacenamiento local.');
}

// Función para actualizar las variables globales
export function updateGlobalData(dataKey, newData) {
    switch (dataKey) {
        case 'products':
            products = newData;
            break;
        case 'recipes':
            recipes = newData;
            break;
        case 'productionOrders':
            productionOrders = newData;
            break;
        case 'operators':
            operators = newData;
            break;
        case 'materials':
            materials = newData;
            break;
    }
    saveToLocalStorage();
}

document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    function showPage(pageId) {
        pages.forEach(page => {
            page.style.display = 'none';
        });
        document.getElementById(pageId).style.display = 'block';

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-page') === pageId) {
                link.classList.add('active');
            }
        });

        // Recargar el contenido de la página al cambiar
        if (pageId === 'dashboard') updateDashboard();
        if (pageId === 'materials') loadMaterials();
        if (pageId === 'products') loadProducts();
        if (pageId === 'production-orders') loadProductionOrders();
        // ... Cargar otras vistas si las añades
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const pageId = event.currentTarget.getAttribute('data-page');
            history.pushState(null, '', `#${pageId}`);
            showPage(pageId);
        });
    });

    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.substring(1) || 'dashboard';
        showPage(pageId);
    });

    const initialPage = window.location.hash.substring(1) || 'dashboard';
    showPage(initialPage);

    // Inicializar listeners de todos los módulos
    initializeDashboardListeners();
    initializeMaterialsListeners();
    initializeProductsListeners();
});

// Lógica de importación/exportación (sin cambios)
// ...
