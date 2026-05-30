/**
 * Azure OpenAI Service for Query Explanation
 * 
 * This service provides AI-powered explanations for datasource queries (M, SQL, DAX, KQL).
 * Uses customer-hosted Azure OpenAI endpoint - all data stays within customer's tenant.
 * 
 * @module AzureOpenAIService
 */

const fs = require('fs');
const path = require('path');

class AzureOpenAIService {
  constructor() {
    this.config = this.loadConfig();
  }

  /**
   * Load Azure OpenAI configuration from config file
   */
  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/azureOpenAI.config.json');
      const configData = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(configData);
      return config.azureOpenAI;
    } catch (error) {
      console.error('[AzureOpenAI] Failed to load config:', error.message);
      return {
        enabled: false,
        endpoint: '',
        apiKey: '',
        deploymentName: '',
        apiVersion: '2024-08-01-preview',
        maxTokens: 1000,
        temperature: 0.3,
        timeout: 30000
      };
    }
  }

  /**
   * Check if Azure OpenAI is configured and enabled
   */
  isConfigured() {
    const isOpenAICompatible = this.isOpenAICompatibleEndpoint();
    const isAzureAIFoundry = this.isAzureAIFoundry();
    const requiresDeploymentName = !isOpenAICompatible && !isAzureAIFoundry;
    
    return this.config.enabled && 
           this.config.endpoint && 
           this.config.apiKey && 
           (!requiresDeploymentName || this.config.deploymentName);
  }

  /**
   * Detect if the endpoint uses OpenAI-compatible format (/openai/v1)
   */
  isOpenAICompatibleEndpoint() {
    return this.config.endpoint?.includes('/openai/v1');
  }

  /**
   * Detect if the endpoint is Azure AI Foundry project format
   */
  isAzureAIFoundry() {
    return this.config.endpoint?.includes('services.ai.azure.com/api/projects/');
  }

  /**
   * Get the endpoint type as a human-readable string
   */
  getEndpointType() {
    if (this.isOpenAICompatibleEndpoint()) {
      return 'OpenAI-Compatible (Azure AI Foundry)';
    } else if (this.isAzureAIFoundry()) {
      return 'Azure AI Foundry (Project)';
    } else {
      return 'Azure OpenAI Service';
    }
  }

  /**
   * Build the API URL based on endpoint type
   */
  buildApiUrl() {
    if (this.isOpenAICompatibleEndpoint()) {
      // OpenAI-compatible format: {endpoint}/chat/completions
      // Endpoint already includes /openai/v1, just append /chat/completions
      return `${this.config.endpoint}/chat/completions`;
    } else if (this.isAzureAIFoundry()) {
      // Azure AI Foundry project format: {endpoint}/chat/completions
      // API version and deployment are not needed in URL
      return `${this.config.endpoint}/chat/completions`;
    } else {
      // Classic Azure OpenAI format: {endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}
      const apiVersionParam = this.config.apiVersion ? `?api-version=${this.config.apiVersion}` : '';
      return `${this.config.endpoint}/openai/deployments/${this.config.deploymentName}/chat/completions${apiVersionParam}`;
    }
  }

  /**
   * Build the system prompt for query explanation
   */
  buildSystemPrompt() {
    return `You are an expert data engineer helping business users understand datasource queries. 
Your goal is to explain technical queries in simple, non-technical language.

Guidelines:
1. Explain what data is being retrieved in plain English
2. Describe any transformations, filters, or joins applied
3. Highlight potential performance implications if relevant
4. Keep explanations concise (2-4 paragraphs maximum)
5. Use business-friendly language, avoid jargon
6. If the query has issues, mention them constructively

Format your response in clear paragraphs without markdown formatting.`;
  }

  /**
   * Build the user prompt with query context
   */
  buildUserPrompt(queryText, queryLanguage, context) {
    let prompt = `Explain the following ${queryLanguage} query:\n\n${queryText}\n\n`;
    
    if (context) {
      if (context.tableName) {
        prompt += `Context: This query is used for the table "${context.tableName}"`;
      }
      if (context.columnName) {
        prompt += ` in column "${context.columnName}"`;
      }
      if (context.datasetName) {
        prompt += ` within the semantic model "${context.datasetName}"`;
      }
      prompt += '.\n\n';
    }
    
    prompt += 'Provide a clear, business-friendly explanation of what this query does.';
    return prompt;
  }

  /**
   * Call Azure OpenAI API to explain a query
   * 
   * @param {string} queryText - The query code to explain
   * @param {string} queryLanguage - Language of the query (M, SQL, DAX, KQL)
   * @param {Object} context - Additional context (tableName, columnName, datasetName)
   * @returns {Promise<Object>} Explanation result with text and metadata
   */
  async explainQuery(queryText, queryLanguage = 'M', context = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Azure OpenAI is not configured. Please configure your Azure OpenAI endpoint in the settings.',
        explanation: null
      };
    }

    if (!queryText || queryText.trim().length === 0) {
      return {
        success: false,
        error: 'Query text is empty',
        explanation: null
      };
    }

    try {
      const url = this.buildApiUrl();
      const isAzureAIFoundry = this.isAzureAIFoundry();
      
      const requestBody = {
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt()
          },
          {
            role: 'user',
            content: this.buildUserPrompt(queryText, queryLanguage, context)
          }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        top_p: 0.95,
        frequency_penalty: 0,
        presence_penalty: 0
      };

      console.log('[AzureOpenAI] Requesting explanation:', {
        endpointType: this.getEndpointType(),
        url: url,
        deployment: this.config.deploymentName || 'N/A',
        queryLanguage,
        queryLength: queryText.length,
        context
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AzureOpenAI] API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        });
        
        return {
          success: false,
          error: `Azure OpenAI API error: ${response.status} ${response.statusText}`,
          explanation: null
        };
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        return {
          success: false,
          error: 'No response from Azure OpenAI',
          explanation: null
        };
      }

      const explanation = data.choices[0].message.content;
      const usage = data.usage;

      console.log('[AzureOpenAI] Explanation generated:', {
        explanationLength: explanation.length,
        tokensUsed: usage?.total_tokens,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens
      });

      return {
        success: true,
        error: null,
        explanation,
        metadata: {
          queryLanguage,
          tokensUsed: usage?.total_tokens,
          model: data.model,
          timestamp: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('[AzureOpenAI] Exception:', error);
      
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'Request timeout - Azure OpenAI did not respond in time',
          explanation: null
        };
      }

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        explanation: null
      };
    }
  }

  /**
   * Test the Azure OpenAI connection
   * 
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Azure OpenAI is not configured'
      };
    }

    try {
      const result = await this.explainQuery(
        'SELECT TOP 10 * FROM Customers WHERE Country = \'USA\'',
        'SQL',
        { tableName: 'Customers' }
      );

      return {
        success: result.success,
        error: result.error,
        message: result.success ? 'Azure OpenAI connection successful' : result.error
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Singleton instance
let instance = null;

function getAzureOpenAIService() {
  if (!instance) {
    instance = new AzureOpenAIService();
  }
  return instance;
}

module.exports = {
  getAzureOpenAIService,
  AzureOpenAIService
};
