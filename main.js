// -----------------------------------------------------------------------------
//  Superproducción – Gestión de Producción
//  main.js  (final – all fixes + improvements included)
// -----------------------------------------------------------------------------
/* global bootstrap, XLSX, jsPDF, html2canvas, Toastify */

/* ----------  BASE DE DATOS LOCAL  ---------- */
let products   = JSON.parse(localStorage.getItem('products'))   || [];
let recipes    = JSON.parse(localStorage.getItem('recipes'))    || {};
let productionOrders = JSON.parse(localStorage.getItem('productionOrders')) || [];
let operators  = JSON.parse(localStorage.getItem('operators'))  || [];
let equipos    = JSON.parse(localStorage.getItem('equipos'))    || [];
let materials  = JSON.parse(localStorage.getItem('materials'))  || [];
let vales      = JSON.parse(localStorage.getItem('vales'))      || [];

let costChartInstance = null, productionChartInstance = null;

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

function saveToLocalStorage() {
  localStorage.setItem('products', JSON.stringify(products));
  localStorage.setItem('recipes', JSON.stringify(recipes));
  localStorage.setItem('productionOrders', JSON.stringify(productionOrders));
  localStorage.setItem('operators', JSON.stringify(operators));
  localStorage.setItem('equipos', JSON.stringify(equipos));
  localStorage.setItem('materials', JSON.stringify(materials));
  localStorage.setItem('vales', JSON.stringify(vales));
}

/* ----------  NAVEGACIÓN  ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const navLinks = document.querySelectorAll('.nav-link');
  const pages    = document.querySelectorAll('.page-content');

  function showPage(pageId) {
    pages.forEach(p => p.style.display = 'none');
    document.getElementById(pageId).style.display = 'block';
    navLinks.forEach(l => l.classList.remove('active'));
    document.querySelector(`[data-page="${pageId}"]`).classList.add('active');
    if (pageId === 'dashboardPage') {
        updateDashboard();
        updateTimestamps();
    } else if (pageId === 'productsPage') {
        loadProducts();
    } else if (pageId === 'materialsPage') {
        loadMaterials();
    } else if (pageId === 'recipesPage') {
        loadRecipes();
        populateRecipeProductSelect();
    } else if (pageId === 'productionOrdersPage') {
        loadProductionOrders();
        populateOrderFormSelects();
    } else if (pageId === 'reportsPage') {
        loadReports();
        updateTimestamps();
    } else if (pageId === 'settingsPage') {
        loadOperators();
        loadEquipos();
        loadLogo();
    }
  }
  navLinks.forEach(l => l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.page); }));
  
  // PDF and Print Buttons
  document.getElementById('dashboardPdfBtn')?.addEventListener('click', () => generatePagePDF('dashboardPage', 'dashboard.pdf'));
  document.getElementById('dashboardPrintBtn')?.addEventListener('click', () => printPage('dashboardPage'));
  document.getElementById('reportsPdfBtn')?.addEventListener('click', () => generatePagePDF('reportsPage', 'reporte.pdf'));
  document.getElementById('reportsPrintBtn')?.addEventListener('click', () => printPage('reportsPage'));
  
  document.getElementById('toggleOrderSortBtn')?.addEventListener('click', () => {
    orderSortDirection = orderSortDirection === 'asc' ? 'desc' : 'asc';
    const icon = document.querySelector('#toggleOrderSortBtn i');
    icon.className = orderSortDirection === 'asc' ? 'fas fa-sort-amount-up-alt' : 'fas fa-sort-amount-down-alt';
    loadProductionOrders(document.getElementById('searchOrder').value);
  });

  showPage('dashboardPage');
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
  document.getElementById('totalCostCard').textContent = `$${realCost.toFixed(2)}`;
  document.getElementById('totalOvercostCard').textContent = `$${overCost.toFixed(2)}`;
  
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
  overcostRankBody.innerHTML = sortedByOvercost.map((op, i) => `<tr><td>${i + 1}</td><td>${op.name}</td><td>$${op.overcost.toFixed(2)}</td></tr>`).join('');

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

  const usedMaterials = new Set();
  Object.values(recipes).flat().forEach(r => usedMaterials.add(r.code));
  const low = materials.filter(m => m.existencia < 10 && usedMaterials.has(m.codigo));
  const lowStockTbody = document.getElementById('lowStockTableBody');
  lowStockTbody.innerHTML = low.length
    ? low.map(m => `<tr><td>${m.descripcion}</td><td>${m.existencia}</td><td>${m.unidad}</td></tr>`).join('')
    : '<tr><td colspan="3" class="text-center">Sin alertas</td></tr>';
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
document.getElementById('productForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = document.getElementById('productCode').value.trim();
  const desc = document.getElementById('productDescription').value.trim();
  const unit = document.getElementById('productUnit').value.trim();
  if (!code || !desc) return;
  if (isEditingProduct) {
    const idx = products.findIndex(p => p.codigo === currentProductCode);
    if (idx !== -1) {
      products[idx].descripcion = desc;
      products[idx].unidad = unit;
    }
  } else {
    if (products.some(p => p.codigo === code)) { Toastify({ text: 'Código duplicado', backgroundColor: 'var(--danger-color)' }).showToast(); return; }
    products.push({ codigo: code, descripcion: desc, unidad: unit });
  }
  saveToLocalStorage(); loadProducts(); productModal.hide();
});
document.getElementById('productsTableBody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const code = btn.dataset.code;
  if (btn.classList.contains('delete-btn')) { products = products.filter(p => p.codigo !== code); saveToLocalStorage(); loadProducts(); }
  if (btn.classList.contains('edit-btn')) { isEditingProduct = true; currentProductCode = code; const p = products.find(p => p.codigo === code); document.getElementById('productCode').value = p.codigo; document.getElementById('productDescription').value = p.descripcion; document.getElementById('productUnit').value = p.unidad || ''; document.getElementById('productCode').disabled = true; document.getElementById('productModalLabel').textContent = 'Editar Producto'; productModal.show(); }
});
document.getElementById('productModal').addEventListener('hidden.bs.modal', () => { isEditingProduct = false; document.getElementById('productForm').reset(); document.getElementById('productCode').disabled = false; document.getElementById('productModalLabel').textContent = 'Añadir Producto'; });
document.getElementById('searchProduct').addEventListener('input', e => loadProducts(e.target.value));

/* ----------  MATERIALES  ---------- */
let isEditingMaterial = false, currentMaterialCode = null;
const materialModal = new bootstrap.Modal(document.getElementById('materialModal'));
function loadMaterials(filter = '') {
  const tbody = document.getElementById('materialsTableBody'); tbody.innerHTML = '';
  materials.sort((a, b) => a.codigo.localeCompare(b.codigo));
  materials.filter(m => !filter || m.codigo.includes(filter) || m.descripcion.toLowerCase().includes(filter.toLowerCase()))
    .forEach(m => tbody.insertAdjacentHTML('beforeend', `<tr><td>${m.codigo}</td><td>${m.descripcion}</td><td>${m.unidad}</td><td>${m.existencia}</td><td>$${m.costo.toFixed(2)}</td><td><button class="btn btn-sm btn-warning edit-btn me-2" data-code="${m.codigo}" title="Editar"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-btn" data-code="${m.codigo}" title="Eliminar"><i class="fas fa-trash"></i></button></td></tr>`));
}
document.getElementById('materialForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = document.getElementById('materialCode').value.trim();
  const desc = document.getElementById('materialDescription').value.trim();
  const unit = document.getElementById('materialUnit').value.trim();
  const exist = parseFloat(document.getElementById('materialExistence').value);
  const cost = parseFloat(document.getElementById('materialCost').value);
  if (!code || !desc) return;
  const idx = materials.findIndex(m => m.codigo === code);
  if (idx === -1) {
    materials.push({ codigo: code, descripcion: desc, unidad: unit, existencia: exist, costo: cost });
  } else {
    materials[idx].descripcion = desc;
    materials[idx].unidad = unit;
    materials[idx].existencia = exist;
    materials[idx].costo = cost;
  }
  saveToLocalStorage(); loadMaterials(); materialModal.hide();
});
document.getElementById('materialsTableBody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const code = btn.dataset.code;
  if (btn.classList.contains('delete-btn')) { materials = materials.filter(m => m.codigo !== code); saveToLocalStorage(); loadMaterials(); }
  if (btn.classList.contains('edit-btn')) { isEditingMaterial = true; currentMaterialCode = code; const m = materials.find(m => m.codigo === code); ['materialCode', 'materialDescription', 'materialUnit', 'materialExistence', 'materialCost'].forEach((id, i) => document.getElementById(id).value = [m.codigo, m.descripcion, m.unidad, m.existencia, m.costo][i]); document.getElementById('materialCode').disabled = true; document.getElementById('materialModalLabel').textContent = 'Editar Material'; materialModal.show(); }
});
document.getElementById('materialModal').addEventListener('hidden.bs.modal', () => { isEditingMaterial = false; document.getElementById('materialForm').reset(); document.getElementById('materialCode').disabled = false; document.getElementById('materialModalLabel').textContent = 'Añadir Material'; });
document.getElementById('searchMaterial').addEventListener('input', e => loadMaterials(e.target.value));

/* ----------  RECETAS  ---------- */
const addRecipeModal  = new bootstrap.Modal(document.getElementById('addRecipeModal'));
const editRecipeModal = new bootstrap.Modal(document.getElementById('editRecipeModal'));

function loadRecipes() {
  const tbody = document.getElementById('recipesTableBody'); tbody.innerHTML = '';
  const sorted = Object.keys(recipes).sort((a, b) => a.localeCompare(b));
  sorted.forEach(pid => {
    const prod = products.find(p => p.codigo === pid);
    if (!prod) return;
    const cost = calculateRecipeCost(recipes[pid]);
    tbody.insertAdjacentHTML('beforeend', `
      <tr>
        <td>${prod.codigo}</td>
        <td>${prod.descripcion}</td>
        <td>${recipes[pid].length}</td>
        <td>$${cost.toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-warning edit-btn me-2" data-product-id="${pid}" title="Editar"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-btn" data-product-id="${pid}" title="Eliminar"><i class="fas fa-trash"></i></button>
        </td>
      </tr>`);
  });
}
function calculateRecipeCost(items) {
  return items.reduce((acc, it) => {
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
  qtyInput.step = '0.001';
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

  const createCol = (className, element) => {
      const col = document.createElement('div');
      col.className = className;
      col.appendChild(element);
      return col;
  };
  
  row.append(
    createCol('col-md-2', typeSelect),
    createCol('col-md-3', codeSelect),
    createCol('col-md-4', descInput),
    createCol('col-md-2', qtyInput),
    createCol('col-md-1 text-center', delBtn)
  );
  
  container.appendChild(row);
  populateCodeSelect();
}
document.getElementById('addRecipeForm').addEventListener('submit', e => {
  e.preventDefault();
  const pid = document.getElementById('recipeProductSelect').value;
  const items = [...document.querySelectorAll('#recipeMaterials .material-field')]
    .map(f => ({ type: f.querySelector('.type-select').value, code: f.querySelector('.code-select').value, quantity: parseFloat(f.querySelector('.qty-input').value) }))
    .filter(i => i.code && !isNaN(i.quantity));
  if (!items.length) { Toastify({ text: 'Agrega al menos un ingrediente' }).showToast(); return; }
  recipes[pid] = items;
  saveToLocalStorage(); loadRecipes(); addRecipeModal.hide();
});
document.getElementById('editRecipeForm').addEventListener('submit', e => {
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
  recipes[pid] = items;
  saveToLocalStorage(); loadRecipes(); editRecipeModal.hide();
});
document.getElementById('recipesTableBody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const pid = btn.dataset.productId;
  if (btn.classList.contains('delete-btn')) { delete recipes[pid]; saveToLocalStorage(); loadRecipes(); }
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
  const tbody = document.getElementById('productionOrdersTableBody'); tbody.innerHTML = '';
  
  const sortedOrders = [...productionOrders].sort((a, b) => {
    if (orderSortDirection === 'asc') return a.order_id - b.order_id;
    return b.order_id - a.order_id;
  });

  sortedOrders
    .filter(o => !filter || o.order_id.toString().includes(filter) || (o.product_name || '').toLowerCase().includes(filter.toLowerCase()))
    .forEach(o => {
      const oc = o.overcost || 0;
      const ocColor = oc > 0 ? 'text-danger' : oc < 0 ? 'text-success' : '';
      tbody.insertAdjacentHTML('beforeend', `
        <tr>
          <td>${o.order_id}</td>
          <td>${o.product_name || 'N/A'}</td>
          <td>${o.quantity} / ${o.quantity_produced ?? 'N/A'}</td>
          <td>$${(o.cost_real || 0).toFixed(2)}</td>
          <td class="${ocColor}">$${oc.toFixed(2)}</td>
          <td><span class="badge ${o.status === 'Completada' ? 'bg-success' : 'bg-warning'}">${o.status}</span></td>
          <td>
            <button class="btn btn-sm btn-info view-details-btn" data-order-id="${o.order_id}" title="Ver"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-danger pdf-btn" data-order-id="${o.order_id}" title="PDF"><i class="fas fa-file-pdf"></i></button>
            ${o.status === 'Pendiente'
              ? `<button class="btn btn-sm btn-primary" onclick="generateValePrompt(${o.order_id})" title="Crear Vale"><i class="fas fa-plus-circle"></i></button>
                 <button class="btn btn-sm btn-success complete-order-btn" data-order-id="${o.order_id}" title="Completar"><i class="fas fa-check"></i></button>
                 <button class="btn btn-sm btn-danger delete-order-btn" data-order-id="${o.order_id}" title="Eliminar"><i class="fas fa-trash"></i></button>`
              : `<button class="btn btn-sm btn-secondary reopen-order-btn" data-order-id="${o.order_id}" title="Reabrir"><i class="fas fa-undo"></i></button>`}
          </td>
        </tr>`);
    });

  tbody.addEventListener('click', async e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const oid = parseInt(btn.dataset.orderId);
    if (btn.classList.contains('view-details-btn')) {
      showOrderDetails(oid);
    } else if (btn.classList.contains('pdf-btn')) {
      await generateOrderPDF(oid);
    } else if (btn.classList.contains('delete-order-btn')) {
      if (confirm(`¿Eliminar orden ${oid}?`)) {
        productionOrders = productionOrders.filter(o => o.order_id !== oid);
        saveToLocalStorage(); loadProductionOrders(); updateDashboard();
      }
    } else if (btn.classList.contains('complete-order-btn')) {
      const ord = productionOrders.find(o => o.order_id === oid);
      document.getElementById('closeHiddenOrderId').value = oid;
      document.getElementById('realQuantityInput').value = ord.quantity;
      confirmCloseOrderModal.show();
    } else if (btn.classList.contains('reopen-order-btn')) {
      reopenOrder(oid);
    }
  });
}

function showOrderDetails(oid) {
  const ord = productionOrders.find(o => o.order_id === oid);
  if (!ord) {
    Toastify({ text: 'Orden no encontrada', backgroundColor: 'var(--danger-color)' }).showToast();
    return;
  }

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
  
  const realQty = ord.quantity_produced || 0;
  const standardCost = (ord.cost_standard_unit || 0) * realQty;
  const extraCost = ord.cost_extra || 0;
  const realTotalCost = standardCost + extraCost;

  document.getElementById('detailStandardCost').textContent = `$${standardCost.toFixed(2)}`;
  document.getElementById('detailExtraCost').textContent = `$${extraCost.toFixed(2)}`;
  document.getElementById('detailRealCost').textContent = ord.status === 'Completada' ? `$${realTotalCost.toFixed(2)}` : 'N/A';
  
  const displayOvercost = ord.overcost;
  const overcostEl = document.getElementById('detailOvercost');
  overcostEl.textContent = displayOvercost ? `$${displayOvercost.toFixed(2)}` : 'N/A';
  const ocValue = displayOvercost || 0;
  overcostEl.className = 'h5 ' + (ocValue > 0 ? 'text-danger' : ocValue < 0 ? 'text-success' : '');

  const materialsSummary = {};
  const recipeItems = recipes[ord.product_code] || [];
  
  recipeItems.forEach(recipeMat => {
    let itemInfo = {
        descripcion: 'N/A',
        costo_unit: 0
    };

    if (recipeMat.type === 'product') {
        const p = products.find(prod => prod.codigo === recipeMat.code);
        if (p) {
            itemInfo.descripcion = p.descripcion;
        }
        itemInfo.costo_unit = calculateRecipeCost(recipes[recipeMat.code] || []);
    } else { // 'material'
        const m = materials.find(mat => mat.codigo === recipeMat.code);
        if (m) {
            itemInfo.descripcion = m.descripcion;
            itemInfo.costo_unit = m.costo;
        }
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
    vales.filter(v => v.order_id === oid).forEach(vale => {
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
  for (const [code, mat] of Object.entries(materialsSummary)) {
    const cost_real = mat.qty_real * mat.costo_unit;
    materialsTbody.insertAdjacentHTML('beforeend', `
        <tr>
            <td>${code}</td>
            <td>${mat.descripcion}</td>
            <td>${mat.qty_plan.toFixed(2)} / <strong class="ms-1">${mat.qty_real.toFixed(2)}</strong></td>
            <td>$${mat.cost_plan.toFixed(2)} / <strong class="ms-1">$${cost_real.toFixed(2)}</strong></td>
        </tr>
    `);
  }
  
  orderDetailsModal.show();
}

document.getElementById('productionOrderForm').addEventListener('submit', e => {
  e.preventDefault();
  const pCode = document.getElementById('orderProductSelect').value;
  const qty   = parseInt(document.getElementById('orderQuantity').value);
  const opId  = document.getElementById('orderOperatorSelect').value;
  const eqId  = document.getElementById('orderEquipoSelect').value;
  if (!pCode || !opId || !eqId) { Toastify({ text: 'Completa producto, operador y equipo' }).showToast(); return; }
  const prod = products.find(p => p.codigo === pCode);
  if (!recipes[pCode]) { Toastify({ text: `Sin receta para ${prod.descripcion}` }).showToast(); return; }
  const stdCost = calculateRecipeCost(recipes[pCode]) * qty;
  productionOrders.push({
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
  });
  saveToLocalStorage(); loadProductionOrders(); populateOrderFormSelects(); productionOrderModal.hide();
});
document.getElementById('confirmCloseOrderForm').addEventListener('submit', e => {
  e.preventDefault();
  const oid = parseInt(document.getElementById('closeHiddenOrderId').value);
  const realQty = parseFloat(document.getElementById('realQuantityInput').value);
  completeOrder(oid, realQty);
  bootstrap.Modal.getInstance(document.getElementById('confirmCloseOrderModal')).hide();
});
function completeOrder(oid, realQty) {
  const idx = productionOrders.findIndex(o => o.order_id === oid);
  if (idx === -1) return;
  const ord = productionOrders[idx];
  
  (ord.materials_used || []).forEach(orderMat => {
    if (orderMat.type !== 'material') return;
    const mIdx = materials.findIndex(m => m.codigo === orderMat.material_code);
    if (mIdx !== -1) {
      const perUnitQty = (ord.quantity > 0) ? (orderMat.quantity / ord.quantity) : 0;
      const consumedQty = perUnitQty * realQty;
      materials[mIdx].existencia -= consumedQty;
    }
  });

  ord.quantity_produced = realQty;
  ord.status = 'Completada';
  ord.completed_at = new Date().toISOString().slice(0, 10);
  
  ord.cost_real = (ord.cost_standard || 0) + (ord.cost_extra || 0);
  ord.overcost = ord.cost_real - ((ord.cost_standard_unit || 0) * realQty);

  saveToLocalStorage(); 
  loadProductionOrders(); 
  loadMaterials(); 
  updateDashboard();

  Toastify({ text: `Orden ${oid} completada con éxito.`, backgroundColor: 'var(--success-color)' }).showToast();
}
function reopenOrder(oid) {
  const idx = productionOrders.findIndex(o => o.order_id === oid);
  if (idx === -1) return;
  const ord = productionOrders[idx];
  (ord.materials_used || []).forEach(orderMat => {
    if (orderMat.type !== 'material') return;
    const mIdx = materials.findIndex(m => m.codigo === orderMat.material_code);
    if (mIdx !== -1) {
      const perUnitQty = (ord.quantity > 0) ? (orderMat.quantity / ord.quantity) : 0;
      const consumedQty = perUnitQty * (ord.quantity_produced || 0);
      materials[mIdx].existencia += consumedQty;
    }
  });
  vales.filter(v => v.order_id === oid).forEach(v => {
    v.materials.forEach(m => {
      const mIdx = materials.findIndex(ma => ma.codigo === m.material_code);
      if (mIdx !== -1) materials[mIdx].existencia += (v.type === 'salida' ? 1 : -1) * m.quantity;
    });
  });
  ord.status = 'Pendiente'; ord.completed_at = null; ord.quantity_produced = null; ord.cost_real = null; ord.overcost = null;
  saveToLocalStorage(); loadProductionOrders(); loadMaterials(); updateDashboard();
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

  const recipeMaterials = new Set(ord.materials_used.map(m => m.material_code));
  recipeMaterials.forEach(code => {
      const m = materials.find(ma => ma.codigo === code);
      if (!m) return;
      tbody.insertAdjacentHTML('beforeend', `
          <tr class="existing-material-row">
              <td><input type="text" class="form-control-plaintext form-control-sm" value="${m.codigo}" readonly></td>
              <td><input type="text" class="form-control-plaintext form-control-sm" value="${m.descripcion}" readonly></td>
              <td>${m.existencia} ${m.unidad}</td>
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
  vales.push(newVale);
  await generateValePDF(newVale);
  saveToLocalStorage();
  loadProductionOrders();
  loadMaterials();
  bootstrap.Modal.getInstance(document.getElementById('valeModal')).hide();
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

function generateAllReports() {
  const start = document.getElementById('startDateFilter').value;
  const end = document.getElementById('endDateFilter').value;
  const productId = document.getElementById('productFilter').value;
  const operatorId = document.getElementById('operatorFilter').value;
  const equipoId = document.getElementById('equipoFilter').value;

  const filteredOrders = productionOrders.filter(o => {
    // Status filter (currently only completed orders are considered for reports)
    if (o.status !== 'Completada') return false;

    // Date filter
    if (start && end) {
        const d = new Date(o.completed_at);
        if (d < new Date(start) || d > new Date(end)) return false;
    }
    
    // Product filter
    if (productId !== 'all' && o.product_code !== productId) return false;

    // Operator filter
    if (operatorId !== 'all' && o.operator_id !== operatorId) return false;

    // Equipo filter
    if (equipoId !== 'all' && o.equipo_id !== equipoId) return false;

    return true;
  });

  // Generate all report tables with the filtered data
  generateDetailedOrdersReport(filteredOrders);
  generateProductPerformanceReport(filteredOrders);
  generateOperatorReport(filteredOrders);
  generateMaterialConsumptionReport(filteredOrders);
}

function generateOperatorReport(orders) {
  const report = {};
  orders.forEach(o => {
    const op = operators.find(op => op.id === o.operator_id);
    const name = op ? op.name : o.operator_id;
    if (!report[name]) report[name] = { completed: 0, units: 0, over: 0 };
    report[name].completed += 1;
    report[name].units += o.quantity_produced || 0;
    report[name].over += o.overcost || 0;
  });
  const tbody = document.getElementById('operatorReportTableBody');
  tbody.innerHTML = Object.entries(report).map(([name, r]) => {
    return `<tr><td>${name}</td><td>${r.completed}</td><td>${r.units}</td><td>$${r.over.toFixed(2)}</td></tr>`;
  }).join('');
}

function generateDetailedOrdersReport(orders) {
    const tbody = document.getElementById('detailedOrdersTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    orders.forEach(o => {
        const operator = operators.find(op => op.id === o.operator_id);
        const overcostColor = (o.overcost || 0) > 0 ? 'text-danger' : ((o.overcost || 0) < 0 ? 'text-success' : '');
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td>${o.order_id}</td>
                <td>${o.product_name}</td>
                <td>${operator ? operator.name : 'N/A'}</td>
                <td>${o.quantity}</td>
                <td>${o.quantity_produced || 'N/A'}</td>
                <td>$${(o.cost_real || 0).toFixed(2)}</td>
                <td class="${overcostColor}">$${(o.overcost || 0).toFixed(2)}</td>
                <td><span class="badge bg-success">${o.status}</span></td>
                <td>${formatDate(o.completed_at)}</td>
            </tr>
        `);
    });
}

function generateProductPerformanceReport(orders) {
    const tbody = document.getElementById('productReportTableBody');
    if (!tbody) return;
    const report = {};
    orders.forEach(o => {
        if (!report[o.product_name]) {
            report[o.product_name] = { completed: 0, units: 0, over: 0 };
        }
        report[o.product_name].completed += 1;
        report[o.product_name].units += o.quantity_produced || 0;
        report[o.product_name].over += o.overcost || 0;
    });

    tbody.innerHTML = Object.entries(report).map(([name, r]) => {
        return `<tr>
            <td>${name}</td>
            <td>${r.completed}</td>
            <td>${r.units}</td>
            <td>$${r.over.toFixed(2)}</td>
        </tr>`;
    }).join('');
}

function generateMaterialConsumptionReport(orders) {
  const report = {};
  orders.forEach(o => {
    o.materials_used.forEach(u => {
      if (u.type !== 'material') return;
      if (!report[u.material_code]) report[u.material_code] = { qty: 0, cost: 0 };
      report[u.material_code].qty += u.quantity;
      const m = materials.find(ma => ma.codigo === u.material_code);
      report[u.material_code].cost += u.quantity * (m ? m.costo : 0);
    });
    vales.filter(v => v.order_id === o.order_id).forEach(v => v.materials.forEach(m => {
      if (!report[m.material_code]) report[m.material_code] = { qty: 0, cost: 0 };
      report[m.material_code].qty += m.quantity;
      const mat = materials.find(ma => ma.codigo === m.material_code);
      report[m.material_code].cost += m.quantity * (mat ? mat.costo : 0);
    }));
  });
  const tbody = document.getElementById('materialReportTableBody');
  tbody.innerHTML = Object.keys(report).map(code => {
    const m = materials.find(ma => ma.codigo === code);
    const r = report[code];
    return `<tr><td>${m ? m.descripcion : code}</td><td>${r.qty.toFixed(2)}</td><td>$${r.cost.toFixed(2)}</td></tr>`;
  }).join('');
}

/* ----------  OPERADORES / LOGO / BACKUP  ---------- */
let isEditingOperator = false, currentOperatorId = null;
const operatorModal = new bootstrap.Modal(document.getElementById('operatorModal'));
function loadOperators() {
  const list = document.getElementById('operatorsList'); list.innerHTML = '';
  operators.forEach(op => list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${op.id} - ${op.name}</span><div><button class="btn btn-sm btn-warning edit-operator-btn me-2" data-id="${op.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-operator-btn" data-id="${op.id}"><i class="fas fa-trash"></i></button></div></li>`));
}
document.getElementById('operatorForm').addEventListener('submit', e => {
  e.preventDefault();
  const id   = document.getElementById('operatorId').value.trim();
  const name = document.getElementById('operatorName').value.trim();
  if (!id || !name) return;
  if (isEditingOperator) {
    const idx = operators.findIndex(op => op.id === currentOperatorId);
    operators[idx] = { id, name };
  } else {
    if (operators.some(op => op.id === id)) { Toastify({ text: 'ID duplicado', backgroundColor: 'var(--danger-color)' }).showToast(); return; }
    operators.push({ id, name });
  }
  saveToLocalStorage(); loadOperators(); populateOrderFormSelects(); operatorModal.hide();
});
document.getElementById('operatorsList').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const id = btn.dataset.id;
  if (btn.classList.contains('delete-operator-btn')) { operators = operators.filter(op => op.id !== id); saveToLocalStorage(); loadOperators(); populateOrderFormSelects(); }
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
document.getElementById('equipoForm').addEventListener('submit', e => {
  e.preventDefault();
  const id   = document.getElementById('equipoId').value.trim();
  const name = document.getElementById('equipoName').value.trim();
  if (!id || !name) return;
  if (isEditingEquipo) {
    const idx = equipos.findIndex(eq => eq.id === currentEquipoId);
    equipos[idx] = { id, name };
  } else {
    if (equipos.some(eq => eq.id === id)) { Toastify({ text: 'ID duplicado', backgroundColor: 'var(--danger-color)' }).showToast(); return; }
    equipos.push({ id, name });
  }
  saveToLocalStorage(); loadEquipos(); populateOrderFormSelects(); equipoModal.hide();
});
document.getElementById('equiposList').addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-equipo-btn')) { equipos = equipos.filter(eq => eq.id !== id); saveToLocalStorage(); loadEquipos(); populateOrderFormSelects(); }
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
function loadLogo() {
  const logo = localStorage.getItem('companyLogo');
  const logoPreview = document.getElementById('logoPreview');
  const noLogoText = document.getElementById('noLogoText');
  if (logo) { logoPreview.src = logo; logoPreview.style.display = 'block'; noLogoText.style.display = 'none'; }
  else { logoPreview.style.display = 'none'; noLogoText.style.display = 'block'; }
}
document.getElementById('logoUpload').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { localStorage.setItem('companyLogo', reader.result); loadLogo(); Toastify({ text: 'Logo guardado correctamente', backgroundColor: 'var(--success-color)' }).showToast(); }
    catch { Toastify({ text: 'Error al guardar el logo', backgroundColor: 'var(--danger-color)' }).showToast(); }
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
document.getElementById('productFile').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    products = json.map(r => ({ codigo: r.codigo || r.Código, descripcion: r.descripcion || r.Descripción, unidad: r.unidad || r.Unidad || '' }));
    saveToLocalStorage(); loadProducts();
    Toastify({ text: 'Productos importados', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});
// Materiales
document.getElementById('exportMaterialsBtn').addEventListener('click', () => downloadExcel('materiales.xlsx', 'Materiales', materials));
document.getElementById('importMaterialsBtn').addEventListener('click', () => document.getElementById('materialFile').click());
document.getElementById('materialFile').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    materials = json.map(r => ({ codigo: r.codigo || r.Código, descripcion: r.descripcion || r.Descripción, unidad: r.unidad || r.Unidad, existencia: parseFloat(r.existencia || r.Existencia || 0), costo: parseFloat(r.costo || r.Costo || 0) }));
    saveToLocalStorage(); loadMaterials();
    Toastify({ text: 'Materiales importados', backgroundColor: 'var(--success-color)' }).showToast();
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
document.getElementById('recipeFile').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const wb = XLSX.read(ev.target.result, { type: 'binary' });
    const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    recipes = {};
    json.forEach(r => {
      const prod = r.producto || r.Producto;
      if (!recipes[prod]) recipes[prod] = [];
      const tipo = (r.tipo || r.Tipo || 'material').toLowerCase();
      recipes[prod].push({ type: tipo, code: r.codigo || r.Código, quantity: parseFloat(r.cantidad || r.Cantidad) });
    });
    saveToLocalStorage(); loadRecipes(); populateRecipeProductSelect();
    Toastify({ text: 'Recetas importadas', backgroundColor: 'var(--success-color)' }).showToast();
  };
  reader.readAsBinaryString(file);
});

/* ----------  BACKUP / RESTORE  ---------- */
document.getElementById('backupBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ products, materials, recipes, productionOrders, operators, vales }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'superproduccion_backup.json'; a.click();
  URL.revokeObjectURL(url);
});
document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('importBackupFile').click());
document.getElementById('importBackupFile').addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      products = data.products || [];
      materials = data.materials || [];
      recipes = data.recipes || {};
      productionOrders = data.productionOrders || [];
      operators = data.operators || [];
      vales = data.vales || [];
      saveToLocalStorage();
      Toastify({ text: 'Datos restaurados', backgroundColor: 'var(--success-color)' }).showToast();
      location.reload();
    } catch {
      Toastify({ text: 'Archivo JSON inválido', backgroundColor: 'var(--danger-color)' }).showToast();
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

  // Cost Chart (Top 5 products this month)
  const ctxCost = document.getElementById('costChart');
  if (ctxCost) {
    const costMap = {};
    completedThisMonth.forEach(o => {
        costMap[o.product_name] = (costMap[o.product_name] || 0) + (o.cost_real || 0);
    });
    const topCost = Object.entries(costMap).map(([name, cost]) => ({ name, cost }))
      .sort((a, b) => b.cost - a.cost).slice(0, 5);

    costChartInstance = new Chart(ctxCost, { 
      type: 'bar', 
      data: { 
        labels: topCost.map(x => x.name), 
        datasets: [{ label: 'Costo', data: topCost.map(x => x.cost), backgroundColor: '#3498db' }] 
      },
      options: { plugins: { datalabels: { anchor: 'end', align: 'top', formatter: (value, context) => `$${value.toFixed(2)}` } } }
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
      options: { plugins: { datalabels: { anchor: 'end', align: 'top' } } }
    });
  }
}
document.addEventListener('DOMContentLoaded', () => {
    Chart.register(ChartDataLabels);
    initCharts();
});
