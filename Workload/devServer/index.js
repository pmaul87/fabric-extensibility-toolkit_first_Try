/**
 * DevServer APIs index file
 * Exports manifest API, metadata API, and dev server components registration
 */

const manifestApi = require('./manifestApi');
const { router: metadataRouter, initializeMetadataApi, initializeReportScannerPersistence } = require('./api/metadata.api');
const { router: semanticRouter, initializeSemanticApi } = require('./api/semantic.api');
const { router: lakehouseRouter, initializeLakehouseApi } = require('./api/lakehouse.api');

/**
 * Register dev server manifest APIs with an Express application
 * @param {object} app Express application
 * @param {object} fabricPlatformApiClient Optional Fabric Platform API client for metadata service
 */
function registerDevServerApis(app, fabricPlatformApiClient) {
  console.log('*** Mounting Manifest API ***');
  app.use('/', manifestApi);

  console.log('*** Mounting Metadata API ***');
  app.use('/', metadataRouter);

  console.log('*** Mounting Semantic API ***');
  app.use('/', semanticRouter);

  console.log('*** Mounting Lakehouse Analyzer API ***');
  app.use('/', lakehouseRouter);

  initializeMetadataApi(fabricPlatformApiClient);
  initializeSemanticApi(fabricPlatformApiClient);
  initializeLakehouseApi(fabricPlatformApiClient);
  
  const hasServicePrincipalConfig =
    !!process.env.TENANT_ID &&
    !!process.env.BACKEND_APPID &&
    !!process.env.BACKEND_CLIENT_SECRET;

  if (hasServicePrincipalConfig) {
    console.log('✅ Metadata API initialized with service principal credentials');
  } else {
    console.log('ℹ️  Metadata API initialized in fallback mode (set TENANT_ID, BACKEND_APPID, BACKEND_CLIENT_SECRET for live Fabric data)');
  }

  // Initialize Report Scanner persistence if SQL Database is configured (optional)
  try {
    const hasSqlDbConfig = !!process.env.SQL_DB_SERVER && !!process.env.SQL_DB_DATABASE;
    const hasServicePrincipal = !!process.env.TENANT_ID && !!process.env.BACKEND_APPID && !!process.env.BACKEND_CLIENT_SECRET;
    
    if (hasSqlDbConfig) {
      console.log('🗄️  Initializing Report Scanner database persistence...');
      
      if (hasServicePrincipal) {
        initializeReportScannerPersistence({
          server: process.env.SQL_DB_SERVER,
          database: process.env.SQL_DB_DATABASE,
          tenantId: process.env.TENANT_ID,
          clientId: process.env.BACKEND_APPID,
          clientSecret: process.env.BACKEND_CLIENT_SECRET,
        });
        console.log('✅ Report Scanner persistence ready (using service principal authentication)');
      } else {
        console.warn('⚠️  SQL Database configured but missing service principal credentials');
        console.log('ℹ️  Set TENANT_ID, BACKEND_APPID, and BACKEND_CLIENT_SECRET to enable persistence');
      }
    } else {
      console.log('ℹ️  Report Scanner database persistence disabled (set SQL_DB_SERVER and SQL_DB_DATABASE to enable)');
    }
  } catch (error) {
    console.warn('⚠️  Failed to initialize Report Scanner persistence, continuing without it:', error.message);
    console.log('ℹ️  Report Scanner will work without database persistence');
  }
}

function registerDevServerComponents() {
  console.log("*********************************************************************");
  console.log('***                Mounting Dev Server Components                ***');

  // Log playground availability
  console.log('\x1b[32m🎮 Following playgrounds are enabled in development mode:\x1b[0m'); // Green
  const workloadName = process.env.WORKLOAD_NAME || 'unknown-workload';
  console.log(`\x1b[32m🌐 Client-SDK Playground:\x1b[0m \x1b[34mhttps://app.fabric.microsoft.com/workloads/${workloadName}/playground-client-sdk\x1b[0m`); // Blue
  console.log(`\x1b[32m🌐 Data Playground:\x1b[0m \x1b[34mhttps://app.fabric.microsoft.com/workloads/${workloadName}/playground-data\x1b[0m`); // Blue
  console.log("*********************************************************************");
}

module.exports = {
  manifestApi,
  metadataRouter,
  initializeMetadataApi,
  semanticRouter,
  initializeSemanticApi,
  lakehouseRouter,
  initializeLakehouseApi,
  registerDevServerApis,
  registerDevServerComponents
};
