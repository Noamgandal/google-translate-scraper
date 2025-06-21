// Google Translate Starred Words Scraper - Background Service Worker
// Manifest V3 compliant background script

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
    
    // Restart scraping alarm if extension was enabled
    const settings = await getSettings();
    if (settings.isEnabled) {
      await setupScrapingAlarm();
      console.log('Scraping alarm restarted on startup');
    }
    
  } catch (error) {
    console.error('Error during extension startup:', error);
  }
});

// Alarm event listener for scheduled scraping
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name);
  
  try {
    if (alarm.name === 'scrapeStarredWords') {
      await performScraping();
    }
  } catch (error) {
    console.error('Error handling alarm:', error);
  }
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

// Alarm management functions
async function setupScrapingAlarm() {
  try {
    const settings = await getSettings();
    
    // Clear existing alarm if it exists
    await chrome.alarms.clear('scrapeStarredWords');
    
    // Create new alarm with specified interval
    await chrome.alarms.create('scrapeStarredWords', {
      delayInMinutes: settings.scrapeInterval,
      periodInMinutes: settings.scrapeInterval
    });
    
    console.log(`Scraping alarm set for every ${settings.scrapeInterval} minutes`);
  } catch (error) {
    console.error('Error setting up scraping alarm:', error);
    throw error;
  }
}

// Main scraping function (placeholder for now)
async function performScraping() {
  try {
    console.log('Starting scheduled scraping...');
    
    // Get current settings
    const settings = await getSettings();
    
    if (!settings.isEnabled) {
      console.log('Scraping disabled, skipping...');
      return;
    }
    
    // TODO: Implement actual scraping logic here
    // This will involve:
    // 1. Finding Google Translate tabs
    // 2. Injecting content scripts
    // 3. Extracting starred words
    // 4. Saving to storage
    // 5. Syncing to Google Sheets if enabled
    
    console.log('Scraping completed successfully');
    
    // Update last scrape time
    settings.lastScrapeTime = new Date().toISOString();
    await chrome.storage.local.set({ settings });
    
  } catch (error) {
    console.error('Error during scraping:', error);
  }
}

// Update handling function
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
    
  } catch (error) {
    console.error('Error handling extension update:', error);
  }
}

// Error handling for service worker termination
self.addEventListener('error', (event) => {
  console.error('Service worker error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Keep service worker alive with periodic activity
setInterval(() => {
  console.log('Service worker heartbeat - keeping alive');
}, 25000); // Every 25 seconds

// Initialize when service worker loads
console.log('Background service worker loaded and ready'); 