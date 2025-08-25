import { saveToLocalStorage, materials, loadProducts, updateGlobalData } from './main.js';

let materialTable = null;

export function loadMaterials() {
    // ... lógica para cargar la tabla de materiales (sin cambios) ...
}

function addMaterial(material) {
    const existingMaterial = materials.find(m => m.code === material.code);
    if (existingMaterial) {
        alert('Ya existe un material con este código. Por favor, use uno diferente.');
        return false;
    }
    const updatedMaterials = [...materials, material];
    updateGlobalData('materials', updatedMaterials);
    loadMaterials();
    alert('Material añadido con éxito.');
    return true;
}

function deleteMaterial(code) {
    const updatedMaterials = materials.filter(m => m.code !== code);
    updateGlobalData('materials', updatedMaterials);
    loadMaterials();
    loadProducts(); // para que se actualice la lista de materiales en la receta
    alert('Material eliminado con éxito.');
}

// ... (El resto de la lógica de listeners se mantiene igual)
