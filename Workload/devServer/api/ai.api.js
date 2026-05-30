/**
 * Azure OpenAI API Router
 * 
 * Provides endpoints for AI-powered query explanation
 * Uses customer-hosted Azure OpenAI - all data stays in customer tenant
 */

const express = require('express');
const router = express.Router();
const { getAzureOpenAIService } = require('../services/AzureOpenAIService');

/**
 * POST /api/ai/explain-query
 * 
 * Explain a datasource query using Azure OpenAI
 * 
 * Request body:
 * {
 *   queryText: string,        // The query code to explain
 *   queryLanguage: string,    // Language: M, SQL, DAX, KQL
 *   context: {                // Optional context
 *     tableName?: string,
 *     columnName?: string,
 *     datasetName?: string
 *   }
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   explanation: string,      // AI-generated explanation
 *   error: string,           // Error message if failed
 *   metadata: {              // Usage metadata
 *     queryLanguage: string,
 *     tokensUsed: number,
 *     model: string,
 *     timestamp: string
 *   }
 * }
 */
router.post('/api/ai/explain-query', async (req, res) => {
  try {
    const { queryText, queryLanguage = 'M', context = {} } = req.body;

    if (!queryText || typeof queryText !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid queryText parameter',
        explanation: null
      });
    }

    console.log('[AI API] Query explanation requested:', {
      queryLanguage,
      queryLength: queryText.length,
      hasContext: !!context,
      contextKeys: Object.keys(context)
    });

    const aiService = getAzureOpenAIService();
    const result = await aiService.explainQuery(queryText, queryLanguage, context);

    if (!result.success) {
      console.warn('[AI API] Explanation failed:', result.error);
      return res.status(result.error.includes('not configured') ? 503 : 500).json(result);
    }

    console.log('[AI API] Explanation successful:', {
      explanationLength: result.explanation.length,
      tokensUsed: result.metadata?.tokensUsed
    });

    res.json(result);

  } catch (error) {
    console.error('[AI API] Exception in explain-query:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      explanation: null
    });
  }
});

/**
 * GET /api/ai/status
 * 
 * Check if Azure OpenAI is configured and available
 * 
 * Response:
 * {
 *   configured: boolean,
 *   enabled: boolean,
 *   endpoint: string (masked),
 *   deploymentName: string
 * }
 */
router.get('/api/ai/status', (req, res) => {
  try {
    const aiService = getAzureOpenAIService();
    const config = aiService.config;
    const isOpenAICompatible = aiService.isOpenAICompatibleEndpoint();
    const isAzureAIFoundry = aiService.isAzureAIFoundry();
    const requiresDeploymentName = !isOpenAICompatible && !isAzureAIFoundry;

    // Mask sensitive information
    const maskedEndpoint = config.endpoint 
      ? config.endpoint.replace(/https:\/\/([^.]+)\./, 'https://***.')
      : '';

    res.json({
      configured: aiService.isConfigured(),
      enabled: config.enabled,
      endpointType: aiService.getEndpointType(),
      endpoint: maskedEndpoint,
      deploymentName: requiresDeploymentName ? (config.deploymentName || 'Not configured') : (config.deploymentName || 'N/A (included in endpoint)'),
      features: {
        queryExplanation: config.enabled
      }
    });

  } catch (error) {
    console.error('[AI API] Exception in status check:', error);
    res.status(500).json({
      configured: false,
      enabled: false,
      error: 'Failed to check AI service status'
    });
  }
});

/**
 * POST /api/ai/test-connection
 * 
 * Test the Azure OpenAI connection with a sample query
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   error: string
 * }
 */
router.post('/api/ai/test-connection', async (req, res) => {
  try {
    console.log('[AI API] Testing Azure OpenAI connection...');
    
    const aiService = getAzureOpenAIService();
    const result = await aiService.testConnection();

    if (result.success) {
      console.log('[AI API] Connection test successful');
    } else {
      console.warn('[AI API] Connection test failed:', result.error);
    }

    res.json(result);

  } catch (error) {
    console.error('[AI API] Exception in test-connection:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: null
    });
  }
});

module.exports = { router };
