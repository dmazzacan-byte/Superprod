const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors")({origin: true});

// Initialize the Firebase Admin SDK.
// This gives the function secure access to the Firestore database of the MAIN project.
admin.initializeApp();

/**
 * An HTTP-triggered Cloud Function that securely fetches the Firebase
 * configuration for a specific tenant (client).
 *
 * @param {functions.https.Request} req The request object, which should
 *   contain a query parameter `id` for the tenant (e.g., ?id=operis-1).
 * @param {functions.https.Response} res The response object.
 */
exports.getConfigForTenant = functions.https.onRequest((req, res) => {
  // Use the cors middleware to handle CORS headers automatically.
  cors(req, res, async () => {
    // 1. Get the tenant ID from the query string.
    const tenantId = req.query.id;

    if (!tenantId) {
      functions.logger.warn("Request received without a tenant ID.");
      res.status(400).send({error: "Tenant ID is required. Please provide it as a query parameter (e.g., ?id=your-tenant-id)."});
      return;
    }

    functions.logger.info(`Fetching configuration for tenant: ${tenantId}`);

    try {
      // 2. Access the 'tenants' collection in the main project's Firestore.
      const db = admin.firestore();
      const tenantDocRef = db.collection("tenants").doc(tenantId);
      const tenantDoc = await tenantDocRef.get();

      // 3. Check if the tenant's configuration document exists.
      if (!tenantDoc.exists) {
        functions.logger.error(`Tenant document not found for ID: ${tenantId}`);
        res.status(404).send({error: `Configuration for tenant '${tenantId}' not found.`});
        return;
      }

      // 4. Extract the firebaseConfig from the document.
      const tenantData = tenantDoc.data();
      const firebaseConfig = tenantData.firebaseConfig;

      if (!firebaseConfig) {
        functions.logger.error(`'firebaseConfig' field is missing in the document for tenant: ${tenantId}`);
        res.status(500).send({error: "Internal server error: Tenant configuration is incomplete."});
        return;
      }
      
      // 5. Securely send the configuration back to the client.
      functions.logger.info(`Successfully fetched and sent configuration for tenant: ${tenantId}`);
      res.status(200).send(firebaseConfig);

    } catch (error) {
      functions.logger.error(`An unexpected error occurred while fetching config for ${tenantId}:`, error);
      res.status(500).send({error: "An internal server error occurred. Please try again later."});
    }
  });
});