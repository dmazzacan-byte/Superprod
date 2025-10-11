import * as state from './state.js';
import { initTomSelect, getIntermediateProductCodes, formatCurrency, formatDateShort, getBaseMaterials } from './utils.js';

/**
 * Populates the filter select elements on the reports page.
 */
function populateReportFilters() {
    initTomSelect('#productFilter', {
        options: [{ value: 'all', text: 'Todos los Productos' }, ...state.products.sort((a,b) => a.descripcion.localeCompare(b.descripcion)).map(p => ({ value: p.codigo, text: p.descripcion }))],
        valueField: 'value', labelField: 'text', searchField: ['text'], placeholder: 'Filtrar por producto...'
    }).setValue('all');

    initTomSelect('#operatorFilter', {
        options: [{ value: 'all', text: 'Todos los Operadores' }, ...state.operators.sort((a,b) => a.name.localeCompare(b.name)).map(o => ({ value: o.id, text: o.name }))],
        valueField: 'value', labelField: 'text', searchField: ['text'], placeholder: 'Filtrar por operador...'
    }).setValue('all');

    initTomSelect('#equipoFilter', {
        options: [{ value: 'all', text: 'Todos los Equipos' }, ...state.equipos.sort((a,b) => a.name.localeCompare(b.name)).map(e => ({ value: e.id, text: e.name }))],
        valueField: 'value', labelField: 'text', searchField: ['text'], placeholder: 'Filtrar por equipo...'
    }).setValue('all');

    const almacenFilter = document.getElementById('reportAlmacenFilter');
    almacenFilter.innerHTML = '<option value="all">Todos</option>';
    state.almacenes.forEach(a => {
        almacenFilter.add(new Option(a.name, a.id));
    });
}

/**
 * Initializes the reports page by populating filters and setting up event listeners.
 */
export function loadReports() {
    populateReportFilters();
    document.getElementById('applyReportFilters').addEventListener('click', generateAllReports);
    generateAllReports(); // Initial load
}

/**
 * Main function to generate all reports based on the current filter values.
 */
function generateAllReports() {
    const start = document.getElementById('startDateFilter').value;
    const end = document.getElementById('endDateFilter').value;
    const productId = document.getElementById('productFilter').value;
    const operatorId = document.getElementById('operatorFilter').value;
    const equipoId = document.getElementById('equipoFilter').value;
    const almacenId = document.getElementById('reportAlmacenFilter').value;

    const filteredOrders = state.productionOrders.filter(o => {
        if (o.status !== 'Completada') return false;
        if (start && o.completed_at < start) return false;
        if (end && o.completed_at > end) return false;
        if (productId !== 'all' && o.product_code !== productId) return false;
        if (operatorId !== 'all' && o.operator_id !== operatorId) return false;
        if (equipoId !== 'all' && o.equipo_id !== equipoId) return false;
        if (almacenId !== 'all' && o.almacen_produccion_id !== almacenId) return false;
        return true;
    });

    const intermediateProducts = getIntermediateProductCodes();
    const finalOrders = filteredOrders.filter(o => !intermediateProducts.has(o.product_code));
    const intermediateOrders = filteredOrders.filter(o => intermediateProducts.has(o.product_code));

    generateDetailedOrdersReport(filteredOrders);
    generateOperatorReport(finalOrders, 'operatorReportTableBodyFinal');
    generateProductPerformanceReport(finalOrders, 'productReportTableBodyFinal');
    generateOperatorReport(intermediateOrders, 'operatorReportTableBodyIntermediate');
    generateProductPerformanceReport(intermediateOrders, 'productReportTableBodyIntermediate');
    generateEquipoReport(filteredOrders);
    generateMaterialConsumptionReport(filteredOrders);
}

/**
 * Generates the operator performance report.
 * @param {Array<object>} orders - The filtered list of orders to include in the report.
 * @param {string} tableBodyId - The ID of the table body element to populate.
 */
function generateOperatorReport(orders, tableBodyId) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    const report = {};
    let totals = { completed: 0, units: 0, cost: 0, over: 0 };

    orders.forEach(o => {
        const op = state.operators.find(op => op.id === o.operator_id);
        const name = op ? op.name : o.operator_id;
        if (!report[name]) report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
        report[name].completed++;
        report[name].units += o.quantity_produced || 0;
        report[name].cost += o.cost_real || 0;
        report[name].over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => `
        <tr><td>${name}</td><td>${r.completed}</td><td>${r.units}</td><td>${formatCurrency(r.cost)}</td><td>${formatCurrency(r.over)}</td></tr>`
    ).join('');

    if (Object.keys(report).length > 0) {
        const totalRow = Object.values(report).reduce((acc, r) => ({
            completed: acc.completed + r.completed,
            units: acc.units + r.units,
            cost: acc.cost + r.cost,
            over: acc.over + r.over,
        }), { completed: 0, units: 0, cost: 0, over: 0 });

        tbody.insertAdjacentHTML('beforeend', `<tr class="table-group-divider fw-bold"><td>TOTALES</td><td>${totalRow.completed}</td><td>${totalRow.units}</td><td>${formatCurrency(totalRow.cost)}</td><td>${formatCurrency(totalRow.over)}</td></tr>`);
    }
}

/**
 * Generates the detailed orders report.
 * @param {Array<object>} orders - The filtered list of orders.
 */
function generateDetailedOrdersReport(orders) {
    const tbody = document.getElementById('detailedOrdersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let totalRealCost = 0;
    let totalOvercost = 0;

    orders.forEach(o => {
        const operator = state.operators.find(op => op.id === o.operator_id);
        const overcostColor = (o.overcost || 0) > 0 ? 'text-danger' : ((o.overcost || 0) < 0 ? 'text-success' : '');
        totalRealCost += o.cost_real || 0;
        totalOvercost += o.overcost || 0;
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${o.order_id}</td><td>${o.product_name}</td><td>${operator?.name || 'N/A'}</td>
                <td>${o.quantity}</td><td>${o.quantity_produced || 'N/A'}</td><td>${formatCurrency(o.cost_real)}</td>
                <td class="${overcostColor}">${formatCurrency(o.overcost)}</td><td><span class="badge bg-success">${o.status}</span></td>
                <td>${formatDateShort(o.completed_at)}</td>
            </tr>`);
    });

    if (orders.length > 0) {
        const overcostTotalColor = totalOvercost > 0 ? 'text-danger' : totalOvercost < 0 ? 'text-success' : '';
        tbody.insertAdjacentHTML('beforeend', `<tr class="table-group-divider fw-bold"><td colspan="5" class="text-end">TOTALES:</td><td>${formatCurrency(totalRealCost)}</td><td class="${overcostTotalColor}">${formatCurrency(totalOvercost)}</td><td colspan="2"></td></tr>`);
    }
}

/**
 * Generates the product performance report.
 * @param {Array<object>} orders - The filtered list of orders.
 * @param {string} tableBodyId - The ID of the table body to populate.
 */
function generateProductPerformanceReport(orders, tableBodyId) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    const report = {};
    orders.forEach(o => {
        if (!report[o.product_name]) report[o.product_name] = { completed: 0, units: 0, cost: 0, over: 0 };
        report[o.product_name].completed++;
        report[o.product_name].units += o.quantity_produced || 0;
        report[o.product_name].cost += o.cost_real || 0;
        report[o.product_name].over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => {
        const unitCost = r.units > 0 ? r.cost / r.units : 0;
        return `<tr><td>${name}</td><td>${r.completed}</td><td>${r.units}</td><td>${formatCurrency(unitCost)}</td><td>${formatCurrency(r.cost)}</td><td>${formatCurrency(r.over)}</td></tr>`;
    }).join('');

    if (Object.keys(report).length > 0) {
        const totals = Object.values(report).reduce((acc, r) => ({
            completed: acc.completed + r.completed, units: acc.units + r.units, cost: acc.cost + r.cost, over: acc.over + r.over
        }), { completed: 0, units: 0, cost: 0, over: 0 });
        const totalUnitCost = totals.units > 0 ? totals.cost / totals.units : 0;
        tbody.insertAdjacentHTML('beforeend', `<tr class="table-group-divider fw-bold"><td>TOTALES</td><td>${totals.completed}</td><td>${totals.units}</td><td>${formatCurrency(totalUnitCost)}</td><td>${formatCurrency(totals.cost)}</td><td>${formatCurrency(totals.over)}</td></tr>`);
    }
}

/**
 * Generates the equipment performance report.
 * @param {Array<object>} orders - The filtered list of orders.
 */
function generateEquipoReport(orders) {
    const tbody = document.getElementById('equipoReportTableBody');
    if (!tbody) return;

    const report = {};
    orders.forEach(o => {
        const eq = state.equipos.find(eq => eq.id === o.equipo_id);
        const name = eq ? eq.name : o.equipo_id;
        if (!report[name]) report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
        report[name].completed++;
        report[name].units += o.quantity_produced || 0;
        report[name].cost += o.cost_real || 0;
        report[name].over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => `<tr><td>${name}</td><td>${r.completed}</td><td>${r.units}</td><td>${formatCurrency(r.cost)}</td><td>${formatCurrency(r.over)}</td></tr>`).join('');

    if (Object.keys(report).length > 0) {
        const totals = Object.values(report).reduce((acc, r) => ({
            completed: acc.completed + r.completed, units: acc.units + r.units, cost: acc.cost + r.cost, over: acc.over + r.over
        }), { completed: 0, units: 0, cost: 0, over: 0 });
        tbody.insertAdjacentHTML('beforeend', `<tr class="table-group-divider fw-bold"><td>TOTALES</td><td>${totals.completed}</td><td>${totals.units}</td><td>${formatCurrency(totals.cost)}</td><td>${formatCurrency(totals.over)}</td></tr>`);
    }
}

/**
 * Generates the material consumption report.
 * @param {Array<object>} orders - The filtered list of orders.
 */
function generateMaterialConsumptionReport(orders) {
    const report = {};

    function addMaterialToReport(materialCode, quantity) {
        const material = state.materials.find(m => m.codigo === materialCode);
        if (!material) return;
        if (!report[materialCode]) report[materialCode] = { qty: 0, cost: 0, desc: material.descripcion };
        report[materialCode].qty += quantity;
        report[materialCode].cost += quantity * material.costo;
    }

    orders.forEach(o => {
        const baseMaterials = getBaseMaterials(o.product_code, o.quantity_produced || 0);
        baseMaterials.forEach(bm => addMaterialToReport(bm.code, bm.quantity));

        state.vales.filter(v => v.order_id === o.order_id).forEach(vale => {
            const multiplier = vale.type === 'salida' ? 1 : -1;
            vale.materials.forEach(m => addMaterialToReport(m.material_code, m.quantity * multiplier));
        });
    });

    const tbody = document.getElementById('materialReportTableBody');
    let totalCost = 0;
    const rows = Object.values(report).map(r => {
        totalCost += r.cost;
        return `<tr><td>${r.desc}</td><td>${r.qty.toFixed(2)}</td><td>${formatCurrency(r.cost)}</td></tr>`;
    });
    tbody.innerHTML = rows.join('');

    if (rows.length > 0) {
        tbody.insertAdjacentHTML('beforeend', `<tr class="table-group-divider fw-bold"><td colspan="2" class="text-end">TOTAL:</td><td>${formatCurrency(totalCost)}</td></tr>`);
    }
}