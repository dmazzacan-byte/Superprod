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
    populateReportProductFilter();
    updateDashboard();
});

// *** Lógica para el formulario de carga de archivo de PRODUCTOS ***
document.getElementById('uploadProductForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const fileInput = document.getElementById('productFile');
    const file = fileInput.files[0];

    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const newProductsFromFile = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (newProductsFromFile.length > 1) {
                    products = newProductsFromFile.slice(1).map(row => ({
                        id: String(row[0]),
                        name: String(row[1]),
                        standardCost: 0
                    }));
                    
                    saveToLocalStorage();
                    loadProducts();
                    populateProductSelects();
                    populateReportProductFilter();
                    alert('Productos cargados y actualizados correctamente.');
                }
            } catch (error) {
                console.error("Error al procesar el archivo:", error);
                alert('Hubo un error al procesar el archivo. Por favor, asegúrese de que el formato sea correcto.');
            }
        };
        reader.readAsArrayBuffer(file);
    }
});


// *** Lógica para el formulario de carga de archivo de MATERIALES ***
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
                const newMaterialsFromFile = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (newMaterialsFromFile.length > 1) {
                    materials = newMaterialsFromFile.slice(1).map(row => ({
                        code: String(row[0]),
                        description: String(row[1]),
                        unit: String(row[2]),
                        existence: Number(row[3]),
                        cost: Number(row[4])
                    }));
                    
                    saveToLocalStorage();
                    loadMaterials();
                    loadInventory();
                    alert('Materiales cargados y actualizados correctamente.');
                }
            } catch (error) {
                console.error("Error al procesar el archivo:", error);
                alert('Hubo un error al procesar el archivo. Por favor, asegúrese de que el formato sea correcto.');
            }
        };
        reader.readAsArrayBuffer(file);
    }
});

// Lógica del formulario de orden de producción
document.getElementById('productionOrderForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const productId = document.getElementById('orderProductSelect').value;
    const quantity = parseInt(document.getElementById('orderQuantity').value);
    const operator = document.getElementById('orderOperator').value.trim();
    
    // Validar que se ha seleccionado un producto
    if (!productId || isNaN(quantity) || quantity <= 0) {
        alert('Por favor, seleccione un producto y una cantidad válida.');
        return;
    }

    if (!operator) {
        alert('Por favor, ingrese el nombre del operador.');
        return;
    }

    const recipe = recipes[productId];
    if (!recipe) {
        alert('No se puede crear la orden. No hay una receta definida para este producto.');
        return;
    }

    // Verificar si hay suficientes materiales en stock
    let hasSufficientMaterials = true;
    let missingMaterials = [];
    
    recipe.forEach(item => {
        const material = materials.find(m => m.code === item.materialCode);
        const requiredQuantity = item.quantity * quantity;
        if (!material || material.existence < requiredQuantity) {
            hasSufficientMaterials = false;
            missingMaterials.push(material ? material.description : 'Material Desconocido');
        }
    });

    if (!hasSufficientMaterials) {
        alert(`No hay suficientes materiales para esta orden. Faltan: ${missingMaterials.join(', ')}`);
        return;
    }

    // Si hay materiales, crear la orden
    const newOrder = {
        orderId: Date.now().toString(), // ID único
        productId,
        quantity,
        operator,
        startDate: new Date().toLocaleDateString('es-ES'),
        status: 'Pendiente'
    };
    productionOrders.push(newOrder);
    saveToLocalStorage();
    loadProductionOrders();
    updateDashboard();
    alert('Orden de producción creada con éxito. Los materiales se descontarán al completarla.');
});

// Lógica para el formulario de reportes
document.getElementById('productionReportForm').addEventListener('submit', function(e) {
    e.preventDefault();
    generateProductionReport();
});

// Función para generar el reporte de producción
function generateProductionReport() {
    const productFilter = document.getElementById('reportProductFilter').value;
    const orderIdFilter = document.getElementById('reportOrderIdFilter').value.toLowerCase();
    const operatorFilter = document.getElementById('reportOperatorFilter').value.toLowerCase();
    const startDateFilter = document.getElementById('reportStartDate').value;
    const endDateFilter = document.getElementById('reportEndDate').value;

    let filteredOrders = productionOrders.filter(order => {
        // Filtro por producto
        const productMatch = !productFilter || order.productId === productFilter;
        // Filtro por ID de Orden
        const orderIdMatch = !orderIdFilter || order.orderId.toLowerCase().includes(orderIdFilter);
        // Filtro por Operador
        const operatorMatch = !operatorFilter || (order.operator && order.operator.toLowerCase().includes(operatorFilter));
        // Filtro por rango de fechas
        const orderDate = new Date(order.startDate.split('/').reverse().join('-'));
        const startDateMatch = !startDateFilter || orderDate >= new Date(startDateFilter);
        const endDateMatch = !endDateFilter || orderDate <= new Date(endDateFilter);
        
        return productMatch && orderIdMatch && operatorMatch && startDateMatch && endDateMatch;
    });

    const reportTableBody = document.getElementById('reportTableBody');
    reportTableBody.innerHTML = '';

    if (filteredOrders.length === 0) {
        reportTableBody.innerHTML = '<tr><td colspan="7" class="text-center">No se encontraron órdenes que coincidan con los filtros.</td></tr>';
        return;
    }

    filteredOrders.forEach(order => {
        const product = products.find(p => p.id === order.productId);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${order.orderId}</td>
            <td>${product ? product.name : 'Desconocido'}</td>
            <td>${order.quantity}</td>
            <td>${order.operator || 'N/A'}</td>
            <td>${order.startDate}</td>
            <td>${order.finishDate || 'N/A'}</td>
            <td>${order.status}</td>
        `;
        reportTableBody.appendChild(row);
    });
}

// Función para completar una orden de producción
function completeProductionOrder(orderId) {
    const order = productionOrders.find(o => o.orderId === orderId);
    if (!order || order.status === 'Completada') {
        return;
    }

    const recipe = recipes[order.productId];
    if (!recipe) {
        alert('No se puede completar la orden. No hay una receta definida para este producto.');
        return;
    }

    // Descontar los materiales del inventario
    recipe.forEach(item => {
        const material = materials.find(m => m.code === item.materialCode);
        if (material) {
            const requiredQuantity = item.quantity * order.quantity;
            material.existence -= requiredQuantity;
        }
    });

    // Actualizar el estado de la orden y su fecha de finalización
    order.status = 'Completada';
    order.finishDate = new Date().toLocaleDateString('es-ES');
    
    // Recalcular el costo total de la orden
    const { totalCost } = calculateStandardCost(order.productId);
    order.totalCost = totalCost * order.quantity;

    saveToLocalStorage();
    loadProductionOrders();
    loadInventory();
    updateDashboard();
    alert('¡Orden de producción completada con éxito! El inventario ha sido actualizado.');
}

// *** Lógica para los botones de editar y eliminar materiales ***
document.getElementById('materialsTableBody').addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-material-btn')) {
        const materialCode = e.target.dataset.code;
        deleteMaterial(materialCode);
    } else if (e.target.classList.contains('edit-material-btn')) {
        const materialCode = e.target.dataset.code;
        editMaterial(materialCode);
    }
});

// Lógica para los botones de la tabla de órdenes
document.getElementById('ordersTableBody').addEventListener('click', (e) => {
    if (e.target.classList.contains('complete-order-btn')) {
        const orderId = e.target.dataset.id;
        if (confirm('¿Está seguro de que desea completar esta orden? El inventario será descontado.')) {
            completeProductionOrder(orderId);
        }
    } else if (e.target.classList.contains('view-order-btn')) {
        const orderId = e.target.dataset.id;
        // Esta función aún no está implementada, pero el evento está listo
        alert(`Ver detalles de la orden ${orderId}`);
    }
});

function deleteMaterial(code) {
    if (confirm('¿Está seguro de que desea eliminar este material?')) {
        materials = materials.filter(material => material.code !== code);
        saveToLocalStorage();
        loadMaterials();
        loadInventory();
        alert('Material eliminado con éxito.');
    }
}

function editMaterial(code) {
    const material = materials.find(m => m.code === code);
    if (material) {
        document.getElementById('editMaterialCode').value = material.code;
        document.getElementById('editMaterialDescription').value = material.description;
        document.getElementById('editMaterialCost').value = material.cost;
        document.getElementById('editMaterialUnit').value = material.unit;
        document.getElementById('editMaterialExistence').value = material.existence;
        
        const editModal = new bootstrap.Modal(document.getElementById('editMaterialModal'));
        editModal.show();
    }
}

document.getElementById('editMaterialForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const code = document.getElementById('editMaterialCode').value;
    const material = materials.find(m => m.code === code);
    if (material) {
        material.description = document.getElementById('editMaterialDescription').value;
        material.cost = parseFloat(document.getElementById('editMaterialCost').value);
        material.unit = document.getElementById('editMaterialUnit').value;
        material.existence = parseInt(document.getElementById('editMaterialExistence').value);
        saveToLocalStorage();
        loadMaterials();
        loadInventory();
        bootstrap.Modal.getInstance(document.getElementById('editMaterialModal')).hide();
        alert('Material actualizado correctamente.');
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
    // Ordenar los materiales por código alfabéticamente
    materials.sort((a, b) => a.code.localeCompare(b.code));
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
    // Ordenar los materiales por código alfabéticamente
    materials.sort((a, b) => a.code.localeCompare(b.code));
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

function populateReportProductFilter() {
    const select = document.getElementById('reportProductFilter');
    select.innerHTML = '<option value="">Todos los productos</option>';
    products.forEach(product => {
        const option = document.createElement('option');
        option.value = product.id;
        option.textContent = product.name;
        select.appendChild(option);
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
