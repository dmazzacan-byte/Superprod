import { productionOrders, products, calculateProductionOrderMetrics, calculateTotalCost } from './main.js';

let costChartInstance = null;
let profitChartInstance = null;

export function updateDashboard() {
    const metrics = calculateProductionOrderMetrics();

    document.getElementById('totalValue').textContent = `$${metrics.totalValue.toFixed(2)}`;
    document.getElementById('totalCost').textContent = `$${metrics.totalCost.toFixed(2)}`;
    document.getElementById('totalProfit').textContent = `$${metrics.totalProfit.toFixed(2)}`;
    document.getElementById('totalOvercost').textContent = `$${metrics.totalOvercost.toFixed(2)}`;
    document.getElementById('totalQuantity').textContent = `${metrics.totalQuantity}`;

    if (costChartInstance) {
        costChartInstance.destroy();
    }
    if (profitChartInstance) {
        profitChartInstance.destroy();
    }
    
    // Generar gráficos
    generateCostBreakdownChart();
    generateProfitMarginChart();
}

function generateCostBreakdownChart() {
    const completedOrders = productionOrders.filter(o => o.status === 'Completada');
    const costData = completedOrders.map(order => calculateTotalCost(order));
    const labels = completedOrders.map(order => `Orden #${order.id}`);

    const materialCosts = costData.map(cost => cost.materialCost);
    const laborCosts = costData.map(cost => cost.laborCost);
    const overcosts = costData.map(cost => cost.overcost);

    const ctx = document.getElementById('costBreakdownChart').getContext('2d');
    costChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Costo de Materiales',
                data: materialCosts,
                backgroundColor: 'rgba(54, 162, 235, 0.8)'
            }, {
                label: 'Costo de Mano de Obra',
                data: laborCosts,
                backgroundColor: 'rgba(255, 99, 132, 0.8)'
            }, {
                label: 'Sobrecosto',
                data: overcosts,
                backgroundColor: 'rgba(255, 206, 86, 0.8)'
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: true,
                },
                y: {
                    stacked: true,
                    beginAtZero: true
                }
            }
        }
    });
}

function generateProfitMarginChart() {
    const completedOrders = productionOrders.filter(o => o.status === 'Completada');
    const profitData = completedOrders.map(order => {
        const product = products.find(p => p.id === order.productId);
        const costs = calculateTotalCost(order);
        const revenue = product ? product.salePrice * order.quantity : 0;
        const profit = revenue - costs.totalCost;
        return profit;
    });

    const labels = completedOrders.map(order => `Orden #${order.id}`);

    const ctx = document.getElementById('profitMarginChart').getContext('2d');
    profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ganancia por Orden',
                data: profitData,
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

export function initializeDashboardListeners() {
    // Aquí puedes añadir listeners específicos del dashboard si es necesario
}
