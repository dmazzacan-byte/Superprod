import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { clientConfigs } from '/config.js';
import * as state from './state.js';
import { initializeFirestore, getDb, loadInitialData } from './firestore.js';
import { initializeAppContent, showLoginPage, showAppPage, setupProductionOrdersListener } from './ui.js';

let app;
let auth;
let storage; // Storage might be needed by other modules, so we initialize it here

// DOM Elements
const loginView = document.getElementById('loginView');
const appView = document.getElementById('appView');
const loginForm = document.getElementById('loginForm');
const logoutBtn = document.getElementById('logoutBtn');
const userDataDiv = document.getElementById('userData');
const loginBtn = document.getElementById('loginBtn');
const clientSelector = document.getElementById('clientSelector');


/**
 * Fetches the role for a given user ID from the 'users' collection.
 * @param {string} uid - The user's unique ID.
 * @returns {Promise<string|null>} The user's role or null if not found.
 */
async function getUserRole(uid) {
    const db = getDb();
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
        return userDoc.data().role;
    }
    return null;
}

/**
 * Handles the process after a user has successfully logged in.
 * Fetches user role, sets up listeners, and initializes the main app content.
 * @param {object} user - The Firebase user object.
 */
async function handleSuccessfulLogin(user) {
    const splashScreen = document.getElementById('splashScreen');
    const db = getDb();
    try {
        let role = await getUserRole(user.uid);

        // If user has no role, check if they are the first user for this client
        if (!role) {
            const usersSnapshot = await getDocs(collection(db, "users"));
            if (usersSnapshot.empty) {
                console.log(`First user login for this client. Assigning 'Administrator' role to ${user.email}`);
                const adminRole = { role: 'Administrator', email: user.email };
                await setDoc(doc(db, "users", user.uid), adminRole);
                role = 'Administrator';
                Toastify({ text: 'Primer usuario detectado. Se ha asignado el rol de Administrador.', backgroundColor: 'var(--info-color)', duration: 8000 }).showToast();
            } else {
                 Toastify({ text: `Error: El usuario ${user.email} no tiene un rol asignado. Contacte al administrador.`, backgroundColor: 'var(--danger-color)', duration: -1 }).showToast();
                 await handleLogout(); // Log out the user as they can't do anything
                 return;
            }
        }

        state.setCurrentUserRole(role);

        if(splashScreen) splashScreen.classList.add('splash-visible');

        showAppPage(user.email);

        // Setup real-time listeners before loading the rest of the content
        setupProductionOrdersListener();

        await initializeAppContent();

    } catch (error) {
        console.error("A critical error occurred during the login process:", error);
        Toastify({ text: 'Ocurrió un error crítico al iniciar sesión. Por favor, intente de nuevo.', backgroundColor: 'var(--danger-color)', duration: 8000 }).showToast();
        if(splashScreen) splashScreen.classList.remove('splash-visible');
        await handleLogout();
    }
}

/**
 * Handles the user logout process.
 * Detaches listeners, signs the user out, and resets the application state.
 */
export async function handleLogout() {
    if (state.unsubscribeProductionOrders) {
        state.unsubscribeProductionOrders();
        state.setUnsubscribeProductionOrders(null);
        console.log('Production orders listener detached.');
    }

    if (auth) {
        await signOut(auth);
    }

    // Reset state and Firebase instance
    state.setCurrentUserRole(null);
    if (app) {
        await deleteApp(app);
        app = null;
        auth = null;
        storage = null;
        console.log("Firebase app instance deleted and session cleared.");
    }

    showLoginPage();
}

/**
 * Initializes the authentication process and sets up event listeners for the login form.
 */
export function initializeAuth() {
    // On page load, check for and pre-fill the last used client ID
    document.addEventListener('DOMContentLoaded', () => {
        const savedClientId = localStorage.getItem('operis-last-client-id');
        if (savedClientId && clientSelector) {
            clientSelector.value = savedClientId;
        }
    });

    loginBtn.addEventListener('click', async () => {
        console.log("Login button clicked.");
        const clientKey = clientSelector.value.trim().toLowerCase();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        const spinner = loginBtn.querySelector('.spinner-border');

        console.log(`Attempting login for client: '${clientKey}' with email: '${email}'`);

        if (!clientKey) {
            Toastify({ text: 'Por favor, ingrese el ID de su empresa.', backgroundColor: 'var(--warning-color)' }).showToast();
            return;
        }

        if (!clientConfigs[clientKey]) {
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
            initializeFirestore(app); // Initialize Firestore with the app instance
            // storage = getStorage(app); // To be initialized when needed

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
}

export { app, auth, storage };