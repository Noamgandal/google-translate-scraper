// Google Translate Starred Words Scraper - Background Service Worker
// Manifest V3 compliant background script

// Import TabManager for tab operations
importScripts('tab-manager.js');

// Import AuthManager for Google OAuth authentication
importScripts('auth.js');

// Import ScrapingController for comprehensive scraping operations
importScripts('scraper.js');

// Import DataProcessor for data cleaning and validation
importScripts('data-processor.js');

// Import Google Sheets API for data synchronization
importScripts('sheets-api.js');

// Default extension settings
const DEFAULT_SETTINGS = {
  isEnabled: true,
  scrapeInterval: 30, // minutes
  lastScrapeTime: null,
  totalWordsScraped: 0,
  googleSheetsId: '',
  autoSync: true,
  notifications: true,
  // Enhanced scraping statistics
  scrapingStats: {
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    totalWordsFound: 0,
    averageWordsPerScrape: 0,
    averageScrapingTime: 0,
    lastSuccessfulScrape: null,
    lastFailedScrape: null,
    duplicatesRemoved: 0,
    dataValidationErrors: 0
  },
  // Google Sheets sync status
  sheetsSync: {
    lastSyncTime: null,
    lastSyncStatus: null,
    lastSyncError: null,
    totalSyncs: 0,
    successfulSyncs: 0,
    failedSyncs: 0,
    lastSyncedWordCount: 0
  }
};

// Extension lifecycle event listeners
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details.reason);
  
  try {
    // Initialize storage with default settings on first install
    if (details.reason === 'install') {
      await initializeStorage();
      console.log('Storage initialized with default settings');
      
      // Set up initial alarm for scraping
      await setupScrapingAlarm();
      console.log('Initial scraping alarm set up');
    }
    
    // Handle updates
    if (details.reason === 'update') {
      console.log('Extension updated from version:', details.previousVersion);
      await handleExtensionUpdate();
    }
    
  } catch (error) {
    console.error('Error during extension installation:', error);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('Extension startup - browser launched');
  
  try {
    // Ensure storage is initialized
    await ensureStorageInitialized();
    
    // Check and recreate alarms that might have been cleared
    await checkAndRecreateAlarms();
    
    console.log('Extension startup completed successfully');
    
  } catch (error) {
    console.error('Error during extension startup:', error);
  }
});

// Alarm event listener for scheduled scraping (must be at top level for Manifest V3)
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name, 'at', new Date().toISOString());
  
  try {
    if (alarm.name === 'scrapeStarredWords') {
      await performScheduledScraping();
    }
  } catch (error) {
    console.error('Error handling alarm:', error);
    // Log alarm error to storage for debugging
    await logAlarmError(error, alarm);
  }
});

// Message listener for communication with popup (must be at top level)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action);
  
  // Handle async operations properly
  (async () => {
    try {
      if (message.action === 'settingsUpdated') {
        console.log('Processing settings update:', message.settings);
        const result = await handleSettingsUpdate(message.settings);
        sendResponse({ success: true, data: result });
        
      } else if (message.action === 'manualScrape') {
        console.log('Processing manual scrape request');
        const result = await performManualScraping();
        sendResponse({ 
          success: result.success, 
          data: result.data,
          error: result.error,
          metrics: result.metrics,
          processing: result.processing,
          performance: result.performance,
          totalDuration: result.totalDuration,
          attempt: result.attempt
        });
        
      } else if (message.action === 'getAlarmStatus') {
        console.log('Processing alarm status request');
        const status = await getAlarmStatus();
        sendResponse({ success: true, status });
        
      } else if (message.action === 'getTabStatus') {
        console.log('Processing tab status request');
        const tabStatus = tabManager.getAllTabsStatus();
        sendResponse({ success: true, tabStatus });
        
      } else if (message.action === 'cleanupAllTabs') {
        console.log('Processing cleanup all tabs request');
        const cleanupResult = await tabManager.cleanupAllTabs();
        sendResponse({ success: true, cleanupResult });
        
      } else if (message.action === 'authenticate') {
        console.log('Processing authentication request');
        const authResult = await handleAuthentication(message.options || {});
        sendResponse(authResult);
        
      } else if (message.action === 'getAuthStatus') {
        console.log('Processing auth status request');
        const authStatus = await handleGetAuthStatus();
        sendResponse(authStatus);
        
      } else if (message.action === 'clearAuth') {
        console.log('Processing clear auth request');
        const clearResult = await handleClearAuth();
        sendResponse(clearResult);
        
      } else if (message.action === 'getUserInfo') {
        console.log('Processing get user info request');
        const userInfoResult = await handleGetUserInfo();
        sendResponse(userInfoResult);
        
      } else if (message.action === 'getScrapingStats') {
        console.log('Processing get scraping statistics request');
        const statsResult = await getScrapingStatistics();
        sendResponse(statsResult);
        
      } else if (message.action === 'getScrapedData') {
        console.log('Processing get scraped data request');
        const dataResult = await getScrapedDataSummary();
        sendResponse(dataResult);
        
      } else if (message.action === 'resetScrapingStats') {
        console.log('Processing reset scraping statistics request');
        const resetResult = await resetScrapingStatistics();
        sendResponse(resetResult);
        
      } else if (message.action === 'syncToSheets') {
        console.log('Processing sync to Google Sheets request');
        const syncResult = await syncDataToGoogleSheets();
        sendResponse(syncResult);
        
      } else if (message.action === 'testSheetsAccess') {
        console.log('Processing test sheets access request');
        const testResult = await testGoogleSheetsAccess(message.spreadsheetId);
        sendResponse(testResult);
        
      } else if (message.action === 'getSyncStatus') {
        console.log('Processing get sync status request');
        const syncStatus = await getGoogleSheetsSyncStatus();
        sendResponse(syncStatus);
        
      } else {
        console.warn('Unknown message action:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
      }
      
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ 
        success: false, 
        error: error.message,
        stack: error.stack
      });
    }
  })();
  
  return true; // Keep message channel open for async response
});

// Storage management functions
async function initializeStorage() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    
    // Only initialize if settings don't exist
    if (!result.settings) {
      await chrome.storage.local.set({
        settings: DEFAULT_SETTINGS,
        scrapedWords: [],
        lastSyncTime: null
      });
      console.log('Storage initialized with default settings');
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
    throw error;
  }
}

async function ensureStorageInitialized() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    if (!result.settings) {
      await initializeStorage();
    }
  } catch (error) {
    console.error('Error ensuring storage initialization:', error);
    throw error;
  }
}

async function getSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    return result.settings || DEFAULT_SETTINGS;
  } catch (error) {
    console.error('Error getting settings:', error);
    return DEFAULT_SETTINGS;
  }
}

// Enhanced alarm management with better error handling
async function setupScrapingAlarm() {
  try {
    console.log('Setting up scraping alarm...');
    const settings = await getSettings();
    
    // If disabled, clear any existing alarms and return
    if (!settings.isEnabled) {
      console.log('Auto-scraping disabled, clearing any existing alarms');
      const cleared = await clearScrapingAlarm();
      console.log(cleared ? 'Existing alarm cleared' : 'No alarm to clear');
      return { success: true, action: 'cleared' };
    }
    
    // Validate interval first
    const validIntervals = [15, 30, 60, 360];
    if (!validIntervals.includes(settings.scrapeInterval)) {
      const error = new Error(`Invalid scrape interval: ${settings.scrapeInterval}. Must be one of: ${validIntervals.join(', ')}`);
      console.error(error.message);
      await logAlarmError(error, null);
      throw error;
    }
    
    // Check if alarm already exists with same interval
    const existingAlarm = await chrome.alarms.get('scrapeStarredWords');
    if (existingAlarm && existingAlarm.periodInMinutes === settings.scrapeInterval) {
      console.log(`Scraping alarm already exists with correct interval (${settings.scrapeInterval} minutes)`);
      return { success: true, action: 'exists', alarm: existingAlarm };
    }
    
    // Clear existing alarm if it exists with different interval
    if (existingAlarm) {
      const cleared = await chrome.alarms.clear('scrapeStarredWords');
      console.log(`Cleared existing alarm with different interval (was ${existingAlarm.periodInMinutes}, now ${settings.scrapeInterval})`);
      if (!cleared) {
        console.warn('Failed to clear existing alarm');
      }
    }
    
    // Create new alarm with specified interval
    await chrome.alarms.create('scrapeStarredWords', {
      delayInMinutes: settings.scrapeInterval,
      periodInMinutes: settings.scrapeInterval
    });
    
    console.log(`Scraping alarm created for every ${settings.scrapeInterval} minutes`);
    
    // Verify alarm was created successfully
    const verifyAlarm = await chrome.alarms.get('scrapeStarredWords');
    if (verifyAlarm) {
      console.log('Alarm verification successful:', {
        name: verifyAlarm.name,
        periodInMinutes: verifyAlarm.periodInMinutes,
        scheduledTime: new Date(verifyAlarm.scheduledTime).toISOString()
      });
      return { success: true, action: 'created', alarm: verifyAlarm };
    } else {
      const error = new Error('Alarm creation failed - verification returned null');
      console.error(error.message);
      await logAlarmError(error, null);
      throw error;
    }
    
  } catch (error) {
    console.error('Error setting up scraping alarm:', error);
    await logAlarmError(error, null);
    throw error;
  }
}

async function clearScrapingAlarm() {
  try {
    const cleared = await chrome.alarms.clear('scrapeStarredWords');
    if (cleared) {
      console.log('Scraping alarm cleared successfully');
    } else {
      console.log('No scraping alarm to clear');
    }
    return cleared;
  } catch (error) {
    console.error('Error clearing scraping alarm:', error);
    throw error;
  }
}

async function getAlarmStatus() {
  try {
    const alarm = await chrome.alarms.get('scrapeStarredWords');
    const allAlarms = await chrome.alarms.getAll();
    
    // Get tab manager status
    const tabStatus = tabManager.getAllTabsStatus();
    
    return {
      hasAlarm: !!alarm,
      alarmDetails: alarm,
      nextScheduledTime: alarm ? new Date(alarm.scheduledTime).toISOString() : null,
      totalAlarms: allAlarms.length,
      allAlarmNames: allAlarms.map(a => a.name),
      tabManager: {
        activeTabs: tabStatus.totalTabs,
        tabStates: tabStatus.states,
        tabs: tabStatus.tabs
      }
    };
  } catch (error) {
    console.error('Error getting alarm status:', error);
    return { 
      hasAlarm: false, 
      error: error.message,
      tabManager: { activeTabs: 0, tabStates: {}, tabs: [] }
    };
  }
}



// Main scraping functions
async function performScheduledScraping() {
  try {
    console.log('Starting scheduled scraping triggered by alarm...');
    
    // Get current settings
    const settings = await getSettings();
    
    if (!settings.isEnabled) {
      console.log('Scraping disabled, skipping scheduled scrape...');
      return { success: false, reason: 'disabled' };
    }
    
    const result = await executeScrapingWithController('scheduled');
    
    // Send status update to popup if open
    try {
      await chrome.runtime.sendMessage({ 
        action: 'scrapeComplete', 
        success: result.success,
        type: 'scheduled',
        data: result.data,
        metrics: result.metrics,
        timestamp: new Date().toISOString()
      });
      console.log('Status update sent to popup');
    } catch (e) {
      // Popup might not be open, this is normal
      console.log('Could not send status update to popup (popup likely closed)');
    }
    
    return result;
    
  } catch (error) {
    console.error('Error during scheduled scraping:', error);
    await updateScrapingStats('scheduled', false, 0, 0, error);
    return { success: false, error: error.message };
  }
}

async function performManualScraping() {
  try {
    console.log('Starting manual scraping triggered by user...');
    
    const result = await executeScrapingWithController('manual');
    
    return result;
    
  } catch (error) {
    console.error('Error during manual scraping:', error);
    await updateScrapingStats('manual', false, 0, 0, error);
    return { success: false, error: error.message };
  }
}

// New comprehensive scraping function using ScrapingController
async function executeScrapingWithController(triggerType) {
  console.log(`Starting ${triggerType} scraping with ScrapingController...`);
  
  try {
    // Check authentication before scraping
    console.log('Checking authentication status before scraping...');
    const authStatus = await checkAuthenticationForScraping();
    
    if (!authStatus.success) {
      console.warn(`Authentication not available: ${authStatus.error}. Proceeding with limited functionality.`);
    } else {
      console.log(`Authentication verified for user: ${authStatus.user?.email || 'unknown'}`);
    }
    
    // Initialize ScrapingController
    const scrapingController = new ScrapingController();
    
    // Execute scraping with the controller
    console.log('Executing scraping with ScrapingController...');
    const scrapingResult = await scrapingController.executeGoogleTranslateScraping();
    
    if (!scrapingResult.success) {
      throw new Error(`Scraping failed: ${scrapingResult.error}`);
    }
    
    console.log(`Scraping completed successfully in ${scrapingResult.totalDuration.toFixed(2)}ms`);
    console.log(`Raw data extracted: ${scrapingResult.data.count} words`);
    
    // Process the scraped data with DataProcessor
    const processedData = await processScrapedData(scrapingResult.data);
    
    if (!processedData.success) {
      console.warn(`Data processing had issues: ${processedData.error}`);
    }
    
    // Store the processed data
    await storeScrapedData(processedData.data, triggerType);
    
    // Update scraping statistics
    await updateScrapingStats(
      triggerType, 
      true, 
      scrapingResult.totalDuration, 
      processedData.data?.words?.length || 0
    );
    
    // Auto-sync to Google Sheets if enabled
    const settings = await getSettings();
    if (settings.autoSync && settings.googleSheetsId && authStatus.success) {
      console.log('Auto-sync enabled, syncing data to Google Sheets...');
      try {
        const syncResult = await syncDataToGoogleSheets();
        if (syncResult.success) {
          console.log('Auto-sync to Google Sheets completed successfully');
        } else {
          console.warn('Auto-sync to Google Sheets failed:', syncResult.error);
        }
      } catch (syncError) {
        console.error('Error during auto-sync to Google Sheets:', syncError);
      }
    }
    
    console.log(`${triggerType} scraping pipeline completed successfully`);
    
    return {
      success: true,
      triggerType,
      totalDuration: scrapingResult.totalDuration,
      attempt: scrapingResult.attempt,
      data: {
        count: processedData.data?.words?.length || 0,
        raw: scrapingResult.data.raw,
        validated: processedData.data,
        lastScrapeTime: new Date().toISOString()
      },
      metrics: scrapingResult.metrics,
      performance: scrapingResult.performance,
      processing: {
        success: processedData.success,
        duplicatesRemoved: processedData.duplicatesRemoved || 0,
        validationErrors: processedData.validationErrors || 0
      }
    };
    
  } catch (error) {
    console.error(`Error during ${triggerType} scraping:`, error);
    
    // Update error statistics
    await updateScrapingStats(triggerType, false, 0, 0, error);
    
    return {
      success: false,
      error: error.message,
      triggerType,
      timestamp: new Date().toISOString()
    };
  }
}

// Process scraped data with DataProcessor
async function processScrapedData(rawData) {
  try {
    console.log('Processing scraped data with DataProcessor...');
    
    if (!rawData || !rawData.validated || !rawData.validated.words) {
      throw new Error('No valid words data found in scraping results');
    }
    
    const words = rawData.validated.words;
    console.log(`Processing ${words.length} raw words...`);
    
    // Step 1: Clean and validate words
    const cleanResult = await DataProcessor.cleanAndValidateWords(words);
    if (!cleanResult.success) {
      throw new Error(`Data cleaning failed: ${cleanResult.error}`);
    }
    
    console.log(`Cleaned words: ${cleanResult.cleanedCount}/${cleanResult.originalCount}`);
    
    // Step 2: Remove duplicates
    const dedupeResult = await DataProcessor.removeDuplicates(cleanResult.words, 'language_pair');
    if (!dedupeResult.success) {
      console.warn(`Deduplication failed: ${dedupeResult.error}`);
    } else {
      console.log(`Removed ${dedupeResult.duplicatesRemoved} duplicates`);
    }
    
    // Step 3: Get existing data and merge
    const existingData = await getExistingScrapedData();
    const mergeResult = await DataProcessor.mergeWithExistingData(
      dedupeResult.words || cleanResult.words, 
      existingData, 
      'merge_unique'
    );
    
    if (!mergeResult.success) {
      console.warn(`Data merging failed: ${mergeResult.error}`);
    }
    
    // Step 4: Generate statistics
    const statsResult = await DataProcessor.generateDataStatistics(mergeResult.words || dedupeResult.words || cleanResult.words);
    
    return {
      success: true,
      data: {
        words: mergeResult.words || dedupeResult.words || cleanResult.words,
        statistics: statsResult.success ? statsResult.statistics : null,
        processing: {
          cleaned: cleanResult.cleanedCount,
          originalCount: cleanResult.originalCount,
          duplicatesRemoved: dedupeResult.duplicatesRemoved || 0,
          merged: mergeResult.mergedCount || 0,
          errors: cleanResult.errors || []
        }
      },
      duplicatesRemoved: dedupeResult.duplicatesRemoved || 0,
      validationErrors: cleanResult.errors?.length || 0
    };
    
  } catch (error) {
    console.error('Error processing scraped data:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

// Store processed data in Chrome storage
async function storeScrapedData(processedData, triggerType) {
  try {
    console.log('Storing processed data in Chrome storage...');
    
    if (!processedData || !processedData.words) {
      throw new Error('No processed data to store');
    }
    
    // Prepare data for storage
    const storageData = {
      words: processedData.words,
      lastUpdate: new Date().toISOString(),
      triggerType: triggerType,
      statistics: processedData.statistics,
      processing: processedData.processing
    };
    
    // Store in Chrome storage
    await chrome.storage.local.set({ 
      scrapedWords: storageData,
      lastSyncTime: new Date().toISOString()
    });
    
    console.log(`Stored ${processedData.words.length} words in Chrome storage`);
    
    // Update settings with new totals
    const settings = await getSettings();
    settings.lastScrapeTime = storageData.lastUpdate;
    settings.totalWordsScraped = processedData.words.length;
    
    await chrome.storage.local.set({ settings });
    
    return { success: true };
    
  } catch (error) {
    console.error('Error storing scraped data:', error);
    throw error;
  }
}

// Get existing scraped data from storage
async function getExistingScrapedData() {
  try {
    const result = await chrome.storage.local.get(['scrapedWords']);
    return result.scrapedWords?.words || [];
  } catch (error) {
    console.error('Error getting existing scraped data:', error);
    return [];
  }
}

// Update scraping statistics
async function updateScrapingStats(triggerType, success, duration, wordsFound, error = null) {
  try {
    const settings = await getSettings();
    const stats = settings.scrapingStats || DEFAULT_SETTINGS.scrapingStats;
    
    // Update counters
    stats.totalAttempts++;
    if (success) {
      stats.successfulAttempts++;
      stats.totalWordsFound += wordsFound;
      stats.lastSuccessfulScrape = new Date().toISOString();
      
      // Update averages
      stats.averageWordsPerScrape = Math.round(stats.totalWordsFound / stats.successfulAttempts);
      const currentAvgTime = stats.averageScrapingTime || 0;
      stats.averageScrapingTime = Math.round(((currentAvgTime * (stats.successfulAttempts - 1)) + duration) / stats.successfulAttempts);
    } else {
      stats.failedAttempts++;
      stats.lastFailedScrape = {
        timestamp: new Date().toISOString(),
        error: error?.message || 'Unknown error',
        triggerType
      };
    }
    
    // Update settings
    settings.scrapingStats = stats;
    await chrome.storage.local.set({ settings });
    
    console.log('Scraping statistics updated:', {
      totalAttempts: stats.totalAttempts,
      successRate: `${((stats.successfulAttempts / stats.totalAttempts) * 100).toFixed(1)}%`,
      avgWordsPerScrape: stats.averageWordsPerScrape,
      avgTime: `${stats.averageScrapingTime}ms`
    });
    
  } catch (error) {
    console.error('Error updating scraping statistics:', error);
  }
}

// Settings update handler for popup communication
async function handleSettingsUpdate(newSettings) {
  try {
    console.log('Handling settings update from popup:', newSettings);
    
    // Get current settings to compare
    const result = await chrome.storage.local.get(['settings']);
    const currentSettings = result.settings || DEFAULT_SETTINGS;
    
    // Validate Google Sheets ID if autoSync is enabled
    if (newSettings.autoSync && newSettings.googleSheetsId) {
      const validationResult = validateGoogleSheetsId(newSettings.googleSheetsId);
      if (!validationResult.isValid) {
        console.error('Invalid Google Sheets ID:', validationResult.error);
        return { 
          success: false, 
          error: `Invalid Google Sheets ID: ${validationResult.error}`
        };
      }
      console.log('Google Sheets ID validation passed');
    }
    
    // Check if alarm-related settings changed
    const alarmSettingsChanged = (
      currentSettings.isEnabled !== newSettings.isEnabled ||
      currentSettings.scrapeInterval !== newSettings.scrapeInterval
    );
    
    // Update settings in storage
    await chrome.storage.local.set({ settings: newSettings });
    console.log('Settings updated in storage');
    
    // Update alarms if necessary
    if (alarmSettingsChanged) {
      console.log('Alarm settings changed, updating alarms...');
      await setupScrapingAlarm();
      
      // Log alarm status after update
      const alarmStatus = await getAlarmStatus();
      console.log('Alarm status after settings update:', alarmStatus);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error('Error handling settings update:', error);
    throw error;
  }
}

// Update handling function for extension updates
async function handleExtensionUpdate() {
  try {
    console.log('Handling extension update...');
    
    // Check if we need to migrate any data or update settings
    const result = await chrome.storage.local.get(['settings']);
    const currentSettings = result.settings || {};
    
    // Merge with default settings to ensure all new properties exist
    const updatedSettings = { ...DEFAULT_SETTINGS, ...currentSettings };
    
    await chrome.storage.local.set({ settings: updatedSettings });
    console.log('Settings updated for new version');
    
    // Ensure alarms are properly set up after update
    await checkAndRecreateAlarms();
    
  } catch (error) {
    console.error('Error handling extension update:', error);
  }
}

// Utility function to log alarm errors for debugging
async function logAlarmError(error, alarm) {
  try {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      alarm: alarm,
      userAgent: navigator.userAgent
    };
    
    // Get existing error logs
    const result = await chrome.storage.local.get(['alarmErrors']);
    const existingErrors = result.alarmErrors || [];
    
    // Keep only last 10 errors
    const updatedErrors = [errorLog, ...existingErrors].slice(0, 10);
    
    await chrome.storage.local.set({ alarmErrors: updatedErrors });
    console.error('Alarm error logged:', errorLog);
    
  } catch (logError) {
    console.error('Error logging alarm error:', logError);
  }
}

// Error handling for service worker termination
self.addEventListener('error', async (event) => {
  console.error('Service worker error:', event.error);
  
  // Cleanup tabs on critical errors
  try {
    await cleanupTabsOnError();
  } catch (cleanupError) {
    console.error('Error during emergency tab cleanup:', cleanupError);
  }
});

self.addEventListener('unhandledrejection', async (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  
  // Cleanup tabs on unhandled rejections
  try {
    await cleanupTabsOnError();
  } catch (cleanupError) {
    console.error('Error during emergency tab cleanup:', cleanupError);
  }
});

// Add beforeunload equivalent for service workers
self.addEventListener('beforeunload', async (event) => {
  console.log('Service worker shutting down, cleaning up tabs...');
  try {
    await tabManager.cleanupAllTabs();
  } catch (error) {
    console.error('Error cleaning up tabs on shutdown:', error);
  }
});

// Emergency tab cleanup function
async function cleanupTabsOnError() {
  try {
    const tabStatus = tabManager.getAllTabsStatus();
    if (tabStatus.totalTabs > 0) {
      console.log(`Emergency cleanup: found ${tabStatus.totalTabs} active tabs`);
      const result = await tabManager.cleanupAllTabs();
      console.log('Emergency tab cleanup completed:', result);
    }
  } catch (error) {
    console.error('Emergency tab cleanup failed:', error);
  }
}

// Initialize when service worker loads
console.log('Background service worker loaded and ready');

// Check and recreate alarms on service worker startup
async function checkAndRecreateAlarms() {
  try {
    console.log('Checking and recreating alarms on service worker startup...');
    
    const settings = await getSettings();
    
    if (!settings.isEnabled) {
      console.log('Auto-scraping disabled, ensuring no alarms exist');
      await clearScrapingAlarm();
      return;
    }
    
    // Check if alarm exists
    const existingAlarm = await chrome.alarms.get('scrapeStarredWords');
    
    if (!existingAlarm) {
      console.log('Alarm missing, recreating...');
      await setupScrapingAlarm();
    } else {
      console.log('Alarm exists:', existingAlarm);
      
      // Verify interval matches settings
      if (existingAlarm.periodInMinutes !== settings.scrapeInterval) {
        console.log('Alarm interval mismatch, recreating with correct interval');
        await setupScrapingAlarm();
      }
    }
    
  } catch (error) {
    console.error('Error checking and recreating alarms:', error);
  }
}

// Initialize TabManager and AuthManager, perform startup checks
async function initializeServiceWorker() {
  try {
    console.log('Initializing service worker with TabManager and AuthManager...');
    
    // Ensure TabManager is ready
    if (typeof tabManager === 'undefined') {
      throw new Error('TabManager not available - check tab-manager.js import');
    }
    
    // Ensure AuthManager is ready
    if (typeof authManager === 'undefined') {
      throw new Error('AuthManager not available - check auth.js import');
    }
    
    // Ensure ScrapingController is ready
    if (typeof ScrapingController === 'undefined') {
      throw new Error('ScrapingController not available - check scraper.js import');
    }
    
    // Ensure DataProcessor is ready
    if (typeof DataProcessor === 'undefined') {
      throw new Error('DataProcessor not available - check data-processor.js import');
    }
    
    console.log('All modules loaded successfully: TabManager, AuthManager, ScrapingController, DataProcessor');
    
    // Clean up any orphaned tabs from previous session
    const cleanupResult = await tabManager.cleanupAllTabs();
    if (cleanupResult.total > 0) {
      console.log(`Cleaned up ${cleanupResult.successful} orphaned tabs from previous session`);
    }
    
    // Check and recreate alarms
    await checkAndRecreateAlarms();
    
    // Check authentication status on startup
    try {
      const authStatus = await authManager.checkAuthStatus();
      console.log('Initial auth status:', authStatus.isAuthenticated ? 'authenticated' : 'not authenticated');
    } catch (authError) {
      console.warn('Error checking initial auth status:', authError);
    }
    
    console.log('Service worker initialization completed successfully');
    
  } catch (error) {
    console.error('Error during service worker initialization:', error);
  }
}

// Authentication handler functions
async function handleAuthentication(options = {}) {
  try {
    console.log('Handling authentication request with options:', options);
    
    // Ensure AuthManager is available
    if (typeof authManager === 'undefined') {
      throw new Error('AuthManager not available');
    }
    
    // Get authentication token
    const token = await authManager.getAuthToken({
      interactive: options.interactive !== false, // Default to true
      forceRefresh: options.forceRefresh || false
    });
    
    // Get user info to confirm authentication
    const userInfo = await authManager.getUserInfo();
    
    console.log(`Authentication successful for user: ${userInfo.email}`);
    
    return {
      success: true,
      user: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture
      },
      hasToken: !!token
    };
    
  } catch (error) {
    console.error('Authentication failed:', error);
    return {
      success: false,
      error: error.message,
      needsInteraction: error.message.includes('interactive') || error.message.includes('user denied')
    };
  }
}

async function handleGetAuthStatus() {
  try {
    console.log('Getting authentication status...');
    
    // Ensure AuthManager is available
    if (typeof authManager === 'undefined') {
      throw new Error('AuthManager not available');
    }
    
    const authStatus = await authManager.checkAuthStatus();
    
    return {
      success: true,
      authStatus: authStatus
    };
    
  } catch (error) {
    console.error('Error getting auth status:', error);
    return {
      success: false,
      error: error.message,
      authStatus: {
        isAuthenticated: false,
        state: 'error',
        error: error.message
      }
    };
  }
}

async function handleClearAuth() {
  try {
    console.log('Clearing authentication...');
    
    // Ensure AuthManager is available
    if (typeof authManager === 'undefined') {
      throw new Error('AuthManager not available');
    }
    
    const cleared = await authManager.clearAuthToken();
    
    console.log('Authentication cleared successfully');
    
    return {
      success: true,
      cleared: cleared
    };
    
  } catch (error) {
    console.error('Error clearing authentication:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function handleGetUserInfo() {
  try {
    console.log('Getting user information...');
    
    // Ensure AuthManager is available
    if (typeof authManager === 'undefined') {
      throw new Error('AuthManager not available');
    }
    
    // Check if authenticated first
    const authStatus = await authManager.checkAuthStatus();
    if (!authStatus.isAuthenticated) {
      throw new Error('User not authenticated. Please login first.');
    }
    
    const userInfo = await authManager.getUserInfo();
    
    console.log(`User info retrieved for: ${userInfo.email}`);
    
    return {
      success: true,
      userInfo: userInfo
    };
    
  } catch (error) {
    console.error('Error getting user info:', error);
    return {
      success: false,
      error: error.message,
      needsAuth: error.message.includes('not authenticated')
    };
  }
}

// New message handler functions for enhanced scraping system

// Get comprehensive scraping statistics
async function getScrapingStatistics() {
  try {
    console.log('Getting comprehensive scraping statistics...');
    
    const settings = await getSettings();
    const scrapingStats = settings.scrapingStats || DEFAULT_SETTINGS.scrapingStats;
    
    // Get processor statistics if available
    let processorStats = null;
    try {
      if (typeof DataProcessor !== 'undefined') {
        processorStats = DataProcessor.getProcessorStatistics();
      }
    } catch (error) {
      console.warn('Could not get DataProcessor statistics:', error);
    }
    
    // Get scraping controller metrics if available
    let controllerMetrics = null;
    try {
      if (typeof ScrapingController !== 'undefined') {
        const controller = new ScrapingController();
        controllerMetrics = controller.getScrapingMetrics();
      }
    } catch (error) {
      console.warn('Could not get ScrapingController metrics:', error);
    }
    
    return {
      success: true,
      statistics: {
        scraping: scrapingStats,
        processor: processorStats,
        controller: controllerMetrics,
        generatedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    console.error('Error getting scraping statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Get scraped data summary
async function getScrapedDataSummary() {
  try {
    console.log('Getting scraped data summary...');
    
    const result = await chrome.storage.local.get(['scrapedWords']);
    const scrapedData = result.scrapedWords;
    
    if (!scrapedData) {
      return {
        success: true,
        data: {
          totalWords: 0,
          lastUpdate: null,
          summary: null
        }
      };
    }
    
    // Generate summary statistics
    const summary = {
      totalWords: scrapedData.words?.length || 0,
      lastUpdate: scrapedData.lastUpdate,
      triggerType: scrapedData.triggerType,
      processing: scrapedData.processing,
      statistics: scrapedData.statistics
    };
    
    // Add recent words preview (last 5)
    if (scrapedData.words && scrapedData.words.length > 0) {
      summary.recentWords = scrapedData.words
        .slice(-5)
        .map(word => ({
          originalText: word.originalText,
          translatedText: word.translatedText,
          sourceLanguage: word.sourceLanguage,
          targetLanguage: word.targetLanguage
        }));
    }
    
    return {
      success: true,
      data: summary
    };
    
  } catch (error) {
    console.error('Error getting scraped data summary:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Reset scraping statistics
async function resetScrapingStatistics() {
  try {
    console.log('Resetting scraping statistics...');
    
    const settings = await getSettings();
    settings.scrapingStats = { ...DEFAULT_SETTINGS.scrapingStats };
    
    await chrome.storage.local.set({ settings });
    
    // Reset processor statistics if available
    try {
      if (typeof DataProcessor !== 'undefined') {
        DataProcessor.resetStatistics();
      }
    } catch (error) {
      console.warn('Could not reset DataProcessor statistics:', error);
    }
    
    // Reset controller metrics if available
    try {
      if (typeof ScrapingController !== 'undefined') {
        const controller = new ScrapingController();
        controller.resetMetrics();
      }
    } catch (error) {
      console.warn('Could not reset ScrapingController metrics:', error);
    }
    
    console.log('Scraping statistics reset successfully');
    
    return {
      success: true,
      message: 'Scraping statistics reset successfully'
    };
    
  } catch (error) {
    console.error('Error resetting scraping statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function checkAuthenticationForScraping() {
  try {
    console.log('Checking authentication for scraping operation...');
    
    // Ensure AuthManager is available
    if (typeof authManager === 'undefined') {
      console.warn('AuthManager not available - proceeding without authentication');
      return {
        success: true,
        user: null,
        warning: 'Authentication not available - limited functionality'
      };
    }
    
    // Check authentication status
    const authStatus = await authManager.checkAuthStatus();
    
    if (!authStatus.isAuthenticated) {
      return {
        success: false,
        error: 'User not authenticated. Google API access requires authentication.',
        needsAuth: true,
        authStatus: authStatus
      };
    }
    
    // Get user info for logging
    let userInfo = null;
    try {
      userInfo = await authManager.getUserInfo();
    } catch (userError) {
      console.warn('Could not get user info:', userError);
    }
    
    return {
      success: true,
      user: userInfo,
      authStatus: authStatus
    };
    
  } catch (error) {
    console.error('Error checking authentication for scraping:', error);
    return {
      success: false,
      error: error.message,
      needsAuth: true
    };
  }
}

// Google Sheets functionality

// Validate Google Sheets ID format
function validateGoogleSheetsId(spreadsheetId) {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return {
      isValid: false,
      error: 'Spreadsheet ID is required and must be a string'
    };
  }
  
  // Remove any whitespace
  const cleanId = spreadsheetId.trim();
  
  // Check length (Google Sheets IDs are 44 characters)
  if (cleanId.length !== 44) {
    return {
      isValid: false,
      error: `Spreadsheet ID must be exactly 44 characters, got ${cleanId.length}`
    };
  }
  
  // Check format (alphanumeric, hyphens, underscores)
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(cleanId)) {
    return {
      isValid: false,
      error: 'Spreadsheet ID contains invalid characters. Only letters, numbers, hyphens, and underscores are allowed'
    };
  }
  
  return {
    isValid: true,
    cleanId: cleanId
  };
}

// Sync data to Google Sheets
async function syncDataToGoogleSheets() {
  console.log('Starting sync to Google Sheets...');
  
  try {
    // Get settings
    const settings = await getSettings();
    
    if (!settings.googleSheetsId) {
      throw new Error('Google Sheets ID not configured');
    }
    
    // Validate sheets ID
    const validation = validateGoogleSheetsId(settings.googleSheetsId);
    if (!validation.isValid) {
      throw new Error(`Invalid Google Sheets ID: ${validation.error}`);
    }
    
    // Check authentication
    const authStatus = await authManager.checkAuthStatus();
    if (!authStatus.isAuthenticated) {
      throw new Error('User not authenticated. Please authenticate first.');
    }
    
    // Get scraped data
    const scrapedData = await getExistingScrapedData();
    if (!scrapedData || !scrapedData.length) {
      console.log('No scraped data to sync');
      await updateSheetsSyncStatus('success', 0, null);
      return {
        success: true,
        message: 'No data to sync',
        wordCount: 0
      };
    }
    
    console.log(`Syncing ${scrapedData.length} words to Google Sheets...`);
    
    // Initialize Google Sheets API
    const sheetsAPI = new GoogleSheetsAPI();
    
    // Validate sheet access
    console.log('Validating sheet access...');
    const accessResult = await sheetsAPI.validateSheetAccess(validation.cleanId);
    if (!accessResult.success) {
      throw new Error(`Cannot access Google Sheet: ${accessResult.error}`);
    }
    
    // Convert data to sheets format
    const sheetsData = convertDataToSheetsFormat(scrapedData);
    
    // Clear existing data
    console.log('Clearing existing sheet data...');
    const clearResult = await sheetsAPI.clearSheetData(validation.cleanId);
    if (!clearResult.success) {
      console.warn('Could not clear existing data:', clearResult.error);
    }
    
    // Write new data
    console.log('Writing new data to sheet...');
    const writeResult = await sheetsAPI.writeDataToSheet(validation.cleanId, sheetsData);
    if (!writeResult.success) {
      throw new Error(`Failed to write data to sheet: ${writeResult.error}`);
    }
    
    // Update sync status
    await updateSheetsSyncStatus('success', scrapedData.length, null);
    
    console.log(`Successfully synced ${scrapedData.length} words to Google Sheets`);
    
    return {
      success: true,
      message: 'Data synced successfully',
      wordCount: scrapedData.length,
      sheetInfo: accessResult.sheetInfo
    };
    
  } catch (error) {
    console.error('Error syncing to Google Sheets:', error);
    
    // Store error for debugging
    await updateSheetsSyncStatus('error', 0, error.message);
    
    // Store detailed error in chrome storage for debugging
    await storeSheetsSyncError(error);
    
    return {
      success: false,
      error: error.message,
      userFriendlyError: getUserFriendlyError(error.message)
    };
  }
}

// Test Google Sheets access
async function testGoogleSheetsAccess(spreadsheetId) {
  console.log('Testing Google Sheets access for ID:', spreadsheetId);
  
  try {
    // Validate sheets ID
    const validation = validateGoogleSheetsId(spreadsheetId);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.error
      };
    }
    
    // Check authentication
    const authStatus = await authManager.checkAuthStatus();
    if (!authStatus.isAuthenticated) {
      return {
        success: false,
        error: 'User not authenticated. Please authenticate first.',
        needsAuth: true
      };
    }
    
    // Test access using Google Sheets API
    const sheetsAPI = new GoogleSheetsAPI();
    const accessResult = await sheetsAPI.validateSheetAccess(validation.cleanId);
    
    if (!accessResult.success) {
      return {
        success: false,
        error: accessResult.error,
        userFriendlyError: getUserFriendlyError(accessResult.error)
      };
    }
    
    console.log('Google Sheets access test successful');
    
    return {
      success: true,
      message: 'Sheet access verified successfully',
      sheetInfo: accessResult.sheetInfo
    };
    
  } catch (error) {
    console.error('Error testing Google Sheets access:', error);
    return {
      success: false,
      error: error.message,
      userFriendlyError: getUserFriendlyError(error.message)
    };
  }
}

// Get Google Sheets sync status
async function getGoogleSheetsSyncStatus() {
  try {
    console.log('Getting Google Sheets sync status...');
    
    const settings = await getSettings();
    const syncStatus = settings.sheetsSync || DEFAULT_SETTINGS.sheetsSync;
    
    return {
      success: true,
      syncStatus: {
        lastSyncTime: syncStatus.lastSyncTime,
        lastSyncStatus: syncStatus.lastSyncStatus,
        lastSyncError: syncStatus.lastSyncError,
        totalSyncs: syncStatus.totalSyncs,
        successfulSyncs: syncStatus.successfulSyncs,
        failedSyncs: syncStatus.failedSyncs,
        lastSyncedWordCount: syncStatus.lastSyncedWordCount,
        isConfigured: !!settings.googleSheetsId,
        autoSyncEnabled: settings.autoSync
      }
    };
    
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Convert scraped data to Google Sheets format
function convertDataToSheetsFormat(scrapedData) {
  console.log('Converting data to Google Sheets format...');
  
  // Headers
  const headers = [
    'Original Text',
    'Translated Text', 
    'Source Language',
    'Target Language',
    'Extracted At'
  ];
  
  // Convert each word to row format
  const rows = scrapedData.map(word => [
    word.originalText || '',
    word.translatedText || '',
    word.sourceLanguage || '',
    word.targetLanguage || '',
    word.extractedAt || word.timestamp || new Date().toISOString()
  ]);
  
  // Combine headers and data
  const sheetsData = [headers, ...rows];
  
  console.log(`Converted ${rows.length} words to sheets format`);
  
  return sheetsData;
}

// Update Google Sheets sync status in storage
async function updateSheetsSyncStatus(status, wordCount, error) {
  try {
    const settings = await getSettings();
    
    if (!settings.sheetsSync) {
      settings.sheetsSync = { ...DEFAULT_SETTINGS.sheetsSync };
    }
    
    // Update sync statistics
    settings.sheetsSync.lastSyncTime = new Date().toISOString();
    settings.sheetsSync.lastSyncStatus = status;
    settings.sheetsSync.lastSyncError = error;
    settings.sheetsSync.totalSyncs += 1;
    settings.sheetsSync.lastSyncedWordCount = wordCount;
    
    if (status === 'success') {
      settings.sheetsSync.successfulSyncs += 1;
    } else {
      settings.sheetsSync.failedSyncs += 1;
    }
    
    await chrome.storage.local.set({ settings });
    
    console.log('Sheets sync status updated:', {
      status,
      wordCount,
      totalSyncs: settings.sheetsSync.totalSyncs,
      successRate: `${((settings.sheetsSync.successfulSyncs / settings.sheetsSync.totalSyncs) * 100).toFixed(1)}%`
    });
    
  } catch (error) {
    console.error('Error updating sheets sync status:', error);
  }
}

// Store detailed error information for debugging
async function storeSheetsSyncError(error) {
  try {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      userAgent: navigator.userAgent
    };
    
    // Get existing error logs
    const result = await chrome.storage.local.get(['sheetsSyncErrors']);
    const existingErrors = result.sheetsSyncErrors || [];
    
    // Keep only last 10 errors
    const updatedErrors = [errorLog, ...existingErrors].slice(0, 10);
    
    await chrome.storage.local.set({ sheetsSyncErrors: updatedErrors });
    console.error('Sheets sync error logged:', errorLog);
    
  } catch (logError) {
    console.error('Error logging sheets sync error:', logError);
  }
}

// Get user-friendly error messages
function getUserFriendlyError(errorMessage) {
  const lowerError = errorMessage.toLowerCase();
  
  if (lowerError.includes('permission') || lowerError.includes('403') || lowerError.includes('forbidden')) {
    return 'Permission denied. Please check that the Google Sheet is shared with your account and allows editing.';
  }
  
  if (lowerError.includes('not found') || lowerError.includes('404')) {
    return 'Google Sheet not found. Please verify the spreadsheet ID is correct and the sheet exists.';
  }
  
  if (lowerError.includes('quota') || lowerError.includes('rate limit') || lowerError.includes('429')) {
    return 'Rate limit exceeded. Please wait a few minutes before trying again.';
  }
  
  if (lowerError.includes('network') || lowerError.includes('fetch')) {
    return 'Network error. Please check your internet connection and try again.';
  }
  
  if (lowerError.includes('authentication') || lowerError.includes('unauthorized') || lowerError.includes('401')) {
    return 'Authentication required. Please authenticate with your Google account.';
  }
  
  if (lowerError.includes('invalid') && lowerError.includes('id')) {
    return 'Invalid spreadsheet ID. Please check the ID format and try again.';
  }
  
  // Default fallback
  return 'An error occurred while syncing to Google Sheets. Please try again or check the console for details.';
}

// Enhanced background script loaded with comprehensive scraping system
console.log('Enhanced Google Translate Scraper Background Script loaded successfully');
console.log('Modules: TabManager, AuthManager, ScrapingController, DataProcessor, GoogleSheetsAPI');
console.log('Features: Advanced scraping, data processing, Google Sheets sync, statistics tracking, error handling');

// Immediate initialization on service worker load
initializeServiceWorker(); 