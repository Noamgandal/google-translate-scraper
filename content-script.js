/**
 * Google Translate Starred Words Content Script
 * Extracts starred words from translate.google.com/saved page
 * Compatible with Chrome Extension Manifest V3 isolated world execution
 */

// Configuration constants
const CONFIG = {
  TARGET_URL_PATTERN: /translate\.google\.com\/saved/i,
  MAX_WAIT_TIME: 30000, // 30 seconds
  POLLING_INTERVAL: 500, // 500ms
  MUTATION_OBSERVER_TIMEOUT: 5000, // 5 seconds
  MIN_WORD_LENGTH: 1,
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // 1 second
  DEBUG: true
};

// Selector strategies for finding starred words (multiple fallbacks)
const SELECTORS = {
  // Primary selectors (most likely to work)
  primary: {
    container: [
      '[data-term-id]',
      '[jsname][data-term]',
      '.starred-word-item',
      '.saved-translation-item'
    ],
    wordText: [
      '[data-text]',
      '.source-text',
      '.original-text',
      '.term-text'
    ],
    translationText: [
      '[data-translation]',
      '.target-text',
      '.translated-text',
      '.translation-text'
    ],
    sourceLanguage: [
      '[data-source-lang]',
      '.source-language',
      '[data-sl]'
    ],
    targetLanguage: [
      '[data-target-lang]',
      '.target-language',
      '[data-tl]'
    ]
  },
  
  // Secondary selectors (fallback strategies)
  secondary: {
    container: [
      'c-wiz[data-node-index] > div',
      '[role="listitem"]',
      '.translation-entry',
      '[jsaction*="click"]'
    ],
    wordText: [
      'span[lang]',
      '.text-content',
      '[dir="auto"]'
    ],
    translationText: [
      'span[lang]:not(:first-child)',
      '.translation-content'
    ]
  },
  
  // Emergency selectors (last resort)
  emergency: {
    container: [
      'div[jsname]',
      '[data-hveid] > div',
      'c-wiz > div > div'
    ]
  }
};

// Performance and state tracking
const PERFORMANCE = {
  startTime: null,
  endTime: null,
  checkpoints: {}
};

/**
 * Main extraction class
 */
class StarredWordsExtractor {
  constructor() {
    this.isInitialized = false;
    this.retryCount = 0;
    this.mutationObserver = null;
    this.extractedWords = [];
    this.debugLog('StarredWordsExtractor initialized');
  }

  /**
   * Debug logging utility
   */
  debugLog(message, data = null) {
    if (CONFIG.DEBUG) {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[Starred Words Extractor ${timestamp}] ${message}`, data);
      } else {
        console.log(`[Starred Words Extractor ${timestamp}] ${message}`);
      }
    }
  }

  /**
   * Add performance checkpoint
   */
  addCheckpoint(name) {
    PERFORMANCE.checkpoints[name] = performance.now();
    this.debugLog(`Performance checkpoint: ${name} at ${PERFORMANCE.checkpoints[name].toFixed(2)}ms`);
  }

  /**
   * Check if we're on the correct Google Translate page
   */
  isValidPage() {
    const isValidURL = CONFIG.TARGET_URL_PATTERN.test(window.location.href);
    const hasGoogleTranslateDomain = window.location.hostname.includes('translate.google');
    
    this.debugLog('Page validation:', {
      url: window.location.href,
      isValidURL,
      hasGoogleTranslateDomain,
      domain: window.location.hostname
    });
    
    return isValidURL && hasGoogleTranslateDomain;
  }

  /**
   * Wait for page to be fully loaded and ready
   */
  async waitForPageReady() {
    this.addCheckpoint('waitForPageReady_start');
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.debugLog('Page ready timeout reached');
        reject(new Error('Page ready timeout'));
      }, CONFIG.MAX_WAIT_TIME);

      const checkReady = () => {
        const isDocumentReady = document.readyState === 'complete';
        const hasBasicStructure = document.querySelector('c-wiz') || document.querySelector('[jsname]');
        const hasMinimalContent = document.body && document.body.children.length > 0;
        
        this.debugLog('Page readiness check:', {
          documentReady: isDocumentReady,
          hasBasicStructure: !!hasBasicStructure,
          hasMinimalContent: hasMinimalContent,
          bodyChildCount: document.body ? document.body.children.length : 0
        });

        if (isDocumentReady && hasBasicStructure && hasMinimalContent) {
          clearTimeout(timeout);
          this.addCheckpoint('waitForPageReady_complete');
          resolve();
          return;
        }

        setTimeout(checkReady, CONFIG.POLLING_INTERVAL);
      };

      // Start checking immediately if document is already ready
      if (document.readyState === 'complete') {
        checkReady();
      } else {
        document.addEventListener('DOMContentLoaded', checkReady);
        window.addEventListener('load', checkReady);
      }
    });
  }

  /**
   * Find elements using multiple selector strategies
   */
  findElementsWithFallback(selectorGroups, parent = document) {
    for (const [groupName, selectors] of Object.entries(selectorGroups)) {
      this.debugLog(`Trying selector group: ${groupName}`);
      
      for (const selector of selectors) {
        try {
          const elements = parent.querySelectorAll(selector);
          if (elements.length > 0) {
            this.debugLog(`Found ${elements.length} elements with selector: ${selector}`);
            return Array.from(elements);
          }
        } catch (error) {
          this.debugLog(`Selector failed: ${selector}`, error.message);
        }
      }
    }
    
    this.debugLog('No elements found with any selector strategy');
    return [];
  }

  /**
   * Extract text content with multiple strategies
   */
  extractTextContent(element, selectors = []) {
    if (!element) return null;

    // Try specific selectors first
    for (const selector of selectors) {
      try {
        const target = element.querySelector(selector);
        if (target && target.textContent?.trim()) {
          return target.textContent.trim();
        }
      } catch (error) {
        this.debugLog(`Text extraction selector failed: ${selector}`, error.message);
      }
    }

    // Fallback to direct text content
    if (element.textContent?.trim()) {
      return element.textContent.trim();
    }

    // Try innerHTML as last resort
    if (element.innerHTML?.trim()) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = element.innerHTML;
      const text = tempDiv.textContent?.trim();
      if (text) return text;
    }

    return null;
  }

  /**
   * Extract language information from element
   */
  extractLanguageInfo(element) {
    const langSources = [
      () => element.getAttribute('lang'),
      () => element.getAttribute('data-lang'),
      () => element.getAttribute('data-sl'),
      () => element.getAttribute('data-tl'),
      () => element.closest('[lang]')?.getAttribute('lang'),
      () => {
        const langSpan = element.querySelector('span[lang]');
        return langSpan?.getAttribute('lang');
      }
    ];

    for (const langSource of langSources) {
      try {
        const lang = langSource();
        if (lang && lang.length >= 2) {
          return lang;
        }
      } catch (error) {
        // Continue to next strategy
      }
    }

    return null;
  }

  /**
   * Extract word data from a container element
   */
  extractWordData(container, index) {
    this.debugLog(`Extracting data from container ${index}:`, container);

    try {
      // Extract original text
      const originalText = this.extractTextContent(container, SELECTORS.primary.wordText) ||
                          this.extractTextContent(container, SELECTORS.secondary.wordText);

      // Extract translated text
      const translatedText = this.extractTextContent(container, SELECTORS.primary.translationText) ||
                            this.extractTextContent(container, SELECTORS.secondary.translationText);

      // Extract language information
      const sourceLanguage = this.extractLanguageInfo(container) ||
                            container.getAttribute('data-source-lang') ||
                            container.getAttribute('data-sl');

      const targetLanguage = container.getAttribute('data-target-lang') ||
                            container.getAttribute('data-tl') ||
                            this.extractLanguageInfo(container.querySelector('[lang]:last-child'));

      // Validate extracted data
      if (!originalText || originalText.length < CONFIG.MIN_WORD_LENGTH) {
        this.debugLog(`Skipping container ${index}: invalid original text`, { originalText });
        return null;
      }

      const wordData = {
        id: `word_${index}_${Date.now()}`,
        originalText: originalText,
        translatedText: translatedText || originalText, // Fallback to original if no translation
        sourceLanguage: sourceLanguage || 'unknown',
        targetLanguage: targetLanguage || 'unknown',
        extractedAt: new Date().toISOString(),
        extractionMethod: 'content-script',
        containerIndex: index
      };

      this.debugLog(`Successfully extracted word data:`, wordData);
      return wordData;

    } catch (error) {
      this.debugLog(`Error extracting data from container ${index}:`, error);
      return null;
    }
  }

  /**
   * Wait for starred words to appear with mutation observer
   */
  async waitForStarredWords() {
    this.addCheckpoint('waitForStarredWords_start');
    
    return new Promise((resolve) => {
      let resolved = false;
      
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          if (this.mutationObserver) {
            this.mutationObserver.disconnect();
          }
          this.debugLog('Starred words wait timeout reached');
          resolve([]);
        }
      }, CONFIG.MUTATION_OBSERVER_TIMEOUT);

      const checkForWords = () => {
        if (resolved) return;

        const containers = this.findElementsWithFallback({
          primary: SELECTORS.primary.container,
          secondary: SELECTORS.secondary.container,
          emergency: SELECTORS.emergency.container
        });

        if (containers.length > 0) {
          resolved = true;
          clearTimeout(timeout);
          if (this.mutationObserver) {
            this.mutationObserver.disconnect();
          }
          this.addCheckpoint('waitForStarredWords_found');
          this.debugLog(`Found ${containers.length} potential word containers`);
          resolve(containers);
        }
      };

      // Set up mutation observer
      this.mutationObserver = new MutationObserver((mutations) => {
        let shouldCheck = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            shouldCheck = true;
            break;
          }
        }
        
        if (shouldCheck) {
          this.debugLog('DOM mutation detected, checking for starred words');
          checkForWords();
        }
      });

      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Initial check
      checkForWords();
    });
  }

  /**
   * Main extraction method
   */
  async extractStarredWords() {
    try {
      PERFORMANCE.startTime = performance.now();
      this.addCheckpoint('extraction_start');

      // Validate page
      if (!this.isValidPage()) {
        throw new Error('Not on Google Translate starred words page');
      }

      // Wait for page to be ready
      await this.waitForPageReady();
      this.addCheckpoint('page_ready');

      // Wait for starred words to appear
      const containers = await this.waitForStarredWords();
      this.addCheckpoint('words_found');

      if (containers.length === 0) {
        this.debugLog('No starred word containers found');
        return {
          success: true,
          words: [],
          count: 0,
          message: 'No starred words found on this page',
          performance: this.getPerformanceData(),
          extractedAt: new Date().toISOString()
        };
      }

      // Extract data from each container
      const extractedWords = [];
      for (let i = 0; i < containers.length; i++) {
        const wordData = this.extractWordData(containers[i], i);
        if (wordData) {
          extractedWords.push(wordData);
        }
      }

      this.addCheckpoint('extraction_complete');
      PERFORMANCE.endTime = performance.now();

      const result = {
        success: true,
        words: extractedWords,
        count: extractedWords.length,
        totalContainers: containers.length,
        performance: this.getPerformanceData(),
        extractedAt: new Date().toISOString(),
        pageUrl: window.location.href
      };

      this.debugLog('Extraction completed successfully:', result);
      return result;

    } catch (error) {
      PERFORMANCE.endTime = performance.now();
      this.debugLog('Extraction failed:', error);
      
      return {
        success: false,
        error: error.message,
        words: [],
        count: 0,
        performance: this.getPerformanceData(),
        extractedAt: new Date().toISOString(),
        pageUrl: window.location.href
      };
    } finally {
      // Cleanup
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
        this.mutationObserver = null;
      }
    }
  }

  /**
   * Get performance data
   */
  getPerformanceData() {
    const totalTime = PERFORMANCE.endTime - PERFORMANCE.startTime;
    
    return {
      totalTime: totalTime ? totalTime.toFixed(2) + 'ms' : 'N/A',
      checkpoints: Object.fromEntries(
        Object.entries(PERFORMANCE.checkpoints).map(([key, value]) => [
          key, 
          (value - PERFORMANCE.startTime).toFixed(2) + 'ms'
        ])
      ),
      memoryUsage: performance.memory ? {
        used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
        total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
      } : 'N/A'
    };
  }

  /**
   * Retry extraction with backoff
   */
  async extractWithRetry() {
    for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
      this.debugLog(`Extraction attempt ${attempt}/${CONFIG.MAX_RETRIES}`);
      
      try {
        const result = await this.extractStarredWords();
        
        if (result.success) {
          return result;
        }
        
        // If not successful but not the last attempt, retry
        if (attempt < CONFIG.MAX_RETRIES) {
          this.debugLog(`Attempt ${attempt} failed, retrying in ${CONFIG.RETRY_DELAY}ms`);
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
        }
        
      } catch (error) {
        this.debugLog(`Attempt ${attempt} error:`, error);
        
        if (attempt === CONFIG.MAX_RETRIES) {
          return {
            success: false,
            error: `All ${CONFIG.MAX_RETRIES} attempts failed. Last error: ${error.message}`,
            words: [],
            count: 0,
            attempts: attempt,
            extractedAt: new Date().toISOString()
          };
        }
        
        await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY * attempt));
      }
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('Google Translate Starred Words Content Script loaded');
  
  // Wait a bit for page to stabilize
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const extractor = new StarredWordsExtractor();
  const result = await extractor.extractWithRetry();
  
  console.log('Final extraction result:', result);
  
  // Send result to extension background script
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    try {
      chrome.runtime.sendMessage({
        action: 'starredWordsExtracted',
        data: result
      });
    } catch (error) {
      console.log('Could not send message to extension:', error.message);
    }
  }
  
  return result;
}

// Initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}

// Export for potential external usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { StarredWordsExtractor, main, CONFIG, SELECTORS };
}

// Make available in global scope for debugging
window.StarredWordsExtractor = StarredWordsExtractor; 