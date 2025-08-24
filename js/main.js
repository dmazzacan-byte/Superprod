import { updateDashboard } from './dashboard.js';
import { loadMaterials } from './materials.js';
import { loadProducts, loadProductionOrders } from './products.js';

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
        default:
            console.error('Clave de datos no válida:', dataKey);
            return;
    }
    saveToLocalStorage();
}

// Inicialización de la página y manejo de la navegación
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    function showPage(pageId) {
        pages.forEach(page => {
            page.style.display = 'none';
        });

        const pageElement = document.getElementById(`${pageId}-page`);
        if (pageElement) {
            pageElement.style.display = 'block';
        }

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('data-page') === pageId) {
                link.classList.add('active');
            }
        });

        if (pageId === 'dashboard') updateDashboard();
        if (pageId === 'materials') loadMaterials();
        if (pageId === 'products') loadProducts();
        if (pageId === 'production-orders') loadProductionOrders();
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
});
