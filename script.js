// Simulación de una base de datos local
let products = JSON.parse(localStorage.getItem('products')) || [];
let recipes = JSON.parse(localStorage.getItem('recipes')) || {};
let productionOrders = JSON.parse(localStorage.getItem('productionOrders')) || [];
let operators = JSON.parse(localStorage.getItem('operators')) || [];
let materials = JSON.parse(localStorage.getItem('materials')) || [];
let costChartInstance = null;

let currentProductIdForRecipe = null;
let currentOrderIdToFinalize = null; // Variable para almacenar el ID de la orden actual

// La función 'saveToLocalStorage' ahora guarda los nuevos arrays
function saveToLocalStorage() {
    localStorage.setItem('products', JSON.stringify(products));
    localStorage.setItem('recipes', JSON.stringify(recipes));
    localStorage.setItem('productionOrders', JSON.stringify(productionOrders));
    localStorage.setItem('operators', JSON.stringify(operators));
    localStorage.setItem('materials', JSON.stringify(materials));
    console.log('Datos guardados en el almacenamiento local.');
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

    if (!file) {
        alert('Por favor, seleccione un archivo para cargar.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        let workbook;
        try {
            console.log('Iniciando lectura del archivo de productos...');
            if (file.name.endsWith('.csv')) {
                workbook = XLSX.read(e.target.result, { type: 'binary', bookType: 'csv' });
            } else {
                workbook = XLSX.read(e.target.result, { type: 'binary' });
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const newProductsFromFile = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            
            if (newProductsFromFile.length > 1) {
                products = newProductsFromFile.slice(1).map(row => ({
                    id: String(row[0] || ''),
                    name: String(row[1] || ''),
                    standardCost: 0
                }));
                
                saveToLocalStorage();
                loadProducts();
                populateProductSelects();
                populateReportProductFilter();
                alert('Productos cargados y actualizados correctamente.');
                console.log('Productos cargados:', products);
            } else {
                alert('El archivo no contiene datos válidos.');
            }
        } catch (error) {
            console.error("Error al procesar el archivo:", error);
            alert('Hubo un error al procesar el archivo. Por favor, asegúrese de que el formato sea correcto. (Ver la consola para más detalles)');
        }
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});

// *** Lógica para el formulario de carga de archivo de RECETAS ***
document.getElementById('uploadRecipeForm').addEventListener('submit', function(event) {
    event.preventDefault();

    if (!confirm('Esta acción sobrescribirá todas las recetas existentes. ¿Desea continuar?')) {
        return;
    }

    const fileInput = document.getElementById('recipeFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Por favor, seleccione un archivo para cargar.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        let workbook;
        try {
            console.log('Iniciando lectura del archivo de recetas...');
            if (file.name.endsWith('.csv')) {
                workbook = XLSX.read(e.target.result, { type: 'binary', bookType: 'csv' });
            } else {
                workbook = XLSX.read(e.target.result, { type: 'binary' });
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const recipesFromFile = XLSX.utils.sheet_to_json(worksheet);

            // Reiniciar el objeto de recetas para la nueva carga
            recipes = {};
            let hasError = false;

            recipesFromFile.forEach(row => {
                const productId = String(row.product_id).trim();
                const materialCode = String(row.material_code).trim();
                const quantity = parseFloat(row.quantity);

                // Validaciones
                if (!productId || !materialCode || isNaN(quantity) || quantity <= 0) {
                    console.error(`Error en la fila: `, row);
                    alert(`Error: Fila con datos inválidos. Asegúrese de que las columnas 'product_id', 'material_code' y 'quantity' existan y tengan valores correctos.`);
                    hasError = true;
                    return;
                }

                if (!products.find(p => p.id === productId)) {
                    alert(`Error: El ID de producto '${productId}' no existe. Por favor, cargue primero los productos.`);
                    hasError = true;
                    return;
                }

                if (!materials.find(m => m.code === materialCode)) {
                    alert(`Error: El código de material '${materialCode}' no existe. Por favor, cargue primero los materiales.`);
                    hasError = true;
                    return;
                }

                if (!recipes[productId]) {
                    recipes[productId] = [];
                }
                
                // Evitar duplicados por si acaso
                if (!recipes[productId].find(item => item.materialCode === materialCode)) {
                    recipes[productId].push({
                        materialCode,
                        quantity
                    });
                }
            });

            if (!hasError) {
                saveToLocalStorage();
                alert('Recetas cargadas y actualizadas correctamente.');
                console.log('Recetas cargadas:', recipes);
            }

        } catch (error) {
            console.error("Error al procesar el archivo:", error);
            alert('Hubo un error al procesar el archivo. Asegúrese de que el formato sea correcto. (Ver la consola para más detalles)');
        }
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});


// *** Lógica para el formulario de Añadir Producto Individualmente ***
document.getElementById('addProductForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const productId = document.getElementById('addProductId').value.trim();
    const productName = document.getElementById('addProductName').value.trim();

    if (productId === '' || productName === '') {
        alert('Por favor, complete todos los campos.');
        return;
    }

    if (products.find(p => p.id === productId)) {
        alert('Ya existe un producto con este ID. Por favor, use uno diferente.');
        return;
    }

    const newProduct = {
        id: productId,
        name: productName,
        standardCost: 0
    };

    products.push(newProduct);
    saveToLocalStorage();
    loadProducts();
    populateProductSelects();
    populateReportProductFilter();
    document.getElementById('addProductForm').reset();
    alert('Producto añadido con éxito.');
    console.log('Producto añadido:', newProduct);
});


// *** Lógica para el formulario de carga de archivo de MATERIALES ***
document.getElementById('uploadMaterialForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const fileInput = document.getElementById('materialFile');
    const file = fileInput.files[0];

    if (!file) {
        alert('Por favor, seleccione un archivo para cargar.');
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        let workbook;
        try {
            console.log('Iniciando lectura del archivo de materiales...');
            if (file.name.endsWith('.csv')) {
                workbook = XLSX.read(e.target.result, { type: 'binary', bookType: 'csv' });
            } else {
                workbook = XLSX.read(e.target.result, { type: 'binary' });
            }

            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const newMaterialsFromFile = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (newMaterialsFromFile.length > 1) {
                materials = newMaterialsFromFile.slice(1).map(row => ({
                    code: String(row[0] || ''),
                    description: String(row[1] || ''),
                    unit: String(row[2] || ''),
                    existence: Number(row[3] || 0),
                    cost: Number(row[4] || 0)
                }));
                
                saveToLocalStorage();
                loadMaterials();
                loadInventory();
                alert('Materiales cargados y actualizados correctamente.');
                console.log('Materiales cargados:', materials);
            } else {
                alert('El archivo no contiene datos válidos.');
            }
        } catch (error) {
            console.error("Error al procesar el archivo:", error);
            alert('Hubo un error al procesar el archivo. Por favor, asegúrese de que el formato sea correcto. (Ver la consola para más detalles)');
        }
    };

    if (file.name.endsWith('.csv')) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsArrayBuffer(file);
    }
});

// *** Lógica para el formulario de Añadir Material Individualmente ***
document.getElementById('addMaterialForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const materialCode = document.getElementById('addMaterialCode').value.trim();
    const materialDescription = document.getElementById('addMaterialDescription').value.trim();
    const materialUnit = document.getElementById('addMaterialUnit').value.trim();
    const materialExistence = parseInt(document.getElementById('addMaterialExistence').value);
    const materialCost = parseFloat(document.getElementById('addMaterialCost').value);

    if (materialCode === '' || materialDescription === '' || materialUnit === '' || isNaN(materialExistence) || isNaN(materialCost)) {
        alert('Por favor, complete todos los campos con valores válidos.');
        return;
    }

    if (materials.find(m => m.code === materialCode)) {
        alert('Ya existe un material con este código. Por favor, use uno diferente.');
        return;
    }

    const newMaterial = {
        code: materialCode,
        description: materialDescription,
        unit: materialUnit,
        existence: materialExistence,
        cost: materialCost
    };

    materials.push(newMaterial);
    saveToLocalStorage();
    loadMaterials();
    loadInventory();
    document.getElementById('addMaterialForm').reset();
    alert('Material añadido con éxito.');
    console.log('Material añadido:', newMaterial);
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
    if (!recipe || recipe.length === 0) {
        alert('No se puede crear la orden. No hay una receta definida para este producto. Por favor, gestione la receta en la sección de Productos.');
        return;
    }
    
    // Si hay materiales, crear la orden
    const newOrder = {
        orderId: Date.now().toString(), // ID único
        productId,
        quantity,
        operator,
        startDate: new Date().toLocaleDateString('es-ES'),
        status: 'Pendiente',
        actualQuantity: null,
        extraConsumption: []
    };
    productionOrders.push(newOrder);
    saveToLocalStorage();
    loadProductionOrders();
    updateDashboard();
    alert('Orden de producción creada con éxito.');
    document.getElementById('productionOrderForm').reset();
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
            <td>${order.actualQuantity !== null ? order.actualQuantity : order.quantity}</td>
            <td>${order.operator || 'N/A'}</td>
            <td>${order.startDate}</td>
            <td>${order.finishDate || 'N/A'}</td>
            <td>${order.status}</td>
        `;
        reportTableBody.appendChild(row);
    });
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
    if (e.target.classList.contains('finalize-order-btn')) {
        const orderId = e.target.dataset.id;
        openFinalizeOrderModal(orderId);
    } else if (e.target.classList.contains('view-order-btn')) {
        const orderId = e.target.dataset.id;
        viewOrderDetails(orderId);
    } else if (e.target.classList.contains('delete-order-btn')) {
        const orderId = e.target.dataset.id;
        deleteProductionOrder(orderId);
    }
});

// Función para abrir el modal de Finalizar Orden
function openFinalizeOrderModal(orderId) {
    currentOrderIdToFinalize = orderId;
    const order = productionOrders.find(o => o.orderId === orderId);
    if (!order) {
        alert('Orden no encontrada.');
        return;
    }

    document.getElementById('finalizeOrderId').textContent = orderId;
    document.getElementById('actualProductionQuantity').value = order.quantity;

    const extraConsumptionList = document.getElementById('extraConsumptionList');
    extraConsumptionList.innerHTML = ''; // Limpiar el contenedor

    // Si ya hay consumos extra guardados, mostrarlos
    if (order.extraConsumption && order.extraConsumption.length > 0) {
        order.extraConsumption.forEach(extra => {
            addExtraConsumptionRow(extra.materialCode, extra.quantity);
        });
    }

    const finalizeModal = new bootstrap.Modal(document.getElementById('finalizeOrderModal'));
    finalizeModal.show();
}

// Lógica para añadir un campo de consumo extra
document.getElementById('addExtraMaterialBtn').addEventListener('click', () => {
    addExtraConsumptionRow();
});

function addExtraConsumptionRow(materialCode = '', quantity = '') {
    const extraConsumptionList = document.getElementById('extraConsumptionList');
    const row = document.createElement('div');
    row.classList.add('row', 'g-2', 'mb-2');
    row.innerHTML = `
        <div class="col-md-7">
            <select class="form-control extra-material-select" required>
                <option value="">Seleccione un material</option>
            </select>
        </div>
        <div class="col-md-3">
            <input type="number" step="0.01" class="form-control extra-quantity-input" placeholder="Cantidad" value="${quantity}" required>
        </div>
        <div class="col-md-2">
            <button type="button" class="btn btn-danger remove-extra-btn w-100">X</button>
        </div>
    `;

    extraConsumptionList.appendChild(row);

    // Llenar el select con los materiales
    const select = row.querySelector('.extra-material-select');
    materials.forEach(material => {
        const option = document.createElement('option');
        option.value = material.code;
        option.textContent = `${material.code} - ${material.description}`;
        select.appendChild(option);
    });

    if (materialCode) {
        select.value = materialCode;
    }
}

// Lógica para eliminar un campo de consumo extra
document.getElementById('extraConsumptionList').addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-extra-btn')) {
        e.target.closest('.row').remove();
    }
});

// Lógica para el envío del formulario de finalización
document.getElementById('finalizeOrderForm').addEventListener('submit', (e) => {
    e.preventDefault();
    finalizeProductionOrder();
});

// Función para finalizar la orden de producción y descontar inventario
function finalizeProductionOrder() {
    const order = productionOrders.find(o => o.orderId === currentOrderIdToFinalize);
    if (!order) return;

    const actualQuantity = parseFloat(document.getElementById('actualProductionQuantity').value);
    if (isNaN(actualQuantity) || actualQuantity <= 0) {
        alert('Por favor, ingrese una cantidad real producida válida.');
        return;
    }

    const recipe = recipes[order.productId];
    if (!recipe) {
        alert('No se puede finalizar la orden. No hay una receta definida para este producto.');
        return;
    }

    // Recopilar los consumos extras del formulario
    const extraConsumption = [];
    document.querySelectorAll('#extraConsumptionList .row').forEach(row => {
        const materialCode = row.querySelector('.extra-material-select').value;
        const quantity = parseFloat(row.querySelector('.extra-quantity-input').value);
        if (materialCode && !isNaN(quantity) && quantity > 0) {
            extraConsumption.push({ materialCode, quantity });
        }
    });

    // Descontar los materiales del inventario (receta + extras)
    let hasSufficientMaterials = true;
    let missingMaterials = [];

    // Calcular y verificar consumo de la receta
    recipe.forEach(item => {
        const material = materials.find(m => m.code === item.materialCode);
        const requiredQuantity = item.quantity * actualQuantity;
        if (!material || material.existence < requiredQuantity) {
            hasSufficientMaterials = false;
            missingMaterials.push(`${material ? material.description : 'Desconocido'} (requerido: ${requiredQuantity})`);
        }
        if (material) {
            material.existence -= requiredQuantity;
        }
    });

    // Calcular y verificar consumo extra
    extraConsumption.forEach(extra => {
        const material = materials.find(m => m.code === extra.materialCode);
        if (!material || material.existence < extra.quantity) {
            hasSufficientMaterials = false;
            missingMaterials.push(`${material ? material.description : 'Desconocido'} (extra: ${extra.quantity})`);
        }
        if (material) {
            material.existence -= extra.quantity;
        }
    });

    if (!hasSufficientMaterials) {
        alert(`No hay suficientes materiales en stock para finalizar esta orden. Faltan: ${missingMaterials.join(', ')}. No se descontará el inventario.`);
        // Revertir los cambios de existencia si la validación falla
        recipe.forEach(item => {
            const material = materials.find(m => m.code === item.materialCode);
            if (material) {
                material.existence += item.quantity * actualQuantity;
            }
        });
        extraConsumption.forEach(extra => {
            const material = materials.find(m => m.code === extra.materialCode);
            if (material) {
                material.existence += extra.quantity;
            }
        });
        return;
    }

    // Actualizar el estado de la orden y sus datos
    order.status = 'Completada';
    order.finishDate = new Date().toLocaleDateString('es-ES');
    order.actualQuantity = actualQuantity;
    order.extraConsumption = extraConsumption;
    
    // Recalcular el costo total de la orden
    const { totalCost } = calculateStandardCost(order.productId);
    order.totalCost = totalCost * actualQuantity;

    saveToLocalStorage();
    loadProductionOrders();
    loadInventory();
    updateDashboard();
    bootstrap.Modal.getInstance(document.getElementById('finalizeOrderModal')).hide();
    alert('¡Orden de producción finalizada con éxito! El inventario ha sido actualizado.');
}

// Función para eliminar una orden de producción
function deleteProductionOrder(orderId) {
    const orderIndex = productionOrders.findIndex(o => o.orderId === orderId);
    if (orderIndex === -1) {
        alert('Orden no encontrada.');
        return;
    }

    const order = productionOrders[orderIndex];
    if (order.status !== 'Pendiente' || order.actualQuantity !== null) {
        alert('Solo se pueden eliminar órdenes pendientes sin consumos o producción registrada.');
        return;
    }

    if (confirm('¿Está seguro de que desea eliminar esta orden de producción? Esta acción es irreversible.')) {
        productionOrders.splice(orderIndex, 1);
        saveToLocalStorage();
        loadProductionOrders();
        updateDashboard();
        alert('Orden eliminada con éxito.');
    }
}

// Función para mostrar el modal con los detalles de la orden
function viewOrderDetails(orderId) {
    const order = productionOrders.find(o => o.orderId === orderId);
    const product = products.find(p => p.id === order.productId);
    const recipe = recipes[order.productId] || [];

    if (!order || !product) {
        alert('No se encontraron los detalles de la orden.');
        return;
    }

    // Llenar la información general de la orden
    document.getElementById('detailOrderId').textContent = order.orderId;
    document.getElementById('detailProductName').textContent = product.name;
    document.getElementById('detailQuantity').textContent = order.quantity;
    document.getElementById('detailActualQuantity').textContent = order.actualQuantity !== null ? order.actualQuantity : 'N/A';
    document.getElementById('detailOperator').textContent = order.operator;
    document.getElementById('detailStartDate').textContent = order.startDate;
    document.getElementById('detailFinishDate').textContent = order.finishDate || 'N/A';
    document.getElementById('detailStatus').textContent = order.status;

    // Llenar la tabla de materiales requeridos
    const requiredMaterialsTableBody = document.getElementById('requiredMaterialsTableBody');
    requiredMaterialsTableBody.innerHTML = '';
    
    const combinedConsumption = {};

    // Consumo de la receta
    recipe.forEach(item => {
        const required = (item.quantity * (order.actualQuantity || order.quantity));
        combinedConsumption[item.materialCode] = {
            recipeQuantity: required,
            extraQuantity: 0
        };
    });

    // Consumo extra
    if (order.extraConsumption) {
        order.extraConsumption.forEach(extra => {
            if (combinedConsumption[extra.materialCode]) {
                combinedConsumption[extra.materialCode].extraQuantity += extra.quantity;
            } else {
                combinedConsumption[extra.materialCode] = {
                    recipeQuantity: 0,
                    extraQuantity: extra.quantity
                };
            }
        });
    }

    if (Object.keys(combinedConsumption).length === 0) {
        requiredMaterialsTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No hay receta o consumos registrados para este producto.</td></tr>';
    } else {
        for (const code in combinedConsumption) {
            const consumption = combinedConsumption[code];
            const material = materials.find(m => m.code === code);
            const total = consumption.recipeQuantity + consumption.extraQuantity;
            
            if (material) {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${code}</td>
                    <td>${material.description}</td>
                    <td>${consumption.recipeQuantity.toFixed(2)}</td>
                    <td>${consumption.extraQuantity.toFixed(2)}</td>
                    <td>${total.toFixed(2)}</td>
                    <td>${material.unit}</td>
                `;
                requiredMaterialsTableBody.appendChild(row);
            }
        }
    }

    // Mostrar el modal
    const orderDetailsModal = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
    orderDetailsModal.show();
}

// Botones para Imprimir y Descargar PDF
document.getElementById('printOrderBtn').addEventListener('click', () => {
    printOrderDetails();
});

document.getElementById('downloadPdfBtn').addEventListener('click', () => {
    downloadOrderPdf();
});

// Función para imprimir el contenido del modal
function printOrderDetails() {
    const content = document.getElementById('orderDetailsContent').outerHTML;
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>Orden de Producción</title>');
    printWindow.document.write('<link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">');
    printWindow.document.write('<style>body{font-family: \'Poppins\', sans-serif;} .modal-body{padding: 2rem;} h5{color: #333;} .list-group-item strong{min-width: 150px; display: inline-block;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(content);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500); // Pequeño retraso para que los estilos se carguen
}

// Función para generar el PDF
function downloadOrderPdf() {
    const { jsPDF } = window.jspdf;
    const element = document.getElementById('orderDetailsContent');

    html2canvas(element, { scale: 2 }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const imgWidth = 210;
        const pageHeight = 297;
        const imgHeight = canvas.height * imgWidth / canvas.width;
        let heightLeft = imgHeight;
        let position = 0;

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        const orderId = document.getElementById('detailOrderId').textContent;
        pdf.save(`Orden_${orderId}.pdf`);
    });
}


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
        document.getElementById('editMaterialUnit').value = material.unit;
        document.getElementById('editMaterialExistence').value = material.existence;
        document.getElementById('editMaterialCost').value = material.cost;
        
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
        material.unit = document.getElementById('editMaterialUnit').value;
        material.existence = parseInt(document.getElementById('editMaterialExistence').value);
        material.cost = parseFloat(document.getElementById('editMaterialCost').value);
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
                <button class="btn btn-info btn-sm manage-recipe-btn" data-id="${product.id}">Gestionar Receta</button>
            </td>
        `;
        productsTableBody.appendChild(row);
    });
}

// Lógica para los nuevos botones "Gestionar Receta"
document.getElementById('productsTableBody').addEventListener('click', (e) => {
    if (e.target.classList.contains('manage-recipe-btn')) {
        const productId = e.target.dataset.id;
        manageRecipe(productId);
    }
});

// Función para inicializar el modal de gestión de recetas
function manageRecipe(productId) {
    currentProductIdForRecipe = productId;
    const product = products.find(p => p.id === productId);
    document.getElementById('recipeProductName').textContent = product ? product.name : 'Producto Desconocido';
    
    populateRecipeMaterialSelect();
    loadRecipeTable(productId);
    
    const recipeModal = new bootstrap.Modal(document.getElementById('manageRecipeModal'));
    recipeModal.show();
}

// Función para cargar los materiales en el select del modal de recetas
function populateRecipeMaterialSelect() {
    const select = document.getElementById('recipeMaterialSelect');
    select.innerHTML = '<option value="">Seleccione un material</option>';
    materials.forEach(material => {
        const option = document.createElement('option');
        option.value = material.code;
        // Ahora el texto de la opción muestra el código y luego la descripción
        option.textContent = `${material.code} - ${material.description}`;
        select.appendChild(option);
    });
}

// Función para cargar los ítems de la receta en la tabla del modal
function loadRecipeTable(productId) {
    const recipeTableBody = document.getElementById('recipeTableBody');
    recipeTableBody.innerHTML = '';
    const recipe = recipes[productId] || [];

    recipe.forEach(item => {
        const material = materials.find(m => m.code === item.materialCode);
        if (material) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.materialCode}</td>
                <td>${material.description}</td>
                <td>${item.quantity}</td>
                <td>${material.unit}</td>
                <td>
                    <button class="btn btn-danger btn-sm delete-recipe-item-btn" data-code="${item.materialCode}">Eliminar</button>
                </td>
            `;
            recipeTableBody.appendChild(row);
        }
    });
}

// Lógica para añadir un ítem a la receta
document.getElementById('addRecipeItemForm').addEventListener('submit', (e) => {
    e.preventDefault();

    const materialCode = document.getElementById('recipeMaterialSelect').value;
    const quantity = parseFloat(document.getElementById('recipeQuantity').value);

    if (!materialCode || isNaN(quantity) || quantity <= 0) {
        alert('Por favor, seleccione un material y una cantidad válida.');
        return;
    }

    if (!recipes[currentProductIdForRecipe]) {
        recipes[currentProductIdForRecipe] = [];
    }
    
    const existingItem = recipes[currentProductIdForRecipe].find(item => item.materialCode === materialCode);
    if (existingItem) {
        alert('Este material ya está en la receta. Por favor, elimínelo primero si desea modificar la cantidad.');
        return;
    }

    recipes[currentProductIdForRecipe].push({
        materialCode: materialCode,
        quantity: quantity
    });

    saveToLocalStorage();
    loadRecipeTable(currentProductIdForRecipe);
    document.getElementById('addRecipeItemForm').reset();
});

// Lógica para eliminar un ítem de la receta
document.getElementById('recipeTableBody').addEventListener('click', (e) => {
    if (e.target.classList.contains('delete-recipe-item-btn')) {
        const materialCodeToDelete = e.target.dataset.code;
        recipes[currentProductIdForRecipe] = recipes[currentProductIdForRecipe].filter(item => item.materialCode !== materialCodeToDelete);
        saveToLocalStorage();
        loadRecipeTable(currentProductIdForRecipe);
    }
});


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
            <td>${material.unit}</td>
            <td>$${material.cost.toFixed(2)}</td>
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
            <td>${material.unit}</td>
            <td>${material.existence}</td>
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
        const isCompleted = order.status === 'Completada';
        
        row.innerHTML = `
            <td>${order.orderId}</td>
            <td>${product ? product.name : 'Desconocido'}</td>
            <td>${order.quantity}</td>
            <td>${order.startDate}</td>
            <td>${order.finishDate || 'N/A'}</td>
            <td>${order.status}</td>
            <td>
                <button class="btn btn-primary btn-sm finalize-order-btn me-1" data-id="${order.orderId}" ${isCompleted ? 'disabled' : ''}>Finalizar</button>
                <button class="btn btn-danger btn-sm delete-order-btn me-1" data-id="${order.orderId}" ${isCompleted ? 'disabled' : ''}>Eliminar</button>
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
            const { totalCost: standardCost } = calculateStandardCost(order.productId);
            const recipeCost = (order.actualQuantity || order.quantity) * standardCost;
            
            let extraCost = 0;
            if (order.extraConsumption && order.extraConsumption.length > 0) {
                order.extraConsumption.forEach(extra => {
                    const material = materials.find(m => m.code === extra.materialCode);
                    if (material) {
                        extraCost += material.cost * extra.quantity;
                    }
                });
            }

            order.totalCost = recipeCost + extraCost;
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

// *** Funciones de Backup y Restore ***
document.getElementById('exportDataBtn').addEventListener('click', exportData);
document.getElementById('importFile').addEventListener('change', importData);

function exportData() {
    const data = {
        products,
        materials,
        recipes,
        productionOrders,
        operators // Incluir también operadores si se usa
    };
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `produccion_backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    if (!confirm('Esta acción sobrescribirá todos los datos actuales (Materiales, Productos, Recetas y Órdenes de Producción). ¿Está seguro de que desea continuar?')) {
        event.target.value = ''; // Resetear el input para permitir la re-selección del mismo archivo
        return;
    }

    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (importedData.products && importedData.materials && importedData.recipes && importedData.productionOrders) {
                products = importedData.products;
                materials = importedData.materials;
                recipes = importedData.recipes;
                productionOrders = importedData.productionOrders;
                // Opcional: Si el backup incluye otros datos, actualizarlos también
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
                // Ocultar la página después de cargar
                document.querySelector('.page-content').style.display = 'block';

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
