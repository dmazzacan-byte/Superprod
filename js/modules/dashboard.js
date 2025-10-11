/* global Chart */
import * as state from './state.js';
import { formatCurrency, getIntermediateProductCodes } from './utils.js';

// --- DOM ELEMENTS ---
const costChartCanvas = document.getElementById('costChart');
const productionChartCanvas = document.getElementById('productionChart');
const dailyProductionChartCanvas = document.getElementById('dailyProductionChart');
const dailyOvercostChartCanvas = document.getElementById('dailyOvercostChart');

// --- CHART INSTANCES ---
let costChartInstance = null;
let productionChartInstance = null;
let dailyProductionChartInstance = null;
let dailyOvercostChartInstance = null;

/**
 * Populates the date and warehouse filters on the dashboard.
 */
export function populateDashboardFilters() {
    const monthFilter = document.getElementById('dashboardMonthFilter');
    const yearFilter = document.getElementById('dashboardYearFilter');
    const almacenFilter = document.getElementById('dashboardAlmacenFilter');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Populate months
    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    monthFilter.innerHTML = months.map((month, index) => `<option value="${index}" ${index === currentMonth ? 'selected' : ''}>${month}</option>`).join('');

    // Populate years from existing data + current year
    const years = new Set([currentYear, ...state.productionOrders.map(o => o.completed_at ? new Date(o.completed_at).getFullYear() : null).filter(Boolean)]);
    yearFilter.innerHTML = Array.from(years).sort((a, b) => b - a).map(year => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`).join('');

    // Populate warehouses
    if (almacenFilter.options.length <= 1) { // Populate only once
        almacenFilter.innerHTML = '<option value="all">Todos los Almacenes</option>';
        state.almacenes.forEach(a => almacenFilter.add(new Option(a.name, a.id)));
    }
}

/**
 * Main function to update all components on the dashboard.
 */
export function updateDashboard() {
    const selectedMonth = parseInt(document.getElementById('dashboardMonthFilter').value, 10);
    const selectedYear = parseInt(document.getElementById('dashboardYearFilter').value, 10);

    const completedThisMonth = state.productionOrders.filter(o => {
        if (o.status !== 'Completada' || !o.completed_at) return false;
        const orderDate = new Date(o.completed_at);
        return orderDate.getMonth() === selectedMonth && orderDate.getFullYear() === selectedYear;
    });

    const pending = state.productionOrders.filter(o => o.status === 'Pendiente');

    const intermediateProducts = getIntermediateProductCodes();
    const finalProductOrdersThisMonth = completedThisMonth.filter(o => !intermediateProducts.has(o.product_code));

    // --- Update KPI Cards ---
    updateKpiCards(pending.length, completedThisMonth.length, finalProductOrdersThisMonth, completedThisMonth);

    // --- Update Rank Tables ---
    updateRankTables(completedThisMonth);

    // --- Update Low Stock Alerts ---
    updateLowStockAlerts();

    // --- Initialize/Update Charts ---
    initCharts(completedThisMonth, finalProductOrdersThisMonth);
}

function updateKpiCards(pendingCount, completedCount, finalOrders, allCompletedOrders) {
    const totalProduction = finalOrders.reduce((acc, o) => acc + (o.quantity_produced || 0), 0);
    const realCost = finalOrders.reduce((acc, o) => acc + (o.cost_real || 0), 0);
    const overCost = allCompletedOrders.reduce((acc, o) => acc + (o.overcost || 0), 0);

    document.getElementById('pendingOrdersCard').textContent = pendingCount;
    document.getElementById('completedOrdersCard').textContent = completedCount;
    document.getElementById('totalProductionCard').textContent = totalProduction.toLocaleString('es-ES');
    document.getElementById('totalCostCard').textContent = formatCurrency(realCost);
    document.getElementById('totalOvercostCard').textContent = formatCurrency(overCost);
}

function updateRankTables(completedOrders) {
    const operatorStats = {};
    completedOrders.forEach(o => {
        const opId = o.operator_id;
        if (!operatorStats[opId]) operatorStats[opId] = { name: state.operators.find(op => op.id === opId)?.name || opId, production: 0, overcost: 0 };
        operatorStats[opId].production += o.quantity_produced || 0;
        operatorStats[opId].overcost += o.overcost || 0;
    });
    document.getElementById('operatorProductionRankBody').innerHTML = Object.values(operatorStats).sort((a, b) => b.production - a.production).map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>${op.production}</td></tr>`).join('');
    document.getElementById('operatorOvercostRankBody').innerHTML = Object.values(operatorStats).sort((a, b) => b.overcost - a.overcost).map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>${formatCurrency(op.overcost)}</td></tr>`).join('');


    const equipoStats = {};
    completedOrders.forEach(o => {
        const eqId = o.equipo_id;
        if (!equipoStats[eqId]) equipoStats[eqId] = { name: state.equipos.find(eq => eq.id === eqId)?.name || eqId, production: 0 };
        equipoStats[eqId].production += o.quantity_produced || 0;
    });
    document.getElementById('equipoProductionRankBody').innerHTML = Object.values(equipoStats).sort((a, b) => b.production - a.production).map((eq, i) => `<tr><td>${i + 1}</td><td>${eq.name}</td><td>${eq.production}</td></tr>`).join('');
}

function updateLowStockAlerts() {
    const threshold = parseInt(document.getElementById('lowStockThreshold').value, 10);
    const selectedAlmacenId = document.getElementById('dashboardAlmacenFilter').value;
    const materialsInRecipes = new Set(Object.values(state.recipes).flat().map(ing => ing.code));

    const lowStockAlerts = [];
    state.materials
        .filter(m => materialsInRecipes.has(m.codigo))
        .forEach(m => {
            if (!m.inventario) return;
            const almacenesToCheck = selectedAlmacenId === 'all' ? Object.keys(m.inventario) : [selectedAlmacenId];
            almacenesToCheck.forEach(almacenId => {
                if (m.inventario[almacenId] < threshold) {
                    lowStockAlerts.push({
                        material: m,
                        almacenName: state.almacenes.find(a => a.id === almacenId)?.name || almacenId,
                        stock: m.inventario[almacenId]
                    });
                }
            });
        });

    const affectedProductsByMaterial = {};
    lowStockAlerts.forEach(alert => {
        const mCode = alert.material.codigo;
        if (!affectedProductsByMaterial[mCode]) {
            affectedProductsByMaterial[mCode] = new Set();
            Object.keys(state.recipes).forEach(productId => {
                if (getBaseMaterials(productId, 1).some(bm => bm.code === mCode)) {
                    affectedProductsByMaterial[mCode].add(state.products.find(p => p.codigo === productId)?.descripcion);
                }
            });
        }
    });

    const lowStockTbody = document.getElementById('lowStockTableBody');
    lowStockTbody.innerHTML = lowStockAlerts.length
        ? lowStockAlerts.sort((a, b) => a.stock - b.stock).map(alert => {
            const affectedProductsList = [...affectedProductsByMaterial[alert.material.codigo]].filter(Boolean).map((p, i) => `${i + 1}. ${p}`).join('<br>') || 'N/A';
            return `<tr><td>${alert.material.descripcion} en <strong>${alert.almacenName}</strong></td><td>${alert.stock.toFixed(2)}</td><td>${alert.material.unidad}</td><td>${affectedProductsList}</td></tr>`;
        }).join('')
        : `<tr><td colspan="4" class="text-center">Sin alertas para el límite de ${threshold}</td></tr>`;
}


/**
 * Initializes or updates all charts on the dashboard.
 * @param {Array<object>} completedThisMonth - All orders completed in the selected period.
 * @param {Array<object>} finalProductOrdersThisMonth - Final product orders completed in the period.
 */
function initCharts(completedThisMonth, finalProductOrdersThisMonth) {
    if (costChartInstance) costChartInstance.destroy();
    if (productionChartInstance) productionChartInstance.destroy();
    if (dailyProductionChartInstance) dailyProductionChartInstance.destroy();
    if (dailyOvercostChartInstance) dailyOvercostChartInstance.destroy();

    const selectedYear = parseInt(document.getElementById('dashboardYearFilter').value, 10);
    const selectedMonth = parseInt(document.getElementById('dashboardMonthFilter').value, 10);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const monthLabels = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    // Data for daily charts
    const dailyProductionData = Array(daysInMonth).fill(0);
    const dailyOvercostData = Array(daysInMonth).fill(0);
    completedThisMonth.forEach(o => {
        const dayOfMonth = new Date(o.completed_at).getDate() - 1;
        dailyOvercostData[dayOfMonth] += o.overcost || 0;
    });
    finalProductOrdersThisMonth.forEach(o => {
        const dayOfMonth = new Date(o.completed_at).getDate() - 1;
        dailyProductionData[dayOfMonth] += o.quantity_produced || 0;
    });

    // Data for summary charts
    const prodMap = finalProductOrdersThisMonth.reduce((acc, o) => {
        acc[o.product_name] = (acc[o.product_name] || 0) + (o.quantity_produced || 0);
        return acc;
    }, {});

    const costMap = finalProductOrdersThisMonth.reduce((acc, o) => {
        if (!acc[o.product_name]) acc[o.product_name] = { total_cost: 0, total_qty: 0 };
        acc[o.product_name].total_cost += o.cost_real || 0;
        acc[o.product_name].total_qty += o.quantity_produced || 0;
        return acc;
    }, {});


    // --- Render Charts ---

    if (productionChartCanvas) {
        const topProd = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
        productionChartInstance = new Chart(productionChartCanvas, {
            type: 'bar',
            data: { labels: topProd.map(x => x[0]), datasets: [{ label: 'Unidades', data: topProd.map(x => x[1]), backgroundColor: '#27ae60' }] },
            options: { scales: { y: { title: { display: true, text: 'Cantidad' } } }, plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'top', formatter: v => Math.round(v) } } }
        });
    }

    if (dailyProductionChartCanvas) {
        dailyProductionChartInstance = new Chart(dailyProductionChartCanvas, {
            type: 'line',
            data: { labels: monthLabels, datasets: [{ label: 'Unidades Producidas (Finales)', data: dailyProductionData, borderColor: 'rgb(75, 192, 192)', tension: 0.1, fill: true }] },
            options: { scales: { y: { title: { display: true, text: 'Cantidad' } } }, plugins: { legend: { display: false }, datalabels: { display: false } } }
        });
    }

    if (costChartCanvas) {
        const topUnitCost = Object.entries(costMap).map(([name, data]) => ({ name, unit_cost: data.total_qty > 0 ? data.total_cost / data.total_qty : 0 })).sort((a, b) => b.unit_cost - a.unit_cost).slice(0, 5);
        costChartInstance = new Chart(costChartCanvas, {
            type: 'bar',
            data: { labels: topUnitCost.map(x => x.name), datasets: [{ label: 'Costo Unitario', data: topUnitCost.map(x => x.unit_cost), backgroundColor: '#3498db' }] },
            options: { scales: { y: { ticks: { callback: v => formatCurrency(v) }, title: { display: true, text: 'US$' } } }, plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'top', formatter: v => formatCurrency(v) } } }
        });
    }

    if (dailyOvercostChartCanvas) {
        dailyOvercostChartInstance = new Chart(dailyOvercostChartCanvas, {
            type: 'line',
            data: { labels: monthLabels, datasets: [{ label: 'Sobrecosto Diario', data: dailyOvercostData, borderColor: 'rgb(255, 99, 132)', tension: 0.1, fill: true }] },
            options: { scales: { y: { ticks: { callback: v => formatCurrency(v) }, title: { display: true, text: 'US$' } } }, plugins: { legend: { display: false }, datalabels: { display: false } } }
        });
    }
}