/* global bootstrap, Toastify, XLSX */
import { doc, setDoc, deleteDoc, getDocs, collection } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { downloadExcel } from './utils.js';
import { populateOrderFormSelects } from './orders.js';

// --- MODULE STATE ---
let isEditingOperator = false, currentOperatorId = null;
let isEditingEquipo = false, currentEquipoId = null;
let isEditingAlmacen = false, currentAlmacenId = null;
let isEditingUser = false;

// --- DOM ELEMENTS ---
const operatorModal = new bootstrap.Modal(document.getElementById('operatorModal'));
const equipoModal = new bootstrap.Modal(document.getElementById('equipoModal'));
const almacenModal = new bootstrap.Modal(document.getElementById('almacenModal'));
const userModal = new bootstrap.Modal(document.getElementById('userModal'));

// --- OPERATORS ---

export function loadOperators() {
    const list = document.getElementById('operatorsList');
    list.innerHTML = '';
    state.operators.forEach(op => {
        list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${op.id} - ${op.name}</span><div><button class="btn btn-sm btn-warning edit-operator-btn me-2" data-id="${op.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-operator-btn" data-id="${op.id}"><i class="fas fa-trash"></i></button></div></li>`);
    });
}

document.getElementById('operatorForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('operatorId').value.trim().toUpperCase();
    const name = document.getElementById('operatorName').value.trim();
    if (!id || !name) return;

    try {
        await setDoc(doc(getDb(), "operators", id), { name });
        if (isEditingOperator) {
            state.updateOperatorInState(currentOperatorId, { name });
        } else {
            state.addOperator({ id, name });
        }
        loadOperators();
        populateOrderFormSelects(); // Refresh selects in other forms
        operatorModal.hide();
        Toastify({ text: 'Operador guardado', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        Toastify({ text: 'Error al guardar operador', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});

document.getElementById('operatorsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-operator-btn')) {
        if (confirm(`¿Eliminar operador ${id}?`)) {
            await deleteDoc(doc(getDb(), "operators", id));
            state.deleteOperatorFromState(id);
            loadOperators();
            populateOrderFormSelects();
            Toastify({ text: 'Operador eliminado', backgroundColor: 'var(--success-color)' }).showToast();
        }
    }
    if (btn.classList.contains('edit-operator-btn')) {
        isEditingOperator = true;
        currentOperatorId = id;
        const op = state.operators.find(op => op.id === id);
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

// --- EQUIPOS ---

export function loadEquipos() {
    const list = document.getElementById('equiposList');
    list.innerHTML = '';
    state.equipos.forEach(eq => {
        list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${eq.id} - ${eq.name}</span><div><button class="btn btn-sm btn-warning edit-equipo-btn me-2" data-id="${eq.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-equipo-btn" data-id="${eq.id}"><i class="fas fa-trash"></i></button></div></li>`);
    });
}

document.getElementById('equipoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('equipoId').value.trim().toUpperCase();
    const name = document.getElementById('equipoName').value.trim();
    if (!id || !name) return;
    try {
        await setDoc(doc(getDb(), "equipos", id), { name });
        if (isEditingEquipo) {
            state.updateEquipoInState(currentEquipoId, { name });
        } else {
            state.addEquipo({ id, name });
        }
        loadEquipos();
        populateOrderFormSelects();
        equipoModal.hide();
        Toastify({ text: 'Equipo guardado', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        Toastify({ text: 'Error al guardar equipo', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});

document.getElementById('equiposList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-equipo-btn')) {
        if (confirm(`¿Eliminar equipo ${id}?`)) {
            await deleteDoc(doc(getDb(), "equipos", id));
            state.deleteEquipoFromState(id);
            loadEquipos();
            populateOrderFormSelects();
            Toastify({ text: 'Equipo eliminado', backgroundColor: 'var(--success-color)' }).showToast();
        }
    }
    if (btn.classList.contains('edit-equipo-btn')) {
        isEditingEquipo = true;
        currentEquipoId = id;
        const eq = state.equipos.find(eq => eq.id === id);
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


// --- ALMACENES ---

export function loadAlmacenes() {
    const list = document.getElementById('almacenesList');
    list.innerHTML = '';
    state.almacenes.forEach(almacen => {
        const isDefault = almacen.isDefault ? '<span class="badge bg-info ms-2">Producción</span>' : '';
        list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>ID:</strong> ${almacen.id} - ${almacen.name}${isDefault}</span><div><button class="btn btn-sm btn-warning edit-almacen-btn me-2" data-id="${almacen.id}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-almacen-btn" data-id="${almacen.id}"><i class="fas fa-trash"></i></button></div></li>`);
    });
}

document.getElementById('almacenForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('almacenId').value.trim().toUpperCase();
    const name = document.getElementById('almacenName').value.trim();
    const isDefault = document.getElementById('almacenDefault').checked;
    if (!id || !name) return;

    try {
        if (isDefault) {
            // Ensure only one warehouse is default
            const updatePromises = state.almacenes
                .filter(a => a.isDefault && a.id !== id)
                .map(a => setDoc(doc(getDb(), "almacenes", a.id), { ...a, isDefault: false }));
            await Promise.all(updatePromises);
            state.almacenes.forEach(a => { if (a.isDefault && a.id !== id) a.isDefault = false; });
        }

        await setDoc(doc(getDb(), "almacenes", id), { name, isDefault });
        const idx = state.almacenes.findIndex(a => a.id === id);
        if (idx !== -1) {
            state.updateAlmacenInState(id, { name, isDefault });
        } else {
            state.addAlmacen({ id, name, isDefault });
        }
        loadAlmacenes();
        almacenModal.hide();
        Toastify({ text: 'Almacén guardado', backgroundColor: 'var(--success-color)' }).showToast();
    } catch (error) {
        Toastify({ text: 'Error al guardar almacén', backgroundColor: 'var(--danger-color)' }).showToast();
    }
});

document.getElementById('almacenesList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('delete-almacen-btn')) {
        if (confirm(`¿Eliminar almacén ${id}?`)) {
            await deleteDoc(doc(getDb(), "almacenes", id));
            state.deleteAlmacenFromState(id);
            loadAlmacenes();
            Toastify({ text: 'Almacén eliminado', backgroundColor: 'var(--success-color)' }).showToast();
        }
    }
    if (btn.classList.contains('edit-almacen-btn')) {
        isEditingAlmacen = true;
        currentAlmacenId = id;
        const almacen = state.almacenes.find(a => a.id === id);
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


// --- USERS ---

export function loadUsers() {
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    state.users.forEach(u => {
        list.insertAdjacentHTML('beforeend', `<li class="list-group-item d-flex justify-content-between align-items-center"><span>${u.email} <span class="badge bg-secondary">${u.role}</span></span><div><button class="btn btn-sm btn-warning edit-user-btn" data-uid="${u.uid}"><i class="fas fa-edit"></i></button><button class="btn btn-sm btn-danger delete-user-btn" data-uid="${u.uid}"><i class="fas fa-trash"></i></button></div></li>`);
    });
}

document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('userEmail').value;
    const role = document.getElementById('userRole').value;
    const uid = document.getElementById('userUid').value;

    if (uid) {
        await setDoc(doc(getDb(), "users", uid), { email, role });
        state.updateUserInState(uid, { email, role });
        loadUsers();
        userModal.hide();
        Toastify({ text: 'Rol de usuario guardado.', backgroundColor: 'var(--success-color)' }).showToast();
    }
});

document.getElementById('usersList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const uid = btn.dataset.uid;
    if (btn.classList.contains('edit-user-btn')) {
        const user = state.users.find(u => u.uid === uid);
        if (user) {
            isEditingUser = true;
            document.getElementById('userUid').value = user.uid;
            document.getElementById('userEmail').value = user.email;
            document.getElementById('userEmail').disabled = true;
            document.getElementById('userRole').value = user.role;
            userModal.show();
        }
    }
    if (btn.classList.contains('delete-user-btn')) {
        if (confirm('¿Eliminar el rol de este usuario? (El usuario no será eliminado de la autenticación)')) {
            await deleteDoc(doc(getDb(), "users", uid));
            state.deleteUserFromState(uid);
            loadUsers();
            Toastify({ text: 'Rol de usuario eliminado.', backgroundColor: 'var(--success-color)' }).showToast();
        }
    }
});

document.getElementById('userModal').addEventListener('hidden.bs.modal', () => {
    isEditingUser = false;
    document.getElementById('userForm').reset();
    document.getElementById('userEmail').disabled = false;
});


// --- LOGO ---

export async function getLogoUrl() {
    const cachedLogo = localStorage.getItem('companyLogo');
    if (cachedLogo) return cachedLogo;

    try {
        const logoUrl = await getDownloadURL(ref(getStorage(), 'company_logo'));
        localStorage.setItem('companyLogo', logoUrl);
        return logoUrl;
    } catch (error) {
        return null; // Object not found is not a critical error
    }
}

export async function loadLogo() {
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
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const storageRef = ref(getStorage(), 'company_logo');
            await uploadString(storageRef, reader.result, 'data_url');
            const logoUrl = await getDownloadURL(storageRef);
            localStorage.setItem('companyLogo', logoUrl);
            loadLogo();
            Toastify({ text: 'Logo guardado', backgroundColor: 'var(--success-color)' }).showToast();
        } catch (error) {
            Toastify({ text: 'Error al guardar el logo', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    };
    reader.readAsDataURL(file);
});


// --- BACKUP / RESTORE & EXCEL ---

document.getElementById('backupBtn').addEventListener('click', () => {
    const dataToBackup = {
        products: state.products,
        materials: state.materials,
        recipes: state.recipes,
        productionOrders: state.productionOrders,
        operators: state.operators,
        equipos: state.equipos,
        vales: state.vales,
        traspasos: state.traspasos,
        maintenanceEvents: state.maintenanceEvents,
        users: state.users,
        almacenes: state.almacenes
    };
    const blob = new Blob([JSON.stringify(dataToBackup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `operis_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('restoreBtn').addEventListener('click', () => document.getElementById('importBackupFile').click());

document.getElementById('importBackupFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('¿Restaurar desde esta copia? Esta acción sobreescribirá TODOS los datos actuales.')) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
        const loader = document.getElementById('loader');
        loader.style.display = 'flex';
        try {
            const data = JSON.parse(ev.target.result);
            const db = getDb();

            // A map of collection names to their data and ID field
            const collectionsToSync = {
                products: { data: data.products || [], idField: 'codigo' },
                materials: { data: data.materials || [], idField: 'codigo' },
                operators: { data: data.operators || [], idField: 'id' },
                equipos: { data: data.equipos || [], idField: 'id' },
                productionOrders: { data: data.productionOrders || [], idField: 'order_id' },
                vales: { data: data.vales || [], idField: 'vale_id' },
                almacenes: { data: data.almacenes || [], idField: 'id'},
                users: {data: data.users || [], idField: 'uid'}
                // ... add other collections here
            };

            for (const [name, { data: collectionData, idField }] of Object.entries(collectionsToSync)) {
                const snapshot = await getDocs(collection(db, name));
                // Delete existing docs
                await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
                // Write new docs
                await Promise.all(collectionData.map(item => setDoc(doc(db, name, item[idField].toString()), item)));
            }

            // Special handling for recipes (object, not array)
            const recipesSnapshot = await getDocs(collection(db, 'recipes'));
            await Promise.all(recipesSnapshot.docs.map(d => deleteDoc(d.ref)));
            if (data.recipes) {
                 await Promise.all(Object.entries(data.recipes).map(([id, items]) => setDoc(doc(db, 'recipes', id), { items })));
            }

            Toastify({ text: 'Datos restaurados. Recargando...', backgroundColor: 'var(--success-color)' }).showToast();
            setTimeout(() => location.reload(), 3000);
        } catch (error) {
            Toastify({ text: `Error al restaurar: ${error.message}`, duration: -1, backgroundColor: 'var(--danger-color)' }).showToast();
        } finally {
            loader.style.display = 'none';
        }
    };
    reader.readAsText(file);
});

// --- EXCEL EXPORT/IMPORT ---

// Add listeners for individual Excel exports
document.getElementById('exportProductsBtn').addEventListener('click', () => downloadExcel('productos.xlsx', 'Productos', state.products));
document.getElementById('exportMaterialsBtn').addEventListener('click', () => downloadExcel('materiales.xlsx', 'Materiales', state.materials.map(m => ({...m, inventario: JSON.stringify(m.inventario)}))));
document.getElementById('exportRecipesBtn').addEventListener('click', () => {
    const flat = Object.entries(state.recipes).flatMap(([prodCode, items]) => items.map(ing => ({ producto: prodCode, tipo: ing.type, codigo: ing.code, cantidad: ing.quantity })));
    downloadExcel('recetas.xlsx', 'Recetas', flat);
});

// Add listeners for individual Excel imports
document.getElementById('importProductsBtn').addEventListener('click', () => document.getElementById('productFile').click());
document.getElementById('productFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        for (const r of json) {
            const product = { codigo: (r.codigo || r.Código)?.toString().toUpperCase(), descripcion: r.descripcion || r.Descripción, unidad: r.unidad || r.Unidad || '' };
            if (product.codigo) {
                await setDoc(doc(getDb(), "products", product.codigo), { descripcion: product.descripcion, unidad: product.unidad });
            }
        }
        state.setProducts(await collection(getDb(), 'products', 'codigo'));
        loadProducts();
        Toastify({ text: 'Productos importados.', backgroundColor: 'var(--success-color)' }).showToast();
    };
    reader.readAsBinaryString(file);
});

// (Add similar import listeners for materials and recipes if needed)
document.getElementById('importMaterialsBtn').addEventListener('click', () => document.getElementById('materialFile').click());
document.getElementById('importRecipesBtn').addEventListener('click', () => document.getElementById('recipeFile').click());
document.getElementById('exportAllRecipesPdfBtn').addEventListener('click', () => { /* Logic for this is in utils or recipes now */ });