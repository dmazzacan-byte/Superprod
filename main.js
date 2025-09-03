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
let materials  = JSON.parse(localStorage.getItem('materials'))  || [];
let vales      = JSON.parse(localStorage.getItem('vales'))      || [];

let costChartInstance = null, productionChartInstance = null;

/* ----------  UTILS  ---------- */
function generateSequentialOrderId() {
  const nums = productionOrders.map(o => Number(o.order_id)).filter(n => !isNaN(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
function saveToLocalStorage() {
  localStorage.setItem('products', JSON.stringify(products));
  localStorage.setItem('recipes', JSON.stringify(recipes));
  localStorage.setItem('productionOrders', JSON.stringify(productionOrders));
  localStorage.setItem('operators', JSON.stringify(operators));
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
    if (pageId === 'dashboardPage') updateDashboard();
    else if (pageId === 'productsPage') loadProducts();
    else if (pageId === 'materialsPage') loadMaterials();
    else if (pageId === 'recipesPage') { loadRecipes(); populateRecipeProductSelect(); }
    else if (pageId === 'productionOrdersPage') { loadProductionOrders(); populateOrderFormSelects(); }
    else if (pageId === 'reportsPage') loadReports();
    else if (pageId === 'settingsPage') { loadOperators(); loadLogo(); }
  }
  navLinks.forEach(l => l.addEventListener('click', e => { e.preventDefault(); showPage(l.dataset.page); }));
  showPage('dashboardPage');
});

/* ----------  DASHBOARD  ---------- */
function updateDashboard() {
  const completed = productionOrders.filter(o => o.status === 'Completada');
  const pending   = productionOrders.filter(o => o.status === 'Pendiente');
  const realCost  = completed.reduce((a, o) => a + (o.cost_real || 0), 0);
  const overCost  = completed.reduce((a, o) => a + (o.overcost || 0), 0);
  const invValue  = materials.reduce((a, m) => a + m.existencia * m.costo, 0);

  document.getElementById('pendingOrdersCard').textContent   = pending.length;
  document.getElementById('totalCostCard').textContent       = `$${realCost.toFixed(2)}`;
  document.getElementById('inventoryValueCard').textContent  = `$${invValue.toFixed(2)}`;
  document.getElementById('totalOvercostCard').textContent   = `$${overCost.toFixed(2)}`;

  const usedMaterials = new Set();
  Object.values(recipes).flat().forEach(r => usedMaterials.add(r.code));
  const low = materials.filter(m => m.existencia < 10 && usedMaterials.has(m.codigo));
  const tbody = document.getElementById('lowStockTableBody');
  tbody.innerHTML = low.length
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
    .forEach(p => tbody.insertAdjacentHTML('beforeend', `<tr><td>${p.codigo}</td><td>${p.descripcion}</td><td><button class="btn btn-sm btn-warning edit-btn me-2" data-code="${p.codigo}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-btn" data-code="${p.codigo}"><i class="fas fa-trash"></i></button></td></tr>`));
}
document.getElementById('productForm').addEventListener('submit', e => {
  e.preventDefault();
  const code = document.getElementById('productCode').value.trim();
  const desc = document.getElementById('productDescription').value.trim();
  if (!code || !desc) return;
  if (isEditingProduct) {
    const idx = products.findIndex(p => p.codigo === currentProductCode);
    products[idx].descripcion = desc;
  } else {
    if (products.some(p => p.codigo === code)) { Toastify({ text: 'Código duplicado', backgroundColor: 'var(--danger-color)' }).showToast(); return; }
    products.push({ codigo: code, descripcion: desc });
  }
  saveToLocalStorage(); loadProducts(); productModal.hide();
});
document.getElementById('productsTableBody').addEventListener('click', e => {
  const btn = e.target.closest('button'); if (!btn) return;
  const code = btn.dataset.code;
  if (btn.classList.contains('delete-btn')) { products = products.filter(p => p.codigo !== code); saveToLocalStorage(); loadProducts(); }
  if (btn.classList.contains('edit-btn')) { isEditingProduct = true; currentProductCode = code; const p = products.find(p => p.codigo === code); document.getElementById('productCode').value = p.codigo; document.getElementById('productDescription').value = p.descripcion; document.getElementById('productCode').disabled = true; document.getElementById('productModalLabel').textContent = 'Editar Producto'; productModal.show(); }
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
    .forEach(m => tbody.insertAdjacentHTML('beforeend', `<tr><td>${m.codigo}</td><td>${m.descripcion}</td><td>${m.unidad}</td><td>${m.existencia}</td><td>$${m.costo.toFixed(2)}</td><td><button class="btn btn-sm btn-warning edit-btn me-2" data-code="${m.codigo}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-btn" data-code="${m.codigo}"><i class="fas fa-trash"></i></button></td></tr>`));
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
        <td>${prod.descripcion}</td>
        <td>${recipes[pid].length}</td>
        <td>$${cost.toFixed(2)}</td>
        <td>
          <button class="btn btn-sm btn-warning edit-btn me-2" data-product-id="${pid}"><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm btn-danger delete-btn" data-product-id="${pid}"><i class="fas fa-trash"></i></button>
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
  const div = document.createElement('div'); div.className = 'd-flex mb-2 material-field';

  const typeSelect = document.createElement('select'); typeSelect.className = 'form-select type-select me-2';
  ['material', 'product'].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt; o.text = opt === 'material' ? 'Material' : 'Producto'; o.selected = (opt === type);
    typeSelect.appendChild(o);
  });

  const codeSelect = document.createElement('select'); codeSelect.className = 'form-select code-select me-2';
  const fillCodeSelect = () => {
    codeSelect.innerHTML = '';
    const list = typeSelect.value === 'material' ? materials : products;
    list.forEach(item => codeSelect.add(new Option(`${item.codigo} – ${item.descripcion}`, item.codigo)));
    if (mCode) codeSelect.value = mCode;
  };
  typeSelect.addEventListener('change', fillCodeSelect); fillCodeSelect();

  const qtyInput = document.createElement('input');
  qtyInput.type = 'number'; qtyInput.step = '0.01'; qtyInput.className = 'form-control qty-input me-2';
  qtyInput.placeholder = 'Cantidad'; qtyInput.value = qty;

  const delBtn = document.createElement('button');
  delBtn.type = 'button'; delBtn.className = 'btn btn-danger remove-material-btn';
  delBtn.innerHTML = '<i class="fas fa-minus"></i>'; delBtn.onclick = () => div.remove();

  div.append(typeSelect, codeSelect, qtyInput, delBtn);
  container.appendChild(div);
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
// --- Recipe Edit Save ---
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
    const prod = products.find(p => p.codigo === pid);
    document.getElementById('editRecipeProductSelect').innerHTML = `<option value="${pid}">${prod.descripcion}</option>`;
    const cont = document.getElementById('editRecipeMaterials'); cont.innerHTML = '';
    recipes[pid].forEach(i => addRecipeMaterialField('editRecipeMaterials', i.code, i.quantity, i.type));
    editRecipeModal.show();
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

function populateOrderFormSelects() {
  const psel = document.getElementById('orderProductSelect'); psel.innerHTML = '<option disabled selected>Selecciona...</option>';
  products.forEach(p => psel.add(new Option(p.descripcion, p.codigo)));
  const osel = document.getElementById('orderOperatorSelect'); osel.innerHTML = '<option disabled selected>Selecciona...</option>';
  operators.forEach(o => osel.add(new Option(o.name, o.id)));
}
function loadProductionOrders(filter = '') {
  const tbody = document.getElementById('productionOrdersTableBody'); tbody.innerHTML = '';
  productionOrders
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

  // Delegated listeners
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('button'); if (!btn) return;
    const oid = parseInt(btn.dataset.orderId);
    if (btn.classList.contains('view-details-btn')) showOrderDetails(oid);
    else if (btn.classList.contains('pdf-btn')) generateOrderPDF(oid);
    else if (btn.classList.contains('delete-order-btn')) {
      if (confirm(`¿Eliminar orden ${oid}?`)) {
        productionOrders = productionOrders.filter(o => o.order_id !== oid);
        saveToLocalStorage(); loadProductionOrders(); updateDashboard();
      }
    } else if (btn.classList.contains('complete-order-btn')) {
      const ord = productionOrders.find(o => o.order_id === oid);
      document.getElementById('closeHiddenOrderId').value = oid;
      document.getElementById('realQuantityInput').value = ord.quantity;
      confirmCloseOrderModal.show();
    } else if (btn.classList.contains('reopen-order-btn')) reopenOrder(oid);
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

  const statusBadge = document.getElementById('detailStatus');
  statusBadge.textContent = ord.status;
  statusBadge.className = `badge ${ord.status === 'Completada' ? 'bg-success' : 'bg-warning'}`;

  document.getElementById('detailQuantityPlanned').textContent = ord.quantity;
  document.getElementById('detailQuantityProduced').textContent = ord.quantity_produced ?? 'N/A';
  document.getElementById('detailCreatedDate').textContent = ord.created_at;
  document.getElementById('detailCompletedDate').textContent = ord.completed_at ?? 'N/A';

  document.getElementById('detailStandardCost').textContent = `$${(ord.cost_standard || 0).toFixed(2)}`;
  document.getElementById('detailExtraCost').textContent = `$${(ord.cost_extra || 0).toFixed(2)}`;
  document.getElementById('detailRealCost').textContent = ord.cost_real ? `$${ord.cost_real.toFixed(2)}` : 'N/A';

  const overcostEl = document.getElementById('detailOvercost');
  const oc = ord.overcost;
  overcostEl.textContent = oc ? `$${oc.toFixed(2)}` : 'N/A';
  const ocValue = oc || 0;
  overcostEl.className = 'h5 ' + (ocValue > 0 ? 'text-danger' : ocValue < 0 ? 'text-success' : '');

  const materialsTbody = document.getElementById('detailMaterialsTableBody');
  materialsTbody.innerHTML = '';
  // NOTE: This table shows planned materials. Real consumption is not tracked per item.
  ord.materials_used.forEach(u => {
    const m = materials.find(ma => ma.codigo === u.material_code);
    const cost = m ? m.costo * u.quantity : 0;
    materialsTbody.insertAdjacentHTML('beforeend', `
        <tr>
            <td>${u.material_code}</td>
            <td>${m ? m.descripcion : 'N/A'}</td>
            <td>${u.quantity.toFixed(2)}</td>
            <td>$${cost.toFixed(2)}</td>
        </tr>
    `);
  });

  orderDetailsModal.show();
}

document.getElementById('productionOrderForm').addEventListener('submit', e => {
  e.preventDefault();
  const pCode = document.getElementById('orderProductSelect').value;
  const qty   = parseInt(document.getElementById('orderQuantity').value);
  const opId  = document.getElementById('orderOperatorSelect').value;
  if (!pCode || !opId) { Toastify({ text: 'Completa producto y operador' }).showToast(); return; }
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
  
  // NOTE: This logic deducts all planned materials regardless of the real quantity produced.
  ord.materials_used.filter(u => u.type === 'material').forEach(u => {
    const mIdx = materials.findIndex(m => m.codigo === u.material_code);
    if (mIdx !== -1) materials[mIdx].existencia -= u.quantity;
  });

  ord.quantity_produced = realQty;
  ord.status = 'Completada';
  ord.completed_at = new Date().toISOString().slice(0, 10);
  
  // Calculate costs based on the provided logic
  ord.cost_real = (ord.cost_standard || 0) + (ord.cost_extra || 0);
  ord.overcost = ord.cost_real - ((ord.cost_standard_unit || 0) * realQty);

  // Save changes and refresh UI
  saveToLocalStorage(); 
  loadProductionOrders(); 
  loadMaterials(); 
  updateDashboard();

  // Provide user feedback
  Toastify({ text: `Orden ${oid} completada con éxito.`, backgroundColor: 'var(--success-color)' }).showToast();
}
function reopenOrder(oid) {
  const idx = productionOrders.findIndex(o => o.order_id === oid);
  if (idx === -1) return;
  const ord = productionOrders[idx];
  ord.materials_used.filter(u => u.type === 'material').forEach(u => {
    const mIdx = materials.findIndex(m => m.codigo === u.material_code);
    if (mIdx !== -1) materials[mIdx].existencia += u.quantity;
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
function generateOrderPDF(oid) {
  try {
    const { jsPDF } = window.jspdf;
    const ord = productionOrders.find(o => o.order_id === oid);
    if (!ord) {
      Toastify({ text: 'Error: Orden no encontrada para PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
      return;
    }
    const doc = new jsPDF();
    const logo = localStorage.getItem('companyLogo');
    if (logo) doc.addImage(logo, 'PNG', 15, 10, 40, 15);
    doc.setFontSize(20);
    doc.text('Orden de Producción', 105, 20, null, null, 'center');
    doc.setFontSize(12);
    doc.text(`ID de Orden: ${ord.order_id}`, 15, 30);
    doc.text(`Producto: ${ord.product_name}`, 15, 35);
    doc.text(`Operador: ${operators.find(op => op.id === ord.operator_id)?.name || 'N/A'}`, 15, 40);
    doc.text(`Cantidad Planificada: ${ord.quantity}`, 15, 45);
    doc.text(`Cantidad Real Producida: ${ord.quantity_produced || 'N/A'}`, 15, 50);
    doc.text(`Costo Estándar: $${(ord.cost_standard || 0).toFixed(2)}`, 15, 55);
    doc.text(`Costo Extra: $${(ord.cost_extra || 0).toFixed(2)}`, 15, 60);
    doc.text(`Costo Real Total: $${ord.cost_real ? ord.cost_real.toFixed(2) : 'N/A'}`, 15, 65);
    doc.text(`Sobrecosto: $${(ord.overcost || 0).toFixed(2)}`, 15, 70);
    const bodyRows = ord.materials_used.map(u => {
      const m = materials.find(ma => ma.codigo === u.material_code);
      return [m ? m.descripcion : u.material_code, u.quantity, (u.quantity * (m ? m.costo : 0)).toFixed(2)];
    });
    doc.autoTable({ head: [['Material', 'Cantidad', 'Costo']], body: bodyRows, startY: 80 });
    doc.save(`orden_${ord.order_id}.pdf`);
  } catch (error) {
    console.error(`Error al generar PDF para orden ${oid}:`, error);
    Toastify({ text: 'No se pudo generar el PDF.', backgroundColor: 'var(--danger-color)' }).showToast();
  }
}
function generateValePDF(vale) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const logo = localStorage.getItem('companyLogo');
  if (logo) doc.addImage(logo, 'PNG', 15, 10, 40, 15);
  doc.setFontSize(18);
  doc.text('Vale de Almacén', 105, 25, null, null, 'center');
  doc.setFontSize(11);
  doc.text(`Vale ID: ${vale.vale_id}`, 15, 40);
  doc.text(`Orden: ${vale.order_id}`, 15, 47);
  doc.text(`Tipo: ${vale.type === 'salida' ? 'Salida' : 'Devolución'}`, 15, 54);
  doc.text(`Fecha: ${vale.created_at}`, 15, 61);
  const bodyRows = vale.materials.map(m => {
    const mat = materials.find(ma => ma.codigo === m.material_code);
    return [mat ? mat.descripcion : m.material_code, m.quantity, (m.quantity * (mat ? mat.costo : 0)).toFixed(2)];
  });
  doc.autoTable({ head: [['Material', 'Cantidad', 'Costo']], body: bodyRows, startY: 75 });
  doc.save(`vale_${vale.vale_id}.pdf`);
}
function generateValePrompt(oid) {
  const ord = productionOrders.find(o => o.order_id === oid);
  document.getElementById('valeOrderId').textContent = oid;
  document.getElementById('valeHiddenOrderId').value = oid;
  const tbody = document.getElementById('valeMaterialsTableBody'); tbody.innerHTML = '';
  const allUsed = {};
  ord.materials_used.forEach(u => allUsed[u.material_code] = (allUsed[u.material_code] || 0) + u.quantity);
  vales.filter(v => v.order_id === oid).forEach(v => v.materials.forEach(m => allUsed[m.material_code] = (allUsed[m.material_code] || 0) + m.quantity));
  Object.keys(allUsed).forEach(code => {
    const m = materials.find(ma => ma.codigo === code);
    if (!m) return;
    tbody.insertAdjacentHTML('beforeend', `<tr><td>${m.descripcion}</td><td>${m.existencia} ${m.unidad}</td><td><input type="number" class="form-control form-control-sm" data-code="${code}" min="0" value="0" step="0.01"></td></tr>`);
  });
  document.getElementById('valeType').value = 'salida';
  valeModal.show();
}
document.getElementById('valeForm').addEventListener('submit', e => {
  e.preventDefault();
  const oid = parseInt(document.getElementById('valeHiddenOrderId').value);
  const type = document.getElementById('valeType').value;
  const rows = [...document.querySelectorAll('#valeMaterialsTableBody tr')].filter(r => parseFloat(r.querySelector('input').value) > 0);
  if (!rows.length) return;
  const mats = rows.map(r => {
    const code = r.querySelector('input').dataset.code;
    const qty = parseFloat(r.querySelector('input').value);
    const mIdx = materials.findIndex(m => m.codigo === code);
    if (mIdx === -1) return false;
    if (type === 'salida' && materials[mIdx].existencia < qty) {
      Toastify({ text: `No hay suficiente ${materials[mIdx].descripcion}` }).showToast();
      return false;
    }
    type === 'salida' ? materials[mIdx].existencia -= qty : materials[mIdx].existencia += qty;
    return { material_code: code, quantity: qty };
  }).filter(Boolean);
  if (!mats.length) return;
  const cost = mats.reduce((a, m) => a + m.quantity * materials.find(ma => ma.codigo === m.material_code).costo, 0) * (type === 'salida' ? 1 : -1);
  const orderIdx = productionOrders.findIndex(o => o.order_id === oid);
  productionOrders[orderIdx].cost_extra += cost;
  const lastVale = vales.filter(v => v.order_id === oid).pop();
  const seq = lastVale ? parseInt(lastVale.vale_id.split('-')[1]) + 1 : 1;
  const valeId = `${oid}-${seq}`;
  const newVale = { vale_id: valeId, order_id: oid, type, created_at: new Date().toISOString().slice(0, 10), materials: mats, cost };
  vales.push(newVale);
  generateValePDF(newVale);
  saveToLocalStorage(); loadProductionOrders(); loadMaterials();
  bootstrap.Modal.getInstance(document.getElementById('valeModal')).hide();
});

/* ----------  REPORTES  ---------- */
function loadReports() {
  document.getElementById('applyReportFilters').addEventListener('click', generateAllReports);
  generateAllReports();
}
function generateAllReports() {
  const start = document.getElementById('startDateFilter').value;
  const end = document.getElementById('endDateFilter').value;
  const filtered = productionOrders.filter(o => {
    if (o.status !== 'Completada') return false;
    if (!start || !end) return true;
    const d = new Date(o.completed_at);
    return d >= new Date(start) && d <= new Date(end);
  });
  generateOperatorReport(filtered);
  generateMaterialConsumptionReport(filtered);
}
function generateOperatorReport(orders) {
  const report = {};
  orders.forEach(o => {
    const op = operators.find(op => op.id === o.operator_id);
    const name = op ? op.name : o.operator_id;
    if (!report[name]) report[name] = { completed: 0, units: 0, cost: 0, over: 0 };
    report[name].completed += 1; report[name].units += o.quantity_produced; report[name].cost += o.cost_real || 0; report[name].over += o.overcost || 0;
  });
  const tbody = document.getElementById('operatorReportTableBody');
  tbody.innerHTML = Object.keys(report).map(name => {
    const r = report[name];
    return `<tr><td>${name}</td><td>${r.completed}</td><td>${r.units}</td><td>$${r.cost.toFixed(2)}</td><td>$${r.over.toFixed(2)}</td></tr>`;
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
    products = json.map(r => ({ codigo: r.codigo || r.Código, descripcion: r.descripcion || r.Descripción }));
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
      recipes[prod].push({ type: r.tipo || r.Tipo, code: r.codigo || r.Código, quantity: parseFloat(r.cantidad || r.Cantidad) });
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
  // Cost Chart (Top 5 products)
  const ctxCost = document.getElementById('costChart');
  if (ctxCost) {
    const top = Object.keys(recipes)
      .map(pid => ({ product: products.find(p => p.codigo === pid)?.descripcion || pid, cost: calculateRecipeCost(recipes[pid]) }))
      .sort((a, b) => b.cost - a.cost).slice(0, 5);
    new Chart(ctxCost, { type: 'bar', data: { labels: top.map(x => x.product), datasets: [{ label: 'Costo', data: top.map(x => x.cost), backgroundColor: '#3498db' }] } });
  }

  // Production chart (Top 5 products)
  const ctxProd = document.getElementById('productionChart');
  if (ctxProd) {
    const prodMap = {};
    productionOrders.filter(o => o.status === 'Completada').forEach(o => {
      prodMap[o.product_name] = (prodMap[o.product_name] || 0) + (o.quantity_produced || 0);
    });
    const topProd = Object.entries(prodMap).map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty).slice(0, 5);
    new Chart(ctxProd, { type: 'bar', data: { labels: topProd.map(x => x.name), datasets: [{ label: 'Unidades', data: topProd.map(x => x.qty), backgroundColor: '#27ae60' }] } });
  }
}
document.addEventListener('DOMContentLoaded', initCharts);
