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

/**
 * Calcula el costo total de una orden de producción.
 * @param {object} order - La orden de producción.
 * @returns {{materialCost: number, laborCost: number, totalCost: number, overcost: number}}
 */
export function calculateTotalCost(order) {
    let materialCost = 0;
    let overcost = 0;

    // Calcular costo de materiales según la receta original
    const recipe = recipes[order.productId];
    if (recipe) {
        recipe.materials.forEach(recipeMaterial => {
            const material = materials.find(m => m.code === recipeMaterial.code);
            if (material) {
                materialCost += (recipeMaterial.quantity * material.unitCost);
            }
        });
    }

    // Calcular sobrecostos por materiales extra
    if (order.extraConsumption) {
        order.extraConsumption.forEach(extra => {
            const material = materials.find(m => m.code === extra.code);
            if (material) {
                overcost += (extra.quantity * material.unitCost);
            }
        });
    }

    // Calcular el costo de mano de obra
    const product = products.find(p => p.id === order.productId);
    const laborCost = product ? (product.laborCost * order.quantity) : 0;
    
    const totalCost = materialCost + laborCost + overcost;
    return { materialCost, laborCost, totalCost, overcost };
}

/**
 * Calcula métricas generales del dashboard.
 * @returns {{totalValue: number, totalCost: number, totalProfit: number, totalOvercost: number, totalQuantity: number}}
 */
export function calculateProductionOrderMetrics() {
    let totalValue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalOvercost = 0;
    let totalQuantity = 0;

    productionOrders.filter(o => o.status === 'Completada').forEach(order => {
        const product = products.find(p => p.id === order.productId);
        const costs = calculateTotalCost(order);
        
        const value = product ? product.salePrice * order.quantity : 0;
        const profit = value - costs.totalCost;

        totalValue += value;
        totalCost += costs.totalCost;
        totalProfit += profit;
        totalOvercost += costs.overcost;
        totalQuantity += order.quantity;
    });

    return { totalValue, totalCost, totalProfit, totalOvercost, totalQuantity };
}

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

    initializeDashboardListeners();
    initializeMaterialsListeners();
    initializeProductsListeners();
});
