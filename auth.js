/**
 * Google Translate Starred Words Scraper - Authentication Manager
 * Handles Google OAuth authentication using Chrome Identity API
 * Supports Google Sheets, Gmail, and user info APIs
 */

// Configuration constants
const AUTH_CONFIG = {
  API_KEY: 'AIzaSyCmg6hbmyXqvv1Jhjy0dJHpaUHvbfbCRnA',
  CLIENT_ID: '734462042602-7f6r7h8851tjprf7lqn5l726at886pr.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
  ],
  TOKEN_STORAGE_KEY: 'google_auth_token',
  TOKEN_INFO_STORAGE_KEY: 'google_token_info',
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000, // 5 minutes buffer before expiry
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  DEBUG: true // Enable detailed logging
};

// Authentication states
const AUTH_STATES = {
  UNAUTHENTICATED: 'unauthenticated',
  AUTHENTICATING: 'authenticating',
  AUTHENTICATED: 'authenticated',
  TOKEN_EXPIRED: 'token_expired',
  ERROR: 'error'
};

/**
 * Authentication Manager class for Google OAuth operations
 */
class AuthManager {
  constructor() {
    this.currentState = AUTH_STATES.UNAUTHENTICATED;
    this.authPromise = null; // Prevent multiple concurrent auth attempts
    this.tokenInfo = null;
    
    // Perform comprehensive configuration validation at startup
    const configValidation = this._validateConfiguration();
    
    this.debugLog('AuthManager initialized with corrected credentials', {
      clientId: AUTH_CONFIG.CLIENT_ID,
      clientIdLength: AUTH_CONFIG.CLIENT_ID.length,
      scopes: AUTH_CONFIG.SCOPES,
      scopesCount: AUTH_CONFIG.SCOPES.length,
      initialState: this.currentState,
      debugEnabled: AUTH_CONFIG.DEBUG,
      apiKey: AUTH_CONFIG.API_KEY ? 'present' : 'missing',
      configValidation
    });

    // Log any critical configuration issues
    if (configValidation.criticalIssues.length > 0) {
      this.debugLog('CRITICAL CONFIGURATION ISSUES DETECTED', {
        issues: configValidation.criticalIssues,
        recommendations: configValidation.recommendations
      });
    }
  }

  /**
   * Validates the OAuth configuration between auth.js and manifest.json
   * @returns {Object} Validation results with any issues found
   * @private
   */
  _validateConfiguration() {
    const validation = {
      isValid: true,
      criticalIssues: [],
      warnings: [],
      recommendations: [],
      details: {}
    };

    try {
      // Get manifest configuration
      const manifest = chrome.runtime.getManifest();
      const manifestClientId = manifest.oauth2?.client_id;
      const manifestScopes = manifest.oauth2?.scopes || [];

      validation.details = {
        authConfigClientId: AUTH_CONFIG.CLIENT_ID,
        authConfigClientIdType: typeof AUTH_CONFIG.CLIENT_ID,
        authConfigClientIdLength: AUTH_CONFIG.CLIENT_ID ? AUTH_CONFIG.CLIENT_ID.length : 0,
        authConfigScopes: AUTH_CONFIG.SCOPES,
        manifestClientId: manifestClientId,
        manifestClientIdType: typeof manifestClientId,
        manifestClientIdLength: manifestClientId ? manifestClientId.length : 0,
        manifestScopes: manifestScopes,
        extensionId: chrome.runtime.id,
        manifestVersion: manifest.manifest_version
      };

      // Check if client IDs match
      if (AUTH_CONFIG.CLIENT_ID !== manifestClientId) {
        validation.isValid = false;
        validation.criticalIssues.push('Client ID mismatch between auth.js and manifest.json');
        validation.recommendations.push('Ensure AUTH_CONFIG.CLIENT_ID in auth.js matches manifest.json oauth2.client_id');
      }

      // Check if auth.js client ID is valid
      if (!AUTH_CONFIG.CLIENT_ID || typeof AUTH_CONFIG.CLIENT_ID !== 'string') {
        validation.isValid = false;
        validation.criticalIssues.push('AUTH_CONFIG.CLIENT_ID is not a valid string');
        validation.recommendations.push('Set AUTH_CONFIG.CLIENT_ID to a valid Google OAuth client ID string');
      } else if (AUTH_CONFIG.CLIENT_ID.includes('YOUR_') || AUTH_CONFIG.CLIENT_ID.includes('PLACEHOLDER')) {
        validation.isValid = false;
        validation.criticalIssues.push('AUTH_CONFIG.CLIENT_ID appears to be a placeholder value');
        validation.recommendations.push('Replace AUTH_CONFIG.CLIENT_ID with actual Google OAuth client ID');
      } else if (AUTH_CONFIG.CLIENT_ID.length < 50) {
        validation.warnings.push('AUTH_CONFIG.CLIENT_ID seems shorter than expected for a Google OAuth client ID');
      }

      // Check if manifest client ID is valid
      if (!manifestClientId || typeof manifestClientId !== 'string') {
        validation.isValid = false;
        validation.criticalIssues.push('manifest.json oauth2.client_id is not set or not a valid string');
        validation.recommendations.push('Set oauth2.client_id in manifest.json to a valid Google OAuth client ID');
      } else if (manifestClientId.includes('YOUR_') || manifestClientId.includes('PLACEHOLDER')) {
        validation.isValid = false;
        validation.criticalIssues.push('manifest.json oauth2.client_id appears to be a placeholder value');
        validation.recommendations.push('Replace oauth2.client_id in manifest.json with actual Google OAuth client ID');
      }

      // Check scopes consistency
      const authScopesSet = new Set(AUTH_CONFIG.SCOPES);
      const manifestScopesSet = new Set(manifestScopes);
      const missingScopesInManifest = AUTH_CONFIG.SCOPES.filter(scope => !manifestScopesSet.has(scope));
      const extraScopesInManifest = manifestScopes.filter(scope => !authScopesSet.has(scope));

      if (missingScopesInManifest.length > 0) {
        validation.warnings.push(`Scopes in auth.js not found in manifest.json: ${missingScopesInManifest.join(', ')}`);
      }

      if (extraScopesInManifest.length > 0) {
        validation.warnings.push(`Extra scopes in manifest.json not used in auth.js: ${extraScopesInManifest.join(', ')}`);
      }

      // Check for potential format issues
      if (AUTH_CONFIG.CLIENT_ID === '0' || AUTH_CONFIG.CLIENT_ID === 0) {
        validation.isValid = false;
        validation.criticalIssues.push('AUTH_CONFIG.CLIENT_ID is set to zero - this will cause "(0)" errors');
        validation.recommendations.push('Set AUTH_CONFIG.CLIENT_ID to the correct Google OAuth client ID string');
      }

      if (manifestClientId === '0' || manifestClientId === 0) {
        validation.isValid = false;
        validation.criticalIssues.push('manifest.json client_id is set to zero - this will cause "(0)" errors');
        validation.recommendations.push('Set oauth2.client_id in manifest.json to the correct Google OAuth client ID');
      }

    } catch (error) {
      validation.isValid = false;
      validation.criticalIssues.push(`Configuration validation failed: ${error.message}`);
      validation.recommendations.push('Check that chrome.runtime.getManifest() is accessible');
    }

         return validation;
   }

  /**
   * Quick configuration check for debugging - can be called from console
   * @returns {Object} Current configuration status
   */
  getConfigurationStatus() {
    const validation = this._validateConfiguration();
    
    const status = {
      timestamp: new Date().toISOString(),
      configurationValid: validation.isValid,
      clientIdMatch: AUTH_CONFIG.CLIENT_ID === chrome.runtime.getManifest().oauth2?.client_id,
      authConfigClientId: AUTH_CONFIG.CLIENT_ID,
      manifestClientId: chrome.runtime.getManifest().oauth2?.client_id,
      extensionId: chrome.runtime.id,
      criticalIssues: validation.criticalIssues,
      warnings: validation.warnings,
      recommendations: validation.recommendations,
      authState: this.currentState,
      quickHealthCheck: {
        authJsClientIdValid: !!(AUTH_CONFIG.CLIENT_ID && typeof AUTH_CONFIG.CLIENT_ID === 'string' && AUTH_CONFIG.CLIENT_ID.length > 20),
        manifestClientIdValid: !!(chrome.runtime.getManifest().oauth2?.client_id && typeof chrome.runtime.getManifest().oauth2?.client_id === 'string'),
        clientIdsMatch: AUTH_CONFIG.CLIENT_ID === chrome.runtime.getManifest().oauth2?.client_id,
        noPlaceholders: !AUTH_CONFIG.CLIENT_ID.includes('YOUR_') && !AUTH_CONFIG.CLIENT_ID.includes('PLACEHOLDER'),
        notZero: AUTH_CONFIG.CLIENT_ID !== '0' && AUTH_CONFIG.CLIENT_ID !== 0
      }
    };
    
    this.debugLog('Configuration status check', status);
    
    return status;
  }

  /**
   * Debug logging utility with structured output
   */
  debugLog(message, data = null) {
    if (AUTH_CONFIG.DEBUG) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        component: 'AuthManager',
        message,
        state: this.currentState,
        ...(data && { data })
      };
      
      console.log(`[AUTH ${timestamp}] ${message}`, data || '');
      
      // Also store in a more structured format for debugging
      if (typeof chrome !== 'undefined' && chrome.storage) {
        try {
          chrome.storage.local.get(['auth_debug_logs'], (result) => {
            const logs = result.auth_debug_logs || [];
            logs.push(logEntry);
            
            // Keep only last 50 log entries
            if (logs.length > 50) {
              logs.splice(0, logs.length - 50);
            }
            
            chrome.storage.local.set({ auth_debug_logs: logs });
          });
        } catch (error) {
          // Ignore storage errors in debug logging
        }
      }
    }
  }

  /**
   * Gets a valid access token, refreshing if necessary
   * @param {Object} options - Authentication options
   * @param {boolean} options.interactive - Whether to show login UI
   * @param {boolean} options.forceRefresh - Force token refresh
   * @returns {Promise<string>} Valid access token
   */
  async getAuthToken(options = {}) {
    const config = {
      interactive: options.interactive !== false, // Default to true
      forceRefresh: options.forceRefresh || false
    };

    this.debugLog('Starting authentication process', {
      clientId: AUTH_CONFIG.CLIENT_ID,
      interactive: config.interactive,
      forceRefresh: config.forceRefresh,
      currentState: this.currentState,
      hasExistingPromise: !!this.authPromise
    });

    try {
      // Prevent multiple concurrent authentication attempts
      if (this.authPromise) {
        this.debugLog('Authentication already in progress, waiting for existing promise');
        return await this.authPromise;
      }

      this.debugLog('Creating new authentication promise');
      this.authPromise = this._performAuthentication(config);
      const token = await this.authPromise;
      this.authPromise = null;

      this.debugLog('Authentication completed successfully', {
        tokenLength: token ? token.length : 0,
        tokenPrefix: token ? token.substring(0, 10) + '...' : 'null'
      });

      return token;

    } catch (error) {
      this.authPromise = null;
      this.currentState = AUTH_STATES.ERROR;
      this.debugLog('Authentication failed with error', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack?.split('\n')[0] // First line of stack trace
      });
      throw error;
    }
  }

  /**
   * Performs the actual authentication process
   * @param {Object} config - Authentication configuration
   * @returns {Promise<string>} Access token
   */
  async _performAuthentication(config) {
    this.debugLog('Beginning authentication process', {
      forceRefresh: config.forceRefresh,
      interactive: config.interactive
    });

    try {
      this.currentState = AUTH_STATES.AUTHENTICATING;
      this.debugLog('State changed to AUTHENTICATING');

      // Check if we have a valid cached token (unless force refresh)
      if (!config.forceRefresh) {
        this.debugLog('Checking for cached token');
        const cachedToken = await this._getCachedToken();
        if (cachedToken) {
          this.debugLog('Found valid cached token, using it', {
            tokenLength: cachedToken.length,
            tokenPrefix: cachedToken.substring(0, 10) + '...'
          });
          this.currentState = AUTH_STATES.AUTHENTICATED;
          return cachedToken;
        } else {
          this.debugLog('No valid cached token found');
        }
      } else {
        this.debugLog('Force refresh requested, skipping cached token check');
      }

      // Get token from Chrome Identity API
      this.debugLog('Requesting new token from Chrome Identity API', {
        clientId: AUTH_CONFIG.CLIENT_ID,
        interactive: config.interactive
      });
      const token = await this._requestNewToken(config.interactive);

      this.debugLog('Received token from Chrome Identity API', {
        tokenReceived: !!token,
        tokenLength: token ? token.length : 0
      });

      // Validate and store the token
      this.debugLog('Validating and storing token');
      await this._validateAndStoreToken(token);

      this.currentState = AUTH_STATES.AUTHENTICATED;
      this.debugLog('Authentication process completed successfully', {
        finalState: this.currentState
      });

      return token;

    } catch (error) {
      this.currentState = AUTH_STATES.ERROR;
      this.debugLog('Authentication process failed', {
        errorName: error.name,
        errorMessage: error.message,
        finalState: this.currentState
      });
      throw error;
    }
  }

  /**
   * Extracts and validates a token string from Chrome Identity API response
   * @param {string|Object} tokenResult - Raw result from chrome.identity.getAuthToken
   * @returns {string} Validated token string
   * @private
   */
  _extractTokenFromResult(tokenResult) {
    this.debugLog('Starting token extraction', {
      resultProvided: !!tokenResult,
      resultType: typeof tokenResult
    });

    if (!tokenResult) {
      this.debugLog('Token extraction failed: No token result provided');
      throw new Error('No token result provided');
    }

    let extractedToken;
    
    if (typeof tokenResult === 'string') {
      // Direct string token (most common case)
      extractedToken = tokenResult;
      this.debugLog('Token received as string', {
        tokenLength: extractedToken.length
      });
    } else if (typeof tokenResult === 'object' && tokenResult !== null) {
      // Object with token property (Manifest V3 in some Chrome versions)
      const objectKeys = Object.keys(tokenResult);
      this.debugLog('Token received as object', {
        availableKeys: objectKeys
      });

      if (tokenResult.token && typeof tokenResult.token === 'string') {
        extractedToken = tokenResult.token;
        this.debugLog('Token extracted from object.token property', {
          tokenLength: extractedToken.length
        });
      } else if (tokenResult.access_token && typeof tokenResult.access_token === 'string') {
        extractedToken = tokenResult.access_token;
        this.debugLog('Token extracted from object.access_token property', {
          tokenLength: extractedToken.length
        });
      } else {
        this.debugLog('Invalid token object structure', {
          availableKeys: objectKeys,
          hasToken: 'token' in tokenResult,
          hasAccessToken: 'access_token' in tokenResult
        });
        throw new Error('Invalid token object: missing token or access_token property');
      }
    } else {
      this.debugLog('Invalid token type received', {
        tokenType: typeof tokenResult,
        tokenValue: tokenResult
      });
      throw new Error(`Invalid token type received: ${typeof tokenResult}`);
    }

    // Validate the extracted token
    if (!extractedToken || typeof extractedToken !== 'string') {
      this.debugLog('Token validation failed: not a valid string', {
        tokenExists: !!extractedToken,
        tokenType: typeof extractedToken
      });
      throw new Error('Extracted token is not a valid string');
    }

    // Basic token format validation
    if (extractedToken.length < 10) {
      this.debugLog('Token validation failed: too short', {
        tokenLength: extractedToken.length
      });
      throw new Error('Token appears to be too short to be valid');
    }

    // Check for common token patterns
    const tokenPattern = /^[a-zA-Z0-9._-]+$/;
    if (!extractedToken.match(tokenPattern)) {
      this.debugLog('Token contains unexpected characters, but proceeding', {
        tokenLength: extractedToken.length,
        tokenPrefix: extractedToken.substring(0, 10) + '...'
      });
    } else {
      this.debugLog('Token format validation passed', {
        tokenLength: extractedToken.length,
        tokenPrefix: extractedToken.substring(0, 10) + '...'
      });
    }

    return extractedToken;
  }

  /**
   * Test function for token extraction (for debugging purposes)
   * @param {string|Object} testToken - Test token to validate extraction
   * @returns {string} Extracted token
   * @private
   */
  _testTokenExtraction(testToken) {
    try {
      return this._extractTokenFromResult(testToken);
    } catch (error) {
      console.error('Token extraction test failed:', error.message);
      throw error;
    }
  }

  /**
   * Requests a new token from Chrome Identity API
   * @param {boolean} interactive - Whether to show login UI
   * @returns {Promise<string>} Access token
   */
  async _requestNewToken(interactive) {
    this.debugLog('Initiating token request to Chrome Identity API', {
      interactive,
      clientId: AUTH_CONFIG.CLIENT_ID,
      requestedScopes: AUTH_CONFIG.SCOPES,
      scopeCount: AUTH_CONFIG.SCOPES.length,
      chromeIdentityAvailable: !!(typeof chrome !== 'undefined' && chrome.identity),
      chromeVersion: typeof chrome !== 'undefined' ? chrome.runtime.getManifest().version : 'unknown'
    });

    try {
      if (typeof chrome === 'undefined' || !chrome.identity) {
        const errorMsg = 'Chrome Identity API not available';
        this.debugLog('Chrome Identity API unavailable', {
          chromeExists: typeof chrome !== 'undefined',
          chromeIdentityExists: typeof chrome !== 'undefined' && !!chrome.identity,
          userAgent: navigator.userAgent
        });
        throw new Error(errorMsg);
      }

      const requestOptions = { interactive };
      
      // Get manifest client ID for comparison
      const manifestClientId = chrome.runtime.getManifest().oauth2?.client_id;
      
      // Detailed client ID validation and logging
      const clientIdValidation = {
        configClientId: AUTH_CONFIG.CLIENT_ID,
        configClientIdType: typeof AUTH_CONFIG.CLIENT_ID,
        configClientIdLength: AUTH_CONFIG.CLIENT_ID ? AUTH_CONFIG.CLIENT_ID.length : 0,
        configClientIdIsString: typeof AUTH_CONFIG.CLIENT_ID === 'string',
        configClientIdTruthy: !!AUTH_CONFIG.CLIENT_ID,
        configClientIdValue: AUTH_CONFIG.CLIENT_ID, // Full value for debugging
        manifestClientId: manifestClientId,
        manifestClientIdType: typeof manifestClientId,
        manifestClientIdLength: manifestClientId ? manifestClientId.length : 0,
        clientIdsMatch: AUTH_CONFIG.CLIENT_ID === manifestClientId,
        actualValueBeingUsed: AUTH_CONFIG.CLIENT_ID || 'UNDEFINED/NULL'
      };
      
      this.debugLog('CLIENT ID VALIDATION - Pre-Request Analysis', clientIdValidation);
      
      // Check for specific problematic values
      if (!AUTH_CONFIG.CLIENT_ID) {
        this.debugLog('CRITICAL: CLIENT_ID is null/undefined/empty!', {
          configValue: AUTH_CONFIG.CLIENT_ID,
          configType: typeof AUTH_CONFIG.CLIENT_ID,
          manifestValue: manifestClientId
        });
      }
      
      if (AUTH_CONFIG.CLIENT_ID === '0' || AUTH_CONFIG.CLIENT_ID === 0) {
        this.debugLog('CRITICAL: CLIENT_ID is set to zero!', {
          configValue: AUTH_CONFIG.CLIENT_ID,
          configType: typeof AUTH_CONFIG.CLIENT_ID
        });
      }
      
      if (AUTH_CONFIG.CLIENT_ID && AUTH_CONFIG.CLIENT_ID.includes('YOUR_') || AUTH_CONFIG.CLIENT_ID && AUTH_CONFIG.CLIENT_ID.includes('PLACEHOLDER')) {
        this.debugLog('CRITICAL: CLIENT_ID appears to be a placeholder!', {
          configValue: AUTH_CONFIG.CLIENT_ID
        });
      }
      
      this.debugLog('Calling chrome.identity.getAuthToken with detailed config', {
        interactive,
        clientIdUsed: AUTH_CONFIG.CLIENT_ID,
        clientIdLength: AUTH_CONFIG.CLIENT_ID ? AUTH_CONFIG.CLIENT_ID.length : 0,
        clientIdFirstChars: AUTH_CONFIG.CLIENT_ID ? AUTH_CONFIG.CLIENT_ID.substring(0, 15) : 'NULL',
        clientIdLastChars: AUTH_CONFIG.CLIENT_ID ? AUTH_CONFIG.CLIENT_ID.substring(AUTH_CONFIG.CLIENT_ID.length - 10) : 'NULL',
        scopesRequested: AUTH_CONFIG.SCOPES,
        manifestScopes: chrome.runtime.getManifest().oauth2?.scopes || [],
        manifestClientId: manifestClientId,
        requestOptions,
        chromeIdentityFunction: typeof chrome.identity.getAuthToken
      });
      
      // Log the exact request being made to Chrome Identity API
      this.debugLog('ABOUT TO CALL chrome.identity.getAuthToken - Final Request Details', {
        exactRequestOptions: requestOptions,
        chromeObjectExists: !!chrome,
        chromeIdentityExists: !!chrome.identity,
        chromeIdentityGetAuthTokenExists: !!chrome.identity.getAuthToken,
        manifestOAuth2Config: chrome.runtime.getManifest().oauth2,
        authConfigClientId: AUTH_CONFIG.CLIENT_ID,
        requestAboutToBeMade: 'chrome.identity.getAuthToken(requestOptions)'
      });

      const tokenResult = await chrome.identity.getAuthToken(requestOptions);

      this.debugLog('Received response from Chrome Identity API', {
        resultType: typeof tokenResult,
        resultExists: !!tokenResult,
        resultIsString: typeof tokenResult === 'string',
        resultLength: tokenResult ? (typeof tokenResult === 'string' ? tokenResult.length : Object.keys(tokenResult).length) : 0,
        successfulRequest: true,
        resultValue: tokenResult ? (typeof tokenResult === 'string' ? tokenResult.substring(0, 20) + '...' : tokenResult) : 'NULL_RESULT'
      });

      // Extract and validate the token using helper function
      this.debugLog('Extracting token from API response');
      const extractedToken = this._extractTokenFromResult(tokenResult);

      this.debugLog('Token successfully extracted and validated', {
        tokenLength: extractedToken.length,
        tokenPrefix: extractedToken.substring(0, 10) + '...',
        tokenFormat: 'valid'
      });
      return extractedToken;

    } catch (error) {
      // Enhanced error logging to identify "(0)" issue and other Chrome Identity API problems
      const errorString = error.toString();
      const errorMessage = error.message || '';
      
      // Comprehensive error logging with full error object analysis
      const errorAnalysis = this._analyzeAuthError(error);
      
      // Special check for the "(0)" error pattern
      const hasZeroError = errorString.includes('(0)') || errorMessage.includes('(0)');
      const hasClientIdError = errorString.toLowerCase().includes('client') || errorMessage.toLowerCase().includes('client');
      
      this.debugLog('Token request failed with detailed error analysis', {
        errorName: error.name,
        errorMessage: errorMessage,
        errorString: errorString,
        errorStack: error.stack,
        hasZeroErrorPattern: hasZeroError,
        hasClientIdErrorPattern: hasClientIdError,
        fullErrorObject: {
          ...error,
          toString: error.toString(),
          valueOf: error.valueOf ? error.valueOf() : 'no valueOf method'
        },
        chromeIdentityApiState: {
          chromeExists: typeof chrome !== 'undefined',
          chromeIdentityExists: typeof chrome !== 'undefined' && !!chrome.identity,
          getAuthTokenExists: typeof chrome !== 'undefined' && !!chrome.identity?.getAuthToken
        },
        requestContext: {
          interactive,
          clientIdUsed: AUTH_CONFIG.CLIENT_ID,
          clientIdLength: AUTH_CONFIG.CLIENT_ID ? AUTH_CONFIG.CLIENT_ID.length : 0,
          clientIdType: typeof AUTH_CONFIG.CLIENT_ID,
          clientIdIsValidString: typeof AUTH_CONFIG.CLIENT_ID === 'string' && AUTH_CONFIG.CLIENT_ID.length > 10,
          scopesRequested: AUTH_CONFIG.SCOPES,
          manifestClientId: chrome.runtime.getManifest().oauth2?.client_id
        },
        errorAnalysis,
        possibleCauses: hasZeroError ? [
          'Chrome extension manifest.json client_id not properly configured',
          'Chrome Identity API receiving null/undefined client_id',
          'Extension ID mismatch with OAuth client configuration',
          'Chrome browser extension permissions issue'
        ] : errorAnalysis.possibleCauses
      });
      
      // Enhanced error message for "(0)" pattern
      if (hasZeroError) {
        this.debugLog('DETECTED "(0)" ERROR PATTERN - This suggests Chrome Identity API issue', {
          likelyRootCause: 'Chrome is not finding valid OAuth configuration',
          checkPoints: [
            'Verify manifest.json oauth2.client_id is correctly set',
            'Ensure extension is properly loaded/reloaded after manifest changes',
            'Check that client_id matches Google Cloud Console OAuth client',
            'Verify Chrome extension ID matches OAuth client redirect URI'
          ],
          configValues: {
            manifestClientId: chrome.runtime.getManifest().oauth2?.client_id,
            authConfigClientId: AUTH_CONFIG.CLIENT_ID,
            extensionId: chrome.runtime.id
          }
        });
        
        throw new Error(`Chrome Identity API returned "(0)" error - likely OAuth configuration issue. Check that manifest.json client_id is correctly configured and extension is properly loaded. Original error: ${errorMessage}`);
      }
      
      // Throw specific error based on analysis
      throw new Error(errorAnalysis.specificMessage);
    }
  }

  /**
   * Analyzes authentication errors to provide specific diagnosis
   * @param {Error} error - The original error from Chrome Identity API
   * @returns {Object} Error analysis with specific diagnosis
   * @private
   */
  _analyzeAuthError(error) {
    const errorMsg = error.message || '';
    const errorStr = error.toString() || '';
    const fullErrorText = `${errorMsg} ${errorStr}`.toLowerCase();

    let errorType = 'unknown';
    let specificMessage = '';
    let possibleCauses = [];
    let suggestedActions = [];

    // Analyze error patterns for specific issues
    if (fullErrorText.includes('oauth2 not granted') || fullErrorText.includes('not granted or revoked')) {
      errorType = 'oauth_not_granted';
      specificMessage = 'OAuth2 permission not granted. The extension needs to be authorized.';
      possibleCauses = [
        'User has not completed the OAuth consent flow',
        'OAuth consent was revoked',
        'Client ID not properly configured in Google Cloud Console'
      ];
      suggestedActions = [
        'Run interactive authentication to show consent screen',
        'Check OAuth client configuration in Google Cloud Console',
        'Verify redirect URIs are properly configured'
      ];
    } else if (fullErrorText.includes('user did not approve') || fullErrorText.includes('access_denied')) {
      errorType = 'user_denied';
      specificMessage = 'User denied authorization. Please try again and approve access.';
      possibleCauses = [
        'User clicked "Cancel" or "Deny" on consent screen',
        'User closed the consent window without completing authorization'
      ];
      suggestedActions = [
        'Retry authentication and ensure user clicks "Allow"',
        'Explain to user why permissions are needed'
      ];
    } else if (fullErrorText.includes('user cancelled') || fullErrorText.includes('cancelled')) {
      errorType = 'user_cancelled';
      specificMessage = 'User cancelled the authorization process.';
      possibleCauses = ['User closed consent window before completing'];
      suggestedActions = ['Retry authentication when user is ready'];
    } else if (fullErrorText.includes('invalid_client') || fullErrorText.includes('client_id')) {
      errorType = 'invalid_client';
      specificMessage = 'Invalid client configuration. Check your OAuth client ID.';
      possibleCauses = [
        'Client ID is incorrect or not found',
        'Client ID not enabled for this domain',
        'OAuth client not properly configured in Google Cloud Console'
      ];
      suggestedActions = [
        'Verify client ID in manifest.json matches Google Cloud Console',
        'Check that OAuth client is enabled',
        'Verify authorized domains are configured'
      ];
    } else if (fullErrorText.includes('invalid_scope') || fullErrorText.includes('scope')) {
      errorType = 'invalid_scope';
      specificMessage = 'Invalid or unauthorized scopes requested.';
      possibleCauses = [
        'Requested scopes are not enabled for this client',
        'Scopes require additional API enablement',
        'Scope names are incorrect'
      ];
      suggestedActions = [
        'Check that required APIs are enabled in Google Cloud Console',
        'Verify scope names match Google API documentation',
        'Enable Google Sheets API and Gmail API'
      ];
    } else if (fullErrorText.includes('api not enabled') || fullErrorText.includes('api_not_enabled')) {
      errorType = 'api_not_enabled';
      specificMessage = 'Required Google APIs are not enabled. Enable Google Sheets API and Gmail API.';
      possibleCauses = [
        'Google Sheets API not enabled',
        'Gmail API not enabled',
        'OAuth API not enabled'
      ];
      suggestedActions = [
        'Enable Google Sheets API in Google Cloud Console',
        'Enable Gmail API in Google Cloud Console',
        'Enable Google OAuth2 API'
      ];
    } else if (fullErrorText.includes('consent') || fullErrorText.includes('verification')) {
      errorType = 'consent_required';
      specificMessage = 'OAuth consent screen verification required. The app may need to be verified by Google.';
      possibleCauses = [
        'OAuth consent screen not configured',
        'App needs Google verification for sensitive scopes',
        'Consent screen is in testing mode with limited users'
      ];
      suggestedActions = [
        'Configure OAuth consent screen in Google Cloud Console',
        'Add test users if app is in testing mode',
        'Submit app for verification if using sensitive scopes'
      ];
    } else if (fullErrorText.includes('network') || fullErrorText.includes('fetch') || error.name === 'TypeError') {
      errorType = 'network_error';
      specificMessage = 'Network error during authentication. Check your internet connection.';
      possibleCauses = [
        'No internet connection',
        'Firewall blocking OAuth requests',
        'Google services temporarily unavailable'
      ];
      suggestedActions = [
        'Check internet connection',
        'Retry authentication',
        'Check if corporate firewall is blocking Google APIs'
      ];
    } else if (fullErrorText.includes('redirect_uri') || fullErrorText.includes('redirect')) {
      errorType = 'redirect_uri_error';
      specificMessage = 'OAuth redirect URI error. Check OAuth client configuration.';
      possibleCauses = [
        'Redirect URI not configured in OAuth client',
        'Chrome extension ID mismatch',
        'Invalid redirect URI format'
      ];
      suggestedActions = [
        'Add proper Chrome extension redirect URI to OAuth client',
        'Verify extension ID matches configuration'
      ];
    } else {
      errorType = 'unknown_error';
      specificMessage = `Authentication failed with unknown error: ${errorMsg}`;
      possibleCauses = ['Unexpected error from Chrome Identity API'];
      suggestedActions = [
        'Check browser console for more details',
        'Try clearing extension data and re-authenticating',
        'Check Google Cloud Console for OAuth client status'
      ];
    }

    return {
      errorType,
      specificMessage,
      possibleCauses,
      suggestedActions,
      originalError: errorMsg,
      fullAnalysis: {
        messageAnalyzed: errorMsg,
        stringAnalyzed: errorStr,
        errorName: error.name
      }
    };
  }

  /**
   * Gets a cached token if it's still valid
   * @returns {Promise<string|null>} Cached token or null
   */
  async _getCachedToken() {
    this.debugLog('Checking for cached token');

    try {
      const result = await chrome.storage.local.get([
        AUTH_CONFIG.TOKEN_STORAGE_KEY,
        AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY
      ]);

      const cachedToken = result[AUTH_CONFIG.TOKEN_STORAGE_KEY];
      const tokenInfo = result[AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY];

      this.debugLog('Retrieved cached data from storage', {
        hasToken: !!cachedToken,
        hasTokenInfo: !!tokenInfo,
        tokenLength: cachedToken ? cachedToken.length : 0
      });

      if (!cachedToken || !tokenInfo) {
        this.debugLog('No cached token or token info found');
        return null;
      }

      // Check if token is expired (with buffer)
      const now = Date.now();
      const expiryTime = tokenInfo.expiryTime - AUTH_CONFIG.TOKEN_EXPIRY_BUFFER;
      const timeUntilExpiry = expiryTime - now;

      this.debugLog('Checking token expiry', {
        now: new Date(now).toISOString(),
        expiryTime: new Date(expiryTime).toISOString(),
        timeUntilExpiryMs: timeUntilExpiry,
        timeUntilExpiryMinutes: Math.round(timeUntilExpiry / 1000 / 60),
        isExpired: now >= expiryTime
      });

      if (now >= expiryTime) {
        this.debugLog('Cached token is expired, clearing it');
        await this._clearStoredToken();
        return null;
      }

      const minutesRemaining = Math.round(timeUntilExpiry / 1000 / 60);
      this.debugLog('Cached token is valid', {
        minutesRemaining,
        email: tokenInfo.email
      });
      
      this.tokenInfo = tokenInfo;
      return cachedToken;

    } catch (error) {
      this.debugLog('Error checking cached token', {
        errorName: error.name,
        errorMessage: error.message
      });
      return null;
    }
  }

  /**
   * Validates a token and stores it with metadata
   * @param {string} token - Access token to validate
   */
  async _validateAndStoreToken(token) {
    try {
      console.log('Validating and storing token...');

      // Get token info from Google's tokeninfo endpoint
      const tokenInfo = await this._getTokenInfo(token);

      // Verify the token is for our client
      if (tokenInfo.aud !== AUTH_CONFIG.CLIENT_ID) {
        throw new Error('Token client ID mismatch');
      }

      // Verify required scopes are present
      const tokenScopes = tokenInfo.scope ? tokenInfo.scope.split(' ') : [];
      const missingScopes = AUTH_CONFIG.SCOPES.filter(scope => !tokenScopes.includes(scope));
      
      if (missingScopes.length > 0) {
        console.warn('Token missing some scopes:', missingScopes);
      }

      // Calculate expiry time (Google returns expires_in as seconds)
      const expiryTime = Date.now() + (parseInt(tokenInfo.expires_in) * 1000);

      const storedTokenInfo = {
        email: tokenInfo.email,
        scopes: tokenScopes,
        expiryTime: expiryTime,
        issuedAt: Date.now(),
        clientId: tokenInfo.aud
      };

      // Store token and info
      await chrome.storage.local.set({
        [AUTH_CONFIG.TOKEN_STORAGE_KEY]: token,
        [AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY]: storedTokenInfo
      });

      this.tokenInfo = storedTokenInfo;
      console.log('Token validated and stored successfully');

    } catch (error) {
      console.error('Error validating token:', error);
      throw new Error(`Token validation failed: ${error.message}`);
    }
  }

  /**
   * Gets token information from Google's tokeninfo endpoint
   * @param {string} token - Access token to validate
   * @param {number} retryAttempt - Current retry attempt (for internal use)
   * @returns {Promise<Object>} Token information
   */
  async _getTokenInfo(token, retryAttempt = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second

    try {
      console.log(`Validating token with Google tokeninfo endpoint (attempt ${retryAttempt + 1}/${MAX_RETRIES + 1})`);

      // Use the correct current Google tokeninfo endpoint with proper URL encoding
      const params = new URLSearchParams({ access_token: token });
      const url = `https://oauth2.googleapis.com/tokeninfo?${params.toString()}`;
      
      console.log('Making tokeninfo request to:', url.replace(token, 'TOKEN_HIDDEN'));

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Google-Translate-Scraper/1.0'
        }
      });

      console.log(`Tokeninfo response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        // Get error details from response body if available
        let errorDetails = '';
        try {
          const errorBody = await response.text();
          console.log('Error response body:', errorBody);
          
          // Try to parse as JSON for structured error
          try {
            const errorJson = JSON.parse(errorBody);
            errorDetails = errorJson.error_description || errorJson.error || errorBody;
          } catch {
            errorDetails = errorBody || 'Unknown error';
          }
        } catch {
          errorDetails = 'Failed to read error details';
        }

        // Handle different error types
        if (response.status === 400) {
          // Bad request - likely invalid token format or expired token
          if (errorDetails.toLowerCase().includes('invalid') || 
              errorDetails.toLowerCase().includes('malformed')) {
            throw new Error(`Invalid token format: ${errorDetails}`);
          } else if (errorDetails.toLowerCase().includes('expired')) {
            throw new Error(`Token has expired: ${errorDetails}`);
          } else {
            throw new Error(`Invalid token: ${errorDetails}`);
          }
        } else if (response.status === 401) {
          throw new Error(`Token authentication failed: ${errorDetails}`);
        } else if (response.status === 403) {
          throw new Error(`Token access forbidden: ${errorDetails}`);
        } else if (response.status >= 500) {
          // Server error - retry if we haven't reached max retries
          const error = new Error(`Google server error (${response.status}): ${errorDetails}`);
          error.isRetryable = true;
          throw error;
        } else if (response.status === 429) {
          // Rate limited - retry after delay
          const error = new Error(`Rate limited: ${errorDetails}`);
          error.isRetryable = true;
          throw error;
        } else {
          throw new Error(`Token validation failed (${response.status}): ${errorDetails}`);
        }
      }

      const tokenInfo = await response.json();
      console.log('Token validation successful, expires at:', new Date(tokenInfo.exp * 1000).toISOString());
      
      // Double-check for embedded errors in successful response
      if (tokenInfo.error) {
        throw new Error(`Token validation error: ${tokenInfo.error_description || tokenInfo.error}`);
      }

      // Validate required fields
      if (!tokenInfo.aud || !tokenInfo.exp) {
        throw new Error('Invalid token info response: missing required fields');
      }

      return tokenInfo;

    } catch (error) {
      console.error(`Error getting token info (attempt ${retryAttempt + 1}):`, error.message);
      
      // Check if we should retry
      const shouldRetry = (
        retryAttempt < MAX_RETRIES && 
        (error.isRetryable || 
         error.name === 'TypeError' || // Network errors
         error.message.includes('network') ||
         error.message.includes('timeout') ||
         error.message.includes('fetch'))
      );

      if (shouldRetry) {
        const delay = RETRY_DELAY * Math.pow(2, retryAttempt); // Exponential backoff
        console.log(`Retrying token validation in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this._getTokenInfo(token, retryAttempt + 1);
      }

      // Add context to error message
      const contextualError = new Error(
        `Token validation failed after ${retryAttempt + 1} attempts: ${error.message}`
      );
      contextualError.originalError = error;
      throw contextualError;
    }
  }

  /**
   * Clears stored authentication tokens
   * @returns {Promise<boolean>} Success status
   */
  async clearAuthToken() {
    try {
      console.log('Clearing stored auth tokens...');

      // Remove from Chrome Identity cache
      if (this.tokenInfo) {
        try {
          await chrome.identity.removeCachedAuthToken({ 
            token: await chrome.storage.local.get([AUTH_CONFIG.TOKEN_STORAGE_KEY])
              .then(result => result[AUTH_CONFIG.TOKEN_STORAGE_KEY])
          });
        } catch (error) {
          console.warn('Error removing cached token from Chrome Identity:', error);
        }
      }

      // Clear from local storage
      await this._clearStoredToken();

      // Reset state
      this.currentState = AUTH_STATES.UNAUTHENTICATED;
      this.tokenInfo = null;
      this.authPromise = null;

      console.log('Auth tokens cleared successfully');
      return true;

    } catch (error) {
      console.error('Error clearing auth tokens:', error);
      return false;
    }
  }

  /**
   * Clears stored token from local storage
   */
  async _clearStoredToken() {
    await chrome.storage.local.remove([
      AUTH_CONFIG.TOKEN_STORAGE_KEY,
      AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY
    ]);
  }

  /**
   * Checks current authentication status
   * @returns {Promise<Object>} Authentication status information
   */
  async checkAuthStatus() {
    try {
      console.log('Checking authentication status...');

      const result = await chrome.storage.local.get([
        AUTH_CONFIG.TOKEN_STORAGE_KEY,
        AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY
      ]);

      const hasToken = !!result[AUTH_CONFIG.TOKEN_STORAGE_KEY];
      const tokenInfo = result[AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY];

      if (!hasToken || !tokenInfo) {
        return {
          isAuthenticated: false,
          state: AUTH_STATES.UNAUTHENTICATED,
          user: null,
          scopes: [],
          expiryTime: null
        };
      }

      // Check if token is expired
      const now = Date.now();
      const isExpired = now >= (tokenInfo.expiryTime - AUTH_CONFIG.TOKEN_EXPIRY_BUFFER);

      const status = {
        isAuthenticated: !isExpired,
        state: isExpired ? AUTH_STATES.TOKEN_EXPIRED : AUTH_STATES.AUTHENTICATED,
        user: {
          email: tokenInfo.email
        },
        scopes: tokenInfo.scopes || [],
        expiryTime: tokenInfo.expiryTime,
        timeUntilExpiry: Math.max(0, tokenInfo.expiryTime - now)
      };

      console.log('Auth status check completed:', status);
      return status;

    } catch (error) {
      console.error('Error checking auth status:', error);
      return {
        isAuthenticated: false,
        state: AUTH_STATES.ERROR,
        error: error.message,
        user: null,
        scopes: [],
        expiryTime: null
      };
    }
  }

  /**
   * Gets headers for Google API calls
   * @param {Object} options - Header options
   * @param {boolean} options.includeApiKey - Whether to include API key
   * @returns {Promise<Object>} Headers object
   */
  async getGoogleApiHeaders(options = {}) {
    try {
      const config = {
        includeApiKey: options.includeApiKey !== false // Default to true
      };

      const token = await this.getAuthToken({ interactive: false });
      
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      if (config.includeApiKey) {
        headers['X-Goog-Api-Key'] = AUTH_CONFIG.API_KEY;
      }

      return headers;

    } catch (error) {
      console.error('Error getting API headers:', error);
      throw new Error(`Failed to get API headers: ${error.message}`);
    }
  }

  /**
   * Revokes authentication and clears all tokens
   * @returns {Promise<boolean>} Success status
   */
  async revokeAuthentication() {
    try {
      console.log('Revoking authentication...');

      // Get current token
      const result = await chrome.storage.local.get([AUTH_CONFIG.TOKEN_STORAGE_KEY]);
      const token = result[AUTH_CONFIG.TOKEN_STORAGE_KEY];

      if (token) {
        // Revoke token with Google
        try {
          const params = new URLSearchParams({ token: token });
          const response = await fetch('https://oauth2.googleapis.com/revoke', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: params.toString()
          });
          
          if (response.ok) {
            console.log('Token revoked with Google successfully');
          } else {
            console.warn(`Token revocation failed: ${response.status} ${response.statusText}`);
          }
        } catch (error) {
          console.warn('Error revoking token with Google:', error);
        }
      }

      // Clear all local tokens
      await this.clearAuthToken();

      console.log('Authentication revoked successfully');
      return true;

    } catch (error) {
      console.error('Error revoking authentication:', error);
      return false;
    }
  }

  /**
   * Gets current user information
   * @param {number} retryAttempt - Current retry attempt (for internal use)
   * @returns {Promise<Object>} User information
   */
  async getUserInfo(retryAttempt = 0) {
    const MAX_RETRIES = 2;
    const RETRY_DELAY = 1000;

    try {
      console.log(`Getting user info (attempt ${retryAttempt + 1}/${MAX_RETRIES + 1})`);
      
      const headers = await this.getGoogleApiHeaders();
      
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        method: 'GET',
        headers: {
          ...headers,
          'Accept': 'application/json'
        }
      });

      console.log(`User info response status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        let errorDetails = '';
        try {
          const errorBody = await response.text();
          try {
            const errorJson = JSON.parse(errorBody);
            errorDetails = errorJson.error_description || errorJson.error || errorBody;
          } catch {
            errorDetails = errorBody || 'Unknown error';
          }
        } catch {
          errorDetails = 'Failed to read error details';
        }

        // Handle different error types
        if (response.status === 401) {
          throw new Error(`Authentication failed: ${errorDetails}`);
        } else if (response.status === 403) {
          throw new Error(`Access forbidden: ${errorDetails}`);
        } else if (response.status >= 500) {
          const error = new Error(`Google server error (${response.status}): ${errorDetails}`);
          error.isRetryable = true;
          throw error;
        } else if (response.status === 429) {
          const error = new Error(`Rate limited: ${errorDetails}`);
          error.isRetryable = true;
          throw error;
        } else {
          throw new Error(`Failed to get user info (${response.status}): ${errorDetails}`);
        }
      }

      const userInfo = await response.json();
      console.log('User info retrieved successfully:', { email: userInfo.email, name: userInfo.name });

      // Validate required fields
      if (!userInfo.email) {
        throw new Error('Invalid user info response: missing email');
      }

      return userInfo;

    } catch (error) {
      console.error(`Error getting user info (attempt ${retryAttempt + 1}):`, error.message);
      
      // Check if we should retry
      const shouldRetry = (
        retryAttempt < MAX_RETRIES && 
        (error.isRetryable || 
         error.name === 'TypeError' || // Network errors
         error.message.includes('network') ||
         error.message.includes('timeout') ||
         error.message.includes('fetch'))
      );

      if (shouldRetry) {
        const delay = RETRY_DELAY * Math.pow(2, retryAttempt);
        console.log(`Retrying user info request in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.getUserInfo(retryAttempt + 1);
      }

      // Add context to error message
      const contextualError = new Error(
        `Failed to get user info after ${retryAttempt + 1} attempts: ${error.message}`
      );
      contextualError.originalError = error;
      throw contextualError;
    }
  }

  /**
   * Retrieves stored debug logs for troubleshooting
   * @returns {Promise<Array>} Array of debug log entries
   */
  async getDebugLogs() {
    try {
      if (!AUTH_CONFIG.DEBUG) {
        return ['Debug logging is disabled'];
      }

      const result = await chrome.storage.local.get(['auth_debug_logs']);
      const logs = result.auth_debug_logs || [];
      
      this.debugLog('Retrieved debug logs', {
        logCount: logs.length,
        latestLogTime: logs.length > 0 ? logs[logs.length - 1].timestamp : 'none'
      });

      return logs;
    } catch (error) {
      console.error('Error retrieving debug logs:', error);
      return [`Error retrieving logs: ${error.message}`];
    }
  }

  /**
   * Clears stored debug logs
   * @returns {Promise<boolean>} Success status
   */
  async clearDebugLogs() {
    try {
      await chrome.storage.local.remove(['auth_debug_logs']);
      this.debugLog('Debug logs cleared');
      return true;
    } catch (error) {
      console.error('Error clearing debug logs:', error);
      return false;
    }
  }

  /**
   * Tests if required Google APIs are enabled and accessible
   * @param {Object} options - Testing options
   * @param {boolean} options.interactive - Whether to attempt interactive auth if needed
   * @returns {Promise<Object>} API availability test results
   */
  async testApiAvailability(options = {}) {
    const config = {
      interactive: options.interactive !== false
    };

    this.debugLog('Starting API availability test', {
      clientId: AUTH_CONFIG.CLIENT_ID,
      scopes: AUTH_CONFIG.SCOPES,
      interactive: config.interactive
    });

    const results = {
      timestamp: new Date().toISOString(),
      authStatus: 'unknown',
      apis: {
        sheets: { available: false, error: null, details: null },
        gmail: { available: false, error: null, details: null },
        oauth2: { available: false, error: null, details: null }
      },
      overallSuccess: false,
      recommendations: []
    };

    try {
      // Step 1: Test authentication
      this.debugLog('Testing authentication');
      let token;
      try {
        token = await this.getAuthToken({ interactive: config.interactive });
        results.authStatus = 'success';
        this.debugLog('Authentication test passed', { tokenLength: token.length });
      } catch (authError) {
        results.authStatus = 'failed';
        results.authError = {
          message: authError.message,
          type: 'authentication_error'
        };
        this.debugLog('Authentication test failed', { error: authError.message });
        
        // If auth fails, we can't test APIs
        results.recommendations.push('Fix authentication issues before testing API availability');
        return results;
      }

      // Step 2: Test Google Sheets API
      this.debugLog('Testing Google Sheets API availability');
      try {
        const sheetsResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets?pageSize=1', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        this.debugLog('Sheets API response received', {
          status: sheetsResponse.status,
          statusText: sheetsResponse.statusText,
          headers: Object.fromEntries(sheetsResponse.headers.entries())
        });

        if (sheetsResponse.ok) {
          const sheetsData = await sheetsResponse.json();
          results.apis.sheets = {
            available: true,
            error: null,
            details: {
              status: sheetsResponse.status,
              hasFiles: !!sheetsData.files,
              fileCount: sheetsData.files ? sheetsData.files.length : 0
            }
          };
          this.debugLog('Google Sheets API test passed');
        } else {
          const errorText = await sheetsResponse.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }

          results.apis.sheets = {
            available: false,
            error: {
              status: sheetsResponse.status,
              statusText: sheetsResponse.statusText,
              message: errorData.error?.message || errorData.message || 'Unknown error',
              code: errorData.error?.code || sheetsResponse.status
            },
            details: null
          };

          this.debugLog('Google Sheets API test failed', {
            status: sheetsResponse.status,
            error: errorData
          });

          if (sheetsResponse.status === 403) {
            if (errorText.includes('API_NOT_ENABLED') || errorText.includes('api not enabled')) {
              results.recommendations.push('Enable Google Sheets API in Google Cloud Console');
            } else if (errorText.includes('PERMISSION_DENIED')) {
              results.recommendations.push('Add Google Sheets API scope to OAuth consent screen');
            }
          }
        }
      } catch (networkError) {
        results.apis.sheets = {
          available: false,
          error: {
            type: 'network_error',
            message: networkError.message
          },
          details: null
        };
        this.debugLog('Google Sheets API network error', { error: networkError.message });
        results.recommendations.push('Check network connectivity for Google Sheets API');
      }

      // Step 3: Test Gmail API
      this.debugLog('Testing Gmail API availability');
      try {
        const gmailResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        this.debugLog('Gmail API response received', {
          status: gmailResponse.status,
          statusText: gmailResponse.statusText
        });

        if (gmailResponse.ok) {
          const gmailData = await gmailResponse.json();
          results.apis.gmail = {
            available: true,
            error: null,
            details: {
              status: gmailResponse.status,
              emailAddress: gmailData.emailAddress,
              messagesTotal: gmailData.messagesTotal,
              threadsTotal: gmailData.threadsTotal
            }
          };
          this.debugLog('Gmail API test passed', { emailAddress: gmailData.emailAddress });
        } else {
          const errorText = await gmailResponse.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }

          results.apis.gmail = {
            available: false,
            error: {
              status: gmailResponse.status,
              statusText: gmailResponse.statusText,
              message: errorData.error?.message || errorData.message || 'Unknown error',
              code: errorData.error?.code || gmailResponse.status
            },
            details: null
          };

          this.debugLog('Gmail API test failed', {
            status: gmailResponse.status,
            error: errorData
          });

          if (gmailResponse.status === 403) {
            if (errorText.includes('API_NOT_ENABLED') || errorText.includes('api not enabled')) {
              results.recommendations.push('Enable Gmail API in Google Cloud Console');
            } else if (errorText.includes('PERMISSION_DENIED')) {
              results.recommendations.push('Add Gmail API scope to OAuth consent screen');
            }
          }
        }
      } catch (networkError) {
        results.apis.gmail = {
          available: false,
          error: {
            type: 'network_error',
            message: networkError.message
          },
          details: null
        };
        this.debugLog('Gmail API network error', { error: networkError.message });
        results.recommendations.push('Check network connectivity for Gmail API');
      }

      // Step 4: Test OAuth2 API (user info)
      this.debugLog('Testing OAuth2 API availability');
      try {
        const oauth2Response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        this.debugLog('OAuth2 API response received', {
          status: oauth2Response.status,
          statusText: oauth2Response.statusText
        });

        if (oauth2Response.ok) {
          const userData = await oauth2Response.json();
          results.apis.oauth2 = {
            available: true,
            error: null,
            details: {
              status: oauth2Response.status,
              email: userData.email,
              name: userData.name,
              verified: userData.verified_email
            }
          };
          this.debugLog('OAuth2 API test passed', { email: userData.email });
        } else {
          const errorText = await oauth2Response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            errorData = { message: errorText };
          }

          results.apis.oauth2 = {
            available: false,
            error: {
              status: oauth2Response.status,
              statusText: oauth2Response.statusText,
              message: errorData.error?.message || errorData.message || 'Unknown error'
            },
            details: null
          };
          this.debugLog('OAuth2 API test failed', { status: oauth2Response.status, error: errorData });
        }
      } catch (networkError) {
        results.apis.oauth2 = {
          available: false,
          error: {
            type: 'network_error',
            message: networkError.message
          },
          details: null
        };
        this.debugLog('OAuth2 API network error', { error: networkError.message });
      }

      // Step 5: Determine overall success and add general recommendations
      const apisAvailable = Object.values(results.apis).filter(api => api.available).length;
      const totalApis = Object.keys(results.apis).length;
      
      results.overallSuccess = apisAvailable === totalApis;
      
      this.debugLog('API availability test completed', {
        overallSuccess: results.overallSuccess,
        apisAvailable: `${apisAvailable}/${totalApis}`,
        recommendations: results.recommendations
      });

      // Add general recommendations based on results
      if (!results.apis.sheets.available && !results.apis.gmail.available) {
        results.recommendations.push('Multiple APIs are not available - check Google Cloud Console project settings');
      }
      
      if (results.recommendations.length === 0 && results.overallSuccess) {
        results.recommendations.push('All APIs are working correctly!');
      }

      return results;

    } catch (error) {
      this.debugLog('API availability test failed with unexpected error', {
        errorName: error.name,
        errorMessage: error.message,
        errorStack: error.stack
      });

      results.apis = {
        sheets: { available: false, error: { type: 'test_error', message: error.message }, details: null },
        gmail: { available: false, error: { type: 'test_error', message: error.message }, details: null },
        oauth2: { available: false, error: { type: 'test_error', message: error.message }, details: null }
      };
      results.recommendations.push('Unexpected error during API testing - check browser console for details');
      
             return results;
     }
   }

  /**
   * Runs a comprehensive OAuth diagnostic that includes all tests and logs
   * @param {Object} options - Diagnostic options
   * @param {boolean} options.interactive - Whether to run interactive tests
   * @param {boolean} options.includeDebugLogs - Whether to include recent debug logs
   * @returns {Promise<Object>} Complete diagnostic results
   */
  async runComprehensiveDiagnostic(options = {}) {
    const config = {
      interactive: options.interactive !== false,
      includeDebugLogs: options.includeDebugLogs !== false
    };

    this.debugLog('Starting comprehensive OAuth diagnostic', {
      interactive: config.interactive,
      includeDebugLogs: config.includeDebugLogs,
      timestamp: new Date().toISOString()
    });

    const diagnostic = {
      timestamp: new Date().toISOString(),
      configuration: {
        clientId: AUTH_CONFIG.CLIENT_ID,
        clientIdLength: AUTH_CONFIG.CLIENT_ID.length,
        scopes: AUTH_CONFIG.SCOPES,
        apiKey: AUTH_CONFIG.API_KEY ? 'configured' : 'missing',
        debugEnabled: AUTH_CONFIG.DEBUG
      },
      environment: {
        userAgent: navigator.userAgent,
        chromeAvailable: typeof chrome !== 'undefined',
        chromeIdentityAvailable: typeof chrome !== 'undefined' && !!chrome.identity,
        manifestVersion: typeof chrome !== 'undefined' ? chrome.runtime.getManifest().manifest_version : 'unknown',
        extensionId: typeof chrome !== 'undefined' ? chrome.runtime.id : 'unknown'
      },
      authStatus: null,
      apiTests: null,
      debugLogs: null,
      recommendations: [],
      summary: {
        overallStatus: 'unknown',
        criticalIssues: [],
        warnings: []
      }
    };

    try {
      // Step 1: Check authentication status
      this.debugLog('Checking authentication status');
      try {
        diagnostic.authStatus = await this.checkAuthStatus();
        if (diagnostic.authStatus.isAuthenticated) {
          diagnostic.summary.overallStatus = 'authenticated';
        } else {
          diagnostic.summary.criticalIssues.push('User is not authenticated');
        }
      } catch (error) {
        diagnostic.authStatus = { error: error.message, isAuthenticated: false };
        diagnostic.summary.criticalIssues.push(`Authentication check failed: ${error.message}`);
      }

      // Step 2: Run API availability tests
      this.debugLog('Running API availability tests');
      try {
        diagnostic.apiTests = await this.testApiAvailability({ interactive: config.interactive });
        if (!diagnostic.apiTests.overallSuccess) {
          diagnostic.summary.criticalIssues.push('Not all required APIs are available');
          diagnostic.recommendations.push(...diagnostic.apiTests.recommendations);
        }
      } catch (error) {
        diagnostic.apiTests = { error: error.message, overallSuccess: false };
        diagnostic.summary.criticalIssues.push(`API testing failed: ${error.message}`);
      }

      // Step 3: Include debug logs if requested
      if (config.includeDebugLogs) {
        this.debugLog('Retrieving debug logs');
        try {
          diagnostic.debugLogs = await this.getDebugLogs();
        } catch (error) {
          diagnostic.debugLogs = [`Error retrieving logs: ${error.message}`];
          diagnostic.summary.warnings.push('Could not retrieve debug logs');
        }
      }

      // Step 4: Generate summary and recommendations
      if (diagnostic.summary.criticalIssues.length === 0) {
        diagnostic.summary.overallStatus = 'healthy';
        diagnostic.recommendations.push('All OAuth and API systems are functioning correctly!');
      } else {
        diagnostic.summary.overallStatus = 'issues_detected';
        
        // Add general recommendations based on common issues
        if (diagnostic.summary.criticalIssues.some(issue => issue.includes('authenticated'))) {
          diagnostic.recommendations.unshift('Run interactive authentication to authorize the extension');
        }
        
        if (diagnostic.summary.criticalIssues.some(issue => issue.includes('API'))) {
          diagnostic.recommendations.push('Check Google Cloud Console for API enablement and configuration');
        }
      }

      this.debugLog('Comprehensive diagnostic completed', {
        overallStatus: diagnostic.summary.overallStatus,
        criticalIssuesCount: diagnostic.summary.criticalIssues.length,
        warningsCount: diagnostic.summary.warnings.length,
        recommendationsCount: diagnostic.recommendations.length
      });

      return diagnostic;

    } catch (error) {
      this.debugLog('Comprehensive diagnostic failed with unexpected error', {
        errorName: error.name,
        errorMessage: error.message
      });

      diagnostic.summary.overallStatus = 'diagnostic_error';
      diagnostic.summary.criticalIssues.push(`Diagnostic process failed: ${error.message}`);
      diagnostic.recommendations.push('Check browser console for detailed error information');

      return diagnostic;
    }
  }
}

// Export singleton instance
const authManager = new AuthManager();

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = { AuthManager, authManager, AUTH_CONFIG, AUTH_STATES };
} else {
  // Determine the global object based on environment
  let globalObj;
  
  if (typeof globalThis !== 'undefined') {
    globalObj = globalThis;
  } else if (typeof self !== 'undefined') {
    globalObj = self;
  } else if (typeof window !== 'undefined') {
    globalObj = window;
  } else {
    globalObj = {};
  }
  
  // Attach to the appropriate global object
  globalObj.AuthManager = AuthManager;
  globalObj.authManager = authManager;
  globalObj.AUTH_CONFIG = AUTH_CONFIG;
  globalObj.AUTH_STATES = AUTH_STATES;
  
  console.log('Auth Manager attached to global object:', typeof globalObj);
}

console.log('Auth Manager module loaded successfully'); 