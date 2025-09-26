const firebaseConfigs = {
  // operis-1 uses the original superprod database
  "operis-1.localhost": {
    apiKey: "AIzaSyAyMsDnA4TadOXrwxUqumwPAji9S3QiEAE",
    authDomain: "superprod-2ced1.firebaseapp.com",
    projectId: "superprod-2ced1",
    storageBucket: "superprod-2ced1.appspot.com",
    messagingSenderId: "691324529613",
    appId: "1:691324529613:web:a050a6d44f06481503b284",
    measurementId: "G-53FH6JGS20"
  },
  // operis-2 will have its own database
  "operis-2.localhost": {
    apiKey: "AIzaSyAJ5RsHYQLmwfFNDE6lsiTjXm9uhXHFvOg",
    authDomain: "operis-2.firebaseapp.com",
    projectId: "operis-2",
    storageBucket: "operis-2.firebasestorage.app",
    messagingSenderId: "558948066489",
    appId: "1:558948066489:web:9eaf8a0b4fa8d04a676768",
    measurementId: "G-DGXEJMFV46"
  },
  // Default or fallback configuration (optional)
  "default": {
    apiKey: "AIzaSyAyMsDnA4TadOXrwxUqumwPAji9S3QiEAE",
    authDomain: "superprod-2ced1.firebaseapp.com",
    projectId: "superprod-2ced1",
    storageBucket: "superprod-2ced1.appspot.com",
    messagingSenderId: "691324529613",
    appId: "1:691324529613:web:a050a6d44f06481503b284",
    measurementId: "G-53FH6JGS20"
  }
};

// Function to get the current config based on hostname
function getCurrentFirebaseConfig() {
  const hostname = window.location.hostname;
  // Use a more robust way to select the client, e.g., by splitting the hostname
  const clientName = hostname.split('.')[0]; // e.g., 'operis-1' from 'operis-1.localhost'

  // Construct the key for the firebaseConfigs object
  const configKey = `${clientName}.localhost`;

  return firebaseConfigs[configKey] || firebaseConfigs['default'];
}