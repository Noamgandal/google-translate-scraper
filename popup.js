// Google Translate Starred Words Scraper - Popup Script
// Handles UI interactions and Chrome storage communication

// DOM Elements
const elements = {
  // Status elements
  extensionStatus: document.getElementById('extensionStatus'),
  lastScrapeTime: document.getElementById('lastScrapeTime'),
  wordCount: document.getElementById('wordCount'),
  authStatus: document.getElementById('authStatus'),
  userEmail: document.getElementById('userEmail'),
  userEmailItem: document.getElementById('userEmailItem'),
  tokenExpiry: document.getElementById('tokenExpiry'),
  tokenExpiryItem: document.getElementById('tokenExpiryItem'),
  
  // Form elements
  settingsForm: document.getElementById('settingsForm'),
  enableScraping: document.getElementById('enableScraping'),
  scrapeInterval: document.getElementById('scrapeInterval'),
  googleSheetsId: document.getElementById('googleSheetsId'),
  autoSync: document.getElementById('autoSync'),
  notifications: document.getElementById('notifications'),
  
  // Buttons
  saveSettings: document.getElementById('saveSettings'),
  manualScrape: document.getElementById('manualScrape'),
  signInButton: document.getElementById('signInButton'),
  signOutButton: document.getElementById('signOutButton'),
  helpLink: document.getElementById('helpLink'),
  
  // UI feedback
  messageContainer: document.getElementById('messageContainer'),
  messageText: document.getElementById('messageText'),
  sheetsIdError: document.getElementById('sheetsIdError'),
  saveSpinner: document.getElementById('saveSpinner'),
  scrapeSpinner: document.getElementById('scrapeSpinner'),
  authSpinner: document.getElementById('authSpinner')
};

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializePopup();
    setupEventListeners();
    console.log('Popup initialized successfully');
  } catch (error) {
    console.error('Error initializing popup:', error);
    showMessage('Failed to initialize popup', 'error');
  }
});

// Initialize popup with current settings and status
async function initializePopup() {
  try {
    // Load current settings
    await loadSettings();
    
    // Check authentication status
    await checkAuthenticationStatus();
    
    // Update status display
    await updateStatus();
    
    // Set up periodic status updates
    setInterval(async () => {
      await updateStatus();
      await checkAuthenticationStatus();
    }, 5000); // Update every 5 seconds
    
  } catch (error) {
    console.error('Error during popup initialization:', error);
    throw error;
  }
}

// Load settings from Chrome storage
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || getDefaultSettings();
    
    // Populate form fields
    elements.enableScraping.checked = settings.isEnabled;
    elements.scrapeInterval.value = settings.scrapeInterval.toString();
    elements.googleSheetsId.value = settings.googleSheetsId || '';
    elements.autoSync.checked = settings.autoSync;
    elements.notifications.checked = settings.notifications;
    
    // Update interval dropdown state
    updateIntervalState();
    
    console.log('Settings loaded successfully');
  } catch (error) {
    console.error('Error loading settings:', error);
    throw error;
  }
}

// Save settings to Chrome storage
async function saveSettings() {
  try {
    showSpinner('save', true);
    
    // Validate form
    if (!validateForm()) {
      showSpinner('save', false);
      return false;
    }
    
    // Get current settings
    const result = await chrome.storage.local.get(['settings']);
    const currentSettings = result.settings || getDefaultSettings();
    
    // Update settings with form values
    const updatedSettings = {
      ...currentSettings,
      isEnabled: elements.enableScraping.checked,
      scrapeInterval: parseInt(elements.scrapeInterval.value),
      googleSheetsId: elements.googleSheetsId.value.trim(),
      autoSync: elements.autoSync.checked,
      notifications: elements.notifications.checked
    };
    
    // Save to storage
    await chrome.storage.local.set({ settings: updatedSettings });
    
    // Notify background script of settings change
    try {
      const response = await chrome.runtime.sendMessage({ 
        action: 'settingsUpdated', 
        settings: updatedSettings 
      });
      
      if (response && !response.success) {
        throw new Error('Background script rejected settings update');
      }
    } catch (messageError) {
      console.error('Error communicating with background script:', messageError);
      // Still show success since settings were saved locally
    }
    
    showMessage('Settings saved successfully!', 'success');
    console.log('Settings saved:', updatedSettings);
    
    return true;
    
  } catch (error) {
    console.error('Error saving settings:', error);
    showMessage('Failed to save settings', 'error');
    return false;
  } finally {
    showSpinner('save', false);
  }
}

// Update status display with current information
async function updateStatus() {
  try {
    const result = await chrome.storage.local.get(['settings', 'scrapedWords']);
    const settings = result.settings || getDefaultSettings();
    const scrapedWords = result.scrapedWords || [];
    
    // Update extension status
    elements.extensionStatus.textContent = settings.isEnabled ? 'Enabled' : 'Disabled';
    elements.extensionStatus.className = `status-value ${settings.isEnabled ? 'status-enabled' : 'status-disabled'}`;
    
    // Update last scrape time
    if (settings.lastScrapeTime) {
      const lastScrape = new Date(settings.lastScrapeTime);
      elements.lastScrapeTime.textContent = formatRelativeTime(lastScrape);
    } else {
      elements.lastScrapeTime.textContent = 'Never';
    }
    
    // Update word count
    elements.wordCount.textContent = scrapedWords.length.toString();
    
  } catch (error) {
    console.error('Error updating status:', error);
  }
}

// Validate form inputs
function validateForm() {
  let isValid = true;
  
  // Clear previous errors
  hideError('sheetsIdError');
  
  // Validate Google Sheets ID if auto-sync is enabled
  if (elements.autoSync.checked) {
    const sheetsId = elements.googleSheetsId.value.trim();
    
    if (!sheetsId) {
      showError('sheetsIdError', 'Google Sheets ID is required when auto-sync is enabled');
      isValid = false;
    } else if (!isValidGoogleSheetsId(sheetsId)) {
      showError('sheetsIdError', 'Please enter a valid Google Sheets ID');
      isValid = false;
    }
  }
  
  return isValid;
}

// Validate Google Sheets ID format
function isValidGoogleSheetsId(id) {
  // Google Sheets ID should be a string of alphanumeric characters, hyphens, and underscores
  // Typically 44 characters long
  const regex = /^[a-zA-Z0-9-_]{10,}$/;
  return regex.test(id) && id.length >= 10;
}

// Setup event listeners for all interactive elements
function setupEventListeners() {
  // Save settings button
  elements.saveSettings.addEventListener('click', async (e) => {
    e.preventDefault();
    await saveSettings();
  });
  
  // Manual scrape button
  elements.manualScrape.addEventListener('click', async (e) => {
    e.preventDefault();
    await performManualScrape();
  });
  
  // Authentication buttons
  elements.signInButton.addEventListener('click', async (e) => {
    e.preventDefault();
    await performAuthentication();
  });
  
  elements.signOutButton.addEventListener('click', async (e) => {
    e.preventDefault();
    await clearAuthentication();
  });
  
  // Enable/disable scraping toggle
  elements.enableScraping.addEventListener('change', () => {
    updateIntervalState();
  });
  
  // Auto-sync toggle
  elements.autoSync.addEventListener('change', () => {
    validateForm();
  });
  
  // Google Sheets ID input
  elements.googleSheetsId.addEventListener('input', () => {
    hideError('sheetsIdError');
  });
  
  // Help link
  elements.helpLink.addEventListener('click', (e) => {
    e.preventDefault();
    showHelp();
  });
  
  // Form submission
  elements.settingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveSettings();
  });
}

// Perform manual scrape
async function performManualScrape() {
  try {
    showSpinner('scrape', true);
    
    // Send message to background script to perform scrape
    const response = await chrome.runtime.sendMessage({ action: 'manualScrape' });
    
    if (response && response.success) {
      const wordsFound = response.data?.wordsFound || 0;
      const duration = response.data?.duration || 0;
      showMessage(`Scraping completed! Found ${wordsFound} words in ${duration}ms`, 'success');
      await updateStatus(); // Refresh status
    } else {
      const errorMsg = response?.error || 'Unknown error occurred';
      showMessage(`Scraping failed: ${errorMsg}`, 'error');
    }
    
  } catch (error) {
    console.error('Error performing manual scrape:', error);
    showMessage('Failed to communicate with background script', 'error');
  } finally {
    showSpinner('scrape', false);
  }
}

// Update interval dropdown state based on enable toggle
function updateIntervalState() {
  elements.scrapeInterval.disabled = !elements.enableScraping.checked;
}

// Show loading spinner
function showSpinner(type, show) {
  if (type === 'save') {
    elements.saveSpinner.style.display = show ? 'inline-block' : 'none';
    elements.saveSettings.disabled = show;
  } else if (type === 'scrape') {
    elements.scrapeSpinner.style.display = show ? 'inline-block' : 'none';
    elements.manualScrape.disabled = show;
  } else if (type === 'auth') {
    elements.authSpinner.style.display = show ? 'inline-block' : 'none';
    elements.signInButton.disabled = show;
    elements.signOutButton.disabled = show;
  }
}

// Show success/error message
function showMessage(message, type) {
  elements.messageText.textContent = message;
  elements.messageContainer.className = `message-container message-${type}`;
  elements.messageContainer.style.display = 'block';
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    elements.messageContainer.style.display = 'none';
  }, 3000);
}

// Show error for specific field
function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
  }
}

// Hide error for specific field
function hideError(elementId) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.style.display = 'none';
  }
}

// Show help information
function showHelp() {
  const helpText = `
How to use this extension:

1. Enable auto-scraping to automatically collect starred words
2. Set your preferred scraping interval
3. Add your Google Sheets ID to sync data automatically
4. Use 'Scrape Now' for manual collection

To find your Google Sheets ID:
Open your Google Sheet and look at the URL. The ID is the long string between '/d/' and '/edit'.
  `;
  
  alert(helpText);
}

// Format relative time for display
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) {
    return 'Just now';
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  } else {
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  }
}

// Get default settings
function getDefaultSettings() {
  return {
    isEnabled: true,
    scrapeInterval: 30,
    lastScrapeTime: null,
    totalWordsScraped: 0,
    googleSheetsId: '',
    autoSync: true,
    notifications: true
  };
}

// Authentication Functions

// Check and display authentication status
async function checkAuthenticationStatus() {
  try {
    // Send message to background script to check auth status
    const response = await chrome.runtime.sendMessage({ action: 'getAuthStatus' });
    
    if (response && response.success) {
      const authData = response.data;
      updateAuthenticationUI(authData);
    } else {
      // Not authenticated
      updateAuthenticationUI(null);
    }
    
  } catch (error) {
    console.error('Error checking authentication status:', error);
    elements.authStatus.textContent = 'Error';
    elements.authStatus.className = 'status-value status-disabled';
    updateAuthenticationUI(null);
  }
}

// Perform authentication (sign in)
async function performAuthentication() {
  try {
    showSpinner('auth', true);
    elements.authStatus.textContent = 'Signing in...';
    
    // Send message to background script to authenticate
    const response = await chrome.runtime.sendMessage({ action: 'authenticate' });
    
    if (response && response.success) {
      const authData = response.data;
      updateAuthenticationUI(authData);
      showMessage('Successfully signed in!', 'success');
      
      // Get user info for display
      const userResponse = await chrome.runtime.sendMessage({ action: 'getUserInfo' });
      if (userResponse && userResponse.success) {
        updateAuthenticationUI({ ...authData, userInfo: userResponse.data });
      }
      
    } else {
      const errorMsg = response?.error || 'Authentication failed';
      showMessage(`Authentication failed: ${errorMsg}`, 'error');
      updateAuthenticationUI(null);
    }
    
  } catch (error) {
    console.error('Error during authentication:', error);
    showMessage('Authentication error occurred', 'error');
    updateAuthenticationUI(null);
  } finally {
    showSpinner('auth', false);
  }
}

// Clear authentication (sign out)
async function clearAuthentication() {
  try {
    showSpinner('auth', true);
    elements.authStatus.textContent = 'Signing out...';
    
    // Send message to background script to clear auth
    const response = await chrome.runtime.sendMessage({ action: 'clearAuth' });
    
    if (response && response.success) {
      updateAuthenticationUI(null);
      showMessage('Successfully signed out', 'success');
    } else {
      const errorMsg = response?.error || 'Sign out failed';
      showMessage(`Sign out failed: ${errorMsg}`, 'error');
    }
    
  } catch (error) {
    console.error('Error during sign out:', error);
    showMessage('Sign out error occurred', 'error');
  } finally {
    showSpinner('auth', false);
  }
}

// Update UI based on authentication state
function updateAuthenticationUI(authData) {
  if (authData && authData.isAuthenticated) {
    // User is authenticated
    elements.authStatus.textContent = 'Authenticated';
    elements.authStatus.className = 'status-value status-enabled';
    
    // Show sign out button, hide sign in button
    elements.signInButton.style.display = 'none';
    elements.signOutButton.style.display = 'block';
    
    // Show user email if available
    if (authData.userInfo && authData.userInfo.email) {
      elements.userEmail.textContent = authData.userInfo.email;
      elements.userEmailItem.style.display = 'flex';
    } else {
      elements.userEmailItem.style.display = 'none';
    }
    
    // Show token expiry if available
    if (authData.tokenExpiry) {
      const expiryDate = new Date(authData.tokenExpiry);
      const now = new Date();
      const timeUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60)); // minutes
      
      if (timeUntilExpiry > 0) {
        if (timeUntilExpiry < 60) {
          elements.tokenExpiry.textContent = `${timeUntilExpiry} minutes`;
        } else {
          const hours = Math.floor(timeUntilExpiry / 60);
          elements.tokenExpiry.textContent = `${hours} hour${hours !== 1 ? 's' : ''}`;
        }
        elements.tokenExpiry.className = 'status-value';
      } else {
        elements.tokenExpiry.textContent = 'Expired';
        elements.tokenExpiry.className = 'status-value status-disabled';
      }
      elements.tokenExpiryItem.style.display = 'flex';
    } else {
      elements.tokenExpiryItem.style.display = 'none';
    }
    
  } else {
    // User is not authenticated
    elements.authStatus.textContent = 'Not authenticated';
    elements.authStatus.className = 'status-value status-disabled';
    
    // Show sign in button, hide sign out button
    elements.signInButton.style.display = 'block';
    elements.signOutButton.style.display = 'none';
    
    // Hide user info
    elements.userEmailItem.style.display = 'none';
    elements.tokenExpiryItem.style.display = 'none';
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'statusUpdate') {
    updateStatus();
  } else if (message.action === 'scrapeComplete') {
    updateStatus();
    if (message.success) {
      showMessage('Scraping completed!', 'success');
    } else {
      showMessage('Scraping failed', 'error');
    }
  } else if (message.action === 'authStatusChanged') {
    checkAuthenticationStatus();
  }
});

console.log('Popup script loaded'); 