// Simulación de una base de datos local
let products = JSON.parse(localStorage.getItem('products')) || [];
let recipes = JSON.parse(localStorage.getItem('recipes')) || {};
let productionOrders = JSON.parse(localStorage.getItem('productionOrders')) || [];
let operators = JSON.parse(localStorage.getItem('operators')) || [];
let materials = JSON.parse(localStorage.getItem('materials')) || [];
let costChartInstance = null;

// La función 'saveToLocalStorage' ahora guarda los nuevos arrays
function saveToLocalStorage() {
    localStorage.setItem('products', JSON.stringify(products));
    localStorage.setItem('recipes', JSON.stringify(recipes));
    localStorage.setItem('productionOrders', JSON.stringify(productionOrders));
    localStorage.setItem('operators', JSON.stringify(operators));
    localStorage.setItem('materials', JSON.stringify(materials));
}

// *** Lógica para mostrar las pestañas ***
document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    // Función para mostrar la página correcta
    function showPage(pageId) {
        pages.forEach(page => {
            page.style.display = 'none';
        });
        document.getElementById(`${pageId}-page`).style.display = 'block';

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.page === pageId) {
                link.classList.add('active');
            }
        });
    }

    // Manejar clics en los enlaces de navegación
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = e.target.dataset.page;
            showPage(pageId);
            // Actualizar el hash de la URL sin recargar la página
            window.location.hash = pageId;
        });
    });

    // Cargar la página correcta al inicio
    const initialPage = window.location.hash ? window.location.hash.substring(1) : 'dashboard';
    showPage(initialPage);

    // Llamadas iniciales
    loadProducts();
    loadMaterials();
    loadInventory();
    loadProductionOrders();
    populateProductSelects();
    updateDashboard();
});

// *** Lógica para el formulario de carga de archivo ***
document.getElementById('uploadMaterialForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const fileInput = document.getElementById('materialFile');
    const file = fileInput.files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                // Asume que la primera fila son los encabezados y los ignora
                if (json.length > 1) {
                    const newMaterials = json.slice(1).map(row => {
                        return {
                            code: String(row[0]),
                            description: String(row[1]),
                            unit: String(row[2]),
                            existence: Number(row[3]),
                            cost: Number(row[4])
                        };
                    });
                    materials = [...materials, ...newMaterials];
                    saveToLocalStorage();
                    loadMaterials();
                    loadInventory();
                }
                alert('Materiales cargados correctamente.');
            } catch (error) {
                console.error("Error al procesar el archivo:", error);
                alert('Hubo un error al procesar el archivo. Por favor, asegúrese de que el formato sea correcto.');
            }
        };
        reader.readAsArrayBuffer(file);
    }
});

// Función para inicializar la tabla de productos
function loadProducts() {
    const productsTableBody = document.getElementById('productsTableBody');
    productsTableBody.innerHTML = '';
    products.forEach(product => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${product.id}</td>
            <td>${product.name}</td>
            <td>$${product.standardCost.toFixed(2)}</td>
            <td>
                <button class="btn btn-warning btn-sm edit-product-btn" data-id="${product.id}">Editar</button>
                <button class="btn btn-danger btn-sm delete-product-btn" data-id="${product.id}">Eliminar</button>
            </td>
        `;
        productsTableBody.appendChild(row);
    });
}

// Función para inicializar la tabla de materiales
function loadMaterials() {
    const materialsTableBody = document.getElementById('materialsTableBody');
    materialsTableBody.innerHTML = '';
    materials.forEach(material => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${material.code}</td>
            <td>${material.description}</td>
            <td>$${material.cost.toFixed(2)}</td>
            <td>${material.unit}</td>
            <td>
                <button class="btn btn-warning btn-sm edit-material-btn" data-code="${material.code}">Editar</button>
                <button class="btn btn-danger btn-sm delete-material-btn" data-code="${material.code}">Eliminar</button>
            </td>
        `;
        materialsTableBody.appendChild(row);
    });
}

// Función para inicializar la tabla de inventario
function loadInventory() {
    const inventoryTableBody = document.getElementById('inventoryTableBody');
    inventoryTableBody.innerHTML = '';
    materials.forEach(material => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${material.code}</td>
            <td>${material.description}</td>
            <td>${material.existence}</td>
            <td>${material.unit}</td>
            <td>$${material.cost.toFixed(2)}</td>
        `;
        inventoryTableBody.appendChild(row);
    });
}

// Función para inicializar la tabla de órdenes de producción
function loadProductionOrders() {
    const ordersTableBody = document.getElementById('ordersTableBody');
    ordersTableBody.innerHTML = '';
    productionOrders.forEach(order => {
        const product = products.find(p => p.id === order.productId);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${order.orderId}</td>
            <td>${product ? product.name : 'Desconocido'}</td>
            <td>${order.quantity}</td>
            <td>${order.startDate}</td>
            <td>${order.finishDate || 'N/A'}</td>
            <td>${order.status}</td>
            <td>
                <button class="btn btn-primary btn-sm complete-order-btn" data-id="${order.orderId}" ${order.status === 'Completada' ? 'disabled' : ''}>Completar</button>
                <button class="btn btn-info btn-sm view-order-btn" data-id="${order.orderId}">Ver</button>
            </td>
        `;
        ordersTableBody.appendChild(row);
    });
}

// Funciones para cargar datos en los selectores
function populateProductSelects() {
    const selects = document.querySelectorAll('#productSelect, #orderProductSelect');
    selects.forEach(select => {
        select.innerHTML = '<option value="">Seleccione un producto</option>';
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name;
            select.appendChild(option);
        });
    });
}

// Funciones de cálculo y reportes
function calculateStandardCost(productId) {
    const recipe = recipes[productId];
    if (!recipe) {
        return { totalCost: 0, materialsCost: 0, packagingCost: 0 };
    }

    let materialsCost = 0;
    let packagingCost = 0;

    recipe.forEach(item => {
        const material = materials.find(m => m.code === item.materialCode);
        if (material) {
            const cost = material.cost * item.quantity;
            if (material.code.startsWith('MP')) {
                materialsCost += cost;
            } else if (material.code.startsWith('ME')) {
                packagingCost += cost;
            }
        }
    });

    const totalCost = materialsCost + packagingCost;
    return { totalCost, materialsCost, packagingCost };
}

function updateDashboard() {
    let totalCost = 0;
    let completedOrders = 0;
    productionOrders.forEach(order => {
        if (order.status === 'Completada') {
            totalCost += order.totalCost;
            completedOrders++;
        }
    });
    const avgCost = completedOrders > 0 ? totalCost / completedOrders : 0;
    document.getElementById('avg-cost').textContent = avgCost.toFixed(2);

    const activeOrders = productionOrders.filter(order => order.status === 'Pendiente').length;
    document.getElementById('active-orders').textContent = activeOrders;

    const lowStockCount = materials.filter(m => m.existence < 100).length; // Ejemplo: menos de 100 unidades en stock
    document.getElementById('low-stock').textContent = lowStockCount;

    // Actualizar el gráfico
    updateCostChart();
}

function updateCostChart() {
    const ctx = document.getElementById('costChart').getContext('2d');

    // Destruir el gráfico anterior si existe
    if (costChartInstance) {
        costChartInstance.destroy();
    }

    const completedOrderCosts = productionOrders
        .filter(order => order.status === 'Completada')
        .map(order => ({
            label: `Orden ${order.orderId}`,
            cost: order.totalCost
        }));

    costChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: completedOrderCosts.map(item => item.label),
            datasets: [{
                label: 'Costo Total por Orden de Producción',
                data: completedOrderCosts.map(item => item.cost),
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// Lógica para manejar formularios
document.getElementById('costo-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const productId = document.getElementById('productSelect').value;
    const { totalCost, materialsCost, packagingCost } = calculateStandardCost(productId);

    document.getElementById('standardCostValue').textContent = totalCost.toFixed(2);
    document.getElementById('materialsCost').textContent = materialsCost.toFixed(2);
    document.getElementById('packagingCost').textContent = packagingCost.toFixed(2);
    document.getElementById('costResult').style.display = 'block';

    // Actualizar el costo estándar en el array de productos
    const product = products.find(p => p.id === productId);
    if (product) {
        product.standardCost = totalCost;
        saveToLocalStorage();
        loadProducts(); // Recargar la tabla de productos para mostrar el costo actualizado
    }
});
