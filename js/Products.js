                <button type="button" class="btn btn-sm btn-secondary view-recipe-btn" data-id="${product.id}" data-bs-toggle="modal" data-bs-target="#recipeModal">
                    <i class="fas fa-clipboard-list"></i> Ver Receta
                </button>
            </td>
            <td>
                <button type="button" class="btn btn-sm btn-danger delete-product-btn" data-id="${product.id}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        productsTableBody.appendChild(row);
    });

    if (productTable) {
        productTable.destroy();
    }
    productTable = new DataTable('#productsTable', {
        responsive: true,
        destroy: true,
        lengthMenu: [
            [5, 10, 25, 50, -1],
            [5, 10, 25, 50, "Todos"]
        ]
    });

    populateProductSelects();
    populateReportProductFilter();
}

export function loadProductionOrders() {
    const ordersTableBody = document.getElementById('productionOrdersTableBody');
    ordersTableBody.innerHTML = '';
    productionOrders.forEach(order => {
        const product = products.find(p => p.id === order.productId);
        const operator = operators.find(o => o.id === order.operatorId);
        const statusClass = order.status === 'Completada' ? 'bg-success text-white' : 'bg-warning text-dark';
        const actionsHtml = order.status !== 'Completada' ?
            `<button type="button" class="btn btn-sm btn-info finalize-order-btn" data-id="${order.id}" data-bs-toggle="modal" data-bs-target="#finalizeOrderModal">
                <i class="fas fa-check"></i> Finalizar
            </button>` : '';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${order.id}</td>
            <td>${order.date}</td>
            <td>${product ? product.description : 'Desconocido'}</td>
            <td>${order.quantity}</td>
            <td><span class="badge ${statusClass}">${order.status}</span></td>
            <td>${operator ? operator.name : 'Desconocido'}</td>
            <td>
                ${actionsHtml}
            </td>
        `;
        ordersTableBody.appendChild(row);
    });

    if (productionOrdersTable) {
        productionOrdersTable.destroy();
    }
    productionOrdersTable = new DataTable('#productionOrdersTable', {
        responsive: true,
        destroy: true,
        lengthMenu: [
            [5, 10, 25, 50, -1],
            [5, 10, 25, 50, "Todos"]
        ],
        order: [
            [0, 'desc']
        ] // Ordenar por ID descendente
    });
}

// Funciones de utilidad
export function populateProductSelects() {
    const selectElements = document.querySelectorAll('.product-select');
    selectElements.forEach(select => {
        const selectedValue = select.value;
        select.innerHTML = '<option value="">Seleccione un producto</option>';
        products.forEach(product => {
            select.innerHTML += `<option value="${product.id}">${product.description}</option>`;
        });
        select.value = selectedValue;
    });
}

export function populateReportProductFilter() {
    const filterSelect = document.getElementById('reportProductFilter');
    const selectedValue = filterSelect.value;
    filterSelect.innerHTML = '<option value="all">Todos los Productos</option>';
    products.forEach(product => {
        filterSelect.innerHTML += `<option value="${product.id}">${product.description}</option>`;
    });
    filterSelect.value = selectedValue;
}

// *** CÁLCULO DE COSTOS Y SOBRECOSTO CORREGIDO ***
export function calculateTotalCost(order) {
    let materialCost = 0;
    let laborCost = 0;

    const recipe = recipes[order.productId];
    if (recipe) {
        for (const item of recipe.materials) {
            const material = materials.find(m => m.code === item.materialCode);
            if (material) {
                materialCost += material.cost * item.quantity;
            }
        }
    }

    const product = products.find(p => p.id === order.productId);
    if (product) {
        laborCost = product.laborCost * order.quantity;
    }

    let overcost = 0;
    if (order.extraConsumption && Array.isArray(order.extraConsumption)) {
        for (const extra of order.extraConsumption) {
            const material = materials.find(m => m.code === extra.materialCode);
            if (material) {
                // Se resta la cantidad de la receta para evitar duplicar el costo
                const baseQuantity = (recipe.materials.find(m => m.materialCode === extra.materialCode)?.quantity || 0);
                const extraQuantity = extra.quantity - baseQuantity;
                if (extraQuantity > 0) {
                    overcost += material.cost * extraQuantity;
                }
            }
        }
    }

    return {
        materialCost,
        laborCost,
        overcost,
        totalCost: materialCost + laborCost + overcost
    };
}

export function calculateProductionOrderMetrics() {
    let totalValue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let totalOvercost = 0;
    let totalQuantity = 0;
    
    productionOrders.forEach(order => {
        if (order.status === 'Completada') {
            const product = products.find(p => p.id === order.productId);
            if (product) {
                const costs = calculateTotalCost(order);
                totalValue += product.salePrice * order.quantity;
                totalCost += costs.totalCost;
                totalOvercost += costs.overcost;
                totalQuantity += order.quantity;
            }
        }
    });

    totalProfit = totalValue - totalCost;

    return {
        totalValue,
        totalCost,
        totalProfit,
        totalOvercost,
        totalQuantity
    };
}

// Lógica de los formularios y botones
function handleAddProductForm(event) {
    event.preventDefault();
    const productId = document.getElementById('addProductId').value.trim();
    const productDescription = document.getElementById('addProductDescription').value.trim();
    const productLaborCost = parseFloat(document.getElementById('addProductLaborCost').value);
    const productSalePrice = parseFloat(document.getElementById('addProductSalePrice').value);

    const existingProduct = products.find(p => p.id === productId);
    if (existingProduct) {
        alert('Ya existe un producto con este ID.');
        return;
    }

    products.push({
        id: productId,
        description: productDescription,
        laborCost: productLaborCost,
        salePrice: productSalePrice
    });
    saveToLocalStorage();
    loadProducts();
    alert('Producto añadido con éxito.');
    document.getElementById('addProductForm').reset();
}

function handleDeleteProduct(id) {
    const isUsedInOrder = productionOrders.some(order => order.productId === id);
    if (isUsedInOrder) {
        alert('No se puede eliminar este producto porque está asociado a una o más órdenes de producción.');
        return;
    }
    if (confirm('¿Estás seguro de que quieres eliminar este producto? Esto también eliminará su receta.')) {
        products = products.filter(p => p.id !== id);
        delete recipes[id];
        saveToLocalStorage();
        loadProducts();
        alert('Producto y receta eliminados.');
    }
}

// ... (secciones para la lógica de recetas y órdenes de producción)

// Inicializar listeners
export function initializeProductsListeners() {
    document.getElementById('addProductForm').addEventListener('submit', handleAddProductForm);
    document.getElementById('productsTableBody').addEventListener('click', (e) => {
        if (e.target.closest('.delete-product-btn')) {
            const id = e.target.closest('.delete-product-btn').dataset.id;
            handleDeleteProduct(id);
        }
    });
    // ... más listeners para recetas y órdenes
}

// Funciones que necesitas para que el resto del código funcione
export function loadInventory() {}
export function loadProductionOrdersTable() {}
