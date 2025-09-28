import { clientConfigs } from './config.js';
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, deleteDoc, getDoc, updateDoc, deleteField, query, orderBy, limit, startAfter, getCountFromServer, where, increment } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import Chart from 'https://esm.sh/chart.js/auto';
import ChartDataLabels from 'https://esm.sh/chartjs-plugin-datalabels';

// Firebase services will be initialized on login, based on client selection
let app;
let auth;
let db;
let storage;

console.log("Awaiting user login to initialize Firebase...");

// -----------------------------------------------------------------------------
//  Superproducción – Gestión de Producción
// -----------------------------------------------------------------------------
/* global bootstrap, XLSX, jsPDF, html2canvas, Toastify, clientConfigs */

/* ----------  AUTH  ---------- */
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const userDataDiv = document.getElementById('userData');

let currentUserRole = null;

async function getUserRole(uid) {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
        return userDoc.data().role;
    }
    return null;
}

async function handleSuccessfulLogin(user) {
    const splashScreen = document.getElementById('splashScreen');
    try {
        currentUserRole = await getUserRole(user.uid);

        // If user has no role, check if they are the first user for this client
        if (!currentUserRole) {
            const usersSnapshot = await getDocs(collection(db, "users"));
            if (usersSnapshot.empty) {
                console.log(`First user login for this client. Assigning 'Administrator' role to ${user.email}`);
                const adminRole = { role: 'Administrator', email: user.email };
                await setDoc(doc(db, "users", user.uid), adminRole);
                currentUserRole = 'Administrator';
                Toastify({ text: 'Primer usuario detectado. Se ha asignado el rol de Administrador.', backgroundColor: 'var(--info-color)', duration: 8000 }).showToast();
            } else {
                 Toastify({ text: `Error: El usuario ${user.email} no tiene un rol asignado. Contacte al administrador.`, backgroundColor: 'var(--danger-color)', duration: -1 }).showToast();
                 await handleLogout(); // Log out the user as they can't do anything
                 return;
            }
        }

        if(splashScreen) splashScreen.classList.add('splash-visible');

        loginView.classList.add('d-none');
        appView.classList.remove('d-none');
        userDataDiv.textContent = user.email;
        await initializeAppContent();

    } catch (error) {
        console.error("A critical error occurred during the login process:", error);
        Toastify({ text: 'Ocurrió un error crítico al iniciar sesión. Por favor, intente de nuevo.', backgroundColor: 'var(--danger-color)', duration: 8000 }).showToast();
        if(splashScreen) splashScreen.classList.remove('splash-visible');
        await handleLogout();
    }
}

async function handleLogout() {
    if (auth) {
        await signOut(auth);
    }
    // Reset state and Firebase instance
    currentUserRole = null;
    if (app) {
        await deleteApp(app);
        app = null;
        auth = null;
        db = null;
        storage = null;
        console.log("Firebase app instance deleted and session cleared.");
    }
    // Show login view
    loginView.classList.remove('d-none');
    appView.classList.add('d-none');
    document.getElementById('loginForm').reset();
    // Re-enable the client selector
    const clientSelector = document.getElementById('clientSelector');
    if(clientSelector) clientSelector.disabled = false;
}

const loginBtn = document.getElementById('loginBtn');

// On page load, check for and pre-fill the last used client ID
document.addEventListener('DOMContentLoaded', () => {
    const savedClientId = localStorage.getItem('operis-last-client-id');
    if (savedClientId) {
        const clientSelector = document.getElementById('clientSelector');
        if (clientSelector) {
            clientSelector.value = savedClientId;
        }
    }
});

loginBtn.addEventListener('click', async () => {
    console.log("Login button clicked.");
    const clientKey = document.getElementById('clientSelector').value.trim().toLowerCase();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const spinner = loginBtn.querySelector('.spinner-border');
    const clientSelector = document.getElementById('clientSelector');

    console.log(`Attempting login for client: '${clientKey}' with email: '${email}'`);

    if (!clientKey) {
        console.log("Client key is missing.");
        Toastify({ text: 'Por favor, ingrese el ID de su empresa.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    if (!clientConfigs[clientKey]) {
        console.log(`Invalid client key: '${clientKey}'. Config not found.`);
        Toastify({ text: `El ID de empresa "${clientKey}" no es válido.`, backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    spinner.classList.remove('d-none');
    loginBtn.disabled = true;
    clientSelector.disabled = true;

    try {
        const config = clientConfigs[clientKey].firebaseConfig;
        console.log("Found config, initializing Firebase...");

        app = initializeApp(config);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        console.log(`Firebase initialized for client: ${clientKey}`);

        console.log("Attempting to sign in with email and password...");
        const userCredential = await signInWithEmailAndPassword(auth, email, password);

        // Save the successful client ID to localStorage
        localStorage.setItem('operis-last-client-id', clientKey);

        console.log("Sign in successful, handling login...");
        await handleSuccessfulLogin(userCredential.user);

    } catch (error) {
        console.error("Login failed with error:", error);
        Toastify({ text: `Error: ${error.message || error.code || 'Error al iniciar sesión.'}`, backgroundColor: 'var(--danger-color)' }).showToast();
        if (app) {
            await deleteApp(app); // Clean up failed initialization
            app = null;
            auth = null;
            db = null;
            storage = null;
            console.log("Cleaned up failed Firebase app instance.");
        }
        // Re-enable form on failure
        clientSelector.disabled = false;
    } finally {
        spinner.classList.add('d-none');
        loginBtn.disabled = false;
        console.log("Login function finished.");
    }
});

logoutBtn.addEventListener('click', handleLogout);


/* ----------  BASE DE DATOS LOCAL  ---------- */
let products   = [];
let recipes    = {};
let productionOrders = [];
let operators  = [];
let equipos    = [];
let materials  = [];
let vales      = [];
let users      = [];
let almacenes = [];
let traspasos = [];

let costChartInstance = null, productionChartInstance = null, dailyProductionChartInstance = null, dailyOvercostChartInstance = null;

async function loadCollection(collectionName, idField) {
    try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        const data = [];
        querySnapshot.forEach((doc) => {
            const docData = doc.data();
            docData[idField] = doc.id;
            data.push(docData);
        });
        return data;
    } catch (error) {
        console.error(`Error loading collection ${collectionName}:`, error);
        if (['products', 'materials', 'recipes'].includes(collectionName)) {
             Toastify({ text: `Error Crítico: No se pudo cargar ${collectionName}. La aplicación puede no funcionar.`, backgroundColor: 'var(--danger-color)', duration: -1 }).showToast();
        }
        return [];
    }
}

async function loadRecipesCollection() {
    try {
        const querySnapshot = await getDocs(collection(db, 'recipes'));
        const recipesData = {};
        querySnapshot.forEach((doc) => {
            recipesData[doc.id] = doc.data().items;
        });
        return recipesData;
    } catch (error) {
        console.error("Error loading recipes collection:", error);
        Toastify({ text: `Error Crítico: No se pudo cargar las recetas.`, backgroundColor: 'var(--danger-color)', duration: -1 }).showToast();
        return {};
    }
}

async function migrateDataToMultiAlmacen() {
    const migrationKey = 'migration_multi_almacen_done_v1';
    if (localStorage.getItem(migrationKey)) {
        return;
    }

    Toastify({ text: 'Comprobando estructura de datos de inventario...', duration: 4000, backgroundColor: 'var(--info-color)' }).showToast();

    // Ensure the GENERAL warehouse exists before proceeding
    let generalAlmacen = almacenes.find(a => a.id === 'GENERAL');
    if (!generalAlmacen) {
        console.log("Creando almacén 'GENERAL' por primera vez para migración.");
        generalAlmacen = { id: 'GENERAL', name: 'Almacén General', isDefault: false };
        try {
            await setDoc(doc(db, "almacenes", "GENERAL"), generalAlmacen);
            almacenes.push(generalAlmacen);
        } catch (e) {
            console.error("Error crítico al crear el almacén GENERAL. La migración no puede continuar.", e);
            Toastify({ text: 'Error al crear almacén base. La migración falló.', backgroundColor: 'var(--danger-color)', duration: -1 }).showToast();
            return;
        }
    }

    try {
        // Find materials that still use the old `existencia` field.
        const materialsToMigrateQuery = query(collection(db, 'materials'), where('existencia', '>', -Infinity));
        const materialsSnapshot = await getDocs(materialsToMigrateQuery);

        if (materialsSnapshot.empty) {
            localStorage.setItem(migrationKey, 'true');
            console.log("No materials needed migration to multi-almacen structure.");
            return;
        }

        const migrationPromises = [];
        materialsSnapshot.forEach(materialDoc => {
            const materialData = materialDoc.data();
            // Check if inventario field is missing to avoid overwriting new structures
            if (typeof materialData.inventario === 'undefined') {
                const docRef = doc(db, "materials", materialDoc.id);
                migrationPromises.push(updateDoc(docRef, {
                    inventario: { 'GENERAL': materialData.existencia || 0 },
                    existencia: deleteField()
                }));
            }
        });

        if (migrationPromises.length > 0) {
            await Promise.all(migrationPromises);
            Toastify({ text: `Estructura de inventario actualizada para ${migrationPromises.length} materiales.`, backgroundColor: 'var(--success-color)' }).showToast();
        }

        localStorage.setItem(migrationKey, 'true');

    } catch (error) {
        console.error('Error during data migration to multi-almacen:', error);
        Toastify({ text: 'Error durante la migración de datos de inventario.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}


async function loadInitialData() {
    document.body.insertAdjacentHTML('beforeend', '<div id="loader" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>');

    try {
        const promises = [
            // loadCollection('products', 'codigo'), // Deactivated for performance
            // loadCollection('materials', 'codigo'), // Deactivated for performance
            // loadCollection('productionOrders', 'order_id'), // Deactivated for performance
            loadCollection('operators', 'id'),
            loadCollection('equipos', 'id'),
            // loadCollection('vales', 'vale_id'), // Deactivated for performance
            loadCollection('almacenes', 'id'),
            // loadCollection('traspasos', 'traspaso_id'), // Deactivated for performance
            // loadRecipesCollection() // Deactivated for performance
        ];

        if (currentUserRole?.toLowerCase() === 'administrator') {
            promises.push(loadCollection('users', 'uid'));
        }

        const [
            // productsData,
            // materialsData,
            // productionOrdersData,
            operatorsData,
            equiposData,
            // valesData,
            almacenesData,
            // traspasosData,
            // recipesData,
            usersData
        ] = await Promise.all(promises);

        // products = productsData; // Deactivated for performance
        // materials = materialsData; // Deactivated for performance
        // productionOrders = productionOrdersData; // Deactivated for performance
        operators = operatorsData;
        equipos = equiposData;
        // vales = valesData; // Deactivated for performance
        almacenes = almacenesData.sort((a, b) => a.id.localeCompare(b.id));
        // traspasos = traspasosData; // Deactivated for performance
        // recipes = recipesData; // Deactivated for performance
        if (usersData) users = usersData;

        // productionOrders.forEach(o => o.order_id = parseInt(o.order_id));

        // await migrateDataToMultiAlmacen(); // This needs materials, must be refactored

    } catch (error) {
        console.error("Error loading initial data from Firestore:", error);
        Toastify({ text: 'Error al cargar datos de la nube. Verifique la conexión y configuración de Firebase.', backgroundColor: 'var(--danger-color)', duration: 10000 }).showToast();
    } finally {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.remove();
        }
    }
}

/* ----------  UTILS  ---------- */
async function generateSequentialOrderId() {
    const q = query(collection(db, 'productionOrders'), orderBy('order_id', 'desc'), limit(1));
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        return 1;
    }
    const lastOrder = querySnapshot.docs[0].data();
    return (lastOrder.order_id || 0) + 1;
}
function formatDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return 'N/A';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
}

function formatDateShort(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return 'N/A';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  const shortYear = year.slice(-2);
  return `${day}-${month}-${shortYear}`;
}

function formatCurrency(value) {
  if (value === null || typeof value === 'undefined') {
    return 'N/A';
  }
  const number = parseFloat(value);
  if (isNaN(number)) {
    return 'N/A';
  }
  return `$${number.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function updateTimestamps() {
  const now = new Date();
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const formattedDate = now.toLocaleString('es-ES', options);
  document.querySelectorAll('.report-timestamp').forEach(span => {
    span.textContent = formattedDate;
  });
}

function printPage(pageId) {
    const page = document.getElementById(pageId);
    if (!page) return;

    window.onafterprint = () => {
        page.classList.remove('printable-page');
        window.onafterprint = null;
    };

    page.classList.add('printable-page');
    window.print();
}

function generatePagePDF(elementId, filename) {
    const { jsPDF } = window.jspdf;
    const element = document.getElementById(elementId);
    if (!element) return;

    const originalDisplay = element.style.display;
    element.style.display = 'block';

    html2canvas(element, { scale: 2, useCORS: true }).then(canvas => {
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasWidth = canvas.width;
        const canvasHeight = canvas.height;
        const ratio = canvasWidth / canvasHeight;
        const width = pdfWidth;
        const height = width / ratio;

        let position = 0;
        let heightLeft = height;

        pdf.addImage(imgData, 'PNG', 0, position, width, height);
        heightLeft -= pdfHeight;

        while (heightLeft > 0) {
            position = heightLeft - height;
            pdf.addPage();
            pdf.addImage(imgData, 'PNG', 0, position, width, height);
            heightLeft -= pdfHeight;
        }

        pdf.save(filename);
        element.style.display = originalDisplay;
    }).catch(err => {
        console.error('Error generating PDF:', err);
        Toastify({ text: 'Error al generar el PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
        element.style.display = originalDisplay;
    });
}

function applyRoleRestrictions() {
    const isSupervisor = currentUserRole?.toLowerCase() === 'supervisor';

    const navLinksToHide = {
        'productsPage': true,
        'settingsPage': true
    };

    document.querySelectorAll('#sidebar .nav-link').forEach(link => {
        const page = link.dataset.page;
        if (isSupervisor && navLinksToHide[page]) {
            link.parentElement.style.display = 'none';
        } else {
            link.parentElement.style.display = 'block';
        }
    });

    const adminOnlySelectors = [
        'button[data-bs-target="#productModal"]',
        '#productsTableBody .edit-btn',
        '#productsTableBody .delete-btn',
        '#importProductsBtn',
        '#exportProductsBtn',
        'button[data-bs-target="#materialModal"]',
        '#materialsTableBody .edit-btn',
        '#materialsTableBody .delete-btn',
        '#exportMaterialsBtn',
        'button[data-bs-target="#addRecipeModal"]',
        '#recipesTableBody .edit-btn',
        '#recipesTableBody .delete-btn',
        '#importRecipesBtn',
        '#exportRecipesBtn',
        '#productionOrdersTableBody .delete-order-btn',
        '#productionOrdersTableBody .reopen-order-btn',
        '#settingsPage .card'
    ];

    adminOnlySelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (isSupervisor) {
                el.style.display = 'none';
            } else {
                el.style.display = '';
            }
        });
    });

    const currentPageId = document.querySelector('.page-content:not([style*="display: none"])')?.id;
    if (isSupervisor && navLinksToHide[currentPageId]) {
        document.getElementById(currentPageId).innerHTML = '<h1 class="mt-4">Acceso Denegado</h1><p>No tiene permiso para ver esta página. Por favor, regrese al Dashboard.</p>';
    }
}


/* ----------  NAVEGACIÓN  ---------- */
async function initializeAppContent() {
  console.log("Initializing app content...");

  console.log("Registering ChartDataLabels plugin");
  try {
      Chart.register(ChartDataLabels);
      console.log("ChartDataLabels plugin registered successfully.");
  } catch(e) {
      console.error("Failed to register ChartDataLabels", e);
  }

  await loadInitialData();
  await migrateDataToMultiAlmacen();
  await checkAndTriggerOnboarding();
  applyRoleRestrictions();
  const navLinks = document.querySelectorAll('.nav-link');
  const pages    = document.querySelectorAll('.page-content');

  function showPage(pageId) {
    try {
        console.log(`Attempting to show page: ${pageId}`);

        pages.forEach(p => {
            p.style.display = 'none';
        });

        const pageToShow = document.getElementById(pageId);
        if (!pageToShow) {
            console.error(`Page with id "${pageId}" not found.`);
            return;
        }
        pageToShow.style.display = 'block';

        navLinks.forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`[data-page="${pageId}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        } else {
            console.error(`Nav link with data-page "${pageId}" not found.`);
        }

        console.log(`Successfully displayed page: ${pageId}. Now loading content...`);

        if (pageId === 'dashboardPage') {
            console.log('Loading dashboard content...');
            updateDashboard();
            updateTimestamps();
        } else if (pageId === 'productsPage') {
            console.log('Loading products content...');
            loadProducts();
        } else if (pageId === 'materialsPage') {
            console.log('Loading materials content...');
            loadMaterials();
        } else if (pageId === 'recipesPage') {
            console.log('Loading recipes content...');
            loadRecipes();
            populateRecipeProductSelect();
        } else if (pageId === 'demandPlannerPage') {
            console.log('Loading demand planner content...');
            const firstSelect = document.querySelector('.forecast-product');
            if (firstSelect) {
                populatePlannerProductSelects(firstSelect);
            }
            const plannerAlmacenSelect = document.getElementById('plannerAlmacenSelect');
            plannerAlmacenSelect.innerHTML = '<option value="all">Todos los Almacenes (Total)</option>';
            almacenes.forEach(a => {
                plannerAlmacenSelect.add(new Option(a.name, a.id));
            });

            document.getElementById('suggestedOrdersCard').style.display = 'none';
            document.getElementById('suggestedOrdersTableBody').innerHTML = '';
        } else if (pageId === 'productionOrdersPage') {
            console.log('Loading production orders content...');
            loadProductionOrders();
            populateOrderFormSelects();
        } else if (pageId === 'reportsPage') {
            console.log('Loading reports content...');
            loadReports();
            updateTimestamps();
        } else if (pageId === 'settingsPage') {
            console.log('Loading settings content...');
            loadOperators();
            loadEquipos();
            loadAlmacenes();
            if (currentUserRole === 'Administrator') {
                document.getElementById('userManagementCard').style.display = 'block';
                loadUsers();
            } else {
                document.getElementById('userManagementCard').style.display = 'none';
            }
        }
        console.log('Finished loading content for page:', pageId);
    } catch (error) {
        console.error(`An error occurred in showPage for pageId "${pageId}":`, error);
        Toastify({ text: 'Ocurrió un error al cambiar de sección.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
  }

  navLinks.forEach(l => l.addEventListener('click', (e) => {
      e.preventDefault();
      const page = l.dataset.page;
      if (page) {
          showPage(page);
          const sidebar = document.getElementById('sidebar');
          if (sidebar.classList.contains('show')) {
              const sidebarToggler = new bootstrap.Collapse(sidebar);
              sidebarToggler.hide();
          }
      }
  }));

  document.getElementById('mobileLogoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout();
  });

  document.getElementById('dashboardPdfBtn')?.addEventListener('click', () => generatePagePDF('dashboardPage', 'dashboard.pdf'));
  document.getElementById('reportsPdfBtn')?.addEventListener('click', () => generatePagePDF('reportsPage', 'reporte.pdf'));

  document.getElementById('toggleOrderSortBtn')?.addEventListener('click', () => {
    orderSortDirection = orderSortDirection === 'asc' ? 'desc' : 'asc';
    const icon = document.querySelector('#toggleOrderSortBtn i');
    icon.className = orderSortDirection === 'asc' ? 'fas fa-sort-amount-up-alt' : 'fas fa-sort-amount-down-alt';
    ordersPageCursors = { 1: null }; // Reset cursors
    loadProductionOrders(1);
  });

  document.getElementById('searchOrder')?.addEventListener('input', () => {
      ordersPageCursors = { 1: null }; // Reset cursors
      loadProductionOrders(1);
  });

  showPage('dashboardPage');

  const dashboardUpdateHandler = () => {
    if (document.getElementById('dashboardPage').style.display !== 'none') {
      updateDashboard();
    }
  };

  document.getElementById('lowStockThreshold').addEventListener('input', dashboardUpdateHandler);
  document.getElementById('dashboardAlmacenFilter').addEventListener('change', dashboardUpdateHandler);

  // Hide splash screen after a delay
  const splashScreen = document.getElementById('splashScreen');
  if(splashScreen) {
    setTimeout(() => {
        splashScreen.classList.remove('splash-visible');
    }, 1500); // 1.5 second delay
  }
}

/* ----------  DASHBOARD  ---------- */
async function updateDashboard() {
    const dashboardContent = document.getElementById('dashboardPage').querySelectorAll('.card, .row');
    try {
        dashboardContent.forEach(el => el.style.opacity = '0.5');

        const almacenFilter = document.getElementById('dashboardAlmacenFilter');
        if (almacenFilter.options.length <= 1) {
            almacenFilter.innerHTML = '<option value="all">Todos los Almacenes</option>';
            almacenes.forEach(a => almacenFilter.add(new Option(a.name, a.id)));
        }

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const firstDayOfMonth = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];

        const [ordersSnapshot, allMaterials, allRecipes, allProducts] = await Promise.all([
            getDocs(query(collection(db, 'productionOrders'), where('created_at', '>=', firstDayOfMonth))),
            loadCollection('materials', 'codigo'),
            loadRecipesCollection(),
            loadCollection('products', 'codigo')
        ]);
        const allOrders = ordersSnapshot.docs.map(d => d.data());

        const completedThisMonth = allOrders.filter(o => {
            if (o.status !== 'Completada' || !o.completed_at) return false;
            const orderDate = new Date(o.completed_at);
            return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
        });

        const pending = allOrders.filter(o => o.status === 'Pendiente');
        const intermediateProducts = await getIntermediateProductCodes();
        const finalProductOrdersThisMonth = completedThisMonth.filter(o => !intermediateProducts.has(o.product_code));

        document.getElementById('pendingOrdersCard').textContent = pending.length;
        document.getElementById('completedOrdersCard').textContent = completedThisMonth.length;
        document.getElementById('totalProductionCard').textContent = finalProductOrdersThisMonth.reduce((acc, o) => acc + (o.quantity_produced || 0), 0);
        document.getElementById('totalCostCard').textContent = formatCurrency(finalProductOrdersThisMonth.reduce((acc, o) => acc + (o.cost_real || 0), 0));
        document.getElementById('totalOvercostCard').textContent = formatCurrency(completedThisMonth.reduce((acc, o) => acc + (o.overcost || 0), 0));

        // Operator & Equipo Stats
        const operatorStats = {};
        const equipoStats = {};
        completedThisMonth.forEach(o => {
            if (!operatorStats[o.operator_id]) operatorStats[o.operator_id] = { name: operators.find(op => op.id === o.operator_id)?.name || o.operator_id, production: 0, overcost: 0 };
            operatorStats[o.operator_id].production += o.quantity_produced || 0;
            operatorStats[o.operator_id].overcost += o.overcost || 0;
            if (!equipoStats[o.equipo_id]) equipoStats[o.equipo_id] = { name: equipos.find(eq => eq.id === o.equipo_id)?.name || o.equipo_id, production: 0 };
            equipoStats[o.equipo_id].production += o.quantity_produced || 0;
        });

        document.getElementById('operatorProductionRankBody').innerHTML = Object.values(operatorStats).sort((a, b) => b.production - a.production).map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>${op.production}</td></tr>`).join('');
        document.getElementById('operatorOvercostRankBody').innerHTML = Object.values(operatorStats).sort((a, b) => a.overcost - b.overcost).map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>${formatCurrency(op.overcost)}</td></tr>`).join('');
        document.getElementById('equipoProductionRankBody').innerHTML = Object.values(equipoStats).sort((a, b) => b.production - a.production).map((eq, i) => `<tr><td>${i + 1}</td><td>${eq.name}</td><td>${eq.production}</td></tr>`).join('');

        // Low Stock Alerts
        const threshold = parseInt(document.getElementById('lowStockThreshold').value, 10);
        const selectedAlmacenId = document.getElementById('dashboardAlmacenFilter').value;
        const lowStockAlerts = [];
        allMaterials.forEach(m => {
            if (!m.inventario) return;
            const almacenesToCheck = selectedAlmacenId === 'all' ? Object.keys(m.inventario) : [selectedAlmacenId];
            almacenesToCheck.forEach(almacenId => {
                if (m.inventario[almacenId] < threshold) {
                    lowStockAlerts.push({ material: m, almacenName: almacenes.find(a => a.id === almacenId)?.name || almacenId, stock: m.inventario[almacenId] });
                }
            });
        });
        lowStockAlerts.sort((a, b) => a.stock - b.stock);

        const materialToProductsMap = {};
        for (const productId of Object.keys(allRecipes)) {
            const baseMaterials = await getBaseMaterials(productId, 1, allRecipes);
            const product = allProducts.find(p => p.codigo === productId);
            if (product) {
                baseMaterials.forEach(bm => {
                    if (!materialToProductsMap[bm.code]) materialToProductsMap[bm.code] = new Set();
                    materialToProductsMap[bm.code].add(product.descripcion);
                });
            }
        }

        const lowStockTbody = document.getElementById('lowStockTableBody');
        lowStockTbody.innerHTML = lowStockAlerts.length ? lowStockAlerts.map(alert => {
            const affectedProductsList = [...(materialToProductsMap[alert.material.codigo] || [])];
            return `<tr><td>${alert.material.descripcion} en <strong>${alert.almacenName}</strong></td><td>${alert.stock.toFixed(2)}</td><td>${alert.material.unidad}</td><td>${affectedProductsList.length > 0 ? affectedProductsList.map((p, i) => `${i + 1}. ${p}`).join('<br>') : 'N/A'}</td></tr>`;
        }).join('') : `<tr><td colspan="4" class="text-center">Sin alertas para el límite de ${threshold}</td></tr>`;

        initCharts(completedThisMonth, finalProductOrdersThisMonth);

    } catch (error) {
        console.error("Error updating dashboard:", error);
        Toastify({ text: 'Error al actualizar el dashboard.', backgroundColor: 'var(--danger-color)' }).showToast();
    } finally {
        dashboardContent.forEach(el => el.style.opacity = '1');
    }
}

/* ----------  PAGINATION  ---------- */
function renderPaginationControls(containerId, currentPage, totalPages, itemsPerPage, onPageChange, onItemsPerPageChange) {
    const container = document.getElementById(containerId);
    if (!container) return;

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


/* ----------  PRODUCTOS  ---------- */
let isEditingProduct = false, currentProductCode = null;
const productModal = new bootstrap.Modal(document.getElementById('productModal'));

// --- State for Server-Side Pagination ---
let productsCurrentPage = 1;
let productsItemsPerPage = 10;
let productsTotalPages = 1;
let productsLastVisible = null; // Stores the last document snapshot for the next page query
let productsPageCursors = { 1: null }; // Maps page number to the 'startAfter' cursor

async function loadProducts(page = 1) {
    productsCurrentPage = page;
    const filter = document.getElementById('searchProduct').value.toUpperCase().trim();
    const tbody = document.getElementById('productsTableBody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Cargando...</td></tr>';

    try {
        // --- Build Query ---
        const productsRef = collection(db, 'products');
        let q;
        let countQuery;

        if (filter) {
            // Firestore is case-sensitive and doesn't have a native 'contains' or 'LIKE' query.
            // A common workaround is to use a range query on the search field.
            // This works for "starts-with" queries.
            q = query(productsRef,
                orderBy('codigo'),
                where('codigo', '>=', filter),
                where('codigo', '<=', filter + '\uf8ff'),
                limit(productsItemsPerPage));

            // We need a separate query to count the filtered results accurately.
            countQuery = query(productsRef,
                where('codigo', '>=', filter),
                where('codigo', '<=', filter + '\uf8ff'));
        } else {
            // Standard paginated query
            const baseQuery = query(productsRef, orderBy('codigo'));
            countQuery = baseQuery; // For total count, we use the base query without limits

            if (page > 1 && productsPageCursors[page]) {
                q = query(baseQuery, startAfter(productsPageCursors[page]), limit(productsItemsPerPage));
            } else {
                q = query(baseQuery, limit(productsItemsPerPage));
            }
        }

        // --- Execute Queries ---
        const [querySnapshot, countSnapshot] = await Promise.all([
            getDocs(q),
            getCountFromServer(countQuery)
        ]);

        const totalProducts = countSnapshot.data().count;
        productsTotalPages = Math.ceil(totalProducts / productsItemsPerPage);
        if (productsCurrentPage > productsTotalPages) productsCurrentPage = productsTotalPages || 1;

        // --- Render Results ---
        tbody.innerHTML = '';
        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No se encontraron productos.</td></tr>';
        } else {
            querySnapshot.forEach(doc => {
                const p = doc.data();
                p.codigo = doc.id; // The document ID is the product code
                tbody.insertAdjacentHTML('beforeend', `<tr><td>${p.codigo}</td><td>${p.descripcion}</td><td>${p.unidad || ''}</td><td><button class="btn btn-sm btn-warning edit-btn" data-code="${p.codigo}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-btn" data-code="${p.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`);
            });
        }

        // --- Update Pagination State ---
        if (!querySnapshot.empty) {
            productsLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            productsPageCursors[page + 1] = productsLastVisible; // Store cursor for the *next* page
        }

        // --- Render Controls ---
        renderPaginationControls(
            'productsPagination',
            productsCurrentPage,
            productsTotalPages,
            productsItemsPerPage,
            (newPage) => { // onPageChange
                loadProducts(newPage);
            },
            (newSize) => { // onItemsPerPageChange
                productsItemsPerPage = newSize;
                productsPageCursors = { 1: null }; // Reset cursors
                loadProducts(1);
            }
        );

    } catch (error) {
        console.error("Error loading products from Firestore:", error);
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">Error al cargar productos.</td></tr>';
        Toastify({ text: 'Error al cargar productos.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('productCode').value.trim().toUpperCase();
    const desc = document.getElementById('productDescription').value.trim();
    const unit = document.getElementById('productUnit').value.trim();
    if (!code || !desc) return;

    if (!isEditingProduct) {
        const productRef = doc(db, "products", code);
        const materialRef = doc(db, "materials", code);
        const [productSnap, materialSnap] = await Promise.all([getDoc(productRef), getDoc(materialRef)]);

        if (productSnap.exists() || materialSnap.exists()) {
            Toastify({ text: `Error: El código ${code} ya existe como producto o material.`, backgroundColor: 'var(--danger-color)', duration: 5000 }).showToast();
            return;
        }
    }

    const productData = {
        descripcion: desc,
        unidad: unit
    };

    try {
        await setDoc(doc(db, "products", code), productData);
        loadProducts(productsCurrentPage); // Refresh the current page
        productModal.hide();
        Toastify({ text: 'Producto guardado', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving product: ", error);
        Toastify({ text: 'Error al guardar producto', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});
document.getElementById('productsTableBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const code = btn.dataset.code;

    if (btn.classList.contains('delete-btn')) {
        if (confirm(`¿Eliminar producto ${code}?`)) {
            try {
                await deleteDoc(doc(db, "products", code));
                loadProducts(productsCurrentPage); // Refresh the view
                Toastify({ text: 'Producto eliminado', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting product: ", error);
                Toastify({ text: 'Error al eliminar producto', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }

    if (btn.classList.contains('edit-btn')) {
        isEditingProduct = true;
        currentProductCode = code;
        const productDoc = await getDoc(doc(db, "products", code));
        if (productDoc.exists()) {
            const p = productDoc.data();
            document.getElementById('productCode').value = code;
            document.getElementById('productDescription').value = p.descripcion;
            document.getElementById('productUnit').value = p.unidad || '';
            document.getElementById('productCode').disabled = true;
            document.getElementById('productModalLabel').textContent = 'Editar Producto';
            productModal.show();
        } else {
            Toastify({ text: `Producto ${code} no encontrado.`, backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
});
document.getElementById('productModal').addEventListener('hidden.bs.modal', () => { isEditingProduct = false; document.getElementById('productForm').reset(); document.getElementById('productCode').disabled = false; document.getElementById('productModalLabel').textContent = 'Añadir Producto'; });
document.getElementById('searchProduct').addEventListener('input', () => {
    productsPageCursors = { 1: null }; // Reset cursors for new search
    loadProducts(1);
});

/* ----------  MATERIALES  ---------- */
let isEditingMaterial = false, currentMaterialCode = null;
const materialModal = new bootstrap.Modal(document.getElementById('materialModal'));

// --- State for Server-Side Pagination ---
let materialsCurrentPage = 1;
let materialsItemsPerPage = 10;
let materialsTotalPages = 1;
let materialsLastVisible = null;
let materialsPageCursors = { 1: null };

function populateMaterialInventario(inventarioData = {}) {
    const container = document.getElementById('materialInventario');
    container.innerHTML = '<label class="form-label">Existencia por Almacén</label>';
    if (almacenes.length === 0) {
        container.innerHTML += '<p class="text-muted small mt-1">No hay almacenes configurados. Por favor, añada al menos uno en la sección de Configuración.</p>';
        return;
    }
    almacenes.forEach(almacen => {
        const stock = inventarioData[almacen.id] || 0;
        container.insertAdjacentHTML('beforeend', `
            <div class="input-group input-group-sm mb-2">
                <span class="input-group-text">${almacen.name}</span>
                <input type="number" class="form-control material-stock-input" data-almacen-id="${almacen.id}" value="${stock.toFixed(2)}" step="0.01" min="0" required>
            </div>
        `);
    });
}

async function loadMaterials(page = 1) {
    materialsCurrentPage = page;
    const filter = document.getElementById('searchMaterial').value.toUpperCase().trim();
    // The "filter as products" feature is complex with Firestore queries and is disabled for now.
    // const showOnlyProducts = document.getElementById('filterMaterialsAsProducts').checked;

    const thead = document.getElementById('materialsTableHead');
    const tbody = document.getElementById('materialsTableBody');
    tbody.innerHTML = `<tr><td colspan="${6 + almacenes.length}" class="text-center">Cargando...</td></tr>`;

    // --- Generate Headers (Dynamic based on warehouses) ---
    let headerHtml = '<tr><th>Código</th><th>Descripción</th><th>Unidad</th>';
    almacenes.forEach(a => {
        headerHtml += `<th>Stock (${a.id})</th>`;
    });
    headerHtml += '<th>Stock Total</th><th>Costo</th><th>Acciones</th></tr>';
    thead.innerHTML = headerHtml;

    try {
        const materialsRef = collection(db, 'materials');
        let q;
        let countQuery;

        // --- Build Query ---
        if (filter) {
            // Simple "starts-with" search on the material code
            q = query(materialsRef,
                orderBy('codigo'),
                where('codigo', '>=', filter),
                where('codigo', '<=', filter + '\uf8ff'),
                limit(materialsItemsPerPage));
            countQuery = query(materialsRef,
                where('codigo', '>=', filter),
                where('codigo', '<=', filter + '\uf8ff'));
        } else {
            const baseQuery = query(materialsRef, orderBy('codigo'));
            countQuery = baseQuery;
            if (page > 1 && materialsPageCursors[page]) {
                q = query(baseQuery, startAfter(materialsPageCursors[page]), limit(materialsItemsPerPage));
            } else {
                q = query(baseQuery, limit(materialsItemsPerPage));
            }
        }

        // --- Execute Queries ---
        const [querySnapshot, countSnapshot] = await Promise.all([
            getDocs(q),
            getCountFromServer(countQuery)
        ]);

        const totalMaterials = countSnapshot.data().count;
        materialsTotalPages = Math.ceil(totalMaterials / materialsItemsPerPage);
        if (materialsCurrentPage > materialsTotalPages) materialsCurrentPage = materialsTotalPages || 1;

        // --- Render Results ---
        tbody.innerHTML = '';
        if (querySnapshot.empty) {
            tbody.innerHTML = `<tr><td colspan="${6 + almacenes.length}" class="text-center">No se encontraron materiales.</td></tr>`;
        } else {
            querySnapshot.forEach(doc => {
                const m = doc.data();
                m.codigo = doc.id;
                let rowHtml = `<tr>
                    <td>${m.codigo}</td>
                    <td>${m.descripcion}</td>
                    <td>${m.unidad}</td>`;

                let totalStock = 0;
                almacenes.forEach(a => {
                    const stock = m.inventario?.[a.id] || 0;
                    rowHtml += `<td>${stock.toFixed(2)}</td>`;
                    totalStock += stock;
                });

                rowHtml += `
                    <td><strong>${totalStock.toFixed(2)}</strong></td>
                    <td>${formatCurrency(m.costo)}</td>
                    <td>
                        <button class="btn btn-sm btn-warning edit-btn me-2" data-code="${m.codigo}" title="Editar"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-sm btn-danger delete-btn" data-code="${m.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
                tbody.insertAdjacentHTML('beforeend', rowHtml);
            });
        }

        // --- Update Pagination State ---
        if (!querySnapshot.empty) {
            materialsLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            materialsPageCursors[page + 1] = materialsLastVisible;
        }

        // --- Render Controls ---
        renderPaginationControls(
            'materialsPagination',
            materialsCurrentPage,
            materialsTotalPages,
            materialsItemsPerPage,
            (newPage) => loadMaterials(newPage),
            (newSize) => {
                materialsItemsPerPage = newSize;
                materialsPageCursors = { 1: null };
                loadMaterials(1);
            }
        );

    } catch (error) {
        console.error("Error loading materials from Firestore:", error);
        tbody.innerHTML = `<tr><td colspan="${6 + almacenes.length}" class="text-center text-danger">Error al cargar materiales.</td></tr>`;
        Toastify({ text: 'Error al cargar materiales.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
document.getElementById('materialForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('materialCode').value.trim().toUpperCase();
    const desc = document.getElementById('materialDescription').value.trim();
    const unit = document.getElementById('materialUnit').value.trim();
    const cost = parseFloat(document.getElementById('materialCost').value);
    if (!code || !desc) return;

    if (isNaN(cost) || cost < 0) {
        Toastify({ text: 'Error: El costo debe ser un número positivo.', backgroundColor: 'var(--danger-color)', duration: 5000 }).showToast();
        return;
    }

    const inventario = {};
    document.querySelectorAll('.material-stock-input').forEach(input => {
        const almacenId = input.dataset.almacenId;
        const stock = parseFloat(input.value) || 0;
        if (almacenId) {
            inventario[almacenId] = stock < 0 ? 0 : stock;
        }
    });

    if (!isEditingMaterial) {
        const materialRef = doc(db, "materials", code);
        const productRef = doc(db, "products", code);
        const [materialSnap, productSnap] = await Promise.all([getDoc(materialRef), getDoc(productRef)]);
        if (materialSnap.exists() || productSnap.exists()) {
            Toastify({ text: `Error: El código ${code} ya existe como material o producto.`, backgroundColor: 'var(--danger-color)', duration: 5000 }).showToast();
            return;
        }
    }

    const materialData = {
        descripcion: desc,
        unidad: unit,
        inventario: inventario,
        costo: cost
    };

    try {
        await setDoc(doc(db, "materials", code), materialData, { merge: isEditingMaterial });
        loadMaterials(materialsCurrentPage); // Refresh view
        materialModal.hide();
        Toastify({ text: 'Material guardado', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving material: ", error);
        Toastify({ text: 'Error al guardar material', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});

document.getElementById('materialsTableBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const code = btn.dataset.code;

    if (btn.classList.contains('delete-btn')) {
        if (confirm(`¿Eliminar material ${code}?`)) {
            try {
                await deleteDoc(doc(db, "materials", code));
                loadMaterials(materialsCurrentPage); // Refresh view
                Toastify({ text: 'Material eliminado', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting material: ", error);
                Toastify({ text: 'Error al eliminar material', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }

    if (btn.classList.contains('edit-btn')) {
        isEditingMaterial = true;
        currentMaterialCode = code;
        const materialDoc = await getDoc(doc(db, "materials", code));
        if (materialDoc.exists()) {
            const m = materialDoc.data();
            document.getElementById('materialCode').value = code;
            document.getElementById('materialDescription').value = m.descripcion;
            document.getElementById('materialUnit').value = m.unidad;
            document.getElementById('materialCost').value = m.costo;
            populateMaterialInventario(m.inventario || {});
            document.getElementById('materialCode').disabled = true;
            document.getElementById('materialModalLabel').textContent = 'Editar Material';
            materialModal.show();
        } else {
            Toastify({ text: `Material ${code} no encontrado.`, backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
});

document.getElementById('materialModal').addEventListener('show.bs.modal', () => {
    if (!isEditingMaterial) {
        populateMaterialInventario();
    }
});

document.getElementById('materialModal').addEventListener('hidden.bs.modal', () => {
    isEditingMaterial = false;
    document.getElementById('materialForm').reset();
    document.getElementById('materialInventario').innerHTML = '';
    document.getElementById('materialCode').disabled = false;
    document.getElementById('materialModalLabel').textContent = 'Añadir Material';
});

document.getElementById('searchMaterial').addEventListener('input', () => {
    materialsPageCursors = { 1: null };
    loadMaterials(1);
});

document.getElementById('filterMaterialsAsProducts').addEventListener('change', () => {
    // This feature is currently disabled due to complexity with Firestore queries.
    // For now, it will just reload the table.
    materialsPageCursors = { 1: null };
    loadMaterials(1);
});

/* ----------  TRASPASOS  ---------- */
const traspasoModal = new bootstrap.Modal(document.getElementById('traspasoModal'));

async function updateTraspasoStock() {
    const materialId = document.getElementById('traspasoMaterialSelect').value;
    const origenId = document.getElementById('traspasoOrigenSelect').value;
    const stockSpan = document.getElementById('traspasoStockOrigen');

    if (!materialId || !origenId) {
        stockSpan.textContent = '--';
        return;
    }

    try {
        const materialDoc = await getDoc(doc(db, "materials", materialId));
        if (materialDoc.exists()) {
            const material = materialDoc.data();
            const stock = material.inventario?.[origenId] || 0;
            stockSpan.textContent = `${stock.toFixed(2)} ${material.unidad || ''}`;
        } else {
            stockSpan.textContent = '0.00';
        }
    } catch (error) {
        console.error("Error fetching stock for traspaso:", error);
        stockSpan.textContent = 'Error';
    }
}

async function populateTraspasoForm() {
    const materialSelect = document.getElementById('traspasoMaterialSelect');
    materialSelect.innerHTML = '<option value="" selected disabled>Cargando materiales...</option>';

    const origenSelect = document.getElementById('traspasoOrigenSelect');
    origenSelect.innerHTML = '<option value="" selected disabled>Seleccione origen...</option>';

    const destinoSelect = document.getElementById('traspasoDestinoSelect');
    destinoSelect.innerHTML = '<option value="" selected disabled>Seleccione destino...</option>';

    almacenes.forEach(a => {
        origenSelect.add(new Option(a.name, a.id));
        destinoSelect.add(new Option(a.name, a.id));
    });

    try {
        const materialsSnapshot = await getDocs(query(collection(db, 'materials'), orderBy('descripcion')));
        materialSelect.innerHTML = '<option value="" selected disabled>Seleccione un material...</option>';
        materialsSnapshot.forEach(doc => {
            const m = doc.data();
            materialSelect.add(new Option(`${m.descripcion} (${doc.id})`, doc.id));
        });
    } catch (error) {
        console.error("Error populating traspaso materials:", error);
        materialSelect.innerHTML = '<option value="" selected disabled>Error al cargar</option>';
    }

    await updateTraspasoStock();
}


document.getElementById('traspasoModal').addEventListener('show.bs.modal', populateTraspasoForm);
document.getElementById('traspasoMaterialSelect')?.addEventListener('change', updateTraspasoStock);
document.getElementById('traspasoOrigenSelect')?.addEventListener('change', updateTraspasoStock);

document.getElementById('traspasoForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const materialId = document.getElementById('traspasoMaterialSelect').value;
    const origenId = document.getElementById('traspasoOrigenSelect').value;
    const destinoId = document.getElementById('traspasoDestinoSelect').value;
    const cantidad = parseFloat(document.getElementById('traspasoCantidad').value);

    // --- Validation ---
    if (!materialId || !origenId || !destinoId || isNaN(cantidad)) {
        Toastify({ text: 'Por favor, complete todos los campos.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }
    if (origenId === destinoId) {
        Toastify({ text: 'El almacén de origen y destino no pueden ser el mismo.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }
    if (cantidad <= 0) {
        Toastify({ text: 'La cantidad a traspasar debe ser mayor que cero.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const materialRef = doc(db, "materials", materialId);

    try {
        const materialDoc = await getDoc(materialRef);
        if (!materialDoc.exists()) {
            Toastify({ text: 'Error: Material no encontrado.', backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }

        const material = materialDoc.data();
        const stockOrigen = material.inventario?.[origenId] || 0;
        if (stockOrigen < cantidad) {
            Toastify({ text: `No hay suficiente stock en el almacén de origen. Disponible: ${stockOrigen.toFixed(2)}`, backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }

        // --- Logic ---
        const traspasoData = {
            materialId,
            origenId,
            destinoId,
            cantidad,
            createdAt: new Date().toISOString()
        };

        const updatePayload = {
            [`inventario.${origenId}`]: increment(-cantidad),
            [`inventario.${destinoId}`]: increment(cantidad)
        };

        await updateDoc(materialRef, updatePayload);
        await addDoc(collection(db, "traspasos"), traspasoData);

        loadMaterials(materialsCurrentPage); // Refresh the materials view
        traspasoModal.hide();
        Toastify({ text: 'Traspaso realizado con éxito.', backgroundColor: 'var(--success-color)' }).showToast();
        document.getElementById('traspasoForm').reset();

    } catch (error) {
        console.error("Error realizando el traspaso: ", error);
        Toastify({ text: 'Error al realizar el traspaso.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});


/* ----------  RECETAS  ---------- */
const addRecipeModal = new bootstrap.Modal(document.getElementById('addRecipeModal'));
const editRecipeModal = new bootstrap.Modal(document.getElementById('editRecipeModal'));

let recipesCurrentPage = 1;
let recipesItemsPerPage = 10;
let recipesTotalPages = 1;
let recipesLastVisible = null;
let recipesPageCursors = { 1: null };

async function loadRecipes(page = 1) {
    recipesCurrentPage = page;
    const tbody = document.getElementById('recipesTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center">Cargando...</td></tr>';

    try {
        const recipesRef = collection(db, 'recipes');
        const baseQuery = query(recipesRef, orderBy('__name__')); // Order by document ID (product code)
        const countQuery = query(recipesRef);

        let q;
        if (page > 1 && recipesPageCursors[page]) {
            q = query(baseQuery, startAfter(recipesPageCursors[page]), limit(recipesItemsPerPage));
        } else {
            q = query(baseQuery, limit(recipesItemsPerPage));
        }

        const [querySnapshot, countSnapshot] = await Promise.all([
            getDocs(q),
            getCountFromServer(countQuery)
        ]);

        const totalRecipes = countSnapshot.data().count;
        recipesTotalPages = Math.ceil(totalRecipes / recipesItemsPerPage);
        if (recipesCurrentPage > recipesTotalPages) recipesCurrentPage = recipesTotalPages || 1;

        tbody.innerHTML = '';
        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No se encontraron recetas.</td></tr>';
        } else {
            const renderPromises = querySnapshot.docs.map(async (doc) => {
                const pid = doc.id;
                const recipe = doc.data().items;
                if (!recipe) return '';

                const productDoc = await getDoc(doc(db, "products", pid));
                const prod = productDoc.exists() ? productDoc.data() : { descripcion: 'Producto no encontrado' };

                const cost = await calculateRecipeCost(recipe);

                return `
                  <tr>
                    <td>${pid}</td>
                    <td>${prod.descripcion}</td>
                    <td>${recipe.length}</td>
                    <td>${formatCurrency(cost)}</td>
                    <td>
                      <button class="btn btn-sm btn-warning edit-btn me-2" data-product-id="${pid}" title="Editar"><i class="fas fa-edit"></i></button>
                      <button class="btn btn-sm btn-danger delete-btn" data-product-id="${pid}" title="Eliminar"><i class="fas fa-trash"></i></button>
                    </td>
                  </tr>`;
            });

            const rowsHtml = await Promise.all(renderPromises);
            tbody.innerHTML = rowsHtml.join('');
        }

        if (!querySnapshot.empty) {
            recipesLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            recipesPageCursors[page + 1] = recipesLastVisible;
        }

        renderPaginationControls(
            'recipesPagination',
            recipesCurrentPage,
            recipesTotalPages,
            recipesItemsPerPage,
            (newPage) => loadRecipes(newPage),
            (newSize) => {
                recipesItemsPerPage = newSize;
                recipesPageCursors = { 1: null };
                loadRecipes(1);
            }
        );

    } catch (error) {
        console.error("Error loading recipes:", error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar recetas.</td></tr>';
    }
}
async function calculateRecipeCost(items, recipeCache = {}, materialCache = {}) {
    if (!items || !Array.isArray(items)) {
        return 0;
    }
    let totalCost = 0;
    for (const it of items) {
        if (!it || !it.type) continue;

        if (it.type === 'product') {
            let subRecipeItems = recipeCache[it.code];
            if (!subRecipeItems) {
                const recipeDoc = await getDoc(doc(db, "recipes", it.code));
                if (recipeDoc.exists()) {
                    subRecipeItems = recipeDoc.data().items;
                    recipeCache[it.code] = subRecipeItems;
                }
            }
            if (subRecipeItems) {
                totalCost += (await calculateRecipeCost(subRecipeItems, recipeCache, materialCache)) * it.quantity;
            }
        } else {
            let material = materialCache[it.code];
            if(!material) {
                const mDoc = await getDoc(doc(db, "materials", it.code));
                if (mDoc.exists()) {
                    material = mDoc.data();
                    materialCache[it.code] = material;
                }
            }
            if (material) {
                totalCost += material.costo * it.quantity;
            }
        }
    }
    return totalCost;
}
async function populateRecipeProductSelect() {
    const sel = document.getElementById('recipeProductSelect');
    sel.innerHTML = '<option disabled selected>Cargando...</option>';
    try {
        const [productsSnapshot, recipesSnapshot] = await Promise.all([
            getDocs(query(collection(db, 'products'), orderBy('descripcion'))),
            getDocs(collection(db, 'recipes'))
        ]);
        const existingRecipeIds = new Set(recipesSnapshot.docs.map(doc => doc.id));

        sel.innerHTML = '<option disabled selected>Selecciona...</option>';
        productsSnapshot.forEach(doc => {
            if (!existingRecipeIds.has(doc.id)) {
                const p = doc.data();
                sel.add(new Option(`${p.descripcion} (${doc.id})`, doc.id));
            }
        });
    } catch (error) {
        console.error("Error populating recipe product select:", error);
        sel.innerHTML = '<option disabled selected>Error al cargar</option>';
    }
    document.getElementById('recipeMaterials').innerHTML = '';
    document.getElementById('addMaterialToRecipeBtn').onclick = () => addRecipeMaterialField('recipeMaterials');
}
async function addRecipeMaterialField(containerId, mCode = '', qty = '', type = 'material') {
    const container = document.getElementById(containerId);
    const row = document.createElement('div');
    row.className = 'row g-2 mb-2 align-items-center material-field';

    const typeSelect = document.createElement('select');
    typeSelect.className = 'form-select form-select-sm type-select';
    ['material', 'product'].forEach(opt => {
        const o = new Option(opt === 'material' ? 'Material' : 'Producto', opt);
        typeSelect.appendChild(o);
    });
    typeSelect.value = type;

    const codeSelect = document.createElement('select');
    codeSelect.className = 'form-select form-select-sm code-select';

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'form-control form-control-sm desc-input';
    descInput.placeholder = 'Descripción';
    descInput.readOnly = true;

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.step = '0.0001';
    qtyInput.className = 'form-control form-control-sm qty-input';
    qtyInput.placeholder = 'Cantidad';
    if (qty) qtyInput.value = qty;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-danger remove-material-btn';
    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
    delBtn.onclick = () => row.remove();

    const updateDescription = async () => {
        const currentType = typeSelect.value;
        const currentCode = codeSelect.value;
        if (!currentCode) {
            descInput.value = '';
            return;
        }
        const collectionName = currentType === 'product' ? 'products' : 'materials';
        const itemDoc = await getDoc(doc(db, collectionName, currentCode));
        descInput.value = itemDoc.exists() ? itemDoc.data().descripcion : '';
    };

    const populateCodeSelect = async () => {
        const currentType = typeSelect.value;
        codeSelect.innerHTML = '<option value="" selected disabled>Cargando...</option>';
        const collectionName = currentType === 'product' ? 'products' : 'materials';
        try {
            const listSnapshot = await getDocs(query(collection(db, collectionName), orderBy('descripcion')));
            codeSelect.innerHTML = '<option value="" selected disabled>Selecciona...</option>';
            const recipeProductCode = document.getElementById('editRecipeProductSelect')?.value || document.getElementById('recipeProductSelect')?.value;

            listSnapshot.forEach(doc => {
                if (currentType === 'product' && doc.id === recipeProductCode) return;
                const item = doc.data();
                const isSelected = doc.id === mCode;
                codeSelect.add(new Option(`${item.descripcion} (${doc.id})`, doc.id, false, isSelected));
            });
            if (mCode) await updateDescription();
        } catch (error) {
            console.error(`Error populating ${collectionName} select:`, error);
            codeSelect.innerHTML = '<option>Error</option>';
        }
    };

    typeSelect.addEventListener('change', () => {
        mCode = '';
        populateCodeSelect();
    });
    codeSelect.addEventListener('change', updateDescription);

    const createCol = (className, element) => {
        const col = document.createElement('div');
        col.className = className;
        col.appendChild(element);
        return col;
    };

    const reqQtyOutput = document.createElement('div');
    reqQtyOutput.className = 'req-qty-output text-end pe-2 small';
    reqQtyOutput.style.paddingTop = '0.375rem';

    const stockAlertOutput = document.createElement('div');
    stockAlertOutput.className = 'stock-alert-output small';
    stockAlertOutput.style.paddingTop = '0.375rem';


    row.append(
        createCol('col-md-2', typeSelect),
        createCol('col-md-3', codeSelect),
        createCol('col-md-3', descInput),
        createCol('col-md-1', qtyInput),
        createCol('col-md-1', reqQtyOutput),
        createCol('col-md-1', stockAlertOutput),
        createCol('col-md-1 text-end', delBtn)
    );

    container.appendChild(row);
    await populateCodeSelect();
}
document.getElementById('addRecipeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = document.getElementById('recipeProductSelect').value;
    const items = [...document.querySelectorAll('#recipeMaterials .material-field')]
        .map(f => ({ type: f.querySelector('.type-select').value, code: f.querySelector('.code-select').value, quantity: parseFloat(f.querySelector('.qty-input').value) }))
        .filter(i => i.code && !isNaN(i.quantity) && i.quantity > 0);
    if (!items.length) { Toastify({ text: 'Agrega al menos un ingrediente con cantidad válida.' }).showToast(); return; }

    try {
        await setDoc(doc(db, "recipes", pid), { items });
        await loadRecipes(1);
        addRecipeModal.hide();
        Toastify({ text: 'Receta guardada', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving recipe: ", error);
        Toastify({ text: 'Error al guardar receta', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});
document.getElementById('editRecipeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = document.getElementById('editRecipeProductSelect').value;
    const items = [...document.querySelectorAll('#editRecipeMaterials .material-field')]
        .map(f => ({ type: f.querySelector('.type-select').value, code: f.querySelector('.code-select').value, quantity: parseFloat(f.querySelector('.qty-input').value) }))
        .filter(i => i.code && !isNaN(i.quantity) && i.quantity > 0);
    if (!items.length) { Toastify({ text: 'Agrega al menos un ingrediente con cantidad válida.' }).showToast(); return; }

    try {
        await setDoc(doc(db, "recipes", pid), { items });
        await loadRecipes(recipesCurrentPage);
        editRecipeModal.hide();
        Toastify({ text: 'Receta actualizada', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error updating recipe: ", error);
        Toastify({ text: 'Error al actualizar receta', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});
document.getElementById('recipesTableBody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const pid = btn.dataset.productId;

    if (btn.classList.contains('delete-btn')) {
        if (confirm(`¿Eliminar receta para el producto ${pid}?`)) {
            try {
                await deleteDoc(doc(db, "recipes", pid));
                await loadRecipes(recipesCurrentPage);
                Toastify({ text: 'Receta eliminada', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting recipe: ", error);
                Toastify({ text: 'Error al eliminar receta', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }

    if (btn.classList.contains('edit-btn')) {
        try {
            const [prodDoc, recipeDoc] = await Promise.all([
                getDoc(doc(db, "products", pid)),
                getDoc(doc(db, "recipes", pid))
            ]);

            if (!prodDoc.exists() || !recipeDoc.exists()) {
                Toastify({ text: `Error: No se encontró el producto o la receta para ${pid}.`, duration: 5000, backgroundColor: 'var(--danger-color)' }).showToast();
                return;
            }
            const prod = prodDoc.data();
            const recipeItems = recipeDoc.data().items;

            document.getElementById('editRecipeProductSelect').innerHTML = `<option value="${pid}">${prod.descripcion}</option>`;
            const cont = document.getElementById('editRecipeMaterials');
            cont.innerHTML = '';

            for (const item of recipeItems) {
                await addRecipeMaterialField('editRecipeMaterials', item.code, item.quantity, item.type);
            }

            const almacenSelect = document.getElementById('recipeSimulationAlmacen');
            almacenSelect.innerHTML = '<option value="all">Todos los Almacenes</option>';
            almacenes.forEach(a => {
                almacenSelect.add(new Option(a.name, a.id));
            });

            document.getElementById('recipeSimulationQty').value = '';
            await updateRecipeSimulation();
            editRecipeModal.show();
        } catch (error) {
            console.error("Error al abrir el modal de editar receta:", error);
            Toastify({ text: `Se produjo un error inesperado. Detalles: ${error.message}`, duration: 5000, backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
});
document.addEventListener('click', e => {
  if (e.target.closest('.remove-material-btn')) e.target.closest('.material-field').remove();
  if (e.target.id === 'addMaterialToEditRecipeBtn') addRecipeMaterialField('editRecipeMaterials');
});

document.getElementById('recipeSimulationQty')?.addEventListener('input', updateRecipeSimulation);
document.getElementById('recipeSimulationAlmacen')?.addEventListener('change', updateRecipeSimulation);

document.getElementById('editRecipeModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('recipeSimulationQty').value = '';
    document.getElementById('recipeSimulationAlmacen').innerHTML = '';
});

async function updateRecipeSimulation() {
    const simQty = parseFloat(document.getElementById('recipeSimulationQty').value);
    const selectedAlmacenId = document.getElementById('recipeSimulationAlmacen').value;
    const materialRows = document.querySelectorAll('#editRecipeMaterials .material-field');

    for (const row of materialRows) {
        const baseQtyInput = row.querySelector('.qty-input');
        const reqQtyOutput = row.querySelector('.req-qty-output');
        const stockAlertOutput = row.querySelector('.stock-alert-output');
        const type = row.querySelector('.type-select').value;
        const code = row.querySelector('.code-select').value;

        stockAlertOutput.textContent = '';
        stockAlertOutput.classList.remove('text-danger', 'fw-bold');
        reqQtyOutput.textContent = '';

        if (isNaN(simQty) || simQty <= 0) continue;

        const baseQty = parseFloat(baseQtyInput.value);
        if (isNaN(baseQty)) continue;

        const requiredQty = baseQty * simQty;
        reqQtyOutput.textContent = requiredQty.toFixed(2);

        if (type === 'material' && code) {
            const materialDoc = await getDoc(doc(db, "materials", code));
            if (materialDoc.exists()) {
                const material = materialDoc.data();
                let totalStock = 0;
                if (material.inventario) {
                    if (selectedAlmacenId === 'all') {
                        totalStock = Object.values(material.inventario).reduce((acc, val) => acc + val, 0);
                    } else {
                        totalStock = material.inventario[selectedAlmacenId] || 0;
                    }
                }
                if (totalStock < requiredQty) {
                    const shortfall = requiredQty - totalStock;
                    stockAlertOutput.textContent = `-${shortfall.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                    stockAlertOutput.classList.add('text-danger', 'fw-bold');
                }
            }
        }
    }
}


/* ----------  ÓRDENES  ---------- */
const productionOrderModal = new bootstrap.Modal(document.getElementById('productionOrderModal'));
const orderDetailsModal    = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
const valeModal            = new bootstrap.Modal(document.getElementById('valeModal'));
const confirmCloseOrderModal = new bootstrap.Modal(document.getElementById('confirmCloseOrderModal'));
let orderSortDirection = 'desc'; // 'asc' or 'desc'

// --- State for Server-Side Pagination ---
let ordersCurrentPage = 1;
let ordersItemsPerPage = 10;
let ordersTotalPages = 1;
let ordersLastVisible = null;
let ordersPageCursors = { 1: null };


async function populateOrderFormSelects() {
    const psel = document.getElementById('orderProductSelect');
    psel.innerHTML = '<option disabled selected>Cargando productos...</option>';

    // Fetch all products for the select dropdown. This might be slow if there are thousands.
    // A future improvement could be a searchable select input.
    const productsSnapshot = await getDocs(query(collection(db, 'products'), orderBy('codigo')));
    psel.innerHTML = '<option disabled selected>Selecciona...</option>';
    productsSnapshot.forEach(doc => {
        const p = doc.data();
        psel.add(new Option(`${doc.id} - ${p.descripcion}`, doc.id));
    });

    const osel = document.getElementById('orderOperatorSelect');
    osel.innerHTML = '<option disabled selected>Selecciona...</option>';
    operators.forEach(o => osel.add(new Option(o.name, o.id)));

    const esel = document.getElementById('orderEquipoSelect');
    esel.innerHTML = '<option disabled selected>Selecciona...</option>';
    equipos.forEach(e => esel.add(new Option(e.name, e.id)));

    const asel = document.getElementById('orderAlmacenSelect');
    asel.innerHTML = '<option disabled selected>Selecciona...</option>';
    const defaultAlmacen = almacenes.find(a => a.isDefault);
    almacenes.forEach(a => {
        const option = new Option(a.name, a.id);
        if (defaultAlmacen && a.id === defaultAlmacen.id) {
            option.selected = true;
        }
        asel.add(option);
    });
}

function renderOrderRow(o) {
    const oc = (o.status === 'Pendiente' ? o.cost_extra : o.overcost) || 0;
    const ocColor = oc > 0 ? 'text-danger' : oc < 0 ? 'text-success' : '';
    return `
      <tr>
        <td>${o.order_id}</td>
        <td>${o.product_name || 'N/A'}</td>
        <td>${o.quantity} / ${o.quantity_produced ?? 'N/A'}</td>
        <td>${formatCurrency(o.cost_real)}</td>
        <td class="${ocColor}">${formatCurrency(oc)}</td>
        <td><span class="badge ${o.status === 'Completada' ? 'bg-success' : 'bg-warning'}">${o.status}</span></td>
        <td>
          <button class="btn btn-sm btn-info view-details-btn" data-order-id="${o.order_id}" title="Ver"><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-danger pdf-btn" data-order-id="${o.order_id}" title="PDF"><i class="fas fa-file-pdf"></i></button>
          ${o.status === 'Pendiente'
            ? `<button class="btn btn-sm btn-primary create-vale-btn" data-order-id="${o.order_id}" title="Crear Vale"><i class="fas fa-plus-circle"></i></button>
               <button class="btn btn-sm btn-success complete-order-btn" data-order-id="${o.order_id}" title="Completar"><i class="fas fa-check"></i></button>
               <button class="btn btn-sm btn-danger delete-order-btn" data-order-id="${o.order_id}" title="Eliminar"><i class="fas fa-trash"></i></button>`
            : `<button class="btn btn-sm btn-secondary reopen-order-btn" data-order-id="${o.order_id}" title="Reabrir"><i class="fas fa-undo"></i></button>`}
        </td>
      </tr>`;
}


async function loadProductionOrders(page = 1) {
    ordersCurrentPage = page;
    const filter = document.getElementById('searchOrder').value.trim();
    const tbody = document.getElementById('productionOrdersTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Cargando...</td></tr>';

    try {
        const ordersRef = collection(db, 'productionOrders');
        let q;
        let countQuery;

        if (filter) {
            const orderIdAsNumber = parseInt(filter, 10);
            if (!isNaN(orderIdAsNumber)) {
                q = query(ordersRef, where('order_id', '==', orderIdAsNumber));
                countQuery = q;
            } else {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">ID de orden inválido.</td></tr>';
                return;
            }
        } else {
            const baseQuery = query(ordersRef, orderBy('order_id', orderSortDirection));
            countQuery = query(ordersRef); // Count all documents for non-filtered view
            if (page > 1 && ordersPageCursors[page]) {
                q = query(baseQuery, startAfter(ordersPageCursors[page]), limit(ordersItemsPerPage));
            } else {
                q = query(baseQuery, limit(ordersItemsPerPage));
            }
        }

        const [querySnapshot, countSnapshot] = await Promise.all([
            getDocs(q),
            getCountFromServer(countQuery)
        ]);

        const totalOrders = countSnapshot.data().count;
        ordersTotalPages = Math.ceil(totalOrders / ordersItemsPerPage);
        if (ordersCurrentPage > ordersTotalPages) ordersCurrentPage = ordersTotalPages || 1;

        tbody.innerHTML = '';
        if (querySnapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No se encontraron órdenes.</td></tr>';
        } else {
            querySnapshot.forEach(doc => {
                tbody.insertAdjacentHTML('beforeend', renderOrderRow(doc.data()));
            });
        }

        if (!querySnapshot.empty) {
            ordersLastVisible = querySnapshot.docs[querySnapshot.docs.length - 1];
            ordersPageCursors[page + 1] = ordersLastVisible;
        }

        renderPaginationControls(
            'productionOrdersPagination',
            ordersCurrentPage,
            ordersTotalPages,
            ordersItemsPerPage,
            (newPage) => loadProductionOrders(newPage),
            (newSize) => {
                ordersItemsPerPage = newSize;
                ordersPageCursors = { 1: null };
                loadProductionOrders(1);
            }
        );

    } catch (error) {
        console.error("Error loading production orders:", error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error al cargar órdenes.</td></tr>';
        Toastify({ text: 'Error al cargar las órdenes de producción.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}

async function deleteOrderAndReverseStock(oid) {
    if (!confirm(`¿Está seguro de que desea eliminar la orden ${oid}? Esta acción es irreversible y ajustará el inventario de TODOS los almacenes involucrados.`)) {
        return;
    }

    const orderRef = doc(db, "productionOrders", oid.toString());
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
        Toastify({ text: `Error: Orden ${oid} no encontrada.`, backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }
    const orderToDelete = orderSnap.data();

    try {
        const promises = [];
        const valesQuery = query(collection(db, "vales"), where("order_id", "==", oid));
        const valesSnapshot = await getDocs(valesQuery);
        const orderVales = valesSnapshot.docs.map(d => d.data());

        // 1. Revert stock from the main order completion if it was completed
        if (orderToDelete.status === 'Completada' && orderToDelete.quantity_produced > 0) {
            const almacenId = orderToDelete.almacen_produccion_id;
            const baseMaterials = await getBaseMaterials(orderToDelete.product_code, orderToDelete.quantity_produced);

            // Add back raw materials
            baseMaterials.forEach(bm => {
                const matRef = doc(db, "materials", bm.code);
                promises.push(updateDoc(matRef, { [`inventario.${almacenId}`]: increment(bm.quantity) }));
            });

            // Remove finished product
            const finishedProductRef = doc(db, "materials", orderToDelete.product_code);
            promises.push(updateDoc(finishedProductRef, { [`inventario.${almacenId}`]: increment(-orderToDelete.quantity_produced) }));
        }

        // 2. Revert stock from all associated vales
        orderVales.forEach(vale => {
            vale.materials.forEach(valeMat => {
                const matRef = doc(db, "materials", valeMat.material_code);
                const almacenId = vale.almacenId;
                // If it was a 'salida', add stock back. If it was 'devolucion', remove it.
                const adjustment = vale.type === 'salida' ? valeMat.quantity : -valeMat.quantity;
                promises.push(updateDoc(matRef, { [`inventario.${almacenId}`]: increment(adjustment) }));
            });
            // Add vale deletion to promises
            promises.push(deleteDoc(doc(db, "vales", vale.vale_id)));
        });

        // 3. Delete the production order itself
        promises.push(deleteDoc(orderRef));

        // 4. Execute all promises
        await Promise.all(promises);

        // 5. Refresh UI
        loadProductionOrders(ordersCurrentPage);
        Toastify({ text: `Orden ${oid} y sus vales han sido eliminados. El inventario ha sido ajustado.`, backgroundColor: 'var(--success-color)' }).showToast();

    } catch (error) {
        console.error(`Error deleting order ${oid} and reversing stock:`, error);
        Toastify({ text: 'Error crítico al eliminar la orden. Revise la consola.', backgroundColor: 'var(--danger-color)', duration: 8000 }).showToast();
    }
}

document.getElementById('productionOrdersTableBody').addEventListener('click', async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const oid = parseInt(btn.dataset.orderId);

    if (btn.classList.contains('view-details-btn')) {
      await showOrderDetails(oid);
    } else if (btn.classList.contains('pdf-btn')) {
      await generateOrderPDF(oid);
    } else if (btn.classList.contains('delete-order-btn')) {
      await deleteOrderAndReverseStock(oid);
    } else if (btn.classList.contains('complete-order-btn')) {
      const orderDoc = await getDoc(doc(db, "productionOrders", oid.toString()));
      if (orderDoc.exists()) {
          const ord = orderDoc.data();
          document.getElementById('closeHiddenOrderId').value = oid;
          document.getElementById('realQuantityInput').value = ord.quantity;
          const almacenSelect = document.getElementById('completionAlmacenSelect');
          almacenSelect.innerHTML = '<option value="" selected disabled>Seleccione almacén...</option>';
          const defaultAlmacen = almacenes.find(a => a.isDefault);
          almacenes.forEach(a => {
              const option = new Option(a.name, a.id);
              if ((ord.almacen_produccion_id && ord.almacen_produccion_id === a.id) || (!ord.almacen_produccion_id && defaultAlmacen && a.id === defaultAlmacen.id)) {
                  option.selected = true;
              }
              almacenSelect.add(option);
          });
          confirmCloseOrderModal.show();
      } else {
          Toastify({ text: 'Error: Orden no encontrada.', backgroundColor: 'var(--danger-color)' }).showToast();
      }
    } else if (btn.classList.contains('reopen-order-btn')) {
      await reopenOrder(oid);
    } else if (btn.classList.contains('create-vale-btn')) {
      await generateValePrompt(oid);
    }
});

async function showOrderDetails(oid) {
    const orderDoc = await getDoc(doc(db, "productionOrders", oid.toString()));
    if (!orderDoc.exists()) {
        Toastify({ text: 'Orden no encontrada', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }
    const ord = orderDoc.data();

    // --- Batch Fetch all necessary data ---
    const productIds = new Set();
    const materialIds = new Set();
    const recipeIds = new Set();

    const mainRecipeDoc = await getDoc(doc(db, "recipes", ord.product_code));
    const recipeItems = mainRecipeDoc.exists() ? mainRecipeDoc.data().items : [];
    recipeItems.forEach(item => {
        if (item.type === 'product') {
            productIds.add(item.code);
            recipeIds.add(item.code);
        } else {
            materialIds.add(item.code);
        }
    });

    const valesQuery = query(collection(db, "vales"), where("order_id", "==", oid));
    const valesSnapshot = await getDocs(valesQuery);
    const orderVales = valesSnapshot.docs.map(doc => doc.data());
    orderVales.forEach(vale => vale.materials.forEach(item => materialIds.add(item.material_code)));

    const [productDocs, materialDocs, recipeDocs] = await Promise.all([
        Promise.all([...productIds].map(id => getDoc(doc(db, "products", id)))),
        Promise.all([...materialIds].map(id => getDoc(doc(db, "materials", id)))),
        Promise.all([...recipeIds].map(id => getDoc(doc(db, "recipes", id)))),
    ]);

    const productsMap = new Map(productDocs.filter(d => d.exists()).map(d => [d.id, d.data()]));
    const materialsMap = new Map(materialDocs.filter(d => d.exists()).map(d => [d.id, d.data()]));
    const recipesMap = new Map(recipeDocs.filter(d => d.exists()).map(d => [d.id, d.data().items]));
    if (mainRecipeDoc.exists()) {
        recipesMap.set(ord.product_code, recipeItems);
    }

    // --- Basic Order Info ---
    document.getElementById('detailOrderId').textContent = ord.order_id;
    document.getElementById('detailProductName').textContent = ord.product_name;
    const operator = operators.find(op => op.id === ord.operator_id);
    document.getElementById('detailOperatorName').textContent = operator ? operator.name : 'N/A';
    const equipo = equipos.find(eq => eq.id === ord.equipo_id);
    document.getElementById('detailEquipoName').textContent = equipo ? equipo.name : 'N/A';
    const statusBadge = document.getElementById('detailStatus');
    statusBadge.textContent = ord.status;
    statusBadge.className = `badge ${ord.status === 'Completada' ? 'bg-success' : 'bg-warning'}`;
    document.getElementById('detailQuantityPlanned').textContent = ord.quantity;
    document.getElementById('detailQuantityProduced').textContent = ord.quantity_produced ?? 'N/A';
    document.getElementById('detailCreatedDate').textContent = formatDate(ord.created_at);
    document.getElementById('detailCompletedDate').textContent = formatDate(ord.completed_at);
    document.getElementById('detailValeCount').textContent = orderVales.length;

    // --- Cost Info ---
    const realQty = ord.quantity_produced || 0;
    const standardCostForRealQty = (ord.cost_standard_unit || 0) * realQty;
    document.getElementById('detailStandardCost').textContent = formatCurrency(standardCostForRealQty);
    document.getElementById('detailExtraCost').textContent = formatCurrency(ord.cost_extra);
    document.getElementById('detailRealCost').textContent = formatCurrency(ord.cost_real);
    const overcostEl = document.getElementById('detailOvercost');
    overcostEl.textContent = formatCurrency(ord.overcost);
    overcostEl.className = 'h5 ' + ((ord.overcost || 0) > 0 ? 'text-danger' : (ord.overcost || 0) < 0 ? 'text-success' : '');

    // --- Consolidated Materials Table ---
    const materialsSummary = {};
    for (const recipeMat of recipeItems) {
        let itemInfo = { descripcion: 'N/A', costo_unit: 0 };
        if (recipeMat.type === 'product') {
            const p = productsMap.get(recipeMat.code);
            if (p) itemInfo.descripcion = p.descripcion;
            itemInfo.costo_unit = await calculateRecipeCost(recipesMap.get(recipeMat.code) || [], recipesMap, materialsMap);
        } else {
            const m = materialsMap.get(recipeMat.code);
            if (m) { itemInfo.descripcion = m.descripcion; itemInfo.costo_unit = m.costo; }
        }
        const plannedQty = recipeMat.quantity * ord.quantity;
        materialsSummary[recipeMat.code] = {
            descripcion: itemInfo.descripcion,
            costo_unit: itemInfo.costo_unit,
            qty_plan: plannedQty,
            qty_real: ord.status === 'Completada' ? (recipeMat.quantity * (ord.quantity_produced || 0)) : 0,
            cost_plan: plannedQty * itemInfo.costo_unit,
        };
    }

    if (ord.status === 'Completada') {
        orderVales.forEach(vale => {
            vale.materials.forEach(valeMat => {
                const adjust = vale.type === 'salida' ? valeMat.quantity : -valeMat.quantity;
                if (materialsSummary[valeMat.material_code]) {
                    materialsSummary[valeMat.material_code].qty_real += adjust;
                } else {
                    const m = materialsMap.get(valeMat.material_code);
                    if (m) {
                        materialsSummary[valeMat.material_code] = {
                            descripcion: m.descripcion,
                            costo_unit: m.costo,
                            qty_plan: 0,
                            qty_real: adjust,
                            cost_plan: 0,
                        };
                    }
                }
            });
        });
    }

    const materialsTbody = document.getElementById('detailMaterialsTableBody');
    materialsTbody.innerHTML = '';
    let totalPlanCost = 0;
    let totalRealCostConsolidated = 0;
    for (const [code, mat] of Object.entries(materialsSummary)) {
        const cost_real = mat.qty_real * mat.costo_unit;
        totalPlanCost += mat.cost_plan;
        totalRealCostConsolidated += cost_real;
        materialsTbody.insertAdjacentHTML('beforeend', `<tr><td>${code}</td><td>${mat.descripcion}</td><td>${mat.qty_plan.toFixed(2)} / <strong class="ms-1">${mat.qty_real.toFixed(2)}</strong></td><td>${formatCurrency(mat.cost_plan)} / <strong class="ms-1">${formatCurrency(cost_real)}</strong></td></tr>`);
    }
    materialsTbody.insertAdjacentHTML('beforeend', `<tr class="table-group-divider fw-bold"><td colspan="3" class="text-end">TOTALES:</td><td>${formatCurrency(totalPlanCost)} / <strong class="ms-1">${formatCurrency(totalRealCostConsolidated)}</strong></td></tr>`);

    // --- Individual Vales Details ---
    const valesContainer = document.getElementById('detailValesContainer');
    valesContainer.innerHTML = '';
    if (orderVales.length > 0) {
        valesContainer.innerHTML += '<h6 class="mt-4">Desglose de Vales</h6>';
        for (const vale of orderVales) {
            let valeHTML = `<div class="card mt-3"><div class="card-header"><strong>Vale #${vale.vale_id}</strong> - Tipo: ${vale.type === 'salida' ? 'Salida' : 'Devolución'} - Fecha: ${formatDate(vale.created_at)}</div><div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr><th>Código</th><th>Descripción</th><th>Cantidad</th><th>Costo</th></tr></thead><tbody>`;
            let valeTotalCost = 0;
            for (const item of vale.materials) {
                const m = materialsMap.get(item.material_code);
                const costPerUnit = item.cost_at_time ?? (m ? m.costo : 0);
                const cost = costPerUnit * item.quantity;
                valeTotalCost += cost;
                valeHTML += `<tr><td>${item.material_code}</td><td>${m ? m.descripcion : 'N/A'}</td><td>${item.quantity.toFixed(2)}</td><td>${formatCurrency(cost)}</td></tr>`;
            }
            valeHTML += `</tbody><tfoot><tr class="fw-bold"><td colspan="3" class="text-end">Costo Total del Vale:</td><td>${formatCurrency(valeTotalCost)}</td></tr></tfoot></table></div></div>`;
            valesContainer.innerHTML += valeHTML;
        }
    }
    orderDetailsModal.show();
}

async function createProductionOrder(pCode, qty, opId, eqId, almacenId) {
    const productDoc = await getDoc(doc(db, "products", pCode));
    if (!productDoc.exists()) {
        Toastify({ text: `Error: Producto con código ${pCode} no encontrado.` }).showToast();
        return false;
    }
    const prod = productDoc.data();
    prod.codigo = productDoc.id;

    const recipeDoc = await getDoc(doc(db, "recipes", pCode));
    if (!recipeDoc.exists()) {
        Toastify({ text: `Sin receta para ${prod.descripcion}` }).showToast();
        return false;
    }
    const recipeItems = recipeDoc.data().items;

    const costPerUnit = await calculateRecipeCost(recipeItems);
    const stdCost = costPerUnit * qty;
    const newOrderId = await generateSequentialOrderId();

    const newOrder = {
        order_id: newOrderId,
        product_code: pCode,
        product_name: prod.descripcion,
        quantity: qty,
        quantity_produced: null,
        operator_id: opId,
        equipo_id: eqId,
        almacen_produccion_id: almacenId,
        cost_standard_unit: costPerUnit,
        cost_standard: stdCost,
        cost_extra: 0,
        cost_real: null,
        overcost: null,
        created_at: new Date().toISOString().slice(0, 10),
        completed_at: null,
        status: 'Pendiente',
        materials_used: recipeItems.map(i => ({ material_code: i.code, quantity: i.quantity * qty, type: i.type }))
    };

    try {
        await setDoc(doc(db, "productionOrders", newOrder.order_id.toString()), newOrder);
        return true; // Indicate success
    } catch (error) {
        console.error("Error creating order: ", error);
        Toastify({ text: `Error al crear orden para ${pCode}`, backgroundColor: 'var(--danger-color)' }).showToast();
        return false; // Indicate failure
    }
}

document.getElementById('productionOrderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pCode = document.getElementById('orderProductSelect').value;
    const qty = parseInt(document.getElementById('orderQuantity').value);
    const opId = document.getElementById('orderOperatorSelect').value;
    const eqId = document.getElementById('orderEquipoSelect').value;
    const almacenId = document.getElementById('orderAlmacenSelect').value;
    if (!pCode || !opId || !eqId || !almacenId) { Toastify({ text: 'Complete todos los campos requeridos.' }).showToast(); return; }

    const success = await createProductionOrder(pCode, qty, opId, eqId, almacenId);

    if (success) {
        loadProductionOrders(); // This will now reload from Firestore
        productionOrderModal.hide();
        document.getElementById('productionOrderForm').reset();
        Toastify({ text: 'Orden de producción creada', backgroundColor: 'var(--success-color)' }).showToast();
    }
});
document.getElementById('confirmCloseOrderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const oid = parseInt(document.getElementById('closeHiddenOrderId').value);
    const realQty = parseFloat(document.getElementById('realQuantityInput').value);
    const almacenId = document.getElementById('completionAlmacenSelect').value;
    if (!almacenId) {
        Toastify({ text: 'Por favor, seleccione un almacén de producción.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }
    await completeOrder(oid, realQty, almacenId);
    bootstrap.Modal.getInstance(document.getElementById('confirmCloseOrderModal')).hide();
});

async function completeOrder(oid, realQty, almacenId) {
    const orderRef = doc(db, "productionOrders", oid.toString());
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
        Toastify({ text: 'Error: Orden no encontrada para completar.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const orderToUpdate = orderSnap.data();
    const promises = [];

    const baseMaterialsConsumed = await getBaseMaterials(orderToUpdate.product_code, realQty);

    // Decrease stock of raw materials
    for (const mat of baseMaterialsConsumed) {
        const matRef = doc(db, "materials", mat.code);
        promises.push(updateDoc(matRef, { [`inventario.${almacenId}`]: increment(-mat.quantity) }));
    }

    // Increase stock of finished product
    const finishedProductRef = doc(db, "materials", orderToUpdate.product_code);
    promises.push(updateDoc(finishedProductRef, { [`inventario.${almacenId}`]: increment(realQty) }));

    // Update order status and details
    orderToUpdate.quantity_produced = realQty;
    orderToUpdate.status = 'Completada';
    orderToUpdate.completed_at = new Date().toISOString().slice(0, 10);
    orderToUpdate.almacen_produccion_id = almacenId;
    const standardCostForRealQty = (orderToUpdate.cost_standard_unit || 0) * realQty;
    orderToUpdate.cost_real = standardCostForRealQty + (orderToUpdate.cost_extra || 0);
    orderToUpdate.overcost = orderToUpdate.cost_extra || 0;

    promises.push(setDoc(orderRef, orderToUpdate));

    try {
        await Promise.all(promises);
        loadProductionOrders(ordersCurrentPage); // Refresh view
        Toastify({ text: `Orden ${oid} completada con éxito.`, backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error completing order: ", error);
        Toastify({ text: 'Error al completar la orden.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
async function reopenOrder(oid) {
    const orderRef = doc(db, "productionOrders", oid.toString());
    const orderSnap = await getDoc(orderRef);

    if (!orderSnap.exists()) {
        Toastify({ text: 'Error: Orden no encontrada para reabrir.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const orderToUpdate = orderSnap.data();
    const almacenId = orderToUpdate.almacen_produccion_id;
    if (!almacenId) {
        Toastify({ text: 'Error: No se puede reabrir la orden porque no se registró un almacén de producción.', backgroundColor: 'var(--danger-color)', duration: 6000 }).showToast();
        return;
    }

    const promises = [];
    const quantityToReverse = orderToUpdate.quantity_produced || 0;

    if (quantityToReverse > 0) {
        const baseMaterialsToRestore = await getBaseMaterials(orderToUpdate.product_code, quantityToReverse);
        // Add back raw materials
        baseMaterialsToRestore.forEach(mat => {
            const matRef = doc(db, "materials", mat.code);
            promises.push(updateDoc(matRef, { [`inventario.${almacenId}`]: increment(mat.quantity) }));
        });

        // Remove finished product
        const finishedProductRef = doc(db, "materials", orderToUpdate.product_code);
        promises.push(updateDoc(finishedProductRef, { [`inventario.${almacenId}`]: increment(-quantityToReverse) }));
    }

    // Reset order status
    orderToUpdate.status = 'Pendiente';
    orderToUpdate.completed_at = null;
    orderToUpdate.quantity_produced = null;
    orderToUpdate.cost_real = null;
    orderToUpdate.overcost = null;
    delete orderToUpdate.almacen_produccion_id;

    promises.push(setDoc(orderRef, orderToUpdate));

    try {
        await Promise.all(promises);
        loadProductionOrders(ordersCurrentPage); // Refresh view
        Toastify({ text: `Orden ${oid} reabierta.`, backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error reopening order: ", error);
        Toastify({ text: 'Error al reabrir la orden.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
async function generateOrderPDF(oid) {
    try {
        const { jsPDF } = window.jspdf;
        const orderDoc = await getDoc(doc(db, "productionOrders", oid.toString()));
        if (!orderDoc.exists()) {
            Toastify({ text: 'Error: Orden no encontrada para PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }
        const ord = orderDoc.data();

        // --- Batch Fetch all necessary data ---
        const productIds = new Set();
        const materialIds = new Set();
        const recipeIds = new Set();
        (ord.materials_used || []).forEach(item => {
            if (item.type === 'product') {
                productIds.add(item.code);
                recipeIds.add(item.code);
            } else {
                materialIds.add(item.code);
            }
        });

        const [productDocs, materialDocs, recipeDocs, valesSnapshot, logoData] = await Promise.all([
            Promise.all([...productIds].map(id => getDoc(doc(db, "products", id)))),
            Promise.all([...materialIds].map(id => getDoc(doc(db, "materials", id)))),
            Promise.all([...recipeIds].map(id => getDoc(doc(db, "recipes", id)))),
            getDocs(query(collection(db, "vales"), where("order_id", "==", oid))),
            getLogoUrl()
        ]);

        const productsMap = new Map(productDocs.filter(d => d.exists()).map(d => [d.id, d.data()]));
        const materialsMap = new Map(materialDocs.filter(d => d.exists()).map(d => [d.id, d.data()]));
        const recipesMap = new Map(recipeDocs.filter(d => d.exists()).map(d => [d.id, d.data().items]));

        const doc = new jsPDF();

        // --- PDF Header ---
        let logoHeight = 0;
        if (logoData) {
            const getImageDimensions = (dataUrl) => new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.src = dataUrl;
            });
            const dims = await getImageDimensions(logoData);
            const w = dims.width * (20 / dims.height);
            const h = 20;
            doc.addImage(logoData, 'PNG', 15, 10, w, h);
            logoHeight = h;
        }
        doc.setFontSize(20);
        doc.text('Orden de Producción', 105, logoHeight > 0 ? 15 + logoHeight : 25, null, null, 'center');

        // --- Order Info ---
        let startY = (logoHeight > 0 ? 15 + logoHeight : 25) + 15;
        const lineHeight = 7;
        const rightColX = 140;
        doc.setFontSize(10);
        doc.text(`Fecha Creación: ${formatDate(ord.created_at)}`, rightColX, startY);
        doc.text(`Fecha Fin: ${formatDate(ord.completed_at)}`, rightColX, startY + lineHeight);
        doc.text(`Nº Vales: ${valesSnapshot.size}`, rightColX, startY + (lineHeight * 2));
        doc.setFontSize(12);
        doc.text(`ID de Orden: ${ord.order_id}`, 15, startY);
        startY += lineHeight;
        doc.text(`Producto: ${ord.product_name}`, 15, startY);
        startY += lineHeight;
        doc.text(`Operador: ${operators.find(op => op.id === ord.operator_id)?.name || 'N/A'}`, 15, startY);
        startY += lineHeight;
        doc.text(`Equipo: ${equipos.find(eq => eq.id === ord.equipo_id)?.name || 'N/A'}`, 15, startY);
        startY += lineHeight;
        doc.text(`Cantidad Planificada: ${ord.quantity}`, 15, startY);
        startY += lineHeight;
        doc.text(`Cantidad Real Producida: ${ord.quantity_produced || 'N/A'}`, 15, startY);
        startY += lineHeight;
        doc.text(`Costo Estándar: ${formatCurrency(ord.cost_standard)}`, 15, startY);
        startY += lineHeight;
        doc.text(`Costo Extra: ${formatCurrency(ord.cost_extra)}`, 15, startY);
        startY += lineHeight;
        doc.text(`Costo Real Total: ${formatCurrency(ord.cost_real)}`, 15, startY);
        startY += lineHeight;
        doc.text(`Sobrecosto: ${formatCurrency(ord.overcost)}`, 15, startY);

        // --- Materials Table ---
        const bodyRows = [];
        for (const u of ord.materials_used) {
            let desc = u.material_code;
            let cost = 0;
            if (u.type === 'product') {
                const p = productsMap.get(u.material_code);
                if (p) desc = p.descripcion;
                cost = await calculateRecipeCost(recipesMap.get(u.material_code) || [], recipesMap, materialsMap);
            } else {
                const m = materialsMap.get(u.material_code);
                if (m) { desc = m.descripcion; cost = m.costo; }
            }
            bodyRows.push([desc, u.quantity.toFixed(2), formatCurrency(u.quantity * cost)]);
        }
        doc.autoTable({ head: [['Material', 'Cantidad Plan.', 'Costo Plan.']], body: bodyRows, startY: startY + 5 });

        // --- PDF Footer ---
        const pageHeight = doc.internal.pageSize.getHeight();
        const bottomMargin = 20;
        doc.setLineWidth(0.2);
        doc.line(60, pageHeight - bottomMargin, 150, pageHeight - bottomMargin);
        doc.setFontSize(10);
        doc.text('Autorizado por:', 105, pageHeight - bottomMargin + 5, null, null, 'center');

        doc.save(`orden_${ord.order_id}.pdf`);
    } catch (error) {
        console.error(`Error al generar PDF para orden ${oid}:`, error);
        Toastify({ text: 'No se pudo generar el PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
async function generateValePDF(vale) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    let logoHeight = 0;
    const logoData = await getLogoUrl();
    if (logoData) {
        const getImageDimensions = (dataUrl) => new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.src = dataUrl;
        });
        const dims = await getImageDimensions(logoData);
        const maxWidth = 40, maxHeight = 20;
        const ratio = Math.min(maxWidth / dims.width, maxHeight / dims.height);
        const w = dims.width * ratio, h = dims.height * ratio;
        doc.addImage(logoData, 'PNG', 15, 10, w, h);
        logoHeight = h;
    }

    doc.setFontSize(18);
    doc.text('Vale de Almacén', 105, logoHeight > 0 ? 15 + logoHeight : 25, null, null, 'center');

    let startY = (logoHeight > 0 ? 15 + logoHeight : 25) + 15;
    const lineHeight = 7;
    doc.setFontSize(11);

    doc.text(`Vale ID: ${vale.vale_id}`, 15, startY); startY += lineHeight;
    doc.text(`Orden: ${vale.order_id}`, 15, startY); startY += lineHeight;
    doc.text(`Tipo: ${vale.type === 'salida' ? 'Salida' : 'Devolución'}`, 15, startY); startY += lineHeight;
    doc.text(`Fecha: ${formatDate(vale.created_at)}`, 15, startY);

    const bodyRows = [];
    for (const m of vale.materials) {
        const matDoc = await getDoc(doc(db, "materials", m.material_code));
        const mat = matDoc.exists() ? matDoc.data() : null;
        const cost = m.cost_at_time ?? (mat ? mat.costo : 0);
        bodyRows.push([
            mat ? mat.descripcion : m.material_code,
            m.quantity.toFixed(2),
            formatCurrency(m.quantity * cost)
        ]);
    }
    doc.autoTable({ head: [['Material', 'Cantidad', 'Costo']], body: bodyRows, startY: startY + 5 });

    const pageHeight = doc.internal.pageSize.getHeight();
    const bottomMargin = 20;
    doc.setLineWidth(0.2);
    doc.line(60, pageHeight - bottomMargin, 150, pageHeight - bottomMargin);
    doc.setFontSize(10);
    doc.text('Autorizado por:', 105, pageHeight - bottomMargin + 5, null, null, 'center');

    doc.save(`vale_${vale.vale_id}.pdf`);
}
async function addFreeFormValeRow() {
    const tbody = document.getElementById('valeMaterialsTableBody');
    const tr = document.createElement('tr');
    tr.classList.add('free-form-row');

    const codeCell = document.createElement('td');
    const descCell = document.createElement('td');
    const stockCell = document.createElement('td');
    const qtyCell = document.createElement('td');

    const codeSelect = document.createElement('select');
    codeSelect.className = 'form-select form-select-sm vale-material-code';
    codeSelect.innerHTML = '<option value="" selected disabled>Cargando...</option>';

    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.className = 'form-control form-control-sm';
    descInput.readOnly = true;

    const stockSpan = document.createElement('span');
    stockSpan.className = 'vale-material-stock';

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.className = 'form-control form-control-sm vale-material-qty';
    qtyInput.min = "0";
    qtyInput.step = "0.01";
    qtyInput.value = "0";

    codeSelect.addEventListener('change', async () => {
        const selectedCode = codeSelect.value;
        if (!selectedCode) return;
        const materialDoc = await getDoc(doc(db, "materials", selectedCode));
        if (materialDoc.exists()) {
            const material = materialDoc.data();
            descInput.value = material.descripcion;
            const almacenId = document.getElementById('valeAlmacen').value;
            const stock = material.inventario && almacenId ? (material.inventario[almacenId] || 0) : 0;
            stockSpan.textContent = `${stock.toFixed(2)} ${material.unidad}`;
            qtyInput.dataset.code = selectedCode;
        } else {
            descInput.value = '';
            stockSpan.textContent = '';
            delete qtyInput.dataset.code;
        }
    });

    codeCell.appendChild(codeSelect);
    descCell.appendChild(descInput);
    stockCell.appendChild(stockSpan);
    qtyCell.appendChild(qtyInput);

    tr.append(codeCell, descCell, stockCell, qtyCell);
    tbody.appendChild(tr);

    // Asynchronously populate the select dropdown
    const materialsSnapshot = await getDocs(query(collection(db, "materials"), orderBy("descripcion")));
    codeSelect.innerHTML = '<option value="" selected disabled>Selecciona...</option>';
    materialsSnapshot.forEach(doc => {
        const m = doc.data();
        codeSelect.add(new Option(`${m.descripcion} (${doc.id})`, doc.id));
    });
}

async function generateValePrompt(oid) {
    const orderDoc = await getDoc(doc(db, "productionOrders", oid.toString()));
    if (!orderDoc.exists()) {
        Toastify({ text: 'Error: Orden no encontrada.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }
    const ord = orderDoc.data();
    document.getElementById('valeOrderId').textContent = oid;
    document.getElementById('valeHiddenOrderId').value = oid;

    const almacenSelect = document.getElementById('valeAlmacen');
    almacenSelect.innerHTML = '<option value="" selected disabled>Seleccione un almacén...</option>';
    almacenes.forEach(a => {
        almacenSelect.add(new Option(a.name, a.id));
    });

    const updateStockDisplay = async () => {
        const selectedAlmacenId = almacenSelect.value;
        if (!selectedAlmacenId) return;

        for (const row of document.querySelectorAll('#valeMaterialsTableBody tr')) {
            const code = row.querySelector('.vale-material-qty')?.dataset.code || row.querySelector('input[type=text]')?.value;
            if (code) {
                const materialDoc = await getDoc(doc(db, "materials", code));
                if (materialDoc.exists()) {
                    const material = materialDoc.data();
                    const stock = material.inventario ? (material.inventario[selectedAlmacenId] || 0) : 0;
                    const stockCell = row.cells[2];
                    if (stockCell) {
                        stockCell.textContent = `${stock.toFixed(2)} ${material.unidad}`;
                    }
                }
            }
        }
    };

    almacenSelect.onchange = updateStockDisplay;

    const tbody = document.getElementById('valeMaterialsTableBody');
    tbody.innerHTML = '';

    const recipeMaterials = new Set((ord.materials_used || []).map(m => m.material_code));
    for (const code of recipeMaterials) {
        const mDoc = await getDoc(doc(db, "materials", code));
        if (!mDoc.exists()) continue;
        const m = mDoc.data();
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="existing-material-row">
                <td><input type="text" class="form-control-plaintext form-control-sm" value="${m.codigo}" readonly></td>
                <td><input type="text" class="form-control-plaintext form-control-sm" value="${m.descripcion}" readonly></td>
                <td>0.00 ${m.unidad || ''}</td>
                <td><input type="number" class="form-control form-control-sm vale-material-qty" data-code="${code}" min="0" value="0" step="0.01"></td>
            </tr>
        `);
    }

    tbody.insertAdjacentHTML('beforeend', '<tr><td colspan="4"><hr class="my-2"></td></tr>');
    await addFreeFormValeRow();
    await addFreeFormValeRow();

    document.getElementById('valeType').value = 'salida';
    await updateStockDisplay();
    valeModal.show();
}

document.getElementById('valeForm').addEventListener('submit', async e => {
    e.preventDefault();
    const oid = parseInt(document.getElementById('valeHiddenOrderId').value);
    const type = document.getElementById('valeType').value;
    const almacenId = document.getElementById('valeAlmacen').value;

    if (!almacenId) {
        Toastify({ text: 'Por favor, seleccione un almacén.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const qtyInputs = [...document.querySelectorAll('.vale-material-qty')].filter(input => parseFloat(input.value) > 0);
    if (!qtyInputs.length) {
        Toastify({ text: 'No se ingresaron cantidades.' }).showToast();
        return;
    }

    const promises = [];
    const matsForVale = [];
    let hasError = false;
    let totalCost = 0;

    for (const input of qtyInputs) {
        const code = input.dataset.code;
        const qty = parseFloat(input.value);
        if (!code || isNaN(qty) || qty <= 0) continue;

        const materialRef = doc(db, "materials", code);
        const materialSnap = await getDoc(materialRef);
        if (!materialSnap.exists()) continue;
        const material = materialSnap.data();

        if (type === 'salida') {
            const stockInAlmacen = material.inventario ? (material.inventario[almacenId] || 0) : 0;
            if (stockInAlmacen < qty) {
                Toastify({ text: `No hay suficiente ${material.descripcion} en ${almacenes.find(a=>a.id===almacenId).name}. Stock: ${stockInAlmacen.toFixed(2)}`, duration: 6000, backgroundColor: 'var(--danger-color)' }).showToast();
                hasError = true;
                break;
            }
        }

        const adjustment = type === 'salida' ? -qty : qty;
        promises.push(updateDoc(materialRef, { [`inventario.${almacenId}`]: increment(adjustment) }));

        const costAdjustment = qty * material.costo * (type === 'salida' ? 1 : -1);
        totalCost += costAdjustment;

        matsForVale.push({ material_code: code, quantity: qty, cost_at_time: material.costo });
    }

    if (hasError) return;

    const orderRef = doc(db, "productionOrders", oid.toString());
    promises.push(updateDoc(orderRef, { cost_extra: increment(totalCost) }));

    const valesQuery = query(collection(db, "vales"), where("order_id", "==", oid), orderBy("vale_id", "desc"), limit(1));
    const lastValeSnap = await getDocs(valesQuery);
    const seq = lastValeSnap.empty ? 1 : parseInt(lastValeSnap.docs[0].data().vale_id.split('-')[1] || 0) + 1;
    const valeId = `${oid}-${seq}`;

    const newVale = { vale_id: valeId, order_id: oid, type, almacenId, created_at: new Date().toISOString().slice(0, 10), materials: matsForVale, cost: totalCost };
    promises.push(setDoc(doc(db, "vales", valeId), newVale));

    try {
        await Promise.all(promises);
        await generateValePDF(newVale);
        loadProductionOrders(ordersCurrentPage);
        bootstrap.Modal.getInstance(document.getElementById('valeModal')).hide();
        Toastify({ text: 'Vale guardado con éxito.', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error saving vale: ", error);
        Toastify({ text: 'Error al guardar el vale.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});

/* ----------  REPORTES  ---------- */
async function populateReportFilters() {
    const productFilter = document.getElementById('productFilter');
    productFilter.innerHTML = '<option value="all">Todos</option>';

    // Asynchronously load products
    try {
        const productsSnapshot = await getDocs(query(collection(db, 'products'), orderBy('descripcion')));
        productsSnapshot.forEach(doc => {
            productFilter.add(new Option(doc.data().descripcion, doc.id));
        });
    } catch (error) {
        console.error("Error populating product filter:", error);
    }

    const operatorFilter = document.getElementById('operatorFilter');
    operatorFilter.innerHTML = '<option value="all">Todos</option>';
    operators.forEach(o => {
        operatorFilter.add(new Option(o.name, o.id));
    });

    const equipoFilter = document.getElementById('equipoFilter');
    equipoFilter.innerHTML = '<option value="all">Todos</option>';
    equipos.forEach(e => {
        equipoFilter.add(new Option(e.name, e.id));
    });

    const almacenFilter = document.getElementById('reportAlmacenFilter');
    almacenFilter.innerHTML = '<option value="all">Todos</option>';
    almacenes.forEach(a => {
        almacenFilter.add(new Option(a.name, a.id));
    });
}

async function loadReports() {
  await populateReportFilters();
  document.getElementById('applyReportFilters').addEventListener('click', generateAllReports);
  generateAllReports(); // Initial load
}

async function getIntermediateProductCodes() {
    const intermediateProducts = new Set();
    try {
        const recipesSnapshot = await getDocs(collection(db, 'recipes'));
        recipesSnapshot.forEach(doc => {
            const items = doc.data().items || [];
            items.forEach(ing => {
                if (ing && ing.type === 'product') {
                    intermediateProducts.add(ing.code);
                }
            });
        });
    } catch (error) {
        console.error("Error fetching intermediate product codes:", error);
    }
    return intermediateProducts;
}

async function generateAllReports() {
    const reportContent = document.getElementById('reportsPage').querySelectorAll('.card, .row');
    reportContent.forEach(el => el.style.opacity = '0.5');

    try {
        const start = document.getElementById('startDateFilter').value;
        const end = document.getElementById('endDateFilter').value;
        const productId = document.getElementById('productFilter').value;
        const operatorId = document.getElementById('operatorFilter').value;
        const equipoId = document.getElementById('equipoFilter').value;
        const almacenId = document.getElementById('reportAlmacenFilter').value;

        let q = query(collection(db, 'productionOrders'), where('status', '==', 'Completada'));
        if (start) q = query(q, where('completed_at', '>=', start));
        if (end) q = query(q, where('completed_at', '<=', end));
        if (productId !== 'all') q = query(q, where('product_code', '==', productId));
        if (operatorId !== 'all') q = query(q, where('operator_id', '==', operatorId));
        if (equipoId !== 'all') q = query(q, where('equipo_id', '==', equipoId));
        if (almacenId !== 'all') q = query(q, where('almacen_produccion_id', '==', almacenId));

        const ordersSnapshot = await getDocs(q);
        const filteredOrders = ordersSnapshot.docs.map(d => d.data());

        const intermediateProducts = await getIntermediateProductCodes();
        const finalOrders = filteredOrders.filter(o => !intermediateProducts.has(o.product_code));
        const intermediateOrders = filteredOrders.filter(o => intermediateProducts.has(o.product_code));

        generateDetailedOrdersReport(filteredOrders);
        generateOperatorReport(finalOrders, 'operatorReportTableBodyFinal');
        generateProductPerformanceReport(finalOrders, 'productReportTableBodyFinal');
        generateOperatorReport(intermediateOrders, 'operatorReportTableBodyIntermediate');
        generateProductPerformanceReport(intermediateOrders, 'productReportTableBodyIntermediate');
        generateEquipoReport(filteredOrders);
        await generateMaterialConsumptionReport(filteredOrders);
    } catch (error) {
        console.error("Error generating reports:", error);
        Toastify({ text: 'Error al generar reportes.', backgroundColor: 'var(--danger-color)' }).showToast();
    } finally {
        reportContent.forEach(el => el.style.opacity = '1');
    }
}

function generateOperatorReport(orders, tableBodyId) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    const report = {};
    let totals = { completed: 0, units: 0, cost: 0, over: 0 };

    orders.forEach(o => {
        const op = operators.find(op => op.id === o.operator_id);
        const name = op ? op.name : o.operator_id;
        if (!report[name]) {
            report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
        }
        report[name].completed += 1;
        report[name].units += o.quantity_produced || 0;
        report[name].cost += o.cost_real || 0;
        report[name].over += o.overcost || 0;

        totals.completed += 1;
        totals.units += o.quantity_produced || 0;
        totals.cost += o.cost_real || 0;
        totals.over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => {
        return `<tr>
            <td>${name}</td>
            <td>${r.completed}</td>
            <td>${r.units}</td>
            <td>${formatCurrency(r.cost)}</td>
            <td>${formatCurrency(r.over)}</td>
        </tr>`;
    }).join('');

    if (Object.keys(report).length > 0) {
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="table-group-divider fw-bold">
                <td>TOTALES</td>
                <td>${totals.completed}</td>
                <td>${totals.units}</td>
                <td>${formatCurrency(totals.cost)}</td>
                <td>${formatCurrency(totals.over)}</td>
            </tr>
        `);
    }
}

function generateDetailedOrdersReport(orders) {
    const tbody = document.getElementById('detailedOrdersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    let totalRealCost = 0;
    let totalOvercost = 0;

    orders.forEach(o => {
        const operator = operators.find(op => op.id === o.operator_id);
        const overcostColor = (o.overcost || 0) > 0 ? 'text-danger' : ((o.overcost || 0) < 0 ? 'text-success' : '');
        totalRealCost += o.cost_real || 0;
        totalOvercost += o.overcost || 0;
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${o.order_id}</td>
                <td>${o.product_name}</td>
                <td>${operator ? operator.name : 'N/A'}</td>
                <td>${o.quantity}</td>
                <td>${o.quantity_produced || 'N/A'}</td>
                <td>${formatCurrency(o.cost_real)}</td>
                <td class="${overcostColor}">${formatCurrency(o.overcost)}</td>
                <td><span class="badge bg-success">${o.status}</span></td>
                <td>${formatDateShort(o.completed_at)}</td>
            </tr>
        `);
    });

    if (orders.length > 0) {
        const overcostTotalColor = totalOvercost > 0 ? 'text-danger' : totalOvercost < 0 ? 'text-success' : '';
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="table-group-divider fw-bold">
                <td colspan="5" class="text-end">TOTALES:</td>
                <td>${formatCurrency(totalRealCost)}</td>
                <td class="${overcostTotalColor}">${formatCurrency(totalOvercost)}</td>
                <td colspan="2"></td>
            </tr>
        `);
    }
}

function generateProductPerformanceReport(orders, tableBodyId) {
    const tbody = document.getElementById(tableBodyId);
    if (!tbody) return;

    const report = {};
    let totals = { completed: 0, units: 0, cost: 0, over: 0 };

    orders.forEach(o => {
        const name = o.product_name;
        if (!report[name]) {
            report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
        }
        report[name].completed += 1;
        report[name].units += o.quantity_produced || 0;
        report[name].cost += o.cost_real || 0;
        report[name].over += o.overcost || 0;

        totals.completed += 1;
        totals.units += o.quantity_produced || 0;
        totals.cost += o.cost_real || 0;
        totals.over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => {
        const unitCost = r.units > 0 ? r.cost / r.units : 0;
        return `<tr>
            <td>${name}</td>
            <td>${r.completed}</td>
            <td>${r.units}</td>
            <td>${formatCurrency(unitCost)}</td>
            <td>${formatCurrency(r.cost)}</td>
            <td>${formatCurrency(r.over)}</td>
        </tr>`;
    }).join('');

    if (Object.keys(report).length > 0) {
        const totalUnitCost = totals.units > 0 ? totals.cost / totals.units : 0;
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="table-group-divider fw-bold">
                <td>TOTALES</td>
                <td>${totals.completed}</td>
                <td>${totals.units}</td>
                <td>${formatCurrency(totalUnitCost)}</td>
                <td>${formatCurrency(totals.cost)}</td>
                <td>${formatCurrency(totals.over)}</td>
            </tr>
        `);
    }
}

function generateEquipoReport(orders) {
    const tbody = document.getElementById('equipoReportTableBody');
    if (!tbody) return;

    const report = {};
    let totals = { completed: 0, units: 0, cost: 0, over: 0 };

    orders.forEach(o => {
        const eq = equipos.find(eq => eq.id === o.equipo_id);
        const name = eq ? eq.name : o.equipo_id;
        if (!report[name]) {
            report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
        }
        report[name].completed += 1;
        report[name].units += o.quantity_produced || 0;
        report[name].cost += o.cost_real || 0;
        report[name].over += o.overcost || 0;

        totals.completed += 1;
        totals.units += o.quantity_produced || 0;
        totals.cost += o.cost_real || 0;
        totals.over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => {
        return `<tr>
            <td>${name}</td>
            <td>${r.completed}</td>
            <td>${r.units}</td>
            <td>${formatCurrency(r.cost)}</td>
            <td>${formatCurrency(r.over)}</td>
        </tr>`;
    }).join('');

    if (Object.keys(report).length > 0) {
        tbody.insertAdjacentHTML('beforeend', `
            <tr class="table-group-divider fw-bold">
                <td>TOTALES</td>
                <td>${totals.completed}</td>
                <td>${totals.units}</td>
                <td>${formatCurrency(totals.cost)}</td>
                <td>${formatCurrency(totals.over)}</td>
            </tr>
        `);
    }
}

async function getBaseMaterials(productCode, requiredQty, recipeCache = {}) {
    const baseMaterials = {};

    let recipe = recipeCache[productCode];
    if (!recipe) {
        const recipeDoc = await getDoc(doc(db, "recipes", productCode));
        if (recipeDoc.exists()) {
            recipe = recipeDoc.data().items;
            recipeCache[productCode] = recipe;
        }
    }

    if (!recipe) return [];

    for (const ingredient of recipe) {
        const ingredientQty = ingredient.quantity * requiredQty;
        if (ingredient.type === 'product') {
            const subMaterials = await getBaseMaterials(ingredient.code, ingredientQty, recipeCache); // Await recursive call
            subMaterials.forEach(subMat => {
                baseMaterials[subMat.code] = (baseMaterials[subMat.code] || 0) + subMat.quantity;
            });
        } else {
            baseMaterials[ingredient.code] = (baseMaterials[ingredient.code] || 0) + ingredientQty;
        }
    }

    return Object.entries(baseMaterials).map(([code, quantity]) => ({ code, quantity }));
}

function generateMaterialConsumptionReport(orders) {
  const report = {};

  function addMaterialToReport(materialCode, quantity, almacenId) {
      const material = materials.find(m => m.codigo === materialCode);
      if (!material) return;

      if (!report[materialCode]) {
          report[materialCode] = { qty: 0, cost: 0, desc: material.descripcion };
      }
      report[materialCode].qty += quantity;
      report[materialCode].cost += quantity * material.costo;
  }

  orders.forEach(o => {
      const baseMaterials = getBaseMaterials(o.product_code, o.quantity_produced || 0);
      baseMaterials.forEach(bm => {
          addMaterialToReport(bm.code, bm.quantity, o.almacen_produccion_id);
      });

      vales.filter(v => v.order_id === o.order_id).forEach(vale => {
          const multiplier = vale.type === 'salida' ? 1 : -1;
          vale.materials.forEach(m => {
              addMaterialToReport(m.material_code, m.quantity * multiplier, vale.almacenId);
          });
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
    tbody.insertAdjacentHTML('beforeend', `
        <tr class="table-group-divider fw-bold">
            <td colspan="2" class="text-end">TOTAL:</td>
            <td>${formatCurrency(totalCost)}</td>
        </tr>
    `);
  }
}

/* ----------  USERS  ---------- */
const userModal = new bootstrap.Modal(document.getElementById('userModal'));
let isEditingUser = false;

function loadUsers() {
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    users.forEach(u => {
        list.insertAdjacentHTML('beforeend', `
            <li class="list-group-item d-flex justify-content-between align-items-center">
                <span>${u.email} <span class="badge bg-secondary">${u.role}</span></span>
                <div>
                    <button class="btn btn-sm btn-warning edit-user-btn" data-uid="${u.uid}"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger delete-user-btn" data-uid="${u.uid}"><i class="fas fa-trash"></i></button>
                </div>
            </li>
        `);
    });
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('userEmail').value;
    const role = document.getElementById('userRole').value;
    const uid = document.getElementById('userUid').value;

    if (uid) {
        await setDoc(doc(db, "users", uid), { email, role });
        const userIndex = users.findIndex(u => u.uid === uid);
        if (userIndex > -1) {
            users[userIndex] = { uid, email, role };
        } else {
            users.push({ uid, email, role });
        }
        loadUsers();
        userModal.hide();
        Toastify({ text: 'Rol de usuario guardado.', backgroundColor: 'var(--success-color)' }).showToast();
    } else {
        Toastify({ text: 'No se pudo encontrar el UID del usuario. Asegúrese de que el usuario exista en Firebase Authentication.', backgroundColor: 'var(--danger-color)', duration: 5000 }).showToast();
    }
});

document.getElementById('usersList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const uid = btn.dataset.uid;
    if (btn.classList.contains('edit-user-btn')) {
        const user = users.find(u => u.uid === uid);
        if (user) {
            isEditingUser = true;
            document.getElementById('userUid').value = user.uid;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userUid').disabled = true;
            document.getElementById('userRole').value = user.role;
            document.getElementById('userModalLabel').textContent = 'Editar Rol de Usuario';
            userModal.show();
        }
    }

    if (btn.classList.contains('delete-user-btn')) {
        if (confirm('¿Está seguro que desea eliminar el rol de este usuario? El usuario no será eliminado de la autenticación.')) {
            await deleteDoc(doc(db, "users", uid));
            users = users.filter(u => u.uid !== uid);
            loadUsers();
            Toastify({ text: 'Rol de usuario eliminado.', backgroundColor: 'var(--success-color)' }).showToast();
        }
    }
});

document.getElementById('userModal').addEventListener('hidden.bs.modal', () => {
    isEditingUser = false;
    document.getElementById('userForm').reset();
    document.getElementById('userUid').disabled = false;
    document.getElementById('userModalLabel').textContent = 'Añadir/Editar Usuario';
});


/* ----------  OPERADORES / LOGO / BACKUP  ---------- */
let isEditingOperator = false, currentOperatorId = null;
const operatorModal = new bootstrap.Modal(document.getElementById('operatorModal'));
function loadOperators() {
  const list = document.getElementById('operatorsList'); list.innerHTML = '';
  operators.forEach(op => list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${op.id} - ${op.name}</span><div><button class="btn btn-sm btn-warning edit-operator-btn me-2" data-id="${op.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-operator-btn" data-id="${op.id}"><i class="fas fa-trash"></i></button></div></li>`));
}
document.getElementById('operatorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id   = document.getElementById('operatorId').value.trim().toUpperCase();
  const name = document.getElementById('operatorName').value.trim();
  if (!id || !name) return;

  const operatorData = { name };

  try {
    await setDoc(doc(db, "operators", id), operatorData);
    if (isEditingOperator) {
        const idx = operators.findIndex(op => op.id === currentOperatorId);
        operators[idx] = { id, name };
    } else {
        operators.push({ id, name });
    }
    loadOperators();
    populateOrderFormSelects();
    operatorModal.hide();
    Toastify({ text: 'Operador guardado', backgroundColor: 'var(--success-color)' }).showToast();
  } catch (error) {
    console.error("Error saving operator: ", error);
    Toastify({ text: 'Error al guardar operador', backgroundColor: 'var(--danger-color)' }).showToast();
  }
});
document.getElementById('operatorsList').addEventListener('click', async (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('delete-operator-btn')) {
    if (confirm(`¿Eliminar operador ${id}?`)) {
        try {
            await deleteDoc(doc(db, "operators", id));
            operators = operators.filter(op => op.id !== id);
            loadOperators();
            populateOrderFormSelects();
            Toastify({ text: 'Operador eliminado', backgroundColor: 'var(--success-color)' }).showToast();
        } catch (error) {
            console.error("Error deleting operator: ", error);
            Toastify({ text: 'Error al eliminar operador', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
  }
  if (btn.classList.contains('edit-btn')) {
    isEditingOperator = true; currentOperatorId = id;
    const op = operators.find(op => op.id === id);
    document.getElementById('operatorId').value = op.id;
    document.getElementById('operatorName').value = op.name;
    document.getElementById('operatorId').disabled = true;
    document.getElementById('operatorModalLabel').textContent = 'Editar Operador';
    operatorModal.show();
  }
});
document.getElementById('operatorModal').addEventListener('hidden.bs.modal', () => {
  isEditingOperator = false;
  document.getElementById('operatorForm').reset();
  document.getElementById('operatorId').disabled = false;
  document.getElementById('operatorModalLabel').textContent = 'Añadir Operador';
});

let isEditingEquipo = false, currentEquipoId = null;
const equipoModal = new bootstrap.Modal(document.getElementById('equipoModal'));
function loadEquipos() {
  const list = document.getElementById('equiposList'); list.innerHTML = '';
  equipos.forEach(eq => list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${eq.id} - ${eq.name}</span><div><button class="btn btn-sm btn-warning edit-equipo-btn me-2" data-id="${eq.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-equipo-btn" data-id="${eq.id}"><i class="fas fa-trash"></i></button></div></li>`));
}
document.getElementById('equipoForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id   = document.getElementById('equipoId').value.trim().toUpperCase();
  const name = document.getElementById('equipoName').value.trim();
  if (!id || !name) return;
  const equipoData = { name };
  try {
    await setDoc(doc(db, "equipos", id), equipoData);
    if (isEditingEquipo) {
        const idx = equipos.findIndex(eq => eq.id === currentEquipoId);
        equipos[idx] = { id, name };
    } else {
        equipos.push({ id, name });
    }
    loadEquipos();
    populateOrderFormSelects();
    equipoModal.hide();
    Toastify({ text: 'Equipo guardado', backgroundColor: 'var(--success-color)' }).showToast();
  } catch (error) {
    console.error("Error saving equipo: ", error);
    Toastify({ text: 'Error al guardar equipo', backgroundColor: 'var(--danger-color)' }).showToast();
  }
});
document.getElementById('equiposList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-equipo-btn')) {
        if (confirm(`¿Eliminar equipo ${id}?`)) {
            try {
                await deleteDoc(doc(db, "equipos", id));
                equipos = equipos.filter(eq => eq.id !== id);
                loadEquipos();
                populateOrderFormSelects();
                Toastify({ text: 'Equipo eliminado', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting equipo: ", error);
                Toastify({ text: 'Error al eliminar equipo', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }
    if (btn.classList.contains('edit-equipo-btn')) {
        isEditingEquipo = true; currentEquipoId = id;
        const eq = equipos.find(eq => eq.id === id);
        document.getElementById('equipoId').value = eq.id;
        document.getElementById('equipoName').value = eq.name;
        document.getElementById('equipoId').disabled = true;
        document.getElementById('equipoModalLabel').textContent = 'Editar Equipo';
        equipoModal.show();
    }
});
document.getElementById('equipoModal').addEventListener('hidden.bs.modal', () => {
    isEditingEquipo = false;
    document.getElementById('equipoForm').reset();
    document.getElementById('equipoId').disabled = false;
    document.getElementById('equipoModalLabel').textContent = 'Añadir Equipo';
});

/* ----------  ALMACENES  ---------- */
let isEditingAlmacen = false, currentAlmacenId = null;
const almacenModal = bootstrap.Modal.getInstance(document.getElementById('almacenModal')) || new bootstrap.Modal(document.getElementById('almacenModal'));

function loadAlmacenes() {
  const list = document.getElementById('almacenesList');
  list.innerHTML = '';
  almacenes.sort((a,b) => a.id.localeCompare(b.id)).forEach(almacen => {
    const isDefault = almacen.isDefault ? '<span class="badge bg-info ms-2">Producción</span>' : '';
    list.insertAdjacentHTML('beforeend', `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <span><strong>ID:</strong> ${almacen.id} - ${almacen.name}${isDefault}</span>
        <div>
          <button class="btn btn-sm btn-warning edit-almacen-btn me-2" data-id="${almacen.id}"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-almacen-btn" data-id="${almacen.id}"><i class="fas fa-trash"></i></button>
        </div>
      </li>`);
  });
}

document.getElementById('almacenForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('almacenId').value.trim().toUpperCase();
  const name = document.getElementById('almacenName').value.trim();
  const isDefault = document.getElementById('almacenDefault').checked;

  if (!id || !name) return;

  const almacenData = { name, isDefault };

  try {
    if (isDefault) {
        const updatePromises = [];
        almacenes.forEach(a => {
            if (a.isDefault && a.id !== id) {
                a.isDefault = false;
                updatePromises.push(setDoc(doc(db, "almacenes", a.id), { ...a, isDefault: false }));
            }
        });
        await Promise.all(updatePromises);
    }

    await setDoc(doc(db, "almacenes", id), almacenData);

    const idx = almacenes.findIndex(a => a.id === id);
    if (idx !== -1) {
        almacenes[idx] = { id, ...almacenData };
    } else {
        almacenes.push({ id, ...almacenData });
    }

    loadAlmacenes();
    almacenModal.hide();
    Toastify({ text: 'Almacén guardado', backgroundColor: 'var(--success-color)' }).showToast();
  } catch (error) {
    console.error("Error saving almacen: ", error);
    Toastify({ text: 'Error al guardar almacén', backgroundColor: 'var(--danger-color)' }).showToast();
  }
});

document.getElementById('almacenesList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button'); if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-almacen-btn')) {
        if (confirm(`¿Eliminar almacén ${id}?`)) {
            try {
                await deleteDoc(doc(db, "almacenes", id));
                almacenes = almacenes.filter(a => a.id !== id);
                loadAlmacenes();
                Toastify({ text: 'Almacén eliminado', backgroundColor: 'var(--success-color)' }).showToast();
            } catch (error) {
                console.error("Error deleting almacen: ", error);
                Toastify({ text: 'Error al eliminar almacén', backgroundColor: 'var(--danger-color)' }).showToast();
            }
        }
    }
    if (btn.classList.contains('edit-almacen-btn')) {
        isEditingAlmacen = true; currentAlmacenId = id;
        const almacen = almacenes.find(a => a.id === id);
        document.getElementById('almacenId').value = almacen.id;
        document.getElementById('almacenName').value = almacen.name;
        document.getElementById('almacenDefault').checked = almacen.isDefault || false;
        document.getElementById('almacenId').disabled = true;
        document.getElementById('almacenModalLabel').textContent = 'Editar Almacén';
        almacenModal.show();
    }
});

document.getElementById('almacenModal').addEventListener('hidden.bs.modal', () => {
    isEditingAlmacen = false;
    document.getElementById('almacenForm').reset();
    document.getElementById('almacenId').disabled = false;
    document.getElementById('almacenModalLabel').textContent = 'Añadir Almacén';
});


/* ----------  LOGO  ---------- */
async function getLogoUrl() {
    const cachedLogo = localStorage.getItem('companyLogo');
    if (cachedLogo) {
        return cachedLogo;
    }

    try {
        const logoUrl = await getDownloadURL(ref(storage, 'company_logo'));
        localStorage.setItem('companyLogo', logoUrl); // Cache it for next time
        return logoUrl;
    } catch (error) {
        if (error.code === 'storage/object-not-found') {
            // This is not an error, it just means no logo has been uploaded.
            return null;
        }
        console.error("Error fetching logo URL from Firebase Storage:", error);
        return null;
    }
}

async function loadLogo() {
    const logoPreview = document.getElementById('logoPreview');
    const noLogoText = document.getElementById('noLogoText');
    const logoUrl = await getLogoUrl();

    if (logoUrl) {
        logoPreview.src = logoUrl;
        logoPreview.style.display = 'block';
        noLogoText.style.display = 'none';
    } else {
        logoPreview.style.display = 'none';
        noLogoText.style.display = 'block';
    }
}
document.getElementById('logoUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
        const storageRef = ref(storage, 'company_logo');
        await uploadString(storageRef, reader.result, 'data_url');
        const logoUrl = await getDownloadURL(storageRef);
        localStorage.setItem('companyLogo', logoUrl); // cache it
        loadLogo();
        Toastify({ text: 'Logo guardado correctamente', backgroundColor: 'var(--success-color)' }).showToast();
    }
    catch(error) {
        console.error("Error uploading logo:", error);
        Toastify({ text: 'Error al guardar el logo', backgroundColor: 'var(--danger-color)' }).showToast();
    }
  };
  reader.readAsDataURL(file);
});

/* ----------  EXCEL IMPORT / EXPORT  ---------- */
function downloadExcel(filename, sheetName, data) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}
// Productos
document.getElementById('exportProductsBtn').addEventListener('click', async () => {
    const products = await loadCollection('products', 'codigo');
    downloadExcel('productos.xlsx', 'Productos', products);
});
document.getElementById('importProductsBtn').addEventListener('click', () => document.getElementById('productFile').click());
document.getElementById('productFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const importedProducts = json.map(r => ({ codigo: (r.codigo || r.Código)?.toString().toUpperCase(), descripcion: r.descripcion || r.Descripción, unidad: r.unidad || r.Unidad || '' }));

    for (const product of importedProducts) {
        if (!product.codigo) continue;
        await setDoc(doc(db, "products", product.codigo), {
            descripcion: product.descripcion,
            unidad: product.unidad
        });
    }
    loadProducts(1);
    Toastify({ text: 'Productos importados y guardados en la nube', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});
// Materiales
document.getElementById('exportMaterialsBtn').addEventListener('click', async () => {
    const materials = await loadCollection('materials', 'codigo');
    downloadExcel('materiales.xlsx', 'Materiales', materials);
});
document.getElementById('importMaterialsBtn').addEventListener('click', () => document.getElementById('materialFile').click());
document.getElementById('materialFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

        const importedMaterials = json.map(r => {
            const existencia = parseFloat(r.existencia || r.Existencia || 0);
            return {
                codigo: (r.codigo || r.Código)?.toString().toUpperCase(),
                descripcion: r.descripcion || r.Descripción,
                unidad: r.unidad || r.Unidad,
                inventario: { 'GENERAL': existencia }, // Use new data structure
                costo: parseFloat(r.costo || r.Costo || 0)
            };
        });

        for (const material of importedMaterials) {
            if (!material.codigo) continue;
            await setDoc(doc(db, "materials", material.codigo), material, { merge: true });
        }
        loadMaterials(1);
        Toastify({ text: 'Materiales importados y guardados en la nube', backgroundColor: 'var(--success-color)' }).showToast();
    };
    reader.readAsBinaryString(file);
});
// Recetas
document.getElementById('exportRecipesBtn').addEventListener('click', async () => {
    const recipesSnapshot = await getDocs(collection(db, 'recipes'));
    const flat = [];
    recipesSnapshot.forEach(doc => {
        const items = doc.data().items || [];
        items.forEach(ing => flat.push({ producto: doc.id, tipo: ing.type, codigo: ing.code, cantidad: ing.quantity }));
    });
    downloadExcel('recetas.xlsx', 'Recetas', flat);
});

async function generateAllRecipesPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const now = new Date();
    const formattedDate = now.toLocaleDateString('es-ES');

    const [recipesSnapshot, productsSnapshot, materialsSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'recipes'), orderBy('__name__'))),
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'materials'))
    ]);

    if (recipesSnapshot.empty) {
        Toastify({ text: 'No hay recetas para exportar.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const productsData = new Map(productsSnapshot.docs.map(d => [d.id, d.data()]));
    const materialsData = new Map(materialsSnapshot.docs.map(d => [d.id, d.data()]));
    const allRecipes = new Map(recipesSnapshot.docs.map(d => [d.id, d.data().items]));

    let isFirstPage = true;
    const logoData = await getLogoUrl();

    for (const [productId, recipeItems] of allRecipes.entries()) {
        if (!isFirstPage) doc.addPage();

        const product = productsData.get(productId);
        if (!product || !recipeItems) continue;

        let logoHeight = 0;
        if (logoData) {
            const getImageDimensions = (dataUrl) => new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.src = dataUrl;
            });
            const dims = await getImageDimensions(logoData);
            const w = dims.width * (20 / dims.height);
            const h = 20;
            doc.addImage(logoData, 'PNG', 15, 10, w, h);
            logoHeight = h;
        }

        const totalRecipeCost = await calculateRecipeCost(recipeItems);

        let startY = logoHeight > 0 ? 15 + logoHeight : 20;
        doc.setFontSize(18);
        doc.text(`Receta para: ${product.descripcion}`, 15, startY);
        startY += 7;
        doc.setFontSize(10);
        doc.text(`Código: ${productId}`, 15, startY);
        doc.text(`Fecha: ${formattedDate}`, 185, startY, null, null, 'right');
        startY += 7;
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.text(`Costo Total de Receta: ${formatCurrency(totalRecipeCost)}`, 15, startY);
        doc.setFont(undefined, 'normal');

        const bodyRows = [];
        for (const item of recipeItems) {
            let desc = 'N/A', unitCost = 0;
            const itemType = item.type === 'product' ? 'Producto' : 'Material';

            if (item.type === 'product') {
                const p = productsData.get(item.code);
                if (p) desc = p.descripcion;
                unitCost = await calculateRecipeCost(allRecipes.get(item.code) || []);
            } else {
                const m = materialsData.get(item.code);
                if (m) { desc = m.descripcion; unitCost = m.costo; }
            }
            bodyRows.push([itemType, item.code, desc, item.quantity.toFixed(4), formatCurrency(unitCost), formatCurrency(item.quantity * unitCost)]);
        }

        doc.autoTable({
            head: [['Tipo', 'Código', 'Descripción', 'Cantidad', 'Costo Unit.', 'Costo Total']],
            body: bodyRows,
            startY: startY + 5,
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 8 },
            columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
        });

        const pageHeight = doc.internal.pageSize.getHeight();
        const signatureY = pageHeight - 25;
        doc.setLineWidth(0.2);
        doc.line(15, signatureY, 85, signatureY);
        doc.setFontSize(10);
        doc.text('Aprobado por:', 15, signatureY + 5);
        isFirstPage = false;
    }

    doc.save('recetario_completo.pdf');
}


document.getElementById('importRecipesBtn').addEventListener('click', () => document.getElementById('recipeFile').click());
document.getElementById('exportAllRecipesPdfBtn').addEventListener('click', generateAllRecipesPDF);

document.getElementById('recipeFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const importedRecipes = {};
    json.forEach(r => {
      const prod = (r.producto || r.Producto)?.toString().toUpperCase();
      if (!prod) return;
      if (!importedRecipes[prod]) importedRecipes[prod] = [];
      const tipoExcel = (r.tipo || r.Tipo || 'material').toLowerCase();
      const tipo = tipoExcel === 'producto' ? 'product' : 'material';
      const code = (r.codigo || r.Código)?.toString().toUpperCase();
      if (!code) return;
      importedRecipes[prod].push({ type: tipo, code: code, quantity: parseFloat(r.cantidad || r.Cantidad) });
    });

    for (const [productId, recipeItems] of Object.entries(importedRecipes)) {
        await setDoc(doc(db, 'recipes', productId), { items: recipeItems });
    }
    recipes = await loadRecipesCollection();
    loadRecipes();
    populateRecipeProductSelect();
    Toastify({ text: 'Recetas importadas y guardados en la nube', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});

/* ----------  ONBOARDING  ---------- */
const onboardingModal = new bootstrap.Modal(document.getElementById('onboardingModal'));
let currentOnboardingStep = 1;

async function checkAndTriggerOnboarding() {
    const onboardingCompleted = localStorage.getItem('onboardingComplete_v1');
    if (onboardingCompleted) {
        return;
    }

    try {
        // Check if essential data is missing by trying to get one document from each collection.
        const [almacenesSnap, operatorsSnap, materialsSnap] = await Promise.all([
            getDocs(query(collection(db, 'almacenes'), limit(1))),
            getDocs(query(collection(db, 'operators'), limit(1))),
            getDocs(query(collection(db, 'materials'), limit(1)))
        ]);

        if (almacenesSnap.empty && operatorsSnap.empty && materialsSnap.empty) {
            onboardingModal.show();
        }
    } catch (error) {
        console.error("Error checking for onboarding:", error);
    }
}

function navigateOnboarding(direction) {
    const steps = document.querySelectorAll('.onboarding-step');
    const currentStepElem = document.getElementById(`onboardingStep${currentOnboardingStep}`);

    if (direction === 'next') {
        if (currentOnboardingStep < steps.length) {
            currentOnboardingStep++;
        }
    } else if (direction === 'prev') {
        if (currentOnboardingStep > 1) {
            currentOnboardingStep--;
        }
    }

    steps.forEach(step => step.style.display = 'none');
    document.getElementById(`onboardingStep${currentOnboardingStep}`).style.display = 'block';

    const prevBtn = document.getElementById('onboardingPrevBtn');
    const nextBtn = document.getElementById('onboardingNextBtn');

    prevBtn.style.display = currentOnboardingStep > 1 ? 'inline-block' : 'none';
    nextBtn.textContent = currentOnboardingStep === steps.length ? 'Finalizar' : 'Siguiente';
}

document.getElementById('onboardingNextBtn').addEventListener('click', async () => {
    const steps = document.querySelectorAll('.onboarding-step').length;

    if (currentOnboardingStep === 3) { // After Almacen step
        const form = document.getElementById('onboardingAlmacenForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const id = document.getElementById('onboardingAlmacenId').value.trim().toUpperCase();
        const name = document.getElementById('onboardingAlmacenName').value.trim();
        const isDefault = document.getElementById('onboardingAlmacenDefault').checked;
        await setDoc(doc(db, "almacenes", id), { name, isDefault });
        almacenes.push({ id, name, isDefault });
    }

    if (currentOnboardingStep === 4) { // After Operator step
        const form = document.getElementById('onboardingOperatorForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const id = document.getElementById('onboardingOperatorId').value.trim().toUpperCase();
        const name = document.getElementById('onboardingOperatorName').value.trim();
        await setDoc(doc(db, "operators", id), { name });
        operators.push({ id, name });
    }

    if (currentOnboardingStep === 5) { // After Material step
        const form = document.getElementById('onboardingMaterialForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        const code = document.getElementById('onboardingMaterialCode').value.trim().toUpperCase();
        const desc = document.getElementById('onboardingMaterialDescription').value.trim();
        const unit = document.getElementById('onboardingMaterialUnit').value.trim();
        const cost = parseFloat(document.getElementById('onboardingMaterialCost').value);
        const stock = parseFloat(document.getElementById('onboardingMaterialStock').value);
        const almacenId = document.getElementById('onboardingAlmacenId').value.trim().toUpperCase();

        const materialData = {
            codigo: code,
            descripcion: desc,
            unidad: unit,
            costo: cost,
            inventario: { [almacenId]: stock }
        };
        await setDoc(doc(db, "materials", code), materialData);
        materials.push(materialData);
    }


    if (currentOnboardingStep === steps) {
        localStorage.setItem('onboardingComplete_v1', 'true');
        onboardingModal.hide();
        Toastify({ text: '¡Configuración inicial completada!', backgroundColor: 'var(--success-color)', duration: 5000 }).showToast();
        // Refresh settings page if it's the current one, to show new data
        if (document.getElementById('settingsPage').style.display !== 'none') {
            loadAlmacenes();
            loadOperators();
        }
    } else {
        navigateOnboarding('next');
    }
});

document.getElementById('onboardingPrevBtn').addEventListener('click', () => {
    navigateOnboarding('prev');
});

document.getElementById('onboardingExitBtn').addEventListener('click', () => {
    onboardingModal.hide();
    Toastify({
        text: 'Asistente omitido. Puede configurar manualmente desde la sección de Configuración.',
        backgroundColor: 'var(--info-color)',
        duration: 5000
    }).showToast();
});

document.getElementById('onboardingLogoUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
        const storageRef = ref(storage, 'company_logo');
        await uploadString(storageRef, reader.result, 'data_url');
        const logoUrl = await getDownloadURL(storageRef);
        localStorage.setItem('companyLogo', logoUrl); // cache it
        const preview = document.getElementById('onboardingLogoPreview');
        preview.src = logoUrl;
        preview.style.display = 'block';
        document.getElementById('onboardingNoLogoText').style.display = 'none';
        Toastify({ text: 'Logo guardado correctamente', backgroundColor: 'var(--success-color)' }).showToast();
    }
    catch(error) {
        console.error("Error uploading logo:", error);
        Toastify({ text: 'Error al guardar el logo', backgroundColor: 'var(--danger-color)' }).showToast();
    }
  };
  reader.readAsDataURL(file);
});


/* ----------  BACKUP / RESTORE  ---------- */
document.getElementById('backupBtn').addEventListener('click', async () => {
    try {
        Toastify({ text: 'Generando copia de seguridad completa...', backgroundColor: 'var(--info-color)', duration: -1 }).showToast();
        const backupData = {};
        const collectionsToBackup = [
            { name: 'products', idField: 'codigo' },
            { name: 'materials', idField: 'codigo' },
            { name: 'productionOrders', idField: 'order_id' },
            { name: 'operators', idField: 'id' },
            { name: 'equipos', idField: 'id' },
            { name: 'vales', idField: 'vale_id' },
            { name: 'traspasos', idField: 'traspaso_id' },
            { name: 'almacenes', idField: 'id' },
            { name: 'users', idField: 'uid' }
        ];

        for (const { name, idField } of collectionsToBackup) {
            backupData[name] = await loadCollection(name, idField);
        }
        backupData['recipes'] = await loadRecipesCollection();

        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `operis_backup_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        Toastify({ text: 'Copia de seguridad descargada.', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error generating backup:", error);
        Toastify({ text: 'Error al generar la copia de seguridad.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});
document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('importBackupFile').click());

document.getElementById('importBackupFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!confirm('¿Está seguro de que desea restaurar desde esta copia de seguridad? Esta acción sobreescribirá TODOS los datos actuales en la nube y no se puede deshacer.')) {
        return;
    }

    const reader = new FileReader();
    reader.onload = async (ev) => {
        const loader = document.getElementById('loader');
        try {
            const data = JSON.parse(ev.target.result);
            if(loader) loader.style.display = 'flex';

            const collectionsToSync = [
                { name: 'products', data: data.products || [], idField: 'codigo' },
                { name: 'materials', data: data.materials || [], idField: 'codigo' },
                { name: 'operators', data: data.operators || [], idField: 'id' },
                { name: 'equipos', data: data.equipos || [], idField: 'id' },
                { name: 'productionOrders', data: data.productionOrders || [], idField: 'order_id' },
                { name: 'vales', data: data.vales || [], idField: 'vale_id' }
            ];

            for (const { name, data, idField } of collectionsToSync) {
                const collectionRef = collection(db, name);
                const snapshot = await getDocs(collectionRef);
                const existingIds = new Set(snapshot.docs.map(d => d.id));
                const backupIds = new Set(data.map(item => item[idField].toString()));

                const deletePromises = [];
                existingIds.forEach(id => {
                    if (!backupIds.has(id)) {
                        deletePromises.push(deleteDoc(doc(db, name, id)));
                    }
                });

                const setPromises = [];
                data.forEach(item => {
                    const docId = item[idField].toString();
                    setPromises.push(setDoc(doc(db, name, docId), item));
                });
                await Promise.all([...deletePromises, ...setPromises]);
            }

            const recipesRef = collection(db, 'recipes');
            const recipesSnapshot = await getDocs(recipesRef);
            const existingRecipeIds = new Set(recipesSnapshot.docs.map(d => d.id));
            const backupRecipeIds = new Set(Object.keys(data.recipes || {}));

            const deleteRecipePromises = [];
            existingRecipeIds.forEach(id => {
                if (!backupRecipeIds.has(id)) {
                    deleteRecipePromises.push(deleteDoc(doc(db, 'recipes', id)));
                }
            });

            const setRecipePromises = [];
            if (data.recipes) {
                for (const [productId, items] of Object.entries(data.recipes)) {
                    setRecipePromises.push(setDoc(doc(db, 'recipes', productId), { items }));
                }
            }
            await Promise.all([...deleteRecipePromises, ...setRecipePromises]);

            Toastify({ text: 'Datos restaurados con éxito. Recargando...', backgroundColor: 'var(--success-color)', duration: 3000 }).showToast();
            setTimeout(() => location.reload(), 3000);

        } catch (error) {
            console.error("Error restoring backup:", error);
            Toastify({ text: `Archivo JSON inválido o error al restaurar: ${error.message}`, duration: 5000, backgroundColor: 'var(--danger-color)' }).showToast();
        } finally {
            if(loader) loader.style.display = 'none';
        }
    };
    reader.readAsText(file);
});

/* ----------  CHARTS  ---------- */
function initCharts(completedThisMonth, finalProductOrdersThisMonth) {
  if (costChartInstance) costChartInstance.destroy();
  if (productionChartInstance) productionChartInstance.destroy();
  if (dailyProductionChartInstance) dailyProductionChartInstance.destroy();
  if (dailyOvercostChartInstance) dailyOvercostChartInstance.destroy();

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const costMap = {};
  const prodMap = {};
  finalProductOrdersThisMonth.forEach(o => {
      if (!costMap[o.product_name]) {
          costMap[o.product_name] = { total_cost: 0, total_qty: 0 };
      }
      costMap[o.product_name].total_cost += o.cost_real || 0;
      costMap[o.product_name].total_qty += o.quantity_produced || 0;
      prodMap[o.product_name] = (prodMap[o.product_name] || 0) + (o.quantity_produced || 0);
  });

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const monthLabels = Array.from({ length: daysInMonth }, (_, i) => i + 1);
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

  const ctxProd = document.getElementById('productionChart');
  if (ctxProd) {
    const topProd = Object.entries(prodMap).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const topProdData = topProd.map(x => x.qty);
    const maxProdValue = topProdData.length > 0 ? Math.max(...topProdData) : 0;

    productionChartInstance = new Chart(ctxProd, {
        type: 'bar',
        data: { labels: topProd.map(x => x.name), datasets: [{ label: 'Unidades', data: topProdData, backgroundColor: '#27ae60' }] },
        options: {
            scales: {
                y: {
                    suggestedMax: maxProdValue * 1.15,
                    title: { display: true, text: 'Cantidad' }
                }
            },
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'top', color: '#333', formatter: (value) => Math.round(value) }
            }
        }
    });
  }

  const ctxDailyProd = document.getElementById('dailyProductionChart');
  if (ctxDailyProd) {
    const maxDailyProd = dailyProductionData.length > 0 ? Math.max(...dailyProductionData) : 0;
    dailyProductionChartInstance = new Chart(ctxDailyProd, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Unidades Producidas (Finales)',
                data: dailyProductionData,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            scales: {
                y: {
                    title: { display: true, text: 'Cantidad' },
                    suggestedMax: maxDailyProd * 1.15
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (tooltipItem) => `Unidades: ${Math.round(tooltipItem.raw)}` } },
                datalabels: {
                    display: true,
                    align: 'top',
                    color: '#333',
                    formatter: (value) => Math.round(value),
                    display: (context) => context.dataset.data[context.dataIndex] > 0,
                    backgroundColor: null
                }
            }
        }
    });
  }

  const ctxCost = document.getElementById('costChart');
  if (ctxCost) {
    const topUnitCost = Object.entries(costMap).map(([name, data]) => ({ name, unit_cost: data.total_qty > 0 ? data.total_cost / data.total_qty : 0 })).sort((a, b) => b.unit_cost - a.unit_cost).slice(0, 5);
    const topCostData = topUnitCost.map(x => x.unit_cost);
    const maxCostValue = topCostData.length > 0 ? Math.max(...topCostData) : 0;

    costChartInstance = new Chart(ctxCost, {
        type: 'bar',
        data: { labels: topUnitCost.map(x => x.name), datasets: [{ label: 'Costo Unitario', data: topCostData, backgroundColor: '#3498db' }] },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { callback: (value) => formatCurrency(value) },
                    suggestedMax: maxCostValue * 1.15,
                    title: { display: true, text: 'US$' }
                }
            },
            plugins: {
                legend: { display: false },
                datalabels: { anchor: 'end', align: 'top', color: '#333', formatter: (value) => formatCurrency(value) }
            }
        }
    });
  }

  const ctxDailyOvercost = document.getElementById('dailyOvercostChart');
  if (ctxDailyOvercost) {
    dailyOvercostChartInstance = new Chart(ctxDailyOvercost, {
        type: 'line',
        data: {
            labels: monthLabels,
            datasets: [{
                label: 'Sobrecosto Diario',
                data: dailyOvercostData,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            scales: {
                y: {
                    ticks: { callback: (value) => formatCurrency(value) },
                    title: { display: true, text: 'US$' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (tooltipItem) => formatCurrency(tooltipItem.raw) } },
                datalabels: {
                    display: true,
                    align: 'top',
                    color: '#333',
                    formatter: (value) => formatCurrency(value),
                    display: (context) => context.dataset.data[context.dataIndex] !== 0,
                    backgroundColor: null
                }
            }
        }
    });
  }
}

/* ---------- PLANIFICADOR DE DEMANDA ---------- */
async function populatePlannerProductSelects(selectElement) {
    selectElement.innerHTML = '<option value="" disabled selected>Cargando...</option>';

    try {
        const [productsSnapshot, recipesSnapshot, intermediateProducts] = await Promise.all([
            getDocs(query(collection(db, 'products'), orderBy('descripcion'))),
            getDocs(collection(db, 'recipes')),
            getIntermediateProductCodes()
        ]);

        const productsWithRecipe = new Set(recipesSnapshot.docs.map(doc => doc.id));

        selectElement.innerHTML = '<option value="" disabled selected>Seleccione un producto...</option>';
        productsSnapshot.forEach(doc => {
            const isFinalProduct = !intermediateProducts.has(doc.id);
            const hasRecipe = productsWithRecipe.has(doc.id);
            if (isFinalProduct && hasRecipe) {
                const p = doc.data();
                const option = new Option(`${doc.id} - ${p.descripcion}`, doc.id);
                selectElement.add(option);
            }
        });
    } catch (error) {
        console.error("Error populating planner product selects:", error);
        selectElement.innerHTML = '<option>Error al cargar</option>';
    }
}

function addForecastEntryRow() {
    const container = document.getElementById('forecast-entries');
    const newEntry = document.createElement('div');
    newEntry.className = 'row g-3 align-items-center forecast-entry mb-2';
    newEntry.innerHTML = `
        <div class="col-md-6">
            <select class="form-select forecast-product"></select>
        </div>
        <div class="col-md-4">
            <input type="number" class="form-control forecast-quantity" min="1" placeholder="Ej: 100">
        </div>
        <div class="col-md-2 d-flex align-items-end">
            <button type="button" class="btn btn-danger w-100 remove-forecast-btn"><i class="fas fa-trash"></i></button>
        </div>
    `;
    const newSelect = newEntry.querySelector('.forecast-product');
    populatePlannerProductSelects(newSelect);
    container.appendChild(newEntry);
}

document.getElementById('addForecastEntryBtn')?.addEventListener('click', addForecastEntryRow);

document.getElementById('forecast-entries')?.addEventListener('click', (e) => {
    if (e.target.closest('.remove-forecast-btn')) {
        const entry = e.target.closest('.forecast-entry');
        entry.remove();
    }
});

async function getGrossRequirements(initialForecast, recipeCache = {}) {
    const grossRequirements = new Map();

    async function explodeBOM(productCode, requiredQty) {
        const currentQty = grossRequirements.get(productCode) || 0;
        grossRequirements.set(productCode, currentQty + requiredQty);

        let recipe = recipeCache[productCode];
        if (!recipe) {
            const recipeDoc = await getDoc(doc(db, "recipes", productCode));
            if (recipeDoc.exists()) {
                recipe = recipeDoc.data().items;
                recipeCache[productCode] = recipe;
            }
        }

        if (!recipe) return;

        for (const ingredient of recipe) {
            if (ingredient.type === 'product') {
                const subProductQty = ingredient.quantity * requiredQty;
                await explodeBOM(ingredient.code, subProductQty);
            }
        }
    }

    for (const item of initialForecast) {
        await explodeBOM(item.productCode, item.quantity);
    }

    return grossRequirements;
}


const materialCheckModal = new bootstrap.Modal(document.getElementById('materialCheckModal'));

async function displaySuggestedOrders(grossRequirements, selectedAlmacenId) {
    const suggestedOrdersTbody = document.getElementById('suggestedOrdersTableBody');
    suggestedOrdersTbody.innerHTML = '';
    let suggestionsMade = false;

    for (const [productCode, grossQty] of grossRequirements.entries()) {
        const productDoc = await getDoc(doc(db, "products", productCode));
        if (!productDoc.exists()) continue;
        const product = productDoc.data();

        const materialDoc = await getDoc(doc(db, "materials", productCode));
        const materialInfo = materialDoc.exists() ? materialDoc.data() : null;

        let currentStock = 0;
        if (materialInfo && materialInfo.inventario) {
            if (selectedAlmacenId === 'all') {
                currentStock = Object.values(materialInfo.inventario).reduce((a, b) => a + b, 0);
            } else {
                currentStock = materialInfo.inventario[selectedAlmacenId] || 0;
            }
        }
        const netRequirement = grossQty - currentStock;

        if (netRequirement > 0) {
            suggestionsMade = true;
            const roundedNetReq = Math.ceil(netRequirement);
            const row = document.createElement('tr');

            row.innerHTML = `
                <td><input type="checkbox" class="suggestion-checkbox" data-product-code="${productCode}" checked></td>
                <td>${product.descripcion} (${productCode})</td>
            `;

            const netReqCell = document.createElement('td');
            const netReqInput = document.createElement('input');
            netReqInput.type = 'number';
            netReqInput.className = 'form-control form-control-sm suggested-order-qty';
            netReqInput.value = roundedNetReq;
            netReqInput.min = 1;
            netReqInput.dataset.originalNetReq = roundedNetReq;
            netReqCell.appendChild(netReqInput);
            row.appendChild(netReqCell);

            row.insertAdjacentHTML('beforeend', `
                <td>${currentStock.toFixed(2)}</td>
                <td>${grossQty.toFixed(2)}</td>
            `);

            const operatorCell = document.createElement('td');
            const operatorSelect = document.createElement('select');
            operatorSelect.className = 'form-select form-select-sm planner-operator-select';
            operatorSelect.innerHTML = '<option value="">Seleccione...</option>';
            operators.forEach(o => operatorSelect.add(new Option(o.name, o.id)));
            operatorCell.appendChild(operatorSelect);
            row.appendChild(operatorCell);

            const equipoCell = document.createElement('td');
            const equipoSelect = document.createElement('select');
            equipoSelect.className = 'form-select form-select-sm planner-equipo-select';
            equipoSelect.innerHTML = '<option value="">Seleccione...</option>';
            equipos.forEach(e => equipoSelect.add(new Option(e.name, e.id)));
            equipoCell.appendChild(equipoSelect);
            row.appendChild(equipoCell);

            suggestedOrdersTbody.appendChild(row);
        }
    }

    const suggestedOrdersCard = document.getElementById('suggestedOrdersCard');
    if (suggestionsMade) {
        suggestedOrdersCard.style.display = 'block';
    } else {
        suggestedOrdersCard.style.display = 'none';
        Toastify({ text: 'No se requiere producción nueva. El inventario actual satisface el pronóstico.', backgroundColor: 'var(--info-color)', duration: 5000 }).showToast();
    }
}

document.getElementById('calculatePlanBtn')?.addEventListener('click', async () => {
    const selectedAlmacenId = document.getElementById('plannerAlmacenSelect').value;
    const entries = document.querySelectorAll('.forecast-entry');
    const forecast = [];
    let hasInvalidEntry = false;

    entries.forEach(entry => {
        const productCode = entry.querySelector('.forecast-product').value;
        const quantity = parseInt(entry.querySelector('.forecast-quantity').value, 10);

        if (productCode && quantity > 0) {
            const existing = forecast.find(f => f.productCode === productCode);
            if (existing) {
                existing.quantity += quantity;
            } else {
                forecast.push({ productCode, quantity });
            }
        } else if (productCode || quantity) {
            hasInvalidEntry = true;
        }
    });

    if (hasInvalidEntry) {
        Toastify({ text: 'Por favor, complete todas las filas del pronóstico antes de calcular.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    if (forecast.length === 0) {
        Toastify({ text: 'No hay pronóstico para calcular. Agregue al menos un producto.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const grossRequirements = await getGrossRequirements(forecast);

    const totalRawMaterials = new Map();
    for (const f of forecast) {
        const baseMats = await getBaseMaterials(f.productCode, f.quantity);
        baseMats.forEach(mat => {
            const currentQty = totalRawMaterials.get(mat.code) || 0;
            totalRawMaterials.set(mat.code, currentQty + mat.quantity);
        });
    }

    if (totalRawMaterials.size === 0) {
        await displaySuggestedOrders(grossRequirements, selectedAlmacenId);
        return;
    }

    const materialCheckResults = [];
    let hasShortage = false;

    for (const [code, requiredQty] of totalRawMaterials.entries()) {
        const materialDoc = await getDoc(doc(db, "materials", code));
        const material = materialDoc.exists() ? materialDoc.data() : null;

        let stock = 0;
        if (material && material.inventario) {
            if (selectedAlmacenId === 'all') {
                stock = Object.values(material.inventario).reduce((a, b) => a + b, 0);
            } else {
                stock = material.inventario[selectedAlmacenId] || 0;
            }
        }

        const balance = stock - requiredQty;
        if (balance < 0) hasShortage = true;

        materialCheckResults.push({
            code,
            description: material ? material.descripcion : 'N/A',
            required: requiredQty,
            stock,
            balance
        });
    }

    const fullBody = document.getElementById('materialFullTableBody');
    const shortageBody = document.getElementById('materialShortageTableBody');
    fullBody.innerHTML = '';
    shortageBody.innerHTML = '';

    materialCheckResults.sort((a, b) => a.code.localeCompare(b.code));

    materialCheckResults.forEach(res => {
        const balanceColor = res.balance < 0 ? 'text-danger fw-bold' : '';
        fullBody.innerHTML += `
            <tr>
                <td>${res.code}</td>
                <td>${res.description}</td>
                <td>${res.required.toFixed(2)}</td>
                <td>${res.stock.toFixed(2)}</td>
                <td class="${balanceColor}">${res.balance.toFixed(2)}</td>
            </tr>
        `;
        if (res.balance < 0) {
            shortageBody.innerHTML += `
                <tr>
                    <td>${res.code}</td>
                    <td>${res.description}</td>
                    <td>${res.required.toFixed(2)}</td>
                    <td>${res.stock.toFixed(2)}</td>
                    <td class="text-danger fw-bold">${(res.balance * -1).toFixed(2)}</td>
                </tr>
            `;
        }
    });

    document.getElementById('materialShortageTableBody').closest('.card').style.display = hasShortage ? 'block' : 'none';
    document.querySelector('#materialCheckModal .alert').style.display = hasShortage ? 'block' : 'none';

    document.getElementById('continuePlanBtn').onclick = async () => {
        materialCheckModal.hide();
        await displaySuggestedOrders(grossRequirements, selectedAlmacenId);
    };

    materialCheckModal.show();
});

document.getElementById('createSelectedOrdersBtn')?.addEventListener('click', async () => {
    const checkedCheckboxes = [...document.querySelectorAll('.suggestion-checkbox:checked')];
    if (checkedCheckboxes.length === 0) {
        Toastify({ text: 'No hay órdenes sugeridas seleccionadas para crear.', backgroundColor: 'var(--warning-color)' }).showToast();
        return;
    }

    const plannerAlmacenId = document.getElementById('plannerAlmacenSelect').value;
    if (plannerAlmacenId === 'all') {
        Toastify({ text: 'Por favor, seleccione un almacén de producción específico (no "Todos") antes de crear órdenes.', backgroundColor: 'var(--danger-color)', duration: 6000 }).showToast();
        return;
    }

    let createdCount = 0;
    const rowsToRemove = [];

    for (const checkbox of checkedCheckboxes) {
        const row = checkbox.closest('tr');
        const operatorId = row.querySelector('.planner-operator-select').value;
        const equipoId = row.querySelector('.planner-equipo-select').value;
        const productCode = checkbox.dataset.productCode;
        const qtyInput = row.querySelector('.suggested-order-qty');
        const originalNetReq = parseInt(qtyInput.dataset.originalNetReq, 10);
        const quantityToCreate = parseInt(qtyInput.value, 10);

        if (!operatorId || !equipoId) {
            Toastify({ text: `Seleccione operador y equipo para ${productCode}.`, backgroundColor: 'var(--warning-color)' }).showToast();
            continue;
        }
        if (isNaN(quantityToCreate) || quantityToCreate <= 0) {
            Toastify({ text: `La cantidad para ${productCode} debe ser un número positivo.`, backgroundColor: 'var(--warning-color)' }).showToast();
            continue;
        }

        const success = await createProductionOrder(productCode, quantityToCreate, operatorId, equipoId, plannerAlmacenId);
        if (success) {
            createdCount++;
            if (quantityToCreate >= originalNetReq) {
                rowsToRemove.push(row);
            } else {
                const remainingQty = originalNetReq - quantityToCreate;
                qtyInput.value = remainingQty;
                qtyInput.dataset.originalNetReq = remainingQty;
                checkbox.checked = false;
            }
        }
    }

    if (createdCount > 0) {
        Toastify({ text: `${createdCount} órdenes de producción creadas para el almacén ${plannerAlmacenId}.`, backgroundColor: 'var(--success-color)' }).showToast();
        loadProductionOrders();

        rowsToRemove.forEach(row => row.remove());

        if (document.getElementById('suggestedOrdersTableBody').children.length === 0) {
            document.getElementById('suggestedOrdersCard').style.display = 'none';
        }
    }
});

document.getElementById('newPlanBtn')?.addEventListener('click', () => {
    const forecastEntriesContainer = document.getElementById('forecast-entries');
    forecastEntriesContainer.innerHTML = '';
    addForecastEntryRow();

    const suggestedOrdersTbody = document.getElementById('suggestedOrdersTableBody');
    suggestedOrdersTbody.innerHTML = '';

    document.getElementById('suggestedOrdersCard').style.display = 'none';

    Toastify({ text: 'Planificador reiniciado.', backgroundColor: 'var(--info-color)' }).showToast();
});
