import { updateDashboard, initializeDashboardListeners } from './dashboard.js';
import { loadMaterials, initializeMaterialsListeners } from './materials.js';
import { loadProducts, initializeProductsListeners, calculateTotalCost, calculateProductionOrderMetrics } from './products.js';

// Simulación de una base de datos local
export let products = JSON.parse(localStorage.getItem('products')) || [];
export let recipes = JSON.parse(localStorage.getItem('recipes')) || {};
export let productionOrders = JSON.parse(localStorage.getItem('productionOrders')) || [];
export let operators = JSON.parse(localStorage.getItem('operators')) || [];
export let materials = JSON.parse(localStorage.getItem('materials')) || [];

// La función 'saveToLocalStorage' ahora guarda todos los arrays
export function saveToLocalStorage() {
    localStorage.setItem('products', JSON.stringify(products));
    localStorage.setItem('recipes', JSON.stringify(recipes));
    localStorage.setItem('productionOrders', JSON.stringify(productionOrders));
    localStorage.setItem('operators', JSON.stringify(operators));
    localStorage.setItem('materials', JSON.stringify(materials));
    console.log('Datos guardados en el almacenamiento local.');
}

// Lógica para mostrar las pestañas
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
        
        // Cargar datos al cambiar de página
        if (pageId === 'dashboard') {
            updateDashboard();
        }
        if (pageId === 'materials') {
            loadMaterials();
        }
        if (pageId === 'products') {
            loadProducts();
        }
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

    // Inicializar listeners de los módulos
    initializeDashboardListeners();
    initializeMaterialsListeners();
    initializeProductsListeners();
});

// Lógica para importar/exportar datos (se queda en main.js porque es de alto nivel)
document.getElementById('exportBackupBtn').addEventListener('click', () => {
    const data = {
        products,
        recipes,
        productionOrders,
        operators,
        materials
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `superproduccion_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
});

document.getElementById('importBackup').addEventListener('change', importBackupFile);

function importBackupFile(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            if (importedData.products && importedData.materials) {
                products = importedData.products;
                materials = importedData.materials;
                recipes = importedData.recipes;
                productionOrders = importedData.productionOrders;
                if (importedData.operators) {
                    operators = importedData.operators;
                }
                saveToLocalStorage();
                alert('Datos restaurados correctamente desde el archivo de copia de seguridad.');
                // Recargar todas las tablas para reflejar los nuevos datos
                loadProducts();
                loadMaterials();
                loadInventory();
                loadProductionOrders();
                populateProductSelects();
                populateReportProductFilter();
                updateDashboard();
            } else {
                alert('El archivo no tiene el formato de copia de seguridad correcto.');
            }
        } catch (error) {
            console.error('Error al importar el archivo:', error);
            alert('Error al leer el archivo. Asegúrese de que sea un archivo de copia de seguridad válido (.json).');
        } finally {
            event.target.value = ''; // Resetear el input
        }
    };
    reader.readAsText(file);
}
