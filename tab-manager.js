/**
 * Google Translate Starred Words Scraper - Tab Manager
 * Comprehensive tab management system for Chrome extension
 * Handles creation, navigation, and cleanup of hidden tabs for scraping
 */

// Constants for tab management
const TAB_CONFIG = {
  GOOGLE_TRANSLATE_BASE_URL: 'https://translate.google.com',
  STARRED_WORDS_URL: 'https://translate.google.com/saved',
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  LOAD_CHECK_INTERVAL: 500, // 500ms
  MAX_RETRIES: 3,
  CLEANUP_DELAY: 1000 // 1 second delay before cleanup
};

// Tab lifecycle states
const TAB_STATES = {
  CREATING: 'creating',
  NAVIGATING: 'navigating',
  LOADING: 'loading',
  READY: 'ready',
  ERROR: 'error',
  CLEANUP: 'cleanup',
  CLOSED: 'closed'
};

/**
 * Tab Manager class for handling Chrome extension tab operations
 */
class TabManager {
  constructor() {
    this.activeTabs = new Map(); // Track active managed tabs
    this.tabTimeouts = new Map(); // Track tab timeouts
    this.tabStates = new Map(); // Track tab states
    
    console.log('TabManager initialized');
  }

  /**
   * Creates a hidden tab and navigates to Google Translate starred words page
   * @param {Object} options - Configuration options
   * @param {string} options.url - URL to navigate to (defaults to starred words page)
   * @param {number} options.timeout - Timeout in milliseconds
   * @param {boolean} options.autoCleanup - Whether to auto-cleanup after success
   * @returns {Promise<Object>} Tab operation result
   */
  async createAndNavigateToGoogleTranslate(options = {}) {
    const config = {
      url: options.url || TAB_CONFIG.STARRED_WORDS_URL,
      timeout: options.timeout || TAB_CONFIG.DEFAULT_TIMEOUT,
      autoCleanup: options.autoCleanup !== false, // Default to true
      retryCount: 0
    };

    console.log('Creating hidden tab for Google Translate navigation:', config);

    try {
      // Validate URL
      if (!this.isValidGoogleTranslateUrl(config.url)) {
        throw new Error(`Invalid Google Translate URL: ${config.url}`);
      }

      // Create hidden tab
      const tab = await this.createHiddenTab(config.url);
      
      // Track tab
      this.activeTabs.set(tab.id, { ...config, tabId: tab.id, startTime: Date.now() });
      this.updateTabState(tab.id, TAB_STATES.NAVIGATING);

      // Wait for page to load
      const loadResult = await this.waitForPageLoad(tab.id, config.timeout);

      if (loadResult.success) {
        this.updateTabState(tab.id, TAB_STATES.READY);
        console.log(`Tab ${tab.id} successfully loaded Google Translate page`);

        const result = {
          success: true,
          tabId: tab.id,
          url: config.url,
          loadTime: Date.now() - this.activeTabs.get(tab.id).startTime,
          tab: tab
        };

        // Auto-cleanup if requested
        if (config.autoCleanup) {
          setTimeout(() => {
            this.cleanupTab(tab.id);
          }, TAB_CONFIG.CLEANUP_DELAY);
        }

        return result;
      } else {
        throw new Error(`Page load failed: ${loadResult.error}`);
      }

    } catch (error) {
      console.error('Error in createAndNavigateToGoogleTranslate:', error);
      
      // Retry logic
      if (config.retryCount < TAB_CONFIG.MAX_RETRIES) {
        console.log(`Retrying tab creation (attempt ${config.retryCount + 1}/${TAB_CONFIG.MAX_RETRIES})`);
        config.retryCount++;
        return this.createAndNavigateToGoogleTranslate(config);
      }

      return {
        success: false,
        error: error.message,
        retryCount: config.retryCount
      };
    }
  }

  /**
   * Creates a hidden tab with specified URL
   * @param {string} url - URL to load in the tab
   * @returns {Promise<chrome.tabs.Tab>} Created tab object
   */
  async createHiddenTab(url) {
    try {
      console.log(`Creating hidden tab for URL: ${url}`);
      
      const tab = await chrome.tabs.create({
        url: url,
        active: false, // Keep tab hidden
        pinned: false
      });

      this.updateTabState(tab.id, TAB_STATES.CREATING);
      console.log(`Hidden tab created with ID: ${tab.id}`);

      return tab;

    } catch (error) {
      console.error('Error creating hidden tab:', error);
      throw new Error(`Failed to create hidden tab: ${error.message}`);
    }
  }

  /**
   * Waits for a tab to finish loading with timeout support
   * @param {number} tabId - Tab ID to monitor
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Object>} Load result
   */
  async waitForPageLoad(tabId, timeout = TAB_CONFIG.DEFAULT_TIMEOUT) {
    console.log(`Waiting for page load in tab ${tabId} (timeout: ${timeout}ms)`);
    
    this.updateTabState(tabId, TAB_STATES.LOADING);

    return new Promise((resolve) => {
      let resolved = false;
      let checkCount = 0;

      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.clearTabTimeout(tabId);
          this.updateTabState(tabId, TAB_STATES.ERROR);
          console.error(`Tab ${tabId} load timeout after ${timeout}ms`);
          resolve({
            success: false,
            error: `Page load timeout after ${timeout}ms`,
            checkCount
          });
        }
      }, timeout);

      this.tabTimeouts.set(tabId, timeoutId);

      // Set up load checking
      const checkLoad = async () => {
        if (resolved) return;

        try {
          checkCount++;
          const tab = await chrome.tabs.get(tabId);
          
          console.log(`Tab ${tabId} load check #${checkCount}: status=${tab.status}, url=${tab.url}`);

          // Check if tab is complete and on correct URL
          if (tab.status === 'complete' && this.isValidGoogleTranslateUrl(tab.url)) {
            resolved = true;
            clearTimeout(timeoutId);
            this.clearTabTimeout(tabId);
            
            console.log(`Tab ${tabId} load completed successfully after ${checkCount} checks`);
            resolve({
              success: true,
              tab: tab,
              checkCount
            });
            return;
          }

          // Continue checking if not complete
          if (tab.status === 'loading' || !this.isValidGoogleTranslateUrl(tab.url)) {
            setTimeout(checkLoad, TAB_CONFIG.LOAD_CHECK_INTERVAL);
          } else {
            // Unexpected state
            resolved = true;
            clearTimeout(timeoutId);
            this.clearTabTimeout(tabId);
            this.updateTabState(tabId, TAB_STATES.ERROR);
            
            resolve({
              success: false,
              error: `Unexpected tab state: ${tab.status}, URL: ${tab.url}`,
              checkCount
            });
          }

        } catch (error) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutId);
            this.clearTabTimeout(tabId);
            this.updateTabState(tabId, TAB_STATES.ERROR);
            
            console.error(`Error checking tab ${tabId} load status:`, error);
            resolve({
              success: false,
              error: `Tab check error: ${error.message}`,
              checkCount
            });
          }
        }
      };

      // Start checking immediately
      checkLoad();
    });
  }

  /**
   * Validates if URL is a valid Google Translate URL
   * @param {string} url - URL to validate
   * @returns {boolean} True if valid Google Translate URL
   */
  isValidGoogleTranslateUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      const urlObj = new URL(url);
      const isGoogleTranslate = urlObj.hostname === 'translate.google.com';
      const isHttps = urlObj.protocol === 'https:';
      
      console.log(`URL validation for ${url}: hostname=${urlObj.hostname}, protocol=${urlObj.protocol}, valid=${isGoogleTranslate && isHttps}`);
      
      return isGoogleTranslate && isHttps;
    } catch (error) {
      console.error('Error validating URL:', error);
      return false;
    }
  }

  /**
   * Cleans up a managed tab by closing it and removing tracking
   * @param {number} tabId - Tab ID to cleanup
   * @returns {Promise<boolean>} True if cleanup successful
   */
  async cleanupTab(tabId) {
    console.log(`Starting cleanup for tab ${tabId}`);
    
    try {
      this.updateTabState(tabId, TAB_STATES.CLEANUP);

      // Clear any pending timeouts
      this.clearTabTimeout(tabId);

      // Close the tab
      await chrome.tabs.remove(tabId);
      
      // Remove from tracking
      this.activeTabs.delete(tabId);
      this.tabStates.delete(tabId);
      
      this.updateTabState(tabId, TAB_STATES.CLOSED);
      console.log(`Tab ${tabId} cleanup completed successfully`);
      
      return true;

    } catch (error) {
      console.error(`Error cleaning up tab ${tabId}:`, error);
      
      // Force remove from tracking even if close failed
      this.activeTabs.delete(tabId);
      this.tabStates.delete(tabId);
      this.clearTabTimeout(tabId);
      
      return false;
    }
  }

  /**
   * Cleans up all managed tabs
   * @returns {Promise<Object>} Cleanup results
   */
  async cleanupAllTabs() {
    console.log('Starting cleanup of all managed tabs');
    
    const tabIds = Array.from(this.activeTabs.keys());
    const results = {
      total: tabIds.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    for (const tabId of tabIds) {
      try {
        const success = await this.cleanupTab(tabId);
        if (success) {
          results.successful++;
        } else {
          results.failed++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({ tabId, error: error.message });
      }
    }

    console.log('All tabs cleanup completed:', results);
    return results;
  }

  /**
   * Gets the current status of a managed tab
   * @param {number} tabId - Tab ID to check
   * @returns {Object} Tab status information
   */
  getTabStatus(tabId) {
    const tabInfo = this.activeTabs.get(tabId);
    const state = this.tabStates.get(tabId);
    
    if (!tabInfo) {
      return { exists: false };
    }

    return {
      exists: true,
      tabId: tabId,
      state: state,
      url: tabInfo.url,
      startTime: tabInfo.startTime,
      elapsedTime: Date.now() - tabInfo.startTime,
      autoCleanup: tabInfo.autoCleanup
    };
  }

  /**
   * Gets status of all managed tabs
   * @returns {Object} Status information for all tabs
   */
  getAllTabsStatus() {
    const status = {
      totalTabs: this.activeTabs.size,
      tabs: [],
      states: {}
    };

    // Count states
    for (const state of this.tabStates.values()) {
      status.states[state] = (status.states[state] || 0) + 1;
    }

    // Get individual tab status
    for (const tabId of this.activeTabs.keys()) {
      status.tabs.push(this.getTabStatus(tabId));
    }

    return status;
  }

  /**
   * Updates the state of a managed tab
   * @param {number} tabId - Tab ID
   * @param {string} state - New state from TAB_STATES
   */
  updateTabState(tabId, state) {
    this.tabStates.set(tabId, state);
    console.log(`Tab ${tabId} state updated to: ${state}`);
  }

  /**
   * Clears timeout for a specific tab
   * @param {number} tabId - Tab ID
   */
  clearTabTimeout(tabId) {
    const timeoutId = this.tabTimeouts.get(tabId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.tabTimeouts.delete(tabId);
      console.log(`Cleared timeout for tab ${tabId}`);
    }
  }

  /**
   * Injects a content script into a managed tab
   * @param {number} tabId - Tab ID
   * @param {Object} script - Script configuration
   * @returns {Promise<Object>} Injection result
   */
  async injectContentScript(tabId, script) {
    try {
      console.log(`Injecting content script into tab ${tabId}`);
      
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        ...script
      });

      console.log(`Content script injection successful for tab ${tabId}`);
      return { success: true, result };

    } catch (error) {
      console.error(`Error injecting content script into tab ${tabId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

// Export singleton instance
const tabManager = new TabManager();

// Export constants and class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = { TabManager, tabManager, TAB_CONFIG, TAB_STATES };
} else {
  // Browser environment - attach to window
  window.TabManager = TabManager;
  window.tabManager = tabManager;
  window.TAB_CONFIG = TAB_CONFIG;
  window.TAB_STATES = TAB_STATES;
}

console.log('Tab Manager module loaded successfully'); 