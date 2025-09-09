// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, collection, getDocs, doc, setDoc, addDoc, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import Chart from 'https://esm.sh/chart.js/auto';
import ChartDataLabels from 'https://esm.sh/chartjs-plugin-datalabels';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAyMsDnA4TadOXrwxUqumwPAji9S3QiEAE",
  authDomain: "superprod-2ced1.firebaseapp.com",
  projectId: "superprod-2ced1",
  storageBucket: "superprod-2ced1.appspot.com",
  messagingSenderId: "691324529613",
  appId: "1:691324529613:web:a050a6d44f06481503b284",
  measurementId: "G-53FH6JGS20"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

console.log("Firebase initialized");

// -----------------------------------------------------------------------------
//  Superproducción – Gestión de Producción
//  main.js  (final – all fixes + improvements included)
// -----------------------------------------------------------------------------
/* global bootstrap, XLSX, jsPDF, html2canvas, Toastify */

/* ----------  BASE DE DATOS LOCAL  ---------- */
let products   = [];
let recipes    = {};
let productionOrders = [];
let operators  = [];
let equipos    = [];
let materials  = [];
let vales      = [];

let costChartInstance = null, productionChartInstance = null;

async function loadCollection(collectionName, idField) {
    const querySnapshot = await getDocs(collection(db, collectionName));
    const data = [];
    querySnapshot.forEach((doc) => {
        const docData = doc.data();
        docData[idField] = doc.id;
        data.push(docData);
    });
    return data;
}

async function loadRecipesCollection() {
    const querySnapshot = await getDocs(collection(db, 'recipes'));
    const recipesData = {};
    querySnapshot.forEach((doc) => {
        recipesData[doc.id] = doc.data().items;
    });
    return recipesData;
}

async function loadInitialData() {
    document.body.insertAdjacentHTML('beforeend', '<div id="loader" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); z-index: 9999; display: flex; align-items: center; justify-content: center;"><div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div></div>');

    try {
        [
            products,
            materials,
            productionOrders,
            operators,
            equipos,
            vales,
            recipes
        ] = await Promise.all([
            loadCollection('products', 'codigo'),
            loadCollection('materials', 'codigo'),
            loadCollection('productionOrders', 'order_id'),
            loadCollection('operators', 'id'),
            loadCollection('equipos', 'id'),
            loadCollection('vales', 'vale_id'),
            loadRecipesCollection()
        ]);
        
        productionOrders.forEach(o => o.order_id = parseInt(o.order_id));

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
function generateSequentialOrderId() {
  const nums = productionOrders.map(o => Number(o.order_id)).filter(n => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
function formatDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return 'N/A';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [year, month, day] = parts;
  return `${day}-${month}-${year}`;
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
        window.onafterprint = null; // Clean up handler
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

/* ----------  NAVEGACIÓN  ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM fully loaded and parsed');

  console.log("Registering ChartDataLabels plugin");
  try {
      Chart.register(ChartDataLabels);
      console.log("ChartDataLabels plugin registered successfully.");
  } catch(e) {
      console.error("Failed to register ChartDataLabels", e);
  }

  await loadInitialData();
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
            // loadLogo().catch(err => console.error("Error in loadLogo:", err));
        }
        console.log('Finished loading content for page:', pageId);
    } catch (error) {
        console.error(`An error occurred in showPage for pageId "${pageId}":`, error);
        Toastify({ text: 'Ocurrió un error al cambiar de sección.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
  }
  
  navLinks.forEach(l => l.addEventListener('click', (e) => { 
      e.preventDefault(); 
      console.log(`Nav link clicked. page: ${l.dataset.page}`);
      showPage(l.dataset.page);
  }));
  
  // PDF and Print Buttons
  document.getElementById('dashboardPdfBtn')?.addEventListener('click', () => generatePagePDF('dashboardPage', 'dashboard.pdf'));
  document.getElementById('reportsPdfBtn')?.addEventListener('click', () => generatePagePDF('reportsPage', 'reporte.pdf'));
  
  document.getElementById('toggleOrderSortBtn')?.addEventListener('click', () => {
    orderSortDirection = orderSortDirection === 'asc' ? 'desc' : 'asc';
    const icon = document.querySelector('#toggleOrderSortBtn i');
    icon.className = orderSortDirection === 'asc' ? 'fas fa-sort-amount-up-alt' : 'fas fa-sort-amount-down-alt';
    loadProductionOrders(document.getElementById('searchOrder').value);
  });

  showPage('dashboardPage');

  document.getElementById('lowStockThreshold').addEventListener('input', () => {
    if (document.getElementById('dashboardPage').style.display !== 'none') {
        updateDashboard();
    }
  });
});

/* ----------  DASHBOARD  ---------- */
function updateDashboard() {
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const completedThisMonth = productionOrders.filter(o => {
    if (o.status !== 'Completada' || !o.completed_at) return false;
    const orderDate = new Date(o.completed_at);
    return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
  });
  
  const pending = productionOrders.filter(o => o.status === 'Pendiente');

  const totalProduction = completedThisMonth.reduce((acc, o) => acc + (o.quantity_produced || 0), 0);
  const realCost = completedThisMonth.reduce((acc, o) => acc + (o.cost_real || 0), 0);
  const overCost = completedThisMonth.reduce((acc, o) => acc + (o.overcost || 0), 0);

  document.getElementById('pendingOrdersCard').textContent = pending.length;
  document.getElementById('completedOrdersCard').textContent = completedThisMonth.length;
  document.getElementById('totalProductionCard').textContent = totalProduction;
  document.getElementById('totalCostCard').textContent = formatCurrency(realCost);
  document.getElementById('totalOvercostCard').textContent = formatCurrency(overCost);
  
  const operatorStats = {};
  completedThisMonth.forEach(o => {
    const opId = o.operator_id;
    if (!operatorStats[opId]) {
      operatorStats[opId] = { name: operators.find(op => op.id === opId)?.name || opId, production: 0, overcost: 0 };
    }
    operatorStats[opId].production += o.quantity_produced || 0;
    operatorStats[opId].overcost += o.overcost || 0;
  });

  const sortedByProduction = Object.values(operatorStats).sort((a, b) => b.production - a.production);
  const sortedByOvercost = Object.values(operatorStats).sort((a, b) => a.overcost - b.overcost);

  const prodRankBody = document.getElementById('operatorProductionRankBody');
  prodRankBody.innerHTML = sortedByProduction.map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>${op.production}</td></tr>`).join('');

  const overcostRankBody = document.getElementById('operatorOvercostRankBody');
  if(overcostRankBody) {
    overcostRankBody.innerHTML = sortedByOvercost.map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>${formatCurrency(op.overcost)}</td></tr>`).join('');
  }

  const equipoStats = {};
  completedThisMonth.forEach(o => {
    const eqId = o.equipo_id;
    if (!equipoStats[eqId]) {
      equipoStats[eqId] = { name: equipos.find(eq => eq.id === eqId)?.name || eqId, production: 0 };
    }
    equipoStats[eqId].production += o.quantity_produced || 0;
  });

  const sortedByEquipoProduction = Object.values(equipoStats).sort((a, b) => b.production - a.production);
  const equipoRankBody = document.getElementById('equipoProductionRankBody');
  equipoRankBody.innerHTML = sortedByEquipoProduction.map((eq, i) => `<tr><td>${i + 1}</td><td>${eq.name}</td><td>${eq.production}</td></tr>`).join('');

  const threshold = parseInt(document.getElementById('lowStockThreshold').value, 10);

  // 1. Get all unique materials used in recipes
  const materialsInRecipes = new Set();
  for (const productId of Object.keys(recipes)) {
      const baseMats = getBaseMaterials(productId, 1);
      baseMats.forEach(mat => materialsInRecipes.add(mat.code));
  }

  // 2. Filter materials that are in recipes, are below threshold, and then sort them
  const lowStockMaterials = materials
      .filter(m => materialsInRecipes.has(m.codigo))
      .filter(m => m.existencia < threshold)
      .sort((a, b) => a.existencia - b.existencia);
  
  const affectedProductsByMaterial = {};
  lowStockMaterials.forEach(m => {
      affectedProductsByMaterial[m.codigo] = new Set();
      Object.keys(recipes).forEach(productId => {
          const recipeItems = recipes[productId] || [];
          const baseMaterials = getBaseMaterials(productId, 1);
          if (baseMaterials.some(bm => bm.code === m.codigo)) {
              const product = products.find(p => p.codigo === productId);
              if (product) {
                  affectedProductsByMaterial[m.codigo].add(product.descripcion);
              }
          }
      });
  });

  const lowStockTbody = document.getElementById('lowStockTableBody');
  lowStockTbody.innerHTML = lowStockMaterials.length
    ? lowStockMaterials.map(m => {
        const affectedProductsList = [...affectedProductsByMaterial[m.codigo]];
        const formattedProducts = affectedProductsList.length
            ? affectedProductsList.map((p, i) => `${i + 1}. ${p}`).join('<br>')
            : 'N/A';
        return `<tr>
            <td>${m.descripcion}</td>
            <td>${m.existencia.toFixed(2)}</td>
            <td>${m.unidad}</td>
            <td>${formattedProducts}</td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="4" class="text-center">Sin alertas para el límite de ${threshold}</td></tr>`;
  
  initCharts();
}

/* ----------  PRODUCTOS  ---------- */
let isEditingProduct = false, currentProductCode = null;
const productModal = new bootstrap.Modal(document.getElementById('productModal'));
function loadProducts(filter = '') {
  const tbody = document.getElementById('productsTableBody'); tbody.innerHTML = '';
  products.sort((a, b) => a.codigo.localeCompare(b.codigo));
  products.filter(p => !filter || p.codigo.includes(filter) || p.descripcion.toLowerCase().includes(filter.toLowerCase()))
    .forEach(p => tbody.insertAdjacentHTML('beforeend', `<tr><td>${p.codigo}</td><td>${p.descripcion}</td><td>${p.unidad || ''}</td><td><button class="btn btn-sm btn-warning edit-btn me-2" data-code="${p.codigo}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-btn" data-code="${p.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`));
}
document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('productCode').value.trim();
  const desc = document.getElementById('productDescription').value.trim();
  const unit = document.getElementById('productUnit').value.trim();
  if (!code || !desc) return;

  const productData = {
      descripcion: desc,
      unidad: unit
  };

  try {
    await setDoc(doc(db, "products", code), productData);

    if (isEditingProduct) {
        const idx = products.findIndex(p => p.codigo === currentProductCode);
        if (idx !== -1) {
            products[idx].descripcion = desc;
            products[idx].unidad = unit;
        }
    } else {
        products.push({ codigo: code, ...productData });
    }
    
    loadProducts();
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
            products = products.filter(p => p.codigo !== code);
            loadProducts();
            Toastify({ text: 'Producto eliminado', backgroundColor: 'var(--success-color)' }).showToast();
        } catch (error) {
            console.error("Error deleting product: ", error);
            Toastify({ text: 'Error al eliminar producto', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
  }
  if (btn.classList.contains('edit-btn')) { isEditingProduct = true; currentProductCode = code; const p = products.find(p => p.codigo === code); document.getElementById('productCode').value = p.codigo; document.getElementById('productDescription').value = p.descripcion; document.getElementById('productUnit').value = p.unidad || ''; document.getElementById('productCode').disabled = true; document.getElementById('productModalLabel').textContent = 'Editar Producto'; productModal.show(); }
});
document.getElementById('productModal').addEventListener('hidden.bs.modal', () => { isEditingProduct = false; document.getElementById('productForm').reset(); document.getElementById('productCode').disabled = false; document.getElementById('productModalLabel').textContent = 'Añadir Producto'; });
document.getElementById('searchProduct').addEventListener('input', e => loadProducts(e.target.value));

/* ----------  MATERIALES  ---------- */
let isEditingMaterial = false, currentMaterialCode = null;
const materialModal = new bootstrap.Modal(document.getElementById('materialModal'));
function loadMaterials() {
  const filter = document.getElementById('searchMaterial').value.toLowerCase();
  const showOnlyProducts = document.getElementById('filterMaterialsAsProducts').checked;
  
  const tbody = document.getElementById('materialsTableBody');
  tbody.innerHTML = '';
  
  materials.sort((a, b) => a.codigo.localeCompare(b.codigo));
  
  let filteredMaterials = materials;

  if (showOnlyProducts) {
    const productCodes = new Set(products.map(p => p.codigo));
    filteredMaterials = filteredMaterials.filter(m => productCodes.has(m.codigo));
  }

  if (filter) {
    filteredMaterials = filteredMaterials.filter(m => m.codigo.toLowerCase().includes(filter) || m.descripcion.toLowerCase().includes(filter));
  }
  
  filteredMaterials.forEach(m => {
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${m.codigo}</td><td>${m.descripcion}</td><td>${m.unidad}</td><td>${m.existencia.toFixed(2)}</td><td>${formatCurrency(m.costo)}</td><td><button class="btn btn-sm btn-warning edit-btn me-2" data-code="${m.codigo}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-btn" data-code="${m.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`);
  });
}
document.getElementById('materialForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('materialCode').value.trim();
  const desc = document.getElementById('materialDescription').value.trim();
  const unit = document.getElementById('materialUnit').value.trim();
  const exist = parseFloat(document.getElementById('materialExistence').value);
  const cost = parseFloat(document.getElementById('materialCost').value);
  if (!code || !desc) return;
  
  const materialData = {
      descripcion: desc,
      unidad: unit,
      existencia: exist,
      costo: cost
  };

  try {
    await setDoc(doc(db, "materials", code), materialData);

    const idx = materials.findIndex(m => m.codigo === code);
    if (idx === -1) {
        materials.push({ codigo: code, ...materialData });
    } else {
        materials[idx] = { codigo: code, ...materialData };
    }
    
    loadMaterials();
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
            materials = materials.filter(m => m.codigo !== code);
            loadMaterials();
            Toastify({ text: 'Material eliminado', backgroundColor: 'var(--success-color)' }).showToast();
        } catch (error) {
            console.error("Error deleting material: ", error);
            Toastify({ text: 'Error al eliminar material', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
  }
  if (btn.classList.contains('edit-btn')) { isEditingMaterial = true; currentMaterialCode = code; const m = materials.find(m => m.codigo === code); ['materialCode', 'materialDescription', 'materialUnit', 'materialExistence', 'materialCost'].forEach((id, i) => document.getElementById(id).value = [m.codigo, m.descripcion, m.unidad, m.existencia, m.costo][i]); document.getElementById('materialCode').disabled = true; document.getElementById('materialModalLabel').textContent = 'Editar Material'; materialModal.show(); }
});
document.getElementById('materialModal').addEventListener('hidden.bs.modal', () => { isEditingMaterial = false; document.getElementById('materialForm').reset(); document.getElementById('materialCode').disabled = false; document.getElementById('materialModalLabel').textContent = 'Añadir Material'; });
document.getElementById('searchMaterial').addEventListener('input', () => loadMaterials());
document.getElementById('filterMaterialsAsProducts').addEventListener('change', () => loadMaterials());

/* ----------  RECETAS  ---------- */
const addRecipeModal  = new bootstrap.Modal(document.getElementById('addRecipeModal'));
const editRecipeModal = new bootstrap.Modal(document.getElementById('editRecipeModal'));

function loadRecipes() {
  const tbody = document.getElementById('recipesTableBody'); tbody.innerHTML = '';
  const sorted = Object.keys(recipes).sort((a, b) => a.localeCompare(b));
  sorted.forEach(pid => {
    const prod = products.find(p => p.codigo === pid);
    if (!prod) return;
    const recipe = recipes[pid];
    if (!recipe) return;
    const cost = calculateRecipeCost(recipe);
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${prod.codigo}</td>
        <td>${prod.descripcion}</td>
        <td>${recipe.length}</td>
        <td>${formatCurrency(cost)}</td>
        <td>
          <button class="btn btn-sm btn-warning edit-btn me-2" data-product-id="${pid}" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-btn" data-product-id="${pid}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`);
  });
}
function calculateRecipeCost(items) {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  return items.reduce((acc, it) => {
    if (!it || !it.type) return acc;
    if (it.type === 'product') return acc + (recipes[it.code] ? calculateRecipeCost(recipes[it.code]) * it.quantity : 0);
    else { const m = materials.find(ma => ma.codigo === it.code); return acc + (m ? m.costo * it.quantity : 0); }
  }, 0);
}
function populateRecipeProductSelect() {
  const sel = document.getElementById('recipeProductSelect');
  sel.innerHTML = '<option disabled selected>Selecciona...</option>';
  products.forEach(p => { if (!recipes[p.codigo]) sel.add(new Option(p.descripcion, p.codigo)); });
  document.getElementById('recipeMaterials').innerHTML = '';
  document.getElementById('addMaterialToRecipeBtn').onclick = () => addRecipeMaterialField('recipeMaterials');
}
function addRecipeMaterialField(containerId, mCode = '', qty = '', type = 'material') {
  const container = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'row g-2 mb-2 align-items-center material-field';

  const allItems = { material: materials, product: products };

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

  const updateDescription = () => {
    const currentType = typeSelect.value;
    const currentCode = codeSelect.value;
    const item = allItems[currentType].find(i => i.codigo === currentCode);
    descInput.value = item ? item.descripcion : '';
  };

  const populateCodeSelect = () => {
    let currentType = typeSelect.value;
    if (!allItems[currentType]) {
        currentType = 'material';
        typeSelect.value = 'material';
    }
    const list = allItems[currentType];
    codeSelect.innerHTML = '<option value="" selected disabled>Selecciona...</option>';
    
    const recipeProductCode = document.getElementById('editRecipeProductSelect')?.value || document.getElementById('recipeProductSelect')?.value;

    list.forEach(item => {
      if (currentType === 'product' && item.codigo === recipeProductCode) return;
      
      const isSelected = item.codigo === mCode;
      const o = new Option(`${item.codigo} – ${item.descripcion}`, item.codigo, false, isSelected);
      codeSelect.add(o);
    });

    if (mCode) updateDescription();
    else descInput.value = '';
  };

  typeSelect.addEventListener('change', () => {
      mCode = '';
      populateCodeSelect();
  });
  codeSelect.addEventListener('change', updateDescription);

  const createCol = (className, element, style = {}) => {
      const col = document.createElement('div');
      col.className = className;
      Object.assign(col.style, style);
      col.appendChild(element);
      return col;
  };
  
  const reqQtyOutput = document.createElement('div');
  reqQtyOutput.className = 'req-qty-output text-end pe-2';
  reqQtyOutput.style.paddingTop = '0.375rem'; 

  const stockAlertOutput = document.createElement('div');
  stockAlertOutput.className = 'stock-alert-output';
  stockAlertOutput.style.paddingTop = '0.375rem';

  row.append(
    createCol('col-md-2', typeSelect, { maxWidth: '120px' }),
    createCol('col-md-2', codeSelect, { maxWidth: '120px' }),
    createCol('col-md-3', descInput),
    createCol('col-md-1', qtyInput),
    createCol('col-md-2', reqQtyOutput, { maxWidth: '150px' }),
    createCol('col-md-1', stockAlertOutput, { maxWidth: '100px' }),
    createCol('col-md-1 text-end', delBtn)
  );
  
  container.appendChild(row);
  populateCodeSelect();
}
document.getElementById('addRecipeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pid = document.getElementById('recipeProductSelect').value;
  const items = [...document.querySelectorAll('#recipeMaterials .material-field')]
    .map(f => ({ type: f.querySelector('.type-select').value, code: f.querySelector('.code-select').value, quantity: parseFloat(f.querySelector('.qty-input').value) }))
    .filter(i => i.code && !isNaN(i.quantity));
  if (!items.length) { Toastify({ text: 'Agrega al menos un ingrediente' }).showToast(); return; }
  
  try {
    await setDoc(doc(db, "recipes", pid), { items });
    recipes[pid] = items;
    loadRecipes();
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
    .map(f => ({
      type: f.querySelector('.type-select').value,
      code: f.querySelector('.code-select').value,
      quantity: parseFloat(f.querySelector('.qty-input').value)
    }))
    .filter(i => i.code && !isNaN(i.quantity));
  if (!items.length) { Toastify({ text: 'Agrega al menos un ingrediente' }).showToast(); return; }
  
  try {
    await setDoc(doc(db, "recipes", pid), { items });
    recipes[pid] = items;
    loadRecipes();
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
    if(confirm(`¿Eliminar receta para el producto ${pid}?`)) {
        try {
            await deleteDoc(doc(db, "recipes", pid));
            delete recipes[pid];
            loadRecipes();
            Toastify({ text: 'Receta eliminada', backgroundColor: 'var(--success-color)' }).showToast();
        } catch (error) {
            console.error("Error deleting recipe: ", error);
            Toastify({ text: 'Error al eliminar receta', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    }
  }
  if (btn.classList.contains('edit-btn')) {
    try {
        const prod = products.find(p => p.codigo === pid);
        if (!prod) {
            Toastify({ text: `Error: El producto para esta receta (código: ${pid}) ya no existe. Por favor, elimine esta receta.`, duration: 5000, backgroundColor: 'var(--danger-color)' }).showToast();
            return;
        }
        document.getElementById('editRecipeProductSelect').innerHTML = `<option value="${pid}">${prod.descripcion}</option>`;
        const cont = document.getElementById('editRecipeMaterials'); cont.innerHTML = '';
        recipes[pid].forEach(i => addRecipeMaterialField('editRecipeMaterials', i.code, i.quantity, i.type));
        document.getElementById('recipeSimulationQty').value = ''; // Clear simulation input
        updateRecipeSimulation(); // Clear simulation columns
        editRecipeModal.show();
    } catch (error) {
        console.error("Error al abrir el modal de editar receta:", error);
        Toastify({ text: `Se produjo un error inesperado al intentar editar la receta. Detalles: ${error.message}`, duration: 5000, backgroundColor: 'var(--danger-color)' }).showToast();
    }
  }
});
document.addEventListener('click', e => {
  if (e.target.closest('.remove-material-btn')) e.target.closest('.material-field').remove();
  if (e.target.id === 'addMaterialToEditRecipeBtn') addRecipeMaterialField('editRecipeMaterials');
});

document.getElementById('recipeSimulationQty')?.addEventListener('input', updateRecipeSimulation);

document.getElementById('editRecipeModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('recipeSimulationQty').value = '';
    // No need to call updateRecipeSimulation() here as the content is destroyed on open anyway
});

function updateRecipeSimulation() {
    const simQty = parseFloat(document.getElementById('recipeSimulationQty').value);
    const materialRows = document.querySelectorAll('#editRecipeMaterials .material-field');

    materialRows.forEach(row => {
        const baseQtyInput = row.querySelector('.qty-input');
        const reqQtyOutput = row.querySelector('.req-qty-output');
        const stockAlertOutput = row.querySelector('.stock-alert-output');
        const type = row.querySelector('.type-select').value;
        const code = row.querySelector('.code-select').value;

        stockAlertOutput.textContent = ''; // Clear previous alerts
        stockAlertOutput.classList.remove('text-danger', 'fw-bold');

        if (isNaN(simQty) || simQty <= 0) {
            reqQtyOutput.textContent = '';
            return;
        }

        const baseQty = parseFloat(baseQtyInput.value);
        if (isNaN(baseQty)) {
            reqQtyOutput.textContent = '';
            return;
        }

        const requiredQty = baseQty * simQty;
        reqQtyOutput.textContent = requiredQty.toFixed(2);

        if (type === 'material' && code) {
            const material = materials.find(m => m.codigo === code);
            if (material && material.existencia < requiredQty) {
                const shortfall = requiredQty - material.existencia;
                stockAlertOutput.textContent = `-${shortfall.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                stockAlertOutput.classList.add('text-danger', 'fw-bold');
            }
        }
    });
}


/* ----------  ÓRDENES  ---------- */
const productionOrderModal = new bootstrap.Modal(document.getElementById('productionOrderModal'));
const orderDetailsModal    = new bootstrap.Modal(document.getElementById('orderDetailsModal'));
const valeModal            = new bootstrap.Modal(document.getElementById('valeModal'));
const confirmCloseOrderModal = new bootstrap.Modal(document.getElementById('confirmCloseOrderModal'));
let orderSortDirection = 'desc'; // 'asc' or 'desc'

function populateOrderFormSelects() {
  const psel = document.getElementById('orderProductSelect'); psel.innerHTML = '<option disabled selected>Selecciona...</option>';
  products.forEach(p => psel.add(new Option(`${p.codigo} - ${p.descripcion}`, p.codigo)));
  const osel = document.getElementById('orderOperatorSelect'); osel.innerHTML = '<option disabled selected>Selecciona...</option>';
  operators.forEach(o => osel.add(new Option(o.name, o.id)));
  const esel = document.getElementById('orderEquipoSelect'); esel.innerHTML = '<option disabled selected>Selecciona...</option>';
  equipos.forEach(e => esel.add(new Option(e.name, e.id)));
}
function loadProductionOrders(filter = '') {
  const tbody = document.getElementById('productionOrdersTableBody');
  tbody.innerHTML = '';
  
  const sortedOrders = [...productionOrders].sort((a, b) => {
    if (orderSortDirection === 'asc') return a.order_id - b.order_id;
    return b.order_id - a.order_id;
  });

  sortedOrders
    .filter(o => !filter || o.order_id.toString().includes(filter) || (o.product_name || '').toLowerCase().includes(filter.toLowerCase()))
    .forEach(o => {
      const oc = (o.status === 'Pendiente' ? o.cost_extra : o.overcost) || 0;
      const ocColor = oc > 0 ? 'text-danger' : oc < 0 ? 'text-success' : '';
      tbody.insertAdjacentHTML('beforeend', `
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
        </tr>`);
    });
}

document.getElementById('productionOrdersTableBody').addEventListener('click', async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const oid = parseInt(btn.dataset.orderId);
    if (btn.classList.contains('view-details-btn')) {
      showOrderDetails(oid);
    } else if (btn.classList.contains('pdf-btn')) {
      await generateOrderPDF(oid);
    } else if (btn.classList.contains('delete-order-btn')) {
      if (confirm(`¿Eliminar orden ${oid}?`)) {
        try {
            await deleteDoc(doc(db, "productionOrders", oid.toString()));
            productionOrders = productionOrders.filter(o => o.order_id !== oid);
            loadProductionOrders();
            updateDashboard();
            Toastify({ text: 'Orden eliminada', backgroundColor: 'var(--success-color)' }).showToast();
        } catch(error) {
            console.error("Error deleting order: ", error);
            Toastify({ text: 'Error al eliminar orden', backgroundColor: 'var(--danger-color)' }).showToast();
        }
      }
    } else if (btn.classList.contains('complete-order-btn')) {
      const ord = productionOrders.find(o => o.order_id === oid);
      document.getElementById('closeHiddenOrderId').value = oid;
      document.getElementById('realQuantityInput').value = ord.quantity;
      confirmCloseOrderModal.show();
    } else if (btn.classList.contains('reopen-order-btn')) {
      reopenOrder(oid);
    } else if (btn.classList.contains('create-vale-btn')) {
      generateValePrompt(oid);
    }
});

function showOrderDetails(oid) {
    const ord = productionOrders.find(o => o.order_id === oid);
    if (!ord) {
        Toastify({ text: 'Orden no encontrada', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
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

    // --- Vales Info ---
    const orderVales = vales.filter(v => v.order_id === oid);
    document.getElementById('detailValeCount').textContent = orderVales.length;

    // --- Cost Info ---
    const realQty = ord.quantity_produced || 0;
    // "Standard Cost" here refers to the cost that *should have been* for the actual quantity produced.
    const standardCostForRealQty = (ord.cost_standard_unit || 0) * realQty;
    
    document.getElementById('detailStandardCost').textContent = formatCurrency(standardCostForRealQty);
    document.getElementById('detailExtraCost').textContent = formatCurrency(ord.cost_extra);
    // Display the true Real Cost and Overcost as calculated and stored on the order object
    document.getElementById('detailRealCost').textContent = formatCurrency(ord.cost_real);
    const overcostEl = document.getElementById('detailOvercost');
    overcostEl.textContent = formatCurrency(ord.overcost);
    const ocValue = ord.overcost || 0;
    overcostEl.className = 'h5 ' + (ocValue > 0 ? 'text-danger' : ocValue < 0 ? 'text-success' : '');

    // --- Consolidated Materials Table ---
    const materialsSummary = {};
    const recipeItems = recipes[ord.product_code] || [];
    recipeItems.forEach(recipeMat => {
        let itemInfo = { descripcion: 'N/A', costo_unit: 0 };
        if (recipeMat.type === 'product') {
            const p = products.find(prod => prod.codigo === recipeMat.code);
            if (p) itemInfo.descripcion = p.descripcion;
            itemInfo.costo_unit = calculateRecipeCost(recipes[recipeMat.code] || []);
        } else {
            const m = materials.find(mat => mat.codigo === recipeMat.code);
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
    });

    if (ord.status === 'Completada') {
        orderVales.forEach(vale => {
            vale.materials.forEach(valeMat => {
                const adjust = vale.type === 'salida' ? valeMat.quantity : -valeMat.quantity;
                if (materialsSummary[valeMat.material_code]) {
                    materialsSummary[valeMat.material_code].qty_real += adjust;
                } else {
                    const m = materials.find(m => m.codigo === valeMat.material_code);
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
        materialsTbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${code}</td>
                <td>${mat.descripcion}</td>
                <td>${mat.qty_plan.toFixed(2)} / <strong class="ms-1">${mat.qty_real.toFixed(2)}</strong></td>
                <td>${formatCurrency(mat.cost_plan)} / <strong class="ms-1">${formatCurrency(cost_real)}</strong></td>
            </tr>
        `);
    }

    // Add total row to consolidated table
    materialsTbody.insertAdjacentHTML('beforeend', `
        <tr class="table-group-divider fw-bold">
            <td colspan="3" class="text-end">TOTALES:</td>
            <td>${formatCurrency(totalPlanCost)} / <strong class="ms-1">${formatCurrency(totalRealCostConsolidated)}</strong></td>
        </tr>
    `);

    // --- Individual Vales Details ---
    const valesContainer = document.getElementById('detailValesContainer');
    valesContainer.innerHTML = '';
    if (orderVales.length > 0) {
        valesContainer.innerHTML += '<h6 class="mt-4">Desglose de Vales</h6>';
        orderVales.forEach(vale => {
            let valeHTML = `
                <div class="card mt-3">
                    <div class="card-header">
                        <strong>Vale #${vale.vale_id}</strong> - Tipo: ${vale.type === 'salida' ? 'Salida' : 'Devolución'} - Fecha: ${formatDate(vale.created_at)}
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-bordered mb-0">
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Descripción</th>
                                    <th>Cantidad</th>
                                    <th>Costo</th>
                                </tr>
                            </thead>
                            <tbody>`;
            let valeTotalCost = 0;
            vale.materials.forEach(item => {
                const material = materials.find(m => m.codigo === item.material_code);
                const cost = material ? material.costo * item.quantity : 0;
                valeTotalCost += cost;
                valeHTML += `
                    <tr>
                        <td>${item.material_code}</td>
                        <td>${material ? material.descripcion : 'N/A'}</td>
                        <td>${item.quantity.toFixed(2)}</td>
                        <td>${formatCurrency(cost)}</td>
                    </tr>`;
            });
            valeHTML += `
                            </tbody>
                            <tfoot>
                                <tr class="fw-bold">
                                    <td colspan="3" class="text-end">Costo Total del Vale:</td>
                                    <td>${formatCurrency(valeTotalCost)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>`;
            valesContainer.innerHTML += valeHTML;
        });
    }

    orderDetailsModal.show();
}

document.getElementById('productionOrderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pCode = document.getElementById('orderProductSelect').value;
  const qty   = parseInt(document.getElementById('orderQuantity').value);
  const opId  = document.getElementById('orderOperatorSelect').value;
  const eqId  = document.getElementById('orderEquipoSelect').value;
  if (!pCode || !opId || !eqId) { Toastify({ text: 'Completa producto, operador y equipo' }).showToast(); return; }
  const prod = products.find(p => p.codigo === pCode);
  if (!recipes[pCode]) { Toastify({ text: `Sin receta para ${prod.descripcion}` }).showToast(); return; }
  const stdCost = calculateRecipeCost(recipes[pCode]) * qty;
  const newOrder = {
    order_id: generateSequentialOrderId(),
    product_code: pCode,
    product_name: prod.descripcion,
    quantity: qty,
    quantity_produced: null,
    operator_id: opId,
    equipo_id: eqId,
    cost_standard_unit: calculateRecipeCost(recipes[pCode]),
    cost_standard: stdCost,
    cost_extra: 0,
    cost_real: null,
    overcost: null,
    created_at: new Date().toISOString().slice(0, 10),
    completed_at: null,
    status: 'Pendiente',
    materials_used: recipes[pCode].map(i => ({ material_code: i.code, quantity: i.quantity * qty, type: i.type }))
  };

  try {
    await setDoc(doc(db, "productionOrders", newOrder.order_id.toString()), newOrder);
    productionOrders.push(newOrder);
    loadProductionOrders();
    populateOrderFormSelects();
    productionOrderModal.hide();
    Toastify({ text: 'Orden de producción creada', backgroundColor: 'var(--success-color)' }).showToast();
  } catch (error) {
    console.error("Error creating order: ", error);
    Toastify({ text: 'Error al crear orden', backgroundColor: 'var(--danger-color)' }).showToast();
  }
});
document.getElementById('confirmCloseOrderForm').addEventListener('submit', e => {
  e.preventDefault();
  const oid = parseInt(document.getElementById('closeHiddenOrderId').value);
  const realQty = parseFloat(document.getElementById('realQuantityInput').value);
  completeOrder(oid, realQty);
  bootstrap.Modal.getInstance(document.getElementById('confirmCloseOrderModal')).hide();
});
async function completeOrder(oid, realQty) {
    const idx = productionOrders.findIndex(o => o.order_id === oid);
    if (idx === -1) {
        Toastify({ text: 'Error: Orden no encontrada para completar.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const orderToUpdate = { ...productionOrders[idx] };
    const materialsToUpdate = new Map();

    // Calculate consumed materials based on recipe
    (orderToUpdate.materials_used || []).forEach(orderMat => {
        if (orderMat.type !== 'material') return;
        const mIdx = materials.findIndex(m => m.codigo === orderMat.material_code);
        if (mIdx !== -1) {
            const originalMaterial = materials[mIdx];
            const perUnitQty = (orderToUpdate.quantity > 0) ? (orderMat.quantity / orderToUpdate.quantity) : 0;
            const consumedQty = perUnitQty * realQty;
            
            const updatedMaterial = materialsToUpdate.get(originalMaterial.codigo) || { ...originalMaterial };
            updatedMaterial.existencia -= consumedQty;
            materialsToUpdate.set(originalMaterial.codigo, updatedMaterial);
        }
    });

    // Update order properties
    orderToUpdate.quantity_produced = realQty;
    orderToUpdate.status = 'Completada';
    orderToUpdate.completed_at = new Date().toISOString().slice(0, 10);

    // Perform cost calculations based on user-defined logic
    const standardCostForRealQty = (orderToUpdate.cost_standard_unit || 0) * realQty;
    const plannedCost = orderToUpdate.cost_standard || 0;
    const extraCostFromVales = orderToUpdate.cost_extra || 0;
    
    orderToUpdate.cost_real = plannedCost + extraCostFromVales;
    orderToUpdate.overcost = orderToUpdate.cost_real - standardCostForRealQty;

    try {
        // Save all changes to Firestore
        const promises = [];
        promises.push(setDoc(doc(db, "productionOrders", orderToUpdate.order_id.toString()), orderToUpdate));
        materialsToUpdate.forEach((material, code) => {
            promises.push(setDoc(doc(db, "materials", code), material));
        });
        
        await Promise.all(promises);

        // Re-fetch data from Firestore to ensure local state is in sync
        [productionOrders, materials] = await Promise.all([
            loadCollection('productionOrders', 'order_id'),
            loadCollection('materials', 'codigo')
        ]);
        productionOrders.forEach(o => o.order_id = parseInt(o.order_id));

        // Re-render UI
        loadProductionOrders();
        loadMaterials();
        updateDashboard();

        Toastify({ text: `Orden ${oid} completada con éxito.`, backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error completing order: ", error);
        Toastify({ text: 'Error al completar la orden.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
async function reopenOrder(oid) {
    const idx = productionOrders.findIndex(o => o.order_id === oid);
    if (idx === -1) {
        Toastify({ text: 'Error: Orden no encontrada para reabrir.', backgroundColor: 'var(--danger-color)' }).showToast();
        return;
    }

    const orderToUpdate = { ...productionOrders[idx] };
    const materialsToUpdate = new Map();

    // Restore stock from the original completed order
    (orderToUpdate.materials_used || []).forEach(orderMat => {
        if (orderMat.type !== 'material') return;
        const mIdx = materials.findIndex(m => m.codigo === orderMat.material_code);
        if (mIdx !== -1) {
            const originalMaterial = materials[mIdx];
            const perUnitQty = (orderToUpdate.quantity > 0) ? (orderMat.quantity / orderToUpdate.quantity) : 0;
            const consumedQty = perUnitQty * (orderToUpdate.quantity_produced || 0);
            
            const updatedMaterial = materialsToUpdate.get(originalMaterial.codigo) || { ...originalMaterial };
            updatedMaterial.existencia += consumedQty;
            materialsToUpdate.set(originalMaterial.codigo, updatedMaterial);
        }
    });

    // Vales are independent transactions and their stock adjustments should not be reversed when an order is reopened.
    // The cost_extra associated with them remains on the order.

    // Update order properties to revert its state
    orderToUpdate.status = 'Pendiente';
    orderToUpdate.completed_at = null;
    orderToUpdate.quantity_produced = null;
    orderToUpdate.cost_real = null;
    orderToUpdate.overcost = null;

    try {
        // Save all changes to Firestore
        const promises = [];
        promises.push(setDoc(doc(db, "productionOrders", orderToUpdate.order_id.toString()), orderToUpdate));
        materialsToUpdate.forEach((material, code) => {
            promises.push(setDoc(doc(db, "materials", code), material));
        });

        await Promise.all(promises);

        // Re-fetch data from Firestore
        [productionOrders, materials] = await Promise.all([
            loadCollection('productionOrders', 'order_id'),
            loadCollection('materials', 'codigo')
        ]);
        productionOrders.forEach(o => o.order_id = parseInt(o.order_id));

        // Re-render UI
        loadProductionOrders();
        loadMaterials();
        updateDashboard();

        Toastify({ text: `Orden ${oid} reabierta.`, backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        console.error("Error reopening order: ", error);
        Toastify({ text: 'Error al reabrir la orden.', backgroundColor: 'var(--danger-color)' }).showToast();
    }
}
async function generateOrderPDF(oid) {
  try {
    const { jsPDF } = window.jspdf;
    const ord = productionOrders.find(o => o.order_id === oid);
    if (!ord) {
      Toastify({ text: 'Error: Orden no encontrada para PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
      return;
    }
    const doc = new jsPDF();
    
    let logoHeight = 0;
    const logoData = localStorage.getItem('companyLogo');
    if (logoData) {
        const getImageDimensions = (dataUrl) => new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.src = dataUrl;
        });
        const dims = await getImageDimensions(logoData);
        const maxWidth = 40;
        const maxHeight = 20;
        const ratio = Math.min(maxWidth / dims.width, maxHeight / dims.height);
        const w = dims.width * ratio;
        const h = dims.height * ratio;
        doc.addImage(logoData, 'PNG', 15, 10, w, h);
        logoHeight = h;
    }

    doc.setFontSize(20);
    doc.text('Orden de Producción', 105, logoHeight > 0 ? 15 + logoHeight : 25, null, null, 'center');

    let startY = (logoHeight > 0 ? 15 + logoHeight : 25) + 15;
    const lineHeight = 7;
    
    const rightColX = 140;
    const valeCount = vales.filter(v => v.order_id === oid).length;
    doc.setFontSize(10);
    doc.text(`Fecha Creación: ${formatDate(ord.created_at)}`, rightColX, startY);
    doc.text(`Fecha Fin: ${formatDate(ord.completed_at)}`, rightColX, startY + lineHeight);
    doc.text(`Nº Vales: ${valeCount}`, rightColX, startY + (lineHeight * 2));

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
    doc.text(`Costo Estándar: $${(ord.cost_standard || 0).toFixed(2)}`, 15, startY);
    startY += lineHeight;
    doc.text(`Costo Extra: $${(ord.cost_extra || 0).toFixed(2)}`, 15, startY);
    startY += lineHeight;
    doc.text(`Costo Real Total: $${ord.cost_real ? ord.cost_real.toFixed(2) : 'N/A'}`, 15, startY);
    startY += lineHeight;
    doc.text(`Sobrecosto: $${(ord.overcost || 0).toFixed(2)}`, 15, startY);

    const bodyRows = ord.materials_used.map(u => {
      let desc = u.material_code;
      let cost = 0;
      if (u.type === 'product') {
          const p = products.find(prod => prod.codigo === u.material_code);
          if (p) desc = p.descripcion;
          cost = calculateRecipeCost(recipes[u.material_code] || []);
      } else {
          const m = materials.find(mat => mat.codigo === u.material_code);
          if (m) {
              desc = m.descripcion;
              cost = m.costo;
          }
      }
      return [desc, u.quantity.toFixed(2), (u.quantity * cost).toFixed(2)];
    });
    doc.autoTable({ head: [['Material', 'Cantidad Plan.', 'Costo Plan.']], body: bodyRows, startY: startY + 5 });
    
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
  const logoData = localStorage.getItem('companyLogo');
  if (logoData) {
      const getImageDimensions = (dataUrl) => new Promise(resolve => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.src = dataUrl;
      });
      const dims = await getImageDimensions(logoData);
      const maxWidth = 40;
      const maxHeight = 20;
      const ratio = Math.min(maxWidth / dims.width, maxHeight / dims.height);
      const w = dims.width * ratio;
      const h = dims.height * ratio;
      doc.addImage(logoData, 'PNG', 15, 10, w, h);
      logoHeight = h;
  }

  doc.setFontSize(18);
  doc.text('Vale de Almacén', 105, logoHeight > 0 ? 15 + logoHeight : 25, null, null, 'center');

  let startY = (logoHeight > 0 ? 15 + logoHeight : 25) + 15;
  const lineHeight = 7;
  doc.setFontSize(11);

  doc.text(`Vale ID: ${vale.vale_id}`, 15, startY);
  startY += lineHeight;
  doc.text(`Orden: ${vale.order_id}`, 15, startY);
  startY += lineHeight;
  doc.text(`Tipo: ${vale.type === 'salida' ? 'Salida' : 'Devolución'}`, 15, startY);
  startY += lineHeight;
  doc.text(`Fecha: ${formatDate(vale.created_at)}`, 15, startY);

  const bodyRows = vale.materials.map(m => {
    const mat = materials.find(ma => ma.codigo === m.material_code);
    return [mat ? mat.descripcion : m.material_code, m.quantity.toFixed(2), (m.quantity * (mat ? mat.costo : 0)).toFixed(2)];
  });
  doc.autoTable({ head: [['Material', 'Cantidad', 'Costo']], body: bodyRows, startY: startY + 5 });

  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 20;
  doc.setLineWidth(0.2);
  doc.line(60, pageHeight - bottomMargin, 150, pageHeight - bottomMargin);
  doc.setFontSize(10);
  doc.text('Autorizado por:', 105, pageHeight - bottomMargin + 5, null, null, 'center');

  doc.save(`vale_${vale.vale_id}.pdf`);
}
function addFreeFormValeRow() {
    const tbody = document.getElementById('valeMaterialsTableBody');
    const tr = document.createElement('tr');
    tr.classList.add('free-form-row');

    const codeCell = document.createElement('td');
    const descCell = document.createElement('td');
    const stockCell = document.createElement('td');
    const qtyCell = document.createElement('td');

    const codeSelect = document.createElement('select');
    codeSelect.className = 'form-select form-select-sm vale-material-code';
    codeSelect.innerHTML = '<option value="" selected disabled>Selecciona...</option>';
    materials.forEach(m => {
        codeSelect.add(new Option(`${m.codigo} - ${m.descripcion}`, m.codigo));
    });

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

    codeSelect.addEventListener('change', () => {
        const selectedCode = codeSelect.value;
        const material = materials.find(m => m.codigo === selectedCode);
        if (material) {
            descInput.value = material.descripcion;
            stockSpan.textContent = `${material.existencia} ${material.unidad}`;
            qtyInput.dataset.code = material.codigo;
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
}

function generateValePrompt(oid) {
  const ord = productionOrders.find(o => o.order_id === oid);
  document.getElementById('valeOrderId').textContent = oid;
  document.getElementById('valeHiddenOrderId').value = oid;
  const tbody = document.getElementById('valeMaterialsTableBody');
  tbody.innerHTML = '';

  const recipeMaterials = new Set((ord.materials_used || []).map(m => m.material_code));
  recipeMaterials.forEach(code => {
      const m = materials.find(ma => ma.codigo === code);
      if (!m) return;
      tbody.insertAdjacentHTML('beforeend', `
          <tr class="existing-material-row">
              <td><input type="text" class="form-control-plaintext form-control-sm" value="${m.codigo}" readonly></td>
              <td><input type="text" class="form-control-plaintext form-control-sm" value="${m.descripcion}" readonly></td>
              <td>${m.existencia.toFixed(2)} ${m.unidad}</td>
              <td><input type="number" class="form-control form-control-sm vale-material-qty" data-code="${code}" min="0" value="0" step="0.01"></td>
          </tr>
      `);
  });

  tbody.insertAdjacentHTML('beforeend', '<tr><td colspan="4"><hr class="my-2"></td></tr>');
  addFreeFormValeRow();
  addFreeFormValeRow();

  document.getElementById('valeType').value = 'salida';
  valeModal.show();
}

document.getElementById('valeForm').addEventListener('submit', async e => {
  e.preventDefault();
  const oid = parseInt(document.getElementById('valeHiddenOrderId').value);
  const type = document.getElementById('valeType').value;

  const qtyInputs = [...document.querySelectorAll('.vale-material-qty')].filter(input => parseFloat(input.value) > 0);

  if (!qtyInputs.length) {
      Toastify({ text: 'No se ingresaron cantidades.' }).showToast();
      return;
  }

  const mats = qtyInputs.map(input => {
    const code = input.dataset.code;
    const qty = parseFloat(input.value);

    if (!code) return false; 
    
    const mIdx = materials.findIndex(m => m.codigo === code);
    if (mIdx === -1) return false;

    if (type === 'salida' && materials[mIdx].existencia < qty) {
      Toastify({ text: `No hay suficiente ${materials[mIdx].descripcion}` }).showToast();
      return false;
    }
    
    type === 'salida' ? materials[mIdx].existencia -= qty : materials[mIdx].existencia += qty;
    
    return { material_code: code, quantity: qty };
  }).filter(Boolean);

  if (!mats.length) {
    loadMaterials();
    return;
  }
  
  const cost = mats.reduce((a, m) => a + m.quantity * materials.find(ma => ma.codigo === m.material_code).costo, 0) * (type === 'salida' ? 1 : -1);
  const orderIdx = productionOrders.findIndex(o => o.order_id === oid);
  productionOrders[orderIdx].cost_extra += cost;
  const lastVale = vales.filter(v => v.order_id === oid).pop();
  const seq = lastVale ? parseInt(lastVale.vale_id.split('-')[1]) + 1 : 1;
  const valeId = `${oid}-${seq}`;
  const newVale = { vale_id: valeId, order_id: oid, type, created_at: new Date().toISOString().slice(0, 10), materials: mats, cost };
  
  try {
    await setDoc(doc(db, "vales", valeId), newVale);
    vales.push(newVale);

    await updateDoc(doc(db, "productionOrders", oid.toString()), {
        cost_extra: productionOrders[orderIdx].cost_extra
    });

    for (const mat of mats) {
        const m = materials.find(m => m.codigo === mat.material_code);
        await updateDoc(doc(db, "materials", m.codigo), { existencia: m.existencia });
    }

    await generateValePDF(newVale);
    loadProductionOrders();
    loadMaterials();
    bootstrap.Modal.getInstance(document.getElementById('valeModal')).hide();
    Toastify({ text: 'Vale guardado', backgroundColor: 'var(--success-color)' }).showToast();
  } catch (error) {
    console.error("Error saving vale: ", error);
    Toastify({ text: 'Error al guardar el vale', backgroundColor: 'var(--danger-color)' }).showToast();
  }
});

/* ----------  REPORTES  ---------- */
function populateReportFilters() {
    const productFilter = document.getElementById('productFilter');
    productFilter.innerHTML = '<option value="all">Todos</option>';
    products.forEach(p => {
        productFilter.add(new Option(p.descripcion, p.codigo));
    });

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
}

function loadReports() {
  populateReportFilters();
  document.getElementById('applyReportFilters').addEventListener('click', generateAllReports);
  generateAllReports(); // Initial load
}

function getIntermediateProductCodes() {
    const intermediateProducts = new Set();
    Object.values(recipes).flat().forEach(ing => {
        if (ing && ing.type === 'product') {
            intermediateProducts.add(ing.code);
        }
    });
    return intermediateProducts;
}

function generateAllReports() {
  const start = document.getElementById('startDateFilter').value;
  const end = document.getElementById('endDateFilter').value;
  const productId = document.getElementById('productFilter').value;
  const operatorId = document.getElementById('operatorFilter').value;
  const equipoId = document.getElementById('equipoFilter').value;

  const filteredOrders = productionOrders.filter(o => {
    if (o.status !== 'Completada') return false;
    if (start && end) {
        const d = new Date(o.completed_at);
        if (d < new Date(start) || d > new Date(end)) return false;
    }
    if (productId !== 'all' && o.product_code !== productId) return false;
    if (operatorId !== 'all' && o.operator_id !== operatorId) return false;
    if (equipoId !== 'all' && o.equipo_id !== equipoId) return false;
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
                <td>${formatDate(o.completed_at)}</td>
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

function getBaseMaterials(productCode, requiredQty) {
    const baseMaterials = {};
    const recipe = recipes[productCode];

    if (!recipe) return [];

    recipe.forEach(ingredient => {
        const ingredientQty = ingredient.quantity * requiredQty;
        if (ingredient.type === 'product') {
            const subMaterials = getBaseMaterials(ingredient.code, ingredientQty);
            subMaterials.forEach(subMat => {
                baseMaterials[subMat.code] = (baseMaterials[subMat.code] || 0) + subMat.quantity;
            });
        } else {
            baseMaterials[ingredient.code] = (baseMaterials[ingredient.code] || 0) + ingredientQty;
        }
    });
    
    return Object.entries(baseMaterials).map(([code, quantity]) => ({ code, quantity }));
}

function generateMaterialConsumptionReport(orders) {
  const report = {};

  function addMaterialToReport(materialCode, quantity) {
      const material = materials.find(m => m.codigo === materialCode);
      if (!material) return; 

      if (!report[materialCode]) {
          report[materialCode] = { qty: 0, cost: 0, desc: material.descripcion };
      }
      report[materialCode].qty += quantity;
      report[materialCode].cost += quantity * material.costo;
  }

  orders.forEach(o => {
      // Get all base materials based on the actual quantity produced
      const baseMaterials = getBaseMaterials(o.product_code, o.quantity_produced || 0);
      baseMaterials.forEach(bm => {
          addMaterialToReport(bm.code, bm.quantity);
      });

      // Adjust with vales
      vales.filter(v => v.order_id === o.order_id).forEach(vale => {
          const multiplier = vale.type === 'salida' ? 1 : -1;
          vale.materials.forEach(m => {
              addMaterialToReport(m.material_code, m.quantity * multiplier);
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

/* ----------  OPERADORES / LOGO / BACKUP  ---------- */
let isEditingOperator = false, currentOperatorId = null;
const operatorModal = new bootstrap.Modal(document.getElementById('operatorModal'));
function loadOperators() {
  const list = document.getElementById('operatorsList'); list.innerHTML = '';
  operators.forEach(op => list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${op.id} - ${op.name}</span><div><button class="btn btn-sm btn-warning edit-operator-btn me-2" data-id="${op.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-operator-btn" data-id="${op.id}"><i class="fas fa-trash"></i></button></div></li>`));
}
document.getElementById('operatorForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id   = document.getElementById('operatorId').value.trim();
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
  if (btn.classList.contains('edit-operator-btn')) {
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
  const id   = document.getElementById('equipoId').value.trim();
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

/* ----------  LOGO  ---------- */
async function loadLogo() {
    const logoPreview = document.getElementById('logoPreview');
    const noLogoText = document.getElementById('noLogoText');
    try {
        const logoUrl = await getDownloadURL(ref(storage, 'company_logo'));
        logoPreview.src = logoUrl;
        logoPreview.style.display = 'block';
        noLogoText.style.display = 'none';
        localStorage.setItem('companyLogo', logoUrl); // cache it
    } catch (error) {
        if (error.code === 'storage/object-not-found') {
            logoPreview.style.display = 'none';
            noLogoText.style.display = 'block';
        } else {
            console.error("Error loading logo:", error);
        }
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
document.getElementById('exportProductsBtn').addEventListener('click', () => downloadExcel('productos.xlsx', 'Productos', products));
document.getElementById('importProductsBtn').addEventListener('click', () => document.getElementById('productFile').click());
document.getElementById('productFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const importedProducts = json.map(r => ({ codigo: r.codigo || r.Código, descripcion: r.descripcion || r.Descripción, unidad: r.unidad || r.Unidad || '' }));
    
    for (const product of importedProducts) {
        await setDoc(doc(db, "products", product.codigo), {
            descripcion: product.descripcion,
            unidad: product.unidad
        });
    }
    products = await loadCollection('products', 'codigo');
    loadProducts();
    Toastify({ text: 'Productos importados y guardados en la nube', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});
// Materiales
document.getElementById('exportMaterialsBtn').addEventListener('click', () => downloadExcel('materiales.xlsx', 'Materiales', materials));
document.getElementById('importMaterialsBtn').addEventListener('click', () => document.getElementById('materialFile').click());
document.getElementById('materialFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const importedMaterials = json.map(r => ({ codigo: r.codigo || r.Código, descripcion: r.descripcion || r.Descripción, unidad: r.unidad || r.Unidad, existencia: parseFloat(r.existencia || r.Existencia || 0), costo: parseFloat(r.costo || r.Costo || 0) }));

    for (const material of importedMaterials) {
        await setDoc(doc(db, "materials", material.codigo), {
            descripcion: material.descripcion,
            unidad: material.unidad,
            existencia: material.existencia,
            costo: material.costo
        });
    }
    materials = await loadCollection('materials', 'codigo');
    loadMaterials();
    Toastify({ text: 'Materiales importados y guardados en la nube', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});
// Recetas
document.getElementById('exportRecipesBtn').addEventListener('click', () => {
  const flat = [];
  Object.keys(recipes).forEach(prodCode => recipes[prodCode].forEach(ing => flat.push({ producto: prodCode, tipo: ing.type, codigo: ing.code, cantidad: ing.quantity })));
  downloadExcel('recetas.xlsx', 'Recetas', flat);
});
document.getElementById('importRecipesBtn').addEventListener('click', () => document.getElementById('recipeFile').click());
document.getElementById('recipeFile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async (ev) => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const importedRecipes = {};
    json.forEach(r => {
      const prod = r.producto || r.Producto;
      if (!importedRecipes[prod]) importedRecipes[prod] = [];
      const tipoExcel = (r.tipo || r.Tipo || 'material').toLowerCase();
      const tipo = tipoExcel === 'producto' ? 'product' : 'material';
      importedRecipes[prod].push({ type: tipo, code: r.codigo || r.Código, quantity: parseFloat(r.cantidad || r.Cantidad) });
    });

    for (const [productId, recipeItems] of Object.entries(importedRecipes)) {
        await setDoc(doc(db, 'recipes', productId), { items: recipeItems });
    }
    recipes = await loadRecipesCollection();
    loadRecipes();
    populateRecipeProductSelect();
    Toastify({ text: 'Recetas importadas y guardadas en la nube', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});

/* ----------  BACKUP / RESTORE  ---------- */
document.getElementById('backupBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ products, materials, recipes, productionOrders, operators, equipos, vales }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'superproduccion_backup.json'; a.click();
  URL.revokeObjectURL(url);
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

            // Special handling for recipes (object instead of array)
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
function initCharts() {
  if (costChartInstance) costChartInstance.destroy();
  if (productionChartInstance) productionChartInstance.destroy();

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const completedThisMonth = productionOrders.filter(o => {
    if (o.status !== 'Completada' || !o.completed_at) return false;
    const orderDate = new Date(o.completed_at);
    return orderDate.getMonth() === currentMonth && orderDate.getFullYear() === currentYear;
  });

  // Cost Chart (Top 5 products this month by Unit Cost)
  const ctxCost = document.getElementById('costChart');
  if (ctxCost) {
    const costMap = {};
    completedThisMonth.forEach(o => {
        if (!costMap[o.product_name]) {
            costMap[o.product_name] = { total_cost: 0, total_qty: 0 };
        }
        costMap[o.product_name].total_cost += o.cost_real || 0;
        costMap[o.product_name].total_qty += o.quantity_produced || 0;
    });

    const topUnitCost = Object.entries(costMap).map(([name, data]) => ({
      name,
      unit_cost: data.total_qty > 0 ? data.total_cost / data.total_qty : 0
    })).sort((a, b) => b.unit_cost - a.unit_cost).slice(0, 5);

    costChartInstance = new Chart(ctxCost, { 
      type: 'bar', 
      data: { 
        labels: topUnitCost.map(x => x.name), 
        datasets: [{ label: 'Costo Unitario', data: topUnitCost.map(x => x.unit_cost), backgroundColor: '#3498db' }] 
      },
      options: {
        plugins: {
          legend: {
            position: 'bottom',
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            color: '#fff',
            formatter: (value) => formatCurrency(value)
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return formatCurrency(value);
              }
            }
          }
        }
      }
    });
  }

  // Production chart (Top 5 products this month)
  const ctxProd = document.getElementById('productionChart');
  if (ctxProd) {
    const prodMap = {};
    completedThisMonth.forEach(o => {
      prodMap[o.product_name] = (prodMap[o.product_name] || 0) + (o.quantity_produced || 0);
    });
    const topProd = Object.entries(prodMap).map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 5);
      
    productionChartInstance = new Chart(ctxProd, { 
      type: 'bar', 
      data: { 
        labels: topProd.map(x => x.name), 
        datasets: [{ label: 'Unidades', data: topProd.map(x => x.qty), backgroundColor: '#27ae60' }] 
      },
      options: {
        plugins: {
          legend: {
            position: 'bottom',
          },
          datalabels: {
            anchor: 'end',
            align: 'end',
            color: '#fff'
          }
        }
      }
    });
  }
}
