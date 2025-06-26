/**
 * Google Sheets API v4 Integration for Chrome Extension
 * Provides comprehensive Google Sheets access with Chrome Identity API authentication
 * Compatible with Manifest V3 service worker environment
 */

// Configuration constants
const SHEETS_CONFIG = {
  SHEETS_API_BASE_URL: 'https://sheets.googleapis.com/v4',
  DEFAULT_RANGE: 'A1:Z1000',
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  BATCH_SIZE: 1000,
  REQUEST_TIMEOUT: 30000,
  SPREADSHEET_ID_LENGTH: 44
};

/**
 * Google Sheets API v4 Integration Class
 * Handles all Google Sheets operations with proper error handling and retry logic
 */
class GoogleSheetsAPI {
  constructor() {
    this.baseUrl = SHEETS_CONFIG.SHEETS_API_BASE_URL;
    this.retryAttempts = SHEETS_CONFIG.MAX_RETRY_ATTEMPTS;
    this.retryDelay = SHEETS_CONFIG.RETRY_DELAY;
    this.isInitialized = false;
    this.debugMode = true;
  }

  /**
   * Initialize the Google Sheets API with authentication check
   */
  async initialize() {
    try {
      this.debugLog('Initializing Google Sheets API...');
      
      // Verify authManager is available
      if (typeof authManager === 'undefined') {
        throw new Error('AuthManager not available. Ensure auth.js is loaded.');
      }

      // Check authentication status
      const authStatus = await authManager.getAuthenticationStatus();
      if (!authStatus.isAuthenticated) {
        throw new Error('User not authenticated. Please authenticate first.');
      }

      this.isInitialized = true;
      this.debugLog('Google Sheets API initialized successfully');
      
      return {
        success: true,
        message: 'Google Sheets API initialized successfully'
      };
    } catch (error) {
      this.debugLog('Failed to initialize Google Sheets API:', error);
      return {
        success: false,
        error: error.message,
        code: 'INITIALIZATION_FAILED'
      };
    }
  }

  /**
   * Validate spreadsheet ID format
   */
  validateSpreadsheetId(spreadsheetId) {
    if (!spreadsheetId || typeof spreadsheetId !== 'string') {
      return {
        valid: false,
        error: 'Spreadsheet ID must be a non-empty string'
      };
    }

    if (spreadsheetId.length !== SHEETS_CONFIG.SPREADSHEET_ID_LENGTH) {
      return {
        valid: false,
        error: `Spreadsheet ID must be exactly ${SHEETS_CONFIG.SPREADSHEET_ID_LENGTH} characters long`
      };
    }

    // Check for valid characters (alphanumeric, hyphens, underscores)
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(spreadsheetId)) {
      return {
        valid: false,
        error: 'Spreadsheet ID contains invalid characters'
      };
    }

    return { valid: true };
  }

  /**
   * Get authentication headers for API requests
   */
  async getAuthHeaders() {
    try {
      if (!this.isInitialized) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          throw new Error(initResult.error);
        }
      }

      const token = await authManager.getValidToken();
      if (!token) {
        throw new Error('Failed to get valid authentication token');
      }

      return {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
    } catch (error) {
      this.debugLog('Failed to get auth headers:', error);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Make HTTP request with retry logic and proper error handling
   */
  async makeRequest(url, options = {}, retryCount = 0) {
    try {
      this.debugLog(`Making request to: ${url} (attempt ${retryCount + 1})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SHEETS_CONFIG.REQUEST_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle specific HTTP status codes
      if (response.status === 401) {
        // Token expired, try to refresh
        this.debugLog('Token expired, attempting refresh...');
        await authManager.refreshToken();
        
        if (retryCount < this.retryAttempts) {
          const newHeaders = await this.getAuthHeaders();
          return this.makeRequest(url, {
            ...options,
            headers: { ...options.headers, ...newHeaders }
          }, retryCount + 1);
        }
        
        throw new Error('Authentication failed after token refresh');
      }

      if (response.status === 403) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Permission denied: ${errorData.error?.message || 'Insufficient permissions for this operation'}`);
      }

      if (response.status === 404) {
        throw new Error('Spreadsheet not found or not accessible');
      }

      if (response.status === 429) {
        // Rate limiting - exponential backoff
        if (retryCount < this.retryAttempts) {
          const delay = this.retryDelay * Math.pow(2, retryCount);
          this.debugLog(`Rate limited, retrying after ${delay}ms...`);
          await this.delay(delay);
          return this.makeRequest(url, options, retryCount + 1);
        }
        
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      this.debugLog('Request successful:', { status: response.status, dataKeys: Object.keys(data) });
      
      return {
        success: true,
        data: data,
        status: response.status
      };

    } catch (error) {
      this.debugLog(`Request failed (attempt ${retryCount + 1}):`, error);

      // Retry on network errors
      if ((error.name === 'AbortError' || error.message.includes('network')) && retryCount < this.retryAttempts) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        this.debugLog(`Network error, retrying after ${delay}ms...`);
        await this.delay(delay);
        return this.makeRequest(url, options, retryCount + 1);
      }

      throw error;
    }
  }

  /**
   * Validate sheet access and permissions
   */
  async validateSheetAccess(spreadsheetId) {
    try {
      this.debugLog(`Validating access to spreadsheet: ${spreadsheetId}`);

      // Validate spreadsheet ID format
      const validation = this.validateSpreadsheetId(spreadsheetId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_SPREADSHEET_ID'
        };
      }

      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`;

      const result = await this.makeRequest(url, {
        method: 'GET',
        headers: headers
      });

      if (result.success) {
        this.debugLog('Sheet access validated successfully');
        return {
          success: true,
          accessible: true,
          spreadsheet: {
            id: result.data.spreadsheetId,
            title: result.data.properties?.title,
            sheetCount: result.data.sheets?.length || 0,
            sheets: result.data.sheets?.map(sheet => ({
              id: sheet.properties.sheetId,
              title: sheet.properties.title,
              index: sheet.properties.index
            })) || []
          }
        };
      }

      return {
        success: false,
        accessible: false,
        error: 'Sheet access validation failed'
      };

    } catch (error) {
      this.debugLog('Sheet access validation failed:', error);
      
      let errorCode = 'ACCESS_VALIDATION_FAILED';
      if (error.message.includes('not found')) {
        errorCode = 'SHEET_NOT_FOUND';
      } else if (error.message.includes('Permission denied')) {
        errorCode = 'PERMISSION_DENIED';
      }

      return {
        success: false,
        accessible: false,
        error: error.message,
        code: errorCode
      };
    }
  }

  /**
   * Get basic sheet information and metadata
   */
  async getSheetInfo(spreadsheetId) {
    try {
      this.debugLog(`Getting sheet info for: ${spreadsheetId}`);

      const validation = this.validateSpreadsheetId(spreadsheetId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_SPREADSHEET_ID'
        };
      }

      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties,sheets.properties,namedRanges`;

      const result = await this.makeRequest(url, {
        method: 'GET',
        headers: headers
      });

      if (result.success) {
        const spreadsheet = result.data;
        
        return {
          success: true,
          info: {
            spreadsheetId: spreadsheet.spreadsheetId,
            title: spreadsheet.properties?.title,
            locale: spreadsheet.properties?.locale,
            timeZone: spreadsheet.properties?.timeZone,
            sheets: spreadsheet.sheets?.map(sheet => ({
              sheetId: sheet.properties.sheetId,
              title: sheet.properties.title,
              index: sheet.properties.index,
              sheetType: sheet.properties.sheetType,
              gridProperties: {
                rowCount: sheet.properties.gridProperties?.rowCount,
                columnCount: sheet.properties.gridProperties?.columnCount,
                frozenRowCount: sheet.properties.gridProperties?.frozenRowCount,
                frozenColumnCount: sheet.properties.gridProperties?.frozenColumnCount
              }
            })) || [],
            namedRanges: spreadsheet.namedRanges?.map(range => ({
              name: range.name,
              range: range.range
            })) || []
          }
        };
      }

      return {
        success: false,
        error: 'Failed to get sheet information'
      };

    } catch (error) {
      this.debugLog('Failed to get sheet info:', error);
      return {
        success: false,
        error: error.message,
        code: 'GET_INFO_FAILED'
      };
    }
  }

  /**
   * Create a new sheet tab if it doesn't exist
   */
  async createSheetIfNeeded(spreadsheetId, sheetName) {
    try {
      this.debugLog(`Creating sheet if needed: ${sheetName} in ${spreadsheetId}`);

      // First, check if sheet already exists
      const infoResult = await this.getSheetInfo(spreadsheetId);
      if (!infoResult.success) {
        return infoResult;
      }

      const existingSheet = infoResult.info.sheets.find(sheet => sheet.title === sheetName);
      if (existingSheet) {
        this.debugLog(`Sheet "${sheetName}" already exists`);
        return {
          success: true,
          created: false,
          sheet: existingSheet,
          message: 'Sheet already exists'
        };
      }

      // Create new sheet
      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}:batchUpdate`;

      const requestBody = {
        requests: [{
          addSheet: {
            properties: {
              title: sheetName,
              sheetType: 'GRID',
              gridProperties: {
                rowCount: 1000,
                columnCount: 26
              }
            }
          }
        }]
      };

      const result = await this.makeRequest(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (result.success) {
        const newSheet = result.data.replies[0].addSheet.properties;
        this.debugLog(`Sheet "${sheetName}" created successfully`);
        
        return {
          success: true,
          created: true,
          sheet: {
            sheetId: newSheet.sheetId,
            title: newSheet.title,
            index: newSheet.index,
            gridProperties: newSheet.gridProperties
          }
        };
      }

      return {
        success: false,
        error: 'Failed to create sheet'
      };

    } catch (error) {
      this.debugLog('Failed to create sheet:', error);
      return {
        success: false,
        error: error.message,
        code: 'CREATE_SHEET_FAILED'
      };
    }
  }

  /**
   * Clear data from a specific range in the sheet
   */
  async clearSheetData(spreadsheetId, range = SHEETS_CONFIG.DEFAULT_RANGE) {
    try {
      this.debugLog(`Clearing data from ${spreadsheetId}, range: ${range}`);

      const validation = this.validateSpreadsheetId(spreadsheetId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_SPREADSHEET_ID'
        };
      }

      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;

      const result = await this.makeRequest(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({})
      });

      if (result.success) {
        this.debugLog('Data cleared successfully');
        return {
          success: true,
          clearedRange: result.data.clearedRange,
          spreadsheetId: result.data.spreadsheetId
        };
      }

      return {
        success: false,
        error: 'Failed to clear sheet data'
      };

    } catch (error) {
      this.debugLog('Failed to clear sheet data:', error);
      return {
        success: false,
        error: error.message,
        code: 'CLEAR_DATA_FAILED'
      };
    }
  }

  /**
   * Write data to sheet in batch mode
   */
  async writeDataToSheet(spreadsheetId, range, data, options = {}) {
    try {
      this.debugLog(`Writing data to ${spreadsheetId}, range: ${range}, rows: ${data.length}`);

      const validation = this.validateSpreadsheetId(spreadsheetId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_SPREADSHEET_ID'
        };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return {
          success: false,
          error: 'Data must be a non-empty array',
          code: 'INVALID_DATA'
        };
      }

      const headers = await this.getAuthHeaders();
      
      // Determine if we should clear first (replace mode)
      if (options.replaceData) {
        const clearResult = await this.clearSheetData(spreadsheetId, range);
        if (!clearResult.success) {
          this.debugLog('Failed to clear data before writing:', clearResult.error);
          // Continue anyway for append mode
        }
      }

      // Prepare data for batch write
      const requestBody = {
        valueInputOption: options.valueInputOption || 'USER_ENTERED',
        data: [{
          range: range,
          majorDimension: 'ROWS',
          values: data
        }],
        includeValuesInResponse: false,
        responseValueRenderOption: 'FORMATTED_VALUE',
        responseDateTimeRenderOption: 'FORMATTED_STRING'
      };

      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}/values:batchUpdate`;

      const result = await this.makeRequest(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (result.success) {
        const response = result.data;
        this.debugLog('Data written successfully', {
          updatedCells: response.totalUpdatedCells,
          updatedRows: response.totalUpdatedRows,
          updatedColumns: response.totalUpdatedColumns
        });

        return {
          success: true,
          spreadsheetId: response.spreadsheetId,
          totalUpdatedCells: response.totalUpdatedCells,
          totalUpdatedRows: response.totalUpdatedRows,
          totalUpdatedColumns: response.totalUpdatedColumns,
          updatedRange: response.responses[0]?.updatedRange
        };
      }

      return {
        success: false,
        error: 'Failed to write data to sheet'
      };

    } catch (error) {
      this.debugLog('Failed to write data to sheet:', error);
      return {
        success: false,
        error: error.message,
        code: 'WRITE_DATA_FAILED'
      };
    }
  }

  /**
   * Read data from a specific range in the sheet
   */
  async readSheetData(spreadsheetId, range = SHEETS_CONFIG.DEFAULT_RANGE) {
    try {
      this.debugLog(`Reading data from ${spreadsheetId}, range: ${range}`);

      const validation = this.validateSpreadsheetId(spreadsheetId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_SPREADSHEET_ID'
        };
      }

      const headers = await this.getAuthHeaders();
      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

      const result = await this.makeRequest(url, {
        method: 'GET',
        headers: headers
      });

      if (result.success) {
        const response = result.data;
        this.debugLog('Data read successfully', {
          range: response.range,
          majorDimension: response.majorDimension,
          rows: response.values?.length || 0
        });

        return {
          success: true,
          range: response.range,
          majorDimension: response.majorDimension,
          values: response.values || [],
          rowCount: response.values?.length || 0
        };
      }

      return {
        success: false,
        error: 'Failed to read sheet data'
      };

    } catch (error) {
      this.debugLog('Failed to read sheet data:', error);
      return {
        success: false,
        error: error.message,
        code: 'READ_DATA_FAILED'
      };
    }
  }

  /**
   * Append data to the end of existing data in a sheet
   */
  async appendDataToSheet(spreadsheetId, range, data, options = {}) {
    try {
      this.debugLog(`Appending data to ${spreadsheetId}, range: ${range}, rows: ${data.length}`);

      const validation = this.validateSpreadsheetId(spreadsheetId);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
          code: 'INVALID_SPREADSHEET_ID'
        };
      }

      if (!Array.isArray(data) || data.length === 0) {
        return {
          success: false,
          error: 'Data must be a non-empty array',
          code: 'INVALID_DATA'
        };
      }

      const headers = await this.getAuthHeaders();
      
      const requestBody = {
        values: data,
        majorDimension: 'ROWS'
      };

      const valueInputOption = options.valueInputOption || 'USER_ENTERED';
      const insertDataOption = options.insertDataOption || 'INSERT_ROWS';
      
      const url = `${this.baseUrl}/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`;

      const result = await this.makeRequest(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (result.success) {
        const response = result.data;
        this.debugLog('Data appended successfully', {
          updatedCells: response.updates?.updatedCells,
          updatedRows: response.updates?.updatedRows,
          updatedRange: response.updates?.updatedRange
        });

        return {
          success: true,
          spreadsheetId: response.spreadsheetId,
          tableRange: response.tableRange,
          updates: response.updates
        };
      }

      return {
        success: false,
        error: 'Failed to append data to sheet'
      };

    } catch (error) {
      this.debugLog('Failed to append data to sheet:', error);
      return {
        success: false,
        error: error.message,
        code: 'APPEND_DATA_FAILED'
      };
    }
  }

  /**
   * Utility method for delays (used in retry logic)
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Debug logging method
   */
  debugLog(message, data = null) {
    if (this.debugMode) {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[GoogleSheetsAPI ${timestamp}] ${message}`, data);
      } else {
        console.log(`[GoogleSheetsAPI ${timestamp}] ${message}`);
      }
    }
  }

  /**
   * Enable/disable debug logging
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    this.debugLog(`Debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return {
      baseUrl: this.baseUrl,
      retryAttempts: this.retryAttempts,
      retryDelay: this.retryDelay,
      isInitialized: this.isInitialized,
      debugMode: this.debugMode,
      config: SHEETS_CONFIG
    };
  }

  /**
   * Test connection to Google Sheets API
   */
  async testConnection() {
    try {
      this.debugLog('Testing Google Sheets API connection...');
      
      const headers = await this.getAuthHeaders();
      
      // Use a minimal request to test connectivity
      const url = `${this.baseUrl}/spreadsheets/1mGVis9qERPDqCW5oh5iOqJQPStcZ4KYGVzHNBjJZwQw?fields=spreadsheetId`;

      const result = await this.makeRequest(url, {
        method: 'GET',
        headers: headers
      });

      return {
        success: true,
        connected: true,
        message: 'Google Sheets API connection successful'
      };

    } catch (error) {
      this.debugLog('Connection test failed:', error);
      return {
        success: false,
        connected: false,
        error: error.message,
        code: 'CONNECTION_TEST_FAILED'
      };
    }
  }
}

// Create global instance for use in service worker
const googleSheetsAPI = new GoogleSheetsAPI();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GoogleSheetsAPI, googleSheetsAPI, SHEETS_CONFIG };
} else {
  // Make available globally for Chrome extension
  if (typeof globalThis !== 'undefined') {
    globalThis.GoogleSheetsAPI = GoogleSheetsAPI;
    globalThis.googleSheetsAPI = googleSheetsAPI;
    globalThis.SHEETS_CONFIG = SHEETS_CONFIG;
  } else if (typeof self !== 'undefined') {
    self.GoogleSheetsAPI = GoogleSheetsAPI;
    self.googleSheetsAPI = googleSheetsAPI;
    self.SHEETS_CONFIG = SHEETS_CONFIG;
  }
}

// Auto-initialization message
if (typeof chrome !== 'undefined' && chrome.runtime) {
  console.log('🔗 Google Sheets API loaded and ready for Chrome Extension');
  console.log('📊 Use googleSheetsAPI instance or create new GoogleSheetsAPI()');
} 