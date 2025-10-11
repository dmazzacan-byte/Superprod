/* global bootstrap, Toastify */
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-storage.js";
import * as state from './state.js';
import { getDb } from './firestore.js';
import { loadAlmacenes, loadOperators, loadEquipos } from './settings.js';

// --- MODULE STATE ---
let currentOnboardingStep = 1;

// --- DOM ELEMENTS ---
const onboardingModal = new bootstrap.Modal(document.getElementById('onboardingModal'));
const onboardingModalElement = document.getElementById('onboardingModal');
const steps = document.querySelectorAll('.onboarding-step');
const prevBtn = document.getElementById('onboardingPrevBtn');
const nextBtn = document.getElementById('onboardingNextBtn');


/**
 * Checks if onboarding is needed and shows the modal if necessary.
 * Onboarding is triggered if it has not been completed before and essential data is missing.
 */
export async function checkAndTriggerOnboarding() {
    const onboardingCompleted = localStorage.getItem('onboardingComplete_v1');
    if (onboardingCompleted) {
        return;
    }

    // Trigger if essential data is missing
    if (state.almacenes.length === 0 && state.operators.length === 0 && state.materials.length === 0) {
        onboardingModal.show();
    }
}

/**
 * Navigates between steps in the onboarding modal.
 * @param {'next'|'prev'} direction - The direction to navigate.
 */
function navigateOnboarding(direction) {
    if (direction === 'next' && currentOnboardingStep < steps.length) {
        currentOnboardingStep++;
    } else if (direction === 'prev' && currentOnboardingStep > 1) {
        currentOnboardingStep--;
    }

    steps.forEach(step => step.style.display = 'none');
    document.getElementById(`onboardingStep${currentOnboardingStep}`).style.display = 'block';

    prevBtn.style.display = currentOnboardingStep > 1 ? 'inline-block' : 'none';
    nextBtn.textContent = currentOnboardingStep === steps.length ? 'Finalizar' : 'Siguiente';
}

/**
 * Handles the logic for the "Next" / "Finish" button in the onboarding modal.
 * It validates and saves data for the current step before proceeding.
 */
async function handleNextOnboardingStep() {
    const db = getDb();

    // --- Validate and Save Data for Current Step ---
    const stepActions = {
        3: async () => { // Almacen step
            const form = document.getElementById('onboardingAlmacenForm');
            if (!form.checkValidity()) { form.reportValidity(); throw new Error("Validation failed"); }
            const id = document.getElementById('onboardingAlmacenId').value.trim().toUpperCase();
            const name = document.getElementById('onboardingAlmacenName').value.trim();
            const isDefault = document.getElementById('onboardingAlmacenDefault').checked;
            await setDoc(doc(db, "almacenes", id), { name, isDefault });
            state.addAlmacen({ id, name, isDefault });
        },
        4: async () => { // Operator step
            const form = document.getElementById('onboardingOperatorForm');
            if (!form.checkValidity()) { form.reportValidity(); throw new Error("Validation failed"); }
            const id = document.getElementById('onboardingOperatorId').value.trim().toUpperCase();
            const name = document.getElementById('onboardingOperatorName').value.trim();
            await setDoc(doc(db, "operators", id), { name });
            state.addOperator({ id, name });
        },
        5: async () => { // Equipo step
            const form = document.getElementById('onboardingEquipoForm');
            if (!form.checkValidity()) { form.reportValidity(); throw new Error("Validation failed"); }
            const id = document.getElementById('onboardingEquipoId').value.trim().toUpperCase();
            const name = document.getElementById('onboardingEquipoName').value.trim();
            await setDoc(doc(db, "equipos", id), { name });
            state.addEquipo({ id, name });
        },
        6: async () => { // Material step
            const form = document.getElementById('onboardingMaterialForm');
            if (!form.checkValidity()) { form.reportValidity(); throw new Error("Validation failed"); }
            const code = document.getElementById('onboardingMaterialCode').value.trim().toUpperCase();
            const desc = document.getElementById('onboardingMaterialDescription').value.trim();
            const unit = document.getElementById('onboardingMaterialUnit').value.trim();
            const cost = parseFloat(document.getElementById('onboardingMaterialCost').value);
            const stock = parseFloat(document.getElementById('onboardingMaterialStock').value);
            const almacenId = document.getElementById('onboardingAlmacenId').value.trim().toUpperCase();
            const materialData = { codigo: code, descripcion: desc, unidad: unit, costo, inventario: { [almacenId]: stock } };
            await setDoc(doc(db, "materials", code), materialData);
            state.addMaterial(materialData);
        }
    };

    try {
        if (stepActions[currentOnboardingStep]) {
            await stepActions[currentOnboardingStep]();
        }
    } catch (error) {
        // Validation error or save error, stop navigation
        console.error("Onboarding step failed:", error);
        return;
    }


    // --- Navigate or Finish ---
    if (currentOnboardingStep === steps.length) {
        localStorage.setItem('onboardingComplete_v1', 'true');
        onboardingModal.hide();
        Toastify({ text: '¡Configuración inicial completada!', backgroundColor: 'var(--success-color)', duration: 5000 }).showToast();
        // Refresh settings page if it's the current one, to show new data
        if (document.getElementById('settingsPage').style.display !== 'none') {
            loadAlmacenes();
            loadOperators();
            loadEquipos();
        }
    } else {
        navigateOnboarding('next');
    }
}

/**
 * Handles the upload of the company logo during onboarding.
 * @param {Event} e - The file input change event.
 */
async function handleOnboardingLogoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const storageRef = ref(getStorage(), 'company_logo');
            await uploadString(storageRef, reader.result, 'data_url');
            const logoUrl = await getDownloadURL(storageRef);
            localStorage.setItem('companyLogo', logoUrl); // cache it
            const preview = document.getElementById('onboardingLogoPreview');
            preview.src = logoUrl;
            preview.style.display = 'block';
            document.getElementById('onboardingNoLogoText').style.display = 'none';
            Toastify({ text: 'Logo guardado.', backgroundColor: 'var(--success-color)' }).showToast();
        } catch (error) {
            console.error("Error uploading logo:", error);
            Toastify({ text: 'Error al guardar el logo.', backgroundColor: 'var(--danger-color)' }).showToast();
        }
    };
    reader.readAsDataURL(file);
}

// --- Event Listeners ---
nextBtn.addEventListener('click', handleNextOnboardingStep);
prevBtn.addEventListener('click', () => navigateOnboarding('prev'));

document.getElementById('onboardingExitBtn').addEventListener('click', () => {
    onboardingModal.hide();
    Toastify({
        text: 'Asistente omitido. Puede configurar manualmente desde Configuración.',
        backgroundColor: 'var(--info-color)',
        duration: 5000
    }).showToast();
});

document.getElementById('onboardingLogoUpload').addEventListener('change', handleOnboardingLogoUpload);