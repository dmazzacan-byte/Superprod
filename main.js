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

export function updateGlobalData(dataKey, newData) {
    switch (dataKey) {
        case 'products': products = newData; break;
        case 'recipes': recipes = newData; break;
        case 'productionOrders': productionOrders = newData; break;
        case 'operators': operators = newData; break;
        case 'materials': materials = newData; break;
    }
    saveToLocalStorage();
}

export function calculateProductionOrderMetrics() {
    const metrics = {
        totalValue: 0,
        totalCost: 0,
        totalProfit: 0,
        totalOvercost: 0,
        totalQuantity: 0
    };
    const completedOrders = productionOrders.filter(o => o.status === 'Completada');
    completedOrders.forEach(order => {
        const product = products.find(p => p.id === order.productId);
        if (product) {
            const recipe = recipes[product.id];
            const materialCosts = recipe ? recipe.items.reduce((sum, item) => {
                const material = materials.find(m => m.code === item.materialId);
                return sum + (material ? material.cost * item.quantity : 0);
            }, 0) : 0;
            const extraMaterialCosts = order.extraConsumption ? order.extraConsumption.reduce((sum, item) => {
                const material = materials.find(m => m.code === item.materialId);
                return sum + (material ? material.cost * item.quantity : 0);
            }, 0) : 0;
            const totalMaterialCost = materialCosts + extraMaterialCosts;
            const laborCost = order.quantity * product.laborCost;
            const totalCost = totalMaterialCost + laborCost + order.extraCost;
            const revenue = order.quantity * product.salePrice;
            const profit = revenue - totalCost;
            metrics.totalValue += revenue;
            metrics.totalCost += totalCost;
            metrics.totalProfit += profit;
            metrics.totalOvercost += order.extraCost;
            metrics.totalQuantity += order.quantity;
        }
    });
    return metrics;
}

export function calculateTotalCost(order) {
    const product = products.find(p => p.id === order.productId);
    const recipe = recipes[product.id];
    let materialCost = 0;
    if (recipe) {
        materialCost = recipe.items.reduce((sum, item) => {
            const material = materials.find(m => m.code === item.materialId);
            return sum + (material ? material.cost * item.quantity : 0);
        }, 0);
    }
    const laborCost = order.quantity * product.laborCost;
    const overcost = order.extraCost || 0;
    const totalCost = materialCost + laborCost + overcost;
    return { totalCost, materialCost, laborCost, overcost };
}

// ----------- Lógica de navegación y sidebar móvil -----------
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');

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
        // Si tienes funciones para otras páginas, ponlas aquí
    }

    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const pageId = event.currentTarget.getAttribute('data-page');
            history.pushState(null, '', `#${pageId}`);
            showPage(pageId);

            // Oculta el sidebar en móvil después de hacer click
            if (window.innerWidth < 768) {
                sidebar.classList.remove('show');
            }
        });
    });

    window.addEventListener('hashchange', () => {
        const pageId = window.location.hash.substring(1) || 'dashboard';
        showPage(pageId);
    });

    const initialPage = window.location.hash.substring(1) || 'dashboard';
    showPage(initialPage);

    // --- Toggle Sidebar en móvil ---
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('show');
    });

    // Oculta el sidebar si se hace click fuera de él en móvil
    document.addEventListener('click', (e) => {
        if (window.innerWidth < 768) {
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('show');
            }
        }
    });
});
