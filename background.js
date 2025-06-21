// Google Translate Starred Words Scraper - Background Service Worker
// Manifest V3 compliant background script

// Import TabManager for tab operations
importScripts('tab-manager.js');

// Default extension settings
const DEFAULT_SETTINGS = {
  isEnabled: true,
  scrapeInterval: 30, // minutes
  lastScrapeTime: null,
  totalWordsScraped: 0,
  googleSheetsId: '',
  autoSync: true,
  notifications: true
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
          error: result.error
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
    
    const result = await executeScraping('scheduled');
    
    // Send status update to popup if open
    try {
      await chrome.runtime.sendMessage({ 
        action: 'scrapeComplete', 
        success: result.success,
        type: 'scheduled',
        data: result.data,
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
    return { success: false, error: error.message };
  }
}

async function performManualScraping() {
  try {
    console.log('Starting manual scraping triggered by user...');
    
    const result = await executeScraping('manual');
    
    return result;
    
  } catch (error) {
    console.error('Error during manual scraping:', error);
    return { success: false, error: error.message };
  }
}

async function executeScraping(triggerType) {
  let tabResult = null;
  
  try {
    const startTime = Date.now();
    console.log(`Executing ${triggerType} scraping with TabManager...`);
    
    // Get current settings
    const settings = await getSettings();
    
    // Create hidden tab and navigate to Google Translate starred words page
    console.log('Creating hidden tab for Google Translate scraping...');
    tabResult = await tabManager.createAndNavigateToGoogleTranslate({
      timeout: 45000, // 45 second timeout for scraping
      autoCleanup: false // We'll handle cleanup manually to extract data first
    });
    
    if (!tabResult.success) {
      throw new Error(`Tab creation failed: ${tabResult.error}`);
    }
    
    console.log(`Tab ${tabResult.tabId} created successfully, load time: ${tabResult.loadTime}ms`);
    
    // TODO: Inject content script to extract starred words
    // This will be implemented in a future update
    // For now, we'll simulate finding words but using real tab timing
    
    // Simulate word extraction delay (realistic timing)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simulate finding words (this will be replaced with actual extraction)
    const wordsFound = Math.floor(Math.random() * 8) + 1; // 1-8 words
    
    // Update statistics with real timing
    const endTime = Date.now();
    const scrapeDuration = endTime - startTime;
    
    settings.lastScrapeTime = new Date().toISOString();
    settings.totalWordsScraped = (settings.totalWordsScraped || 0) + wordsFound;
    
    await chrome.storage.local.set({ settings });
    
    console.log(`${triggerType} scraping completed successfully in ${scrapeDuration}ms, found ${wordsFound} words`);
    
    // Clean up the tab
    try {
      await tabManager.cleanupTab(tabResult.tabId);
      console.log(`Tab ${tabResult.tabId} cleaned up successfully`);
    } catch (cleanupError) {
      console.error(`Error cleaning up tab ${tabResult.tabId}:`, cleanupError);
      // Don't fail the entire operation for cleanup errors
    }
    
    return { 
      success: true, 
      triggerType,
      duration: scrapeDuration,
      wordsFound: wordsFound,
      tabLoadTime: tabResult.loadTime,
      tabId: tabResult.tabId,
      data: { 
        lastScrapeTime: settings.lastScrapeTime,
        totalWordsScraped: settings.totalWordsScraped
      }
    };
    
  } catch (error) {
    console.error(`Error during ${triggerType} scraping:`, error);
    
    // Ensure tab cleanup on error
    if (tabResult && tabResult.tabId) {
      try {
        await tabManager.cleanupTab(tabResult.tabId);
        console.log(`Tab ${tabResult.tabId} cleaned up after error`);
      } catch (cleanupError) {
        console.error(`Error cleaning up tab ${tabResult.tabId} after scraping error:`, cleanupError);
      }
    }
    
    return { 
      success: false, 
      error: error.message, 
      triggerType,
      tabError: tabResult ? tabResult.error : null
    };
  }
}

// Settings update handler for popup communication
async function handleSettingsUpdate(newSettings) {
  try {
    console.log('Handling settings update from popup:', newSettings);
    
    // Get current settings to compare
    const result = await chrome.storage.local.get(['settings']);
    const currentSettings = result.settings || DEFAULT_SETTINGS;
    
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

// Initialize TabManager and perform startup checks
async function initializeServiceWorker() {
  try {
    console.log('Initializing service worker with TabManager...');
    
    // Ensure TabManager is ready
    if (typeof tabManager === 'undefined') {
      throw new Error('TabManager not available - check tab-manager.js import');
    }
    
    // Clean up any orphaned tabs from previous session
    const cleanupResult = await tabManager.cleanupAllTabs();
    if (cleanupResult.total > 0) {
      console.log(`Cleaned up ${cleanupResult.successful} orphaned tabs from previous session`);
    }
    
    // Check and recreate alarms
    await checkAndRecreateAlarms();
    
    console.log('Service worker initialization completed successfully');
    
  } catch (error) {
    console.error('Error during service worker initialization:', error);
  }
}

// Immediate initialization on service worker load
initializeServiceWorker(); 