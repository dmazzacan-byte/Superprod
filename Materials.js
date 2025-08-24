import { saveToLocalStorage, materials, loadProducts, products, recipes } from './main.js';

let materialTable = null;

// Función para cargar los materiales en la tabla
export function loadMaterials() {
    const tableBody = document.getElementById('materialsTableBody');
    tableBody.innerHTML = ''; // Limpiar la tabla
    
    materials.forEach((material, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${material.code}</td>
            <td>${material.description}</td>
            <td>${material.unit}</td>
            <td>${material.existence}</td>
            <td>${material.cost.toFixed(2)}</td>
            <td>
                <button type="button" class="btn btn-sm btn-danger delete-material-btn" data-code="${material.code}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });

    if (materialTable) {
        materialTable.destroy();
    }
    materialTable = new DataTable('#materialsTable', {
        responsive: true,
        destroy: true, // Destruye la instancia anterior
        lengthMenu: [
            [5, 10, 25, 50, -1],
            [5, 10, 25, 50, "Todos"]
        ]
    });
}

// Función para añadir un material
function addMaterial(material) {
    const existingMaterial = materials.find(m => m.code === material.code);
    if (existingMaterial) {
        alert('Ya existe un material con este código. Por favor, use uno diferente.');
        return false;
    }
    materials.push(material);
    saveToLocalStorage();
    loadMaterials();
    alert('Material añadido con éxito.');
    return true;
}

// Función para eliminar un material
function deleteMaterial(code) {
    materials = materials.filter(m => m.code !== code);
    saveToLocalStorage();
    loadMaterials();
    loadProducts(); // para que se actualice la lista de materiales en la receta
    alert('Material eliminado con éxito.');
}

// Función para manejar el formulario de agregar material
function handleAddMaterialForm(event) {
    event.preventDefault();
    const materialCode = document.getElementById('addMaterialCode').value.trim();
    const materialDescription = document.getElementById('addMaterialDescription').value.trim();
    const materialUnit = document.getElementById('addMaterialUnit').value.trim();
    const materialExistence = parseInt(document.getElementById('addMaterialExistence').value);
    const materialCost = parseFloat(document.getElementById('addMaterialCost').value);

    if (addMaterial({ code: materialCode, description: materialDescription, unit: materialUnit, existence: materialExistence, cost: materialCost })) {
        document.getElementById('addMaterialForm').reset();
    }
}

// Función para manejar la carga de archivos de materiales
function handleImportMaterialsFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        const importedMaterials = json.slice(1).map(row => ({
            code: String(row[0]).trim(),
            description: String(row[1]).trim(),
            unit: String(row[2]).trim(),
            existence: parseFloat(row[3]) || 0,
            cost: parseFloat(row[4]) || 0
        })).filter(material => material.code && material.description && material.unit);

        if (importedMaterials.length > 0) {
            importedMaterials.forEach(newMaterial => {
                const existingIndex = materials.findIndex(m => m.code === newMaterial.code);
                if (existingIndex !== -1) {
                    materials[existingIndex] = newMaterial; // Actualizar
                } else {
                    materials.push(newMaterial); // Añadir
                }
            });
            saveToLocalStorage();
            loadMaterials();
            alert('Datos de materiales importados y/o actualizados correctamente.');
        } else {
            alert('No se encontraron datos válidos de materiales en el archivo.');
        }
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// Inicializar todos los listeners del módulo
export function initializeMaterialsListeners() {
    document.getElementById('addMaterialForm').addEventListener('submit', handleAddMaterialForm);
    document.getElementById('materialsTableBody').addEventListener('click', (e) => {
        if (e.target.closest('.delete-material-btn')) {
            const code = e.target.closest('.delete-material-btn').dataset.code;
            if (confirm(`¿Estás seguro de que quieres eliminar el material con código "${code}"?`)) {
                deleteMaterial(code);
            }
        }
    });
    document.getElementById('importMaterials').addEventListener('change', handleImportMaterialsFile);
}
