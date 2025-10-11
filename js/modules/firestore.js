import { getFirestore, collection, getDocs, doc, setDoc, updateDoc, deleteField } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import * as state from './state.js';

let db;

export function initializeFirestore(app) {
    db = getFirestore(app);
}

export function getDb() {
    return db;
}

/**
 * Loads a specified collection from Firestore.
 * @param {string} collectionName - The name of the collection to load.
 * @param {string} idField - The name of the field to store the document ID in.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of documents.
 */
export async function loadCollection(collectionName, idField) {
    try {
        const querySnapshot = await getDocs(collection(db, collectionName));
        const data = [];
        querySnapshot.forEach((doc) => {
            const docData = doc.data();
            // Ensure the ID field is correctly assigned, especially for numeric IDs
            docData[idField] = idField === 'order_id' ? parseInt(doc.id, 10) : doc.id;
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

/**
 * Loads the recipes collection from Firestore, structuring it as an object.
 * @returns {Promise<object>} A promise that resolves to the recipes object.
 */
export async function loadRecipesCollection() {
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

/**
 * Checks for and performs a one-time data migration to a multi-warehouse inventory structure.
 */
async function migrateDataToMultiAlmacen() {
    const migrationKey = 'migration_multi_almacen_done_v1';
    if (localStorage.getItem(migrationKey)) {
        return;
    }

    Toastify({ text: 'Primera ejecución: Actualizando estructura de datos a multi-almacén...', duration: 6000, backgroundColor: 'var(--info-color)' }).showToast();

    // Ensure the GENERAL warehouse exists before proceeding
    let generalAlmacen = state.almacenes.find(a => a.id === 'GENERAL');
    if (!generalAlmacen) {
        console.log("Creando almacén 'GENERAL' por primera vez.");
        generalAlmacen = { id: 'GENERAL', name: 'Almacén General', isDefault: false };
        try {
            await setDoc(doc(db, "almacenes", "GENERAL"), generalAlmacen);
            state.addAlmacen(generalAlmacen);
        } catch (e) {
            console.error("Error crítico al crear el almacén GENERAL. La migración no puede continuar.", e);
            Toastify({ text: 'Error al crear almacén base. La migración falló.', backgroundColor: 'var(--danger-color)', duration: -1 }).showToast();
            return;
        }
    }

    const migrationPromises = [];
    state.materials.forEach(material => {
        // Check for the old structure: 'existencia' is a number and 'inventario' is undefined.
        if (typeof material.existencia === 'number' && typeof material.inventario === 'undefined') {
            const newInventario = { 'GENERAL': material.existencia };

            const docRef = doc(db, "materials", material.codigo);
            migrationPromises.push(updateDoc(docRef, {
                inventario: newInventario,
                existencia: deleteField() // Remove the old field
            }));

            // Immediately update local state to reflect the change
            material.inventario = newInventario;
            delete material.existencia;
        }
    });

    if (migrationPromises.length > 0) {
        try {
            await Promise.all(migrationPromises);
            Toastify({ text: `Migración completada para ${migrationPromises.length} materiales.`, backgroundColor: 'var(--success-color)' }).showToast();
            localStorage.setItem(migrationKey, 'true');
        } catch (error) {
            console.error('Error during data migration:', error);
            Toastify({ text: 'Error durante la migración de datos. Revise la consola.', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    } else {
        // If no migrations were needed, still set the key to prevent re-running this check.
        localStorage.setItem(migrationKey, 'true');
    }
}


/**
 * Loads all essential data from Firestore to initialize the application.
 */
export async function loadInitialData() {
    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    try {
        // Production orders are now loaded via a real-time listener,
        // so they are removed from the initial batch load.
        const promises = [
            loadCollection('products', 'codigo'),
            loadCollection('materials', 'codigo'),
            loadCollection('operators', 'id'),
            loadCollection('equipos', 'id'),
            loadCollection('vales', 'vale_id'),
            loadCollection('almacenes', 'id'),
            loadCollection('traspasos', 'traspaso_id'),
            loadCollection('maintenance_events', 'id'),
            loadRecipesCollection()
        ];

        // Only load users if the current user is an administrator
        if (state.currentUserRole?.toLowerCase() === 'administrator') {
            promises.push(loadCollection('users', 'uid'));
        }

        const [
            productsData,
            materialsData,
            operatorsData,
            equiposData,
            valesData,
            almacenesData,
            traspasosData,
            maintenanceEventsData,
            recipesData,
            usersData // This will be undefined if the promise wasn't added
        ] = await Promise.all(promises);

        // Set the data in the central state
        state.setProducts(productsData);
        state.setMaterials(materialsData);
        state.setOperators(operatorsData);
        state.setEquipos(equiposData);
        state.setVales(valesData);
        state.setAlmacenes(almacenesData);
        state.setTraspasos(traspasosData);
        state.setMaintenanceEvents(maintenanceEventsData);
        state.setRecipes(recipesData);
        if (usersData) state.setUsers(usersData);

        // After loading initial data, run the migration check
        await migrateDataToMultiAlmacen();

    } catch (error) {
        console.error("Error loading initial data from Firestore:", error);
        Toastify({ text: 'Error al cargar datos de la nube. Verifique la conexión y configuración de Firebase.', backgroundColor: 'var(--danger-color)', duration: 10000 }).showToast();
    } finally {
        if (loader) loader.style.display = 'none';
    }
}