/**
 * Google Translate Starred Words Scraping Controller
 * Manages the entire scraping process including tab management, script injection, and data processing
 * Compatible with Chrome Extension Manifest V3 service worker architecture
 */

// Import tab manager for hidden tab operations
const TabManager = (typeof globalThis !== 'undefined' && globalThis.TabManager) || 
                  (typeof self !== 'undefined' && self.TabManager) ||
                  require('./tab-manager.js').TabManager;

// Configuration constants
const SCRAPER_CONFIG = {
  GOOGLE_TRANSLATE_SAVED_URL: 'https://translate.google.com/saved',
  MAX_RETRIES: 3,
  SCRIPT_INJECTION_TIMEOUT: 15000, // 15 seconds
  SCRAPING_TIMEOUT: 45000, // 45 seconds total
  RETRY_DELAY_BASE: 2000, // 2 seconds base delay
  MIN_WORDS_THRESHOLD: 0, // Minimum words to consider success
  MAX_WORDS_LIMIT: 1000, // Maximum words to prevent memory issues
  DEBUG: true
};

// Performance tracking
const METRICS = {
  totalAttempts: 0,
  successfulAttempts: 0,
  failedAttempts: 0,
  averageTime: 0,
  lastScrapingTime: null,
  wordCounts: [],
  errorTypes: {}
};

/**
 * Main scraping controller class
 */
class ScrapingController {
  constructor() {
    this.tabManager = null;
    this.currentTabId = null;
    this.isRunning = false;
    this.retryCount = 0;
    this.startTime = null;
    this.debugLog('ScrapingController initialized');
  }

  /**
   * Debug logging utility
   */
  debugLog(message, data = null) {
    if (SCRAPER_CONFIG.DEBUG) {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[Scraping Controller ${timestamp}] ${message}`, data);
      } else {
        console.log(`[Scraping Controller ${timestamp}] ${message}`);
      }
    }
  }

  /**
   * Record error for metrics
   */
  recordError(errorType, error) {
    if (!METRICS.errorTypes[errorType]) {
      METRICS.errorTypes[errorType] = 0;
    }
    METRICS.errorTypes[errorType]++;
    this.debugLog(`Error recorded: ${errorType}`, error.message);
  }

  /**
   * Update performance metrics
   */
  updateMetrics(success, duration, wordCount = 0) {
    METRICS.totalAttempts++;
    
    if (success) {
      METRICS.successfulAttempts++;
      METRICS.wordCounts.push(wordCount);
      
      // Keep only last 10 word counts
      if (METRICS.wordCounts.length > 10) {
        METRICS.wordCounts.shift();
      }
    } else {
      METRICS.failedAttempts++;
    }

    // Update average time
    const currentAvg = METRICS.averageTime;
    const totalAttempts = METRICS.totalAttempts;
    METRICS.averageTime = ((currentAvg * (totalAttempts - 1)) + duration) / totalAttempts;
    METRICS.lastScrapingTime = Date.now();
  }

  /**
   * Main scraping execution method
   */
  async executeGoogleTranslateScraping() {
    if (this.isRunning) {
      throw new Error('Scraping is already in progress');
    }

    this.isRunning = true;
    this.startTime = performance.now();
    this.retryCount = 0;

    try {
      this.debugLog('Starting Google Translate scraping process');
      
      for (let attempt = 1; attempt <= SCRAPER_CONFIG.MAX_RETRIES; attempt++) {
        this.retryCount = attempt;
        this.debugLog(`Scraping attempt ${attempt}/${SCRAPER_CONFIG.MAX_RETRIES}`);

        try {
          const result = await this.executeSingleScrapingAttempt();
          
          if (result.success) {
            const duration = performance.now() - this.startTime;
            this.updateMetrics(true, duration, result.data?.count || 0);
            
            this.debugLog('Scraping completed successfully', {
              attempt,
              wordCount: result.data?.count || 0,
              duration: `${duration.toFixed(2)}ms`
            });

            return {
              ...result,
              attempt,
              totalDuration: duration,
              metrics: this.getScrapingMetrics()
            };
          }

          // If not successful and not the last attempt, retry
          if (attempt < SCRAPER_CONFIG.MAX_RETRIES) {
            const delay = SCRAPER_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
            this.debugLog(`Attempt ${attempt} failed, retrying in ${delay}ms`, result.error);
            await new Promise(resolve => setTimeout(resolve, delay));
          }

        } catch (error) {
          this.debugLog(`Attempt ${attempt} threw error:`, error);
          this.recordError('attempt_error', error);

          if (attempt === SCRAPER_CONFIG.MAX_RETRIES) {
            throw error;
          }

          const delay = SCRAPER_CONFIG.RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      // All retries failed
      const duration = performance.now() - this.startTime;
      this.updateMetrics(false, duration);
      
      return {
        success: false,
        error: `All ${SCRAPER_CONFIG.MAX_RETRIES} attempts failed`,
        data: null,
        attempt: SCRAPER_CONFIG.MAX_RETRIES,
        totalDuration: duration,
        metrics: this.getScrapingMetrics()
      };

    } finally {
      this.isRunning = false;
      await this.cleanup();
    }
  }

  /**
   * Execute a single scraping attempt
   */
  async executeSingleScrapingAttempt() {
    let tabId = null;

    try {
      // Step 1: Create and setup tab manager
      this.debugLog('Step 1: Setting up tab manager');
      this.tabManager = new TabManager();
      
      // Step 2: Create hidden tab and navigate to Google Translate
      this.debugLog('Step 2: Creating hidden tab and navigating to Google Translate');
      tabId = await this.tabManager.createHiddenTab();
      this.currentTabId = tabId;

      await this.tabManager.navigateToUrl(SCRAPER_CONFIG.GOOGLE_TRANSLATE_SAVED_URL);
      await this.tabManager.waitForPageLoad();

      // Step 3: Inject content script
      this.debugLog('Step 3: Injecting content script');
      const injectionResult = await this.injectContentScript(tabId);
      
      if (!injectionResult.success) {
        throw new Error(`Content script injection failed: ${injectionResult.error}`);
      }

      // Step 4: Wait for scraping results
      this.debugLog('Step 4: Waiting for scraping results');
      const extractionResult = await this.waitForExtractionResults(tabId);

      // Step 5: Validate and process data
      this.debugLog('Step 5: Validating and processing extracted data');
      const validatedData = this.validateExtractedData(extractionResult);

      if (!validatedData.isValid) {
        throw new Error(`Data validation failed: ${validatedData.error}`);
      }

      // Step 6: Format data for further processing
      const formattedData = this.formatDataForSheets(validatedData.data);

      return {
        success: true,
        data: {
          raw: extractionResult,
          validated: validatedData.data,
          formatted: formattedData,
          count: validatedData.data.words?.length || 0,
          extractedAt: new Date().toISOString()
        },
        tabId: tabId,
        performance: extractionResult.performance || {}
      };

    } catch (error) {
      this.debugLog('Single scraping attempt failed:', error);
      this.recordError('scraping_attempt', error);
      
      return {
        success: false,
        error: error.message,
        data: null,
        tabId: tabId
      };
    }
  }

  /**
   * Inject content script into the target tab
   */
  async injectContentScript(tabId) {
    try {
      this.debugLog(`Injecting content script into tab ${tabId}`);

      // Set up timeout for script injection
      const injectionPromise = chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content-script.js']
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Content script injection timeout'));
        }, SCRAPER_CONFIG.SCRIPT_INJECTION_TIMEOUT);
      });

      const results = await Promise.race([injectionPromise, timeoutPromise]);

      if (!results || results.length === 0) {
        throw new Error('No results from content script injection');
      }

      this.debugLog('Content script injected successfully', {
        resultsCount: results.length,
        firstResult: results[0]
      });

      return {
        success: true,
        results: results
      };

    } catch (error) {
      this.debugLog('Content script injection failed:', error);
      this.recordError('script_injection', error);
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Wait for extraction results from content script
   */
  async waitForExtractionResults(tabId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.recordError('extraction_timeout', new Error('Extraction timeout'));
        reject(new Error('Extraction results timeout'));
      }, SCRAPER_CONFIG.SCRAPING_TIMEOUT);

      // Listen for message from content script
      const messageListener = (message, sender, sendResponse) => {
        if (sender.tab?.id === tabId && 
            message.action === 'starredWordsExtracted') {
          
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(messageListener);
          
          this.debugLog('Received extraction results from content script', {
            success: message.data?.success,
            wordCount: message.data?.count || 0,
            hasError: !!message.data?.error
          });

          if (message.data) {
            resolve(message.data);
          } else {
            reject(new Error('No data in extraction results'));
          }
        }
      };

      chrome.runtime.onMessage.addListener(messageListener);
      
      this.debugLog(`Waiting for extraction results from tab ${tabId}`);
    });
  }

  /**
   * Validate extracted data
   */
  validateExtractedData(extractionResult) {
    try {
      this.debugLog('Validating extracted data:', extractionResult);

      // Check if extraction was successful
      if (!extractionResult || !extractionResult.success) {
        return {
          isValid: false,
          error: extractionResult?.error || 'Extraction was not successful',
          data: null
        };
      }

      // Check if words array exists
      if (!extractionResult.words || !Array.isArray(extractionResult.words)) {
        return {
          isValid: false,
          error: 'No words array found in extraction results',
          data: null
        };
      }

      // Check word count limits
      const wordCount = extractionResult.words.length;
      if (wordCount < SCRAPER_CONFIG.MIN_WORDS_THRESHOLD) {
        this.debugLog(`Word count ${wordCount} below threshold ${SCRAPER_CONFIG.MIN_WORDS_THRESHOLD}`);
        // Still valid, just log the information
      }

      if (wordCount > SCRAPER_CONFIG.MAX_WORDS_LIMIT) {
        this.debugLog(`Word count ${wordCount} exceeds limit, truncating to ${SCRAPER_CONFIG.MAX_WORDS_LIMIT}`);
        extractionResult.words = extractionResult.words.slice(0, SCRAPER_CONFIG.MAX_WORDS_LIMIT);
        extractionResult.count = SCRAPER_CONFIG.MAX_WORDS_LIMIT;
        extractionResult.truncated = true;
      }

      // Validate individual word entries
      const validWords = [];
      for (let i = 0; i < extractionResult.words.length; i++) {
        const word = extractionResult.words[i];
        
        if (this.isValidWordEntry(word)) {
          validWords.push(word);
        } else {
          this.debugLog(`Invalid word entry at index ${i}:`, word);
        }
      }

      // Update the extraction result with validated words
      const validatedResult = {
        ...extractionResult,
        words: validWords,
        count: validWords.length,
        originalCount: extractionResult.count,
        validationPerformed: true,
        validatedAt: new Date().toISOString()
      };

      this.debugLog('Data validation completed', {
        originalCount: extractionResult.count,
        validCount: validWords.length,
        invalidCount: extractionResult.count - validWords.length
      });

      return {
        isValid: true,
        data: validatedResult,
        validationStats: {
          originalCount: extractionResult.count,
          validCount: validWords.length,
          invalidCount: extractionResult.count - validWords.length
        }
      };

    } catch (error) {
      this.debugLog('Data validation error:', error);
      this.recordError('data_validation', error);
      
      return {
        isValid: false,
        error: `Data validation failed: ${error.message}`,
        data: null
      };
    }
  }

  /**
   * Validate individual word entry
   */
  isValidWordEntry(word) {
    if (!word || typeof word !== 'object') {
      return false;
    }

    // Required fields
    const requiredFields = ['originalText', 'translatedText'];
    for (const field of requiredFields) {
      if (!word[field] || typeof word[field] !== 'string' || word[field].trim().length === 0) {
        return false;
      }
    }

    // Optional but should be strings if present
    const optionalStringFields = ['sourceLanguage', 'targetLanguage', 'id'];
    for (const field of optionalStringFields) {
      if (word[field] && typeof word[field] !== 'string') {
        return false;
      }
    }

    return true;
  }

  /**
   * Format data for Google Sheets API
   */
  formatDataForSheets(extractionData) {
    try {
      this.debugLog('Formatting data for Google Sheets');

      if (!extractionData || !extractionData.words) {
        throw new Error('No extraction data provided');
      }

      // Create headers
      const headers = [
        'Original Text',
        'Translated Text', 
        'Source Language',
        'Target Language',
        'Extracted At',
        'Word ID'
      ];

      // Create data rows
      const rows = extractionData.words.map(word => [
        word.originalText || '',
        word.translatedText || '',
        word.sourceLanguage || 'unknown',
        word.targetLanguage || 'unknown',
        word.extractedAt || new Date().toISOString(),
        word.id || ''
      ]);

      const sheetsData = {
        headers: headers,
        rows: rows,
        totalRows: rows.length,
        metadata: {
          extractedAt: extractionData.extractedAt || new Date().toISOString(),
          pageUrl: extractionData.pageUrl || SCRAPER_CONFIG.GOOGLE_TRANSLATE_SAVED_URL,
          extractionMethod: 'chrome-extension-scraper',
          validationPerformed: extractionData.validationPerformed || false,
          originalCount: extractionData.originalCount || extractionData.count,
          truncated: extractionData.truncated || false
        }
      };

      this.debugLog('Data formatted for Google Sheets', {
        headerCount: headers.length,
        rowCount: rows.length,
        hasMetadata: true
      });

      return sheetsData;

    } catch (error) {
      this.debugLog('Error formatting data for Google Sheets:', error);
      this.recordError('data_formatting', error);
      throw error;
    }
  }

  /**
   * Get current scraping metrics
   */
  getScrapingMetrics() {
    const successRate = METRICS.totalAttempts > 0 ? 
      (METRICS.successfulAttempts / METRICS.totalAttempts * 100).toFixed(2) : 0;
    
    const averageWordCount = METRICS.wordCounts.length > 0 ?
      Math.round(METRICS.wordCounts.reduce((a, b) => a + b, 0) / METRICS.wordCounts.length) : 0;

    return {
      totalAttempts: METRICS.totalAttempts,
      successfulAttempts: METRICS.successfulAttempts,
      failedAttempts: METRICS.failedAttempts,
      successRate: `${successRate}%`,
      averageTime: `${METRICS.averageTime.toFixed(2)}ms`,
      averageWordCount: averageWordCount,
      lastScrapingTime: METRICS.lastScrapingTime ? 
        new Date(METRICS.lastScrapingTime).toISOString() : null,
      errorTypes: { ...METRICS.errorTypes },
      recentWordCounts: [...METRICS.wordCounts]
    };
  }

  /**
   * Reset metrics (for testing or manual reset)
   */
  resetMetrics() {
    METRICS.totalAttempts = 0;
    METRICS.successfulAttempts = 0;
    METRICS.failedAttempts = 0;
    METRICS.averageTime = 0;
    METRICS.lastScrapingTime = null;
    METRICS.wordCounts = [];
    METRICS.errorTypes = {};
    
    this.debugLog('Scraping metrics reset');
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    try {
      this.debugLog('Starting cleanup process');

      if (this.tabManager && this.currentTabId) {
        await this.tabManager.cleanup();
        this.debugLog(`Cleaned up tab ${this.currentTabId}`);
      }

      this.tabManager = null;
      this.currentTabId = null;
      this.debugLog('Cleanup completed');

    } catch (error) {
      this.debugLog('Error during cleanup:', error);
      this.recordError('cleanup', error);
    }
  }

  /**
   * Check if scraping is currently running
   */
  isScrapingInProgress() {
    return this.isRunning;
  }

  /**
   * Get current configuration
   */
  getConfiguration() {
    return { ...SCRAPER_CONFIG };
  }

  /**
   * Update configuration (for testing or manual adjustment)
   */
  updateConfiguration(newConfig) {
    Object.assign(SCRAPER_CONFIG, newConfig);
    this.debugLog('Configuration updated:', newConfig);
  }
}

/**
 * Export for different environments
 */
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = { ScrapingController, SCRAPER_CONFIG, METRICS };
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
  globalObj.ScrapingController = ScrapingController;
  globalObj.SCRAPER_CONFIG = SCRAPER_CONFIG;
  globalObj.SCRAPER_METRICS = METRICS;
  
  console.log('Scraping Controller loaded successfully');
} 