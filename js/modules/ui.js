/* global bootstrap, Chart, ChartDataLabels */

import { onSnapshot, query, collection } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';
import { getDb, loadInitialData } from './firestore.js';
import { handleLogout } from './auth.js';
import { generatePagePDF } from './utils.js';
import { checkAndTriggerOnboarding } from './onboarding.js';
import { updateDashboard, populateDashboardFilters } from './dashboard.js';
import { loadProducts } from './products.js';
import { loadMaterials } from './materials.js';
import { loadRecipes, populateRecipeProductSelect } from './recipes.js';
import { loadProductionOrders, populateOrderFormSelects } from './orders.js';
import { loadReports } from './reports.js';
import { loadMaintenancePage, setupGlobalMaintenanceEventListeners } from './maintenance.js';
import { loadOperators, loadEquipos, loadAlmacenes, loadUsers } from './settings.js';
import { populatePlannerProductSelects } from './planner.js';


// --- DOM Elements ---
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const userDataDiv = document.getElementById('userData');
const pages = document.querySelectorAll('.page-content');
const navLinks = document.querySelectorAll('.nav-link');

/**
 * Hides the app and shows the login page. Resets the login form.
 */
export function showLoginPage() {
    loginView.classList.remove('d-none');
    appView.classList.add('d-none');
    document.getElementById('loginForm').reset();
    const clientSelector = document.getElementById('clientSelector');
    if (clientSelector) {
        clientSelector.disabled = false;
    }
}

/**
 * Hides the login page and shows the main application view.
 * @param {string} userEmail - The email of the logged-in user to display.
 */
export function showAppPage(userEmail) {
    loginView.classList.add('d-none');
    appView.classList.remove('d-none');
    userDataDiv.textContent = userEmail;
}

/**
 * Updates all elements with class 'report-timestamp' to the current date and time.
 */
export function updateTimestamps() {
  const now = new Date();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const formattedDate = now.toLocaleString('es-ES', options);
  document.querySelectorAll('.report-timestamp').forEach(span => {
    span.textContent = formattedDate;
  });
}

/**
 * Applies UI restrictions based on the current user's role.
 * Hides/shows nav links and buttons for non-administrators.
 */
export function applyRoleRestrictions() {
    const isSupervisor = state.currentUserRole?.toLowerCase() === 'supervisor';

    // A map of page IDs to hide for supervisors
    const navLinksToHide = {
        'productsPage': true,
        'settingsPage': true
    };

    // Hide sidebar navigation links
    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        const page = link.dataset.page;
        if (isSupervisor && navLinksToHide[page]) {
            link.parentElement.style.display = 'none';
        } else {
            link.parentElement.style.display = 'block';
        }
    });

    // Selectors for elements that should only be visible to administrators
    const adminOnlySelectors = [
        'button[data-bs-target="#productModal"]', '#productsTableBody .edit-btn', '#productsTableBody .delete-btn', '#importProductsBtn', '#exportProductsBtn',
        'button[data-bs-target="#materialModal"]', '#materialsTableBody .edit-btn', '#materialsTableBody .delete-btn', '#exportMaterialsBtn',
        'button[data-bs-target="#addRecipeModal"]', '#recipesTableBody .edit-btn', '#recipesTableBody .delete-btn', '#importRecipesBtn', '#exportRecipesBtn',
        '#productionOrdersTableBody .delete-order-btn', '#productionOrdersTableBody .reopen-order-btn',
        '#settingsPage .card' // Hide all settings cards
    ];

    adminOnlySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.style.display = isSupervisor ? 'none' : '';
        });
    });

    // If the supervisor is on a restricted page (e.g., via URL manipulation), show an access denied message.
    const currentPageId = document.querySelector('.page-content:not([style*="display: none"])')?.id;
    if (isSupervisor && navLinksToHide[currentPageId]) {
        document.getElementById(currentPageId).innerHTML = '<h1 class="mt-4">Acceso Denegado</h1><p>No tiene permiso para ver esta página. Por favor, regrese al Dashboard.</p>';
    }
}


/**
 * Renders pagination controls for a table.
 * @param {string} containerId - The ID of the container element for the controls.
 * @param {number} currentPage - The current active page.
 * @param {number} totalPages - The total number of pages.
 * @param {number} itemsPerPage - The number of items shown per page.
 * @param {function} onPageChange - Callback function for when the page is changed.
 * @param {function} onItemsPerPageChange - Callback for when items per page is changed.
 */
export function renderPaginationControls(containerId, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // To prevent disabled buttons from being stuck if totalPages becomes 1
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="d-flex align-items-center">
            <label for="${containerId}-itemsPerPage" class="form-label me-2 mb-0 small">Ver:</label>
            <select id="${containerId}-itemsPerPage" class="form-select form-select-sm" style="width: auto;">
                <option value="10" ${itemsPerPage === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${itemsPerPage === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${itemsPerPage === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${itemsPerPage === 100 ? 'selected' : ''}>100</option>
            </select>
        </div>
        <div class="d-flex align-items-center">
            <button class="btn btn-sm btn-outline-secondary me-2" id="${containerId}-prevBtn" ${currentPage === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            <span class="small">Página ${currentPage} de ${totalPages}</span>
            <button class="btn btn-sm btn-outline-secondary ms-2" id="${containerId}-nextBtn" ${currentPage === totalPages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
    `;

    document.getElementById(`${containerId}-itemsPerPage`).addEventListener('change', (e) => {
        onItemsPerPageChange(parseInt(e.target.value, 10));
    });
    document.getElementById(`${containerId}-prevBtn`).addEventListener('click', () => {
        if (currentPage > 1) onPageChange(currentPage - 1);
    });
    document.getElementById(`${containerId}-nextBtn`).addEventListener('click', () => {
        if (currentPage < totalPages) onPageChange(currentPage + 1);
    });
}

/**
 * Sets up the real-time listener for the 'productionOrders' collection.
 * Updates the local state and refreshes the UI upon receiving new data.
 */
export function setupProductionOrdersListener() {
    const db = getDb();
    const q = query(collection(db, "productionOrders"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
        console.log("Received real-time update for production orders.");
        const newOrders = [];
        querySnapshot.forEach((doc) => {
            const orderData = doc.data();
            orderData.order_id = parseInt(doc.id, 10); // The document ID is the order_id
            newOrders.push(orderData);
        });
        state.setProductionOrders(newOrders);

        // Refresh relevant UI parts that depend on production orders
        loadProductionOrders();
        updateDashboard();
    }, (error) => {
        console.error("Error in production orders listener:", error);
        Toastify({ text: 'Error de conexión en tiempo real. Algunas actualizaciones pueden no reflejarse.', backgroundColor: 'var(--danger-color)' }).showToast();
    });

    state.setUnsubscribeProductionOrders(unsubscribe);
    console.log("Production orders listener attached.");
}

/**
 * The main navigation function. Hides all pages and shows the one with the requested ID.
 * Then, it calls the appropriate function to load the content for that page.
 * @param {string} pageId - The ID of the page to show.
 */
export function showPage(pageId) {
    try {
        console.log(`Attempting to show page: ${pageId}`);

        pages.forEach(p => { p.style.display = 'none'; });
        const pageToShow = document.getElementById(pageId);
        if (!pageToShow) {
            console.error(`Page with id "${pageId}" not found.`);
            return;
        }
        pageToShow.style.display = 'block';

        navLinks.forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`[data-page="${pageId}"]`);
        if (activeLink) activeLink.classList.add('active');

        console.log(`Successfully displayed page: ${pageId}. Now loading content...`);

        // Call the content loader function for the specific page
        const pageLoaders = {
            'dashboardPage': () => { populateDashboardFilters(); updateDashboard(); updateTimestamps(); },
            'productsPage': loadProducts,
            'materialsPage': loadMaterials,
            'recipesPage': () => { loadRecipes(); populateRecipeProductSelect(); },
            'demandPlannerPage': () => {
                const firstSelect = document.querySelector('.forecast-product');
                if (firstSelect) populatePlannerProductSelects(firstSelect);
                const plannerAlmacenSelect = document.getElementById('plannerAlmacenSelect');
                plannerAlmacenSelect.innerHTML = '<option value="all">Todos los Almacenes (Total)</option>';
                state.almacenes.forEach(a => plannerAlmacenSelect.add(new Option(a.name, a.id)));
                document.getElementById('suggestedOrdersCard').style.display = 'none';
                document.getElementById('suggestedOrdersTableBody').innerHTML = '';
            },
            'productionOrdersPage': () => { loadProductionOrders(); populateOrderFormSelects(); },
            'reportsPage': () => { loadReports(); updateTimestamps(); },
            'maintenancePage': loadMaintenancePage,
            'settingsPage': () => {
                loadOperators();
                loadEquipos();
                loadAlmacenes();
                if (state.currentUserRole === 'Administrator') {
                    document.getElementById('userManagementCard').style.display = 'block';
                    loadUsers();
                } else {
                    document.getElementById('userManagementCard').style.display = 'none';
                }
            }
        };

        if (pageLoaders[pageId]) {
            pageLoaders[pageId]();
        }

        console.log('Finished loading content for page:', pageId);
    } catch (error) {
        console.error(`An error occurred in showPage for pageId "${pageId}":`, error);
        Toastify({ text: 'Ocurrió un error al cambiar de sección.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

/**
 * Initializes the main application content after a successful login.
 */
export async function initializeAppContent() {
  console.log("Initializing app content...");

  console.log("Registering ChartDataLabels plugin");
  try {
      Chart.register(ChartDataLabels);
      console.log("ChartDataLabels plugin registered successfully.");
  } catch(e) {
      console.error("Failed to register ChartDataLabels", e);
  }

  await loadInitialData();
  await checkAndTriggerOnboarding();
  setupGlobalEventListeners();
  applyRoleRestrictions();

  // --- Navigation Event Listeners ---
  navLinks.forEach(l => l.addEventListener('click', (e) => {
      e.preventDefault();
      const page = l.dataset.page;
      if (page) {
          showPage(page);
          // Hide sidebar on mobile after clicking a link
          const sidebar = document.getElementById('sidebar');
          if (sidebar.classList.contains('show')) {
              const sidebarToggler = new bootstrap.Collapse(sidebar);
              sidebarToggler.hide();
          }
      }
  }));

  // --- Initial Page Load ---
  showPage('dashboardPage');

  // --- Hide splash screen ---
  const splashScreen = document.getElementById('splashScreen');
  if(splashScreen) {
    setTimeout(() => {
        splashScreen.classList.remove('splash-visible');
    }, 1500);
  }
}

/**
 * Sets up event listeners for elements that are always present in the DOM after login.
 */
function setupGlobalEventListeners() {
    document.getElementById('mobileLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        handleLogout();
    });

    // PDF generation buttons
    document.getElementById('dashboardPdfBtn')?.addEventListener('click', () => generatePagePDF('dashboardPage', 'dashboard.pdf'));
    document.getElementById('reportsPdfBtn')?.addEventListener('click', () => generatePagePDF('reportsPage', 'reporte.pdf'));

    // Dashboard filter listeners
    const dashboardUpdateHandler = () => {
        if (document.getElementById('dashboardPage').style.display !== 'none') {
            updateDashboard();
        }
    };
    document.getElementById('lowStockThreshold').addEventListener('input', dashboardUpdateHandler);
    document.getElementById('dashboardAlmacenFilter').addEventListener('change', dashboardUpdateHandler);
    document.getElementById('dashboardMonthFilter').addEventListener('change', dashboardUpdateHandler);
    document.getElementById('dashboardYearFilter').addEventListener('change', dashboardUpdateHandler);

    // This function from the maintenance module sets up its own modal listeners
    setupGlobalMaintenanceEventListeners();
}