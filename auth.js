/**
 * Google Translate Starred Words Scraper - Authentication Manager
 * Handles Google OAuth authentication using Chrome Identity API
 * Supports Google Sheets, Gmail, and user info APIs
 */

// Configuration constants
const AUTH_CONFIG = {
  API_KEY: 'AIzaSyCmg6hbmyXqvv1Jhjy0dJHpaUHvbfbCRnA',
  CLIENT_ID: '734462042602-7f6r7h8851tjprf7lqn5l1726at886pr.apps.googleusercontent.com',
  SCOPES: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/userinfo.email'
  ],
  TOKEN_STORAGE_KEY: 'google_auth_token',
  TOKEN_INFO_STORAGE_KEY: 'google_token_info',
  TOKEN_EXPIRY_BUFFER: 5 * 60 * 1000, // 5 minutes buffer before expiry
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
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
    
    console.log('AuthManager initialized');
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

    console.log('Getting auth token with options:', config);

    try {
      // Prevent multiple concurrent authentication attempts
      if (this.authPromise) {
        console.log('Authentication already in progress, waiting...');
        return await this.authPromise;
      }

      this.authPromise = this._performAuthentication(config);
      const token = await this.authPromise;
      this.authPromise = null;

      return token;

    } catch (error) {
      this.authPromise = null;
      console.error('Error getting auth token:', error);
      this.currentState = AUTH_STATES.ERROR;
      throw error;
    }
  }

  /**
   * Performs the actual authentication process
   * @param {Object} config - Authentication configuration
   * @returns {Promise<string>} Access token
   */
  async _performAuthentication(config) {
    try {
      this.currentState = AUTH_STATES.AUTHENTICATING;

      // Check if we have a valid cached token (unless force refresh)
      if (!config.forceRefresh) {
        const cachedToken = await this._getCachedToken();
        if (cachedToken) {
          console.log('Using cached valid token');
          this.currentState = AUTH_STATES.AUTHENTICATED;
          return cachedToken;
        }
      }

      // Get token from Chrome Identity API
      console.log('Requesting new token from Chrome Identity API...');
      const token = await this._requestNewToken(config.interactive);

      // Validate and store the token
      await this._validateAndStoreToken(token);

      this.currentState = AUTH_STATES.AUTHENTICATED;
      console.log('Authentication successful');

      return token;

    } catch (error) {
      this.currentState = AUTH_STATES.ERROR;
      console.error('Authentication failed:', error);
      throw error;
    }
  }

  /**
   * Requests a new token from Chrome Identity API
   * @param {boolean} interactive - Whether to show login UI
   * @returns {Promise<string>} Access token
   */
  async _requestNewToken(interactive) {
    try {
      const token = await chrome.identity.getAuthToken({
        interactive: interactive
      });

      if (!token) {
        throw new Error('No token received from Chrome Identity API');
      }

      console.log('New token received from Chrome Identity API');
      return token;

    } catch (error) {
      console.error('Error requesting new token:', error);
      
      // Handle specific Chrome Identity API errors
      if (error.message.includes('OAuth2 not granted or revoked')) {
        throw new Error('OAuth2 permission not granted. Please authorize the extension.');
      } else if (error.message.includes('The user did not approve access')) {
        throw new Error('User denied authorization. Please try again and approve access.');
      } else {
        throw new Error(`Authentication failed: ${error.message}`);
      }
    }
  }

  /**
   * Gets a cached token if it's still valid
   * @returns {Promise<string|null>} Cached token or null
   */
  async _getCachedToken() {
    try {
      const result = await chrome.storage.local.get([
        AUTH_CONFIG.TOKEN_STORAGE_KEY,
        AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY
      ]);

      const cachedToken = result[AUTH_CONFIG.TOKEN_STORAGE_KEY];
      const tokenInfo = result[AUTH_CONFIG.TOKEN_INFO_STORAGE_KEY];

      if (!cachedToken || !tokenInfo) {
        console.log('No cached token found');
        return null;
      }

      // Check if token is expired (with buffer)
      const now = Date.now();
      const expiryTime = tokenInfo.expiryTime - AUTH_CONFIG.TOKEN_EXPIRY_BUFFER;

      if (now >= expiryTime) {
        console.log('Cached token is expired');
        await this._clearStoredToken();
        return null;
      }

      console.log(`Cached token is valid for ${Math.round((expiryTime - now) / 1000 / 60)} more minutes`);
      this.tokenInfo = tokenInfo;
      return cachedToken;

    } catch (error) {
      console.error('Error checking cached token:', error);
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