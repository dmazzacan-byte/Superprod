/* global bootstrap, Toastify, Chart */
import { doc, setDoc, addDoc, deleteDoc, collection } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { formatCurrency, formatDate } from './utils.js';

// --- MODULE STATE ---
let availabilityChart = null;
let downtimeByEquipmentChart = null;
let isEditingMaintenance = false;

// --- DOM ELEMENTS ---
const maintenanceModal = new bootstrap.Modal(document.getElementById('maintenanceModal'));
const maintenanceModalElement = document.getElementById('maintenanceModal');
const maintenanceForm = document.getElementById('maintenanceForm');


/**
 * Sets up event listeners for elements that are always present in the DOM (like the modal).
 * This is called once when the app initializes.
 */
export function setupGlobalMaintenanceEventListeners() {
    document.getElementById('maintenanceEventType').addEventListener('change', (e) => {
        toggleMaintenanceFormFields(e.target.value);
    });

    maintenanceModalElement.addEventListener('show.bs.modal', () => {
        if (!isEditingMaintenance) {
             toggleMaintenanceFormFields('Correctivo'); // Default view for new event
        }
    });

    maintenanceModalElement.addEventListener('hidden.bs.modal', () => {
        isEditingMaintenance = false;
        maintenanceForm.reset();
        document.getElementById('maintenanceEventId').value = '';
        toggleMaintenanceFormFields('Correctivo'); // Reset to default view
    });

    maintenanceForm.addEventListener('submit', saveMaintenanceEvent);
}

/**
 * Sets up event listeners for elements specific to the maintenance page.
 * This is called every time the maintenance page is shown.
 */
function setupMaintenancePageEventListeners() {
    document.getElementById('maintenanceEquipoFilter').addEventListener('change', updateMaintenanceView);
    document.getElementById('maintenanceMonthFilter').addEventListener('change', updateMaintenanceView);
    document.getElementById('maintenanceYearFilter').addEventListener('change', updateMaintenanceView);
    document.getElementById('clearMaintenanceFiltersBtn').addEventListener('click', () => {
        document.getElementById('maintenanceEquipoFilter').value = 'all';
        populateMaintenanceDateFilters(); // Resets month/year to current
        updateMaintenanceView();
    });
    document.getElementById('toggleAllEquipmentChart').addEventListener('change', updateMaintenanceView);
    document.getElementById('maintenanceHistoryBody').addEventListener('click', handleMaintenanceTableClick);
    document.getElementById('preventiveMaintenanceScheduleBody').addEventListener('click', handleMaintenanceTableClick);
}

/**
 * Toggles form fields in the maintenance modal based on the event type.
 * @param {string} type - 'Correctivo' or 'Preventivo'.
 */
function toggleMaintenanceFormFields(type) {
    const correctiveFields = document.getElementById('corrective-fields');
    const preventiveFields = document.getElementById('preventive-fields');
    correctiveFields.style.display = (type === 'Preventivo') ? 'none' : 'block';
    preventiveFields.style.display = (type === 'Preventivo') ? 'block' : 'none';
}

/**
 * Main function to update all components on the maintenance page based on filters.
 */
function updateMaintenanceView() {
    const equipoFilter = document.getElementById('maintenanceEquipoFilter').value;
    const month = document.getElementById('maintenanceMonthFilter').value;
    const year = document.getElementById('maintenanceYearFilter').value;

    const effectiveStartDate = new Date(year, month, 1);
    const effectiveEndDate = new Date(year, parseInt(month) + 1, 0, 23, 59, 59);

    // Filter all events by the selected date range first
    const dateFilteredEvents = state.maintenanceEvents.filter(event => {
        const eventDate = new Date(event.type === 'Preventivo' ? event.scheduledDate : event.startTime);
        return eventDate >= effectiveStartDate && eventDate <= effectiveEndDate;
    });

    // The downtime comparison chart always uses the full date-filtered set
    const correctiveEventsForChart = dateFilteredEvents.filter(e => e.type === 'Correctivo');
    renderDowntimeByEquipmentChart(correctiveEventsForChart);

    // Now, apply the equipment filter for all other components on the page
    const pageFilteredEvents = (equipoFilter === 'all')
        ? dateFilteredEvents
        : dateFilteredEvents.filter(event => event.equipmentId === equipoFilter);

    const correctiveEventsForPage = pageFilteredEvents.filter(e => e.type === 'Correctivo');
    const preventiveEventsForPage = pageFilteredEvents.filter(e => e.type === 'Preventivo');

    renderMaintenanceHistory(correctiveEventsForPage);
    renderPreventiveMaintenanceSchedule(preventiveEventsForPage);
    calculateAndDisplayMaintenanceKPIs(correctiveEventsForPage, pageFilteredEvents);
    renderAvailabilityChart(correctiveEventsForPage);
}

/**
 * Populates the date filters (month and year) on the maintenance page.
 */
function populateMaintenanceDateFilters() {
    const monthFilter = document.getElementById('maintenanceMonthFilter');
    const yearFilter = document.getElementById('maintenanceYearFilter');
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    monthFilter.innerHTML = months.map((month, index) => `<option value="${index}" ${index === currentMonth ? 'selected' : ''}>${month}</option>`).join('');

    const years = new Set([currentYear, ...state.maintenanceEvents.map(e => new Date(e.type === 'Preventivo' ? e.scheduledDate : e.startTime).getFullYear())]);
    yearFilter.innerHTML = Array.from(years).sort((a, b) => b - a).map(year => `<option value="${year}" ${year === currentYear ? 'selected' : ''}>${year}</option>`).join('');
}

/**
 * Initializes the maintenance page content and event listeners.
 */
export function loadMaintenancePage() {
    const equipoFilterSelect = document.getElementById('maintenanceEquipoFilter');
    if (equipoFilterSelect.options.length <= 1) { // Populate only once
        equipoFilterSelect.innerHTML = '<option value="all" selected>Todos los Equipos</option>';
        state.equipos.sort((a,b) => a.name.localeCompare(b.name)).forEach(e => {
            equipoFilterSelect.add(new Option(e.name, e.id));
        });
    }

    populateMaintenanceDateFilters();

    const modalEquipoSelect = document.getElementById('maintenanceEquipoSelect');
    modalEquipoSelect.innerHTML = '<option value="" disabled selected>Seleccione un equipo...</option>';
    state.equipos.forEach(e => modalEquipoSelect.add(new Option(e.name, e.id)));

    setupMaintenancePageEventListeners();
    updateMaintenanceView(); // Initial render
}

/**
 * Renders the maintenance history table (corrective events).
 * @param {Array<object>} events - The filtered list of corrective maintenance events.
 */
function renderMaintenanceHistory(events) {
    const historyBody = document.getElementById('maintenanceHistoryBody');
    historyBody.innerHTML = '';
    events.sort((a, b) => new Date(b.startTime) - new Date(a.startTime)).forEach(event => {
        const equipo = state.equipos.find(e => e.id === event.equipmentId);
        const totalCost = (event.costParts || 0) + (event.costLabor || 0) + (event.costExternal || 0);
        historyBody.innerHTML += `
            <tr data-event-id="${event.id}">
                <td>${equipo?.name || event.equipmentId}</td>
                <td><span class="badge bg-danger">${event.type}</span></td>
                <td>${event.reason || 'N/A'}</td>
                <td>${event.startTime ? new Date(event.startTime).toLocaleString() : 'N/A'}</td>
                <td>${event.endTime ? new Date(event.endTime).toLocaleString() : 'N/A'}</td>
                <td>${event.durationMinutes || 0}</td>
                <td>${formatCurrency(totalCost)}</td>
                <td title="${event.notes || ''}">${(event.notes || '').substring(0, 30)}...</td>
                <td>
                    <button class="btn btn-sm btn-warning edit-maintenance-btn" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger delete-maintenance-btn" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

/**
 * Renders the preventive maintenance schedule table.
 * @param {Array<object>} events - The filtered list of preventive maintenance events.
 */
function renderPreventiveMaintenanceSchedule(events) {
    const scheduleBody = document.getElementById('preventiveMaintenanceScheduleBody');
    scheduleBody.innerHTML = '';
    events.sort((a, b) => new Date(a.scheduledDate) - new Date(b.scheduledDate)).forEach(event => {
        const equipo = state.equipos.find(e => e.id === event.equipmentId);
        scheduleBody.innerHTML += `
            <tr data-event-id="${event.id}">
                <td>${equipo?.name || event.equipmentId}</td>
                <td>${formatDate(event.scheduledDate)}</td>
                <td title="${event.notes || ''}">${(event.notes || '').substring(0, 50)}...</td>
                <td>
                    <button class="btn btn-sm btn-success complete-preventive-btn" title="Marcar como Completado"><i class="fas fa-check"></i></button>
                    <button class="btn btn-sm btn-warning edit-maintenance-btn" title="Editar"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger delete-maintenance-btn" title="Eliminar"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
    });
}

/**
 * Calculates and displays key maintenance KPIs.
 * @param {Array<object>} failureEvents - Corrective events for MTTR/MTBF calculation.
 * @param {Array<object>} allEvents - All filtered events for cost calculation.
 */
function calculateAndDisplayMaintenanceKPIs(failureEvents, allEvents) {
    // MTTR
    const totalRepairTime = failureEvents.reduce((acc, event) => acc + (event.durationMinutes || 0), 0);
    const mttr = failureEvents.length > 0 ? totalRepairTime / failureEvents.length : 0;
    document.getElementById('mttrCard').textContent = `${mttr.toFixed(2)} minutos`;

    // MTBF
    const sortedFailures = failureEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (sortedFailures.length < 2) {
        document.getElementById('mtbfCard').textContent = 'N/A';
    } else {
        const totalUptime = sortedFailures.slice(1).reduce((acc, event, i) => {
            const uptime = (new Date(event.startTime) - new Date(sortedFailures[i].endTime)) / (1000 * 60);
            return acc + (uptime > 0 ? uptime : 0);
        }, 0);
        const mtbf = totalUptime / (sortedFailures.length - 1);
        document.getElementById('mtbfCard').textContent = `${(mtbf / 60).toFixed(2)} horas`;
    }

    // Total Cost
    const totalCost = allEvents.reduce((acc, event) => acc + (event.costParts || 0) + (event.costLabor || 0) + (event.costExternal || 0), 0);
    document.getElementById('totalMaintenanceCostCard').textContent = formatCurrency(totalCost);
}

/**
 * Renders the availability doughnut chart.
 * @param {Array<object>} events - Filtered list of corrective events.
 */
function renderAvailabilityChart(events) {
    const canvas = document.getElementById('availabilityChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (availabilityChart) availabilityChart.destroy();

    const month = document.getElementById('maintenanceMonthFilter').value;
    const year = document.getElementById('maintenanceYearFilter').value;
    const totalMinutesInPeriod = new Date(year, parseInt(month) + 1, 0).getDate() * 24 * 60;
    const totalDowntimeMinutes = events.reduce((acc, event) => acc + (event.durationMinutes || 0), 0);
    const totalUptimeMinutes = Math.max(0, totalMinutesInPeriod - totalDowntimeMinutes);
    const uptimePercentage = totalMinutesInPeriod > 0 ? (totalUptimeMinutes / totalMinutesInPeriod) * 100 : 0;

    availabilityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [`Disponibilidad`, `Inactividad`],
            datasets: [{ data: [totalUptimeMinutes, totalDowntimeMinutes], backgroundColor: ['#27ae60', '#c0392b'] }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: `${uptimePercentage.toFixed(1)}%`, font: { size: 24 } },
                legend: { position: 'bottom' },
                tooltip: { callbacks: { label: ctx => `${ctx.label}: ${Math.round(ctx.raw)} min` } },
                datalabels: { display: false }
            }
        }
    });
}

/**
 * Renders the downtime by equipment bar chart.
 * @param {Array<object>} events - Filtered list of corrective events.
 */
function renderDowntimeByEquipmentChart(events) {
    const canvas = document.getElementById('downtimeByEquipmentChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (downtimeByEquipmentChart) downtimeByEquipmentChart.destroy();

    const downtimeByEq = {};
    events.forEach(event => {
        downtimeByEq[event.equipmentId] = (downtimeByEq[event.equipmentId] || 0) + (event.durationMinutes || 0);
    });

    const showAll = document.getElementById('toggleAllEquipmentChart').checked;
    let sortedDowntime = Object.entries(downtimeByEq).sort(([, a], [, b]) => b - a);
    if (!showAll) sortedDowntime = sortedDowntime.slice(0, 5);

    downtimeByEquipmentChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDowntime.map(([eqId,]) => state.equipos.find(e => e.id === eqId)?.name || eqId),
            datasets: [{ label: 'Minutos de Parada', data: sortedDowntime.map(([, mins]) => mins), backgroundColor: 'rgba(231, 76, 60, 0.6)' }]
        },
        options: {
            indexAxis: 'y', responsive: true,
            plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'end', formatter: v => `${Math.round(v)} min` } }
        }
    });
}

/**
 * Saves or updates a maintenance event in Firestore.
 * @param {Event} e - The form submission event.
 */
async function saveMaintenanceEvent(e) {
    e.preventDefault();
    const db = getDb();
    const eventId = document.getElementById('maintenanceEventId').value;
    const type = document.getElementById('maintenanceEventType').value;
    const equipmentId = document.getElementById('maintenanceEquipoSelect').value;
    const notes = document.getElementById('maintenanceNotes').value;
    const costParts = parseFloat(document.getElementById('maintenanceCostParts').value) || 0;
    const costLabor = parseFloat(document.getElementById('maintenanceCostLabor').value) || 0;
    const costExternal = parseFloat(document.getElementById('maintenanceCostExternal').value) || 0;

    let eventData = { equipmentId, type, notes, costParts, costLabor, costExternal, updatedAt: new Date().toISOString() };

    if (type === 'Preventivo') {
        const scheduledDate = document.getElementById('maintenanceScheduledDate').value;
        if (!equipmentId || !scheduledDate) { Toastify({ text: 'Equipo y fecha son requeridos.', backgroundColor: 'var(--warning-color)' }).showToast(); return; }
        eventData.scheduledDate = scheduledDate;
    } else { // Correctivo
        const startTime = document.getElementById('maintenanceStartTime').value;
        const endTime = document.getElementById('maintenanceEndTime').value;
        const reason = document.getElementById('maintenanceReason').value;
        if (!equipmentId || !startTime || !endTime || !reason) { Toastify({ text: 'Complete todos los campos de parada.', backgroundColor: 'var(--warning-color)' }).showToast(); return; }
        const start = new Date(startTime), end = new Date(endTime);
        if (end <= start) { Toastify({ text: 'La fecha de fin debe ser posterior al inicio.', backgroundColor: 'var(--warning-color)' }).showToast(); return; }
        eventData = { ...eventData, startTime: start.toISOString(), endTime: end.toISOString(), durationMinutes: Math.round((end - start) / 60000), reason };
    }

    try {
        if (eventId) {
            await setDoc(doc(db, "maintenance_events", eventId), eventData, { merge: true });
            state.updateMaintenanceEventInState(eventId, eventData);
        } else {
            eventData.createdAt = new Date().toISOString();
            const docRef = await addDoc(collection(db, "maintenance_events"), eventData);
            state.addMaintenanceEvent({ id: docRef.id, ...eventData });
        }
        updateMaintenanceView();
        maintenanceModal.hide();
        Toastify({ text: 'Evento de mantenimiento guardado.', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving maintenance event:", error);
        Toastify({ text: 'Error al guardar el evento.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

/**
 * Handles clicks on the maintenance tables (edit, delete, complete).
 * @param {Event} e - The click event.
 */
function handleMaintenanceTableClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;

    const eventId = btn.closest('tr').dataset.eventId;
    const event = state.maintenanceEvents.find(ev => ev.id === eventId);

    if (btn.classList.contains('edit-maintenance-btn')) populateMaintenanceModal(event);
    if (btn.classList.contains('delete-maintenance-btn')) deleteMaintenanceEvent(eventId);
    if (btn.classList.contains('complete-preventive-btn')) populateMaintenanceModal(event, true);
}

/**
 * Populates the maintenance modal for editing or completing an event.
 * @param {object} event - The maintenance event object.
 * @param {boolean} [isCompleting=false] - True if we are completing a preventive event.
 */
function populateMaintenanceModal(event, isCompleting = false) {
    if (!event) return;
    isEditingMaintenance = true;
    document.getElementById('maintenanceEventId').value = event.id;
    document.getElementById('maintenanceEquipoSelect').value = event.equipmentId;
    document.getElementById('maintenanceNotes').value = event.notes || '';
    document.getElementById('maintenanceCostParts').value = event.costParts || '';
    document.getElementById('maintenanceCostLabor').value = event.costLabor || '';
    document.getElementById('maintenanceCostExternal').value = event.costExternal || '';

    if (isCompleting) {
        document.getElementById('maintenanceEventType').value = 'Correctivo';
        toggleMaintenanceFormFields('Correctivo');
        document.getElementById('maintenanceModalLabel').textContent = 'Completar Mantenimiento Preventivo';
        document.getElementById('maintenanceReason').value = 'Mantenimiento Programado';
    } else {
        const eventType = event.type || 'Correctivo';
        document.getElementById('maintenanceEventType').value = eventType;
        toggleMaintenanceFormFields(eventType);
        document.getElementById('maintenanceModalLabel').textContent = 'Editar Evento de Mantenimiento';
        if (eventType === 'Preventivo') {
            document.getElementById('maintenanceScheduledDate').value = event.scheduledDate || '';
        } else {
            document.getElementById('maintenanceStartTime').value = event.startTime ? event.startTime.slice(0, 16) : '';
            document.getElementById('maintenanceEndTime').value = event.endTime ? event.endTime.slice(0, 16) : '';
            document.getElementById('maintenanceReason').value = event.reason || '';
        }
    }
    maintenanceModal.show();
}

/**
 * Deletes a maintenance event from Firestore and local state.
 * @param {string} eventId - The ID of the event to delete.
 */
async function deleteMaintenanceEvent(eventId) {
    if (!confirm('¿Está seguro de que desea eliminar este evento de mantenimiento?')) return;
    try {
        await deleteDoc(doc(getDb(), "maintenance_events", eventId));
        state.deleteMaintenanceEventFromState(eventId);
        updateMaintenanceView();
        Toastify({ text: 'Evento eliminado.', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error deleting maintenance event:", error);
        Toastify({ text: 'Error al eliminar el evento.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}