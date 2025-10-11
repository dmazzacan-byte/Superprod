/**
 * Superproducción - Gestión de Producción
 *
 * Main application entry point.
 * This file initializes the authentication module, which in turn handles the entire application lifecycle.
 */

// Import the primary initialization function from the auth module.
// The auth module will handle Firebase initialization, login, and then trigger
// the UI and data loading modules.
import { initializeAuth } from '/js/modules/auth.js';

// Import Chart.js and the datalabels plugin at the top level to ensure they are available globally
// for all modules that might use them.
import 'https://esm.sh/chart.js/auto';
import 'https://esm.sh/chartjs-plugin-datalabels';


// Start the application by initializing the authentication flow.
initializeAuth();