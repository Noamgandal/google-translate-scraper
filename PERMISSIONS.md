# Chrome Extension Permissions Documentation

## Manifest v3 Permissions Justification - CORRECTED VERSION

This document explains all permissions requested by the **Google Translate Starred Words Scraper** extension and their specific use cases for Chrome Web Store submission.

## ⚠️ Important Configuration Notes

### Dynamic Content Script Injection ONLY
- **NO static content scripts** - We use `chrome.scripting.executeScript()` for dynamic injection
- **Service worker compatibility** - Removed `"type": "module"` to ensure `importScripts()` works properly
- **Enhanced security** - Scripts only run when explicitly triggered by user action
- **Better performance** - No persistent content scripts on Google Translate pages

---

## 🔐 Core Permissions

### `"storage"`
**Purpose**: Core storage for extension functionality
- **Settings storage**: User preferences, scraping intervals, and configuration
- **Scraped data storage**: Processed starred words with metadata
- **Statistics tracking**: Performance metrics, success rates, and error logs
- **Cache management**: Temporary data and operation states

### `"alarms"`
**Purpose**: Scheduled scraping functionality
- **Automatic scraping**: Periodic extraction of starred words (15min-6hr intervals)
- **Background operations**: Runs scraping tasks when browser is minimized
- **User-configurable scheduling**: Respects user-defined scraping frequency
- **Persistent across sessions**: Maintains schedule even after browser restart

### `"tabs"`
**Purpose**: Tab management for hidden scraping operations
- **Hidden tab creation**: Creates invisible tabs to avoid user disruption
- **Navigation control**: Directs tabs to Google Translate saved words page
- **Resource cleanup**: Properly closes tabs after scraping completion
- **Error handling**: Cleanup orphaned tabs from failed operations

### `"activeTab"`
**Purpose**: Current page interaction (minimal access)
- **User-initiated actions**: Only when user explicitly triggers scraping
- **No background surveillance**: Does not monitor browsing activity
- **Limited scope**: Only accesses Google Translate pages when requested

### `"scripting"`
**Purpose**: Dynamic content script injection for data extraction
- **Content script injection**: Injects `content-script.js` into Google Translate pages
- **Programmatic execution**: Uses `chrome.scripting.executeScript()` for precise control
- **Isolated execution**: Scripts run in isolated environment for security
- **No persistent access**: Scripts only run during active scraping operations

### `"identity"`
**Purpose**: Google OAuth authentication for API access
- **Google Sheets access**: Export scraped data to user's Google Sheets
- **Gmail notifications**: Send scraping status emails (optional)
- **User authentication**: Secure access to user's Google account
- **Token management**: Handles OAuth tokens securely with automatic refresh

---

## 🌐 Host Permissions

### `"https://translate.google.com/*"`
**Primary Domain**: Main scraping target
- **Starred words page**: Access to `/saved` page for data extraction
- **Authentication pages**: Login flow when accessing saved words
- **Navigation**: Programmatic navigation to specific Google Translate sections

### `"https://oauth2.googleapis.com/*"`
**Authentication API**: Token validation and management
- **Token validation**: Verify OAuth token authenticity and expiration
- **Token refresh**: Automatic renewal of expired authentication tokens
- **Secure authentication**: Industry-standard OAuth 2.0 implementation

### `"https://sheets.googleapis.com/*"`
**Google Sheets API**: Data export functionality
- **Spreadsheet creation**: Create new sheets for exported data
- **Data writing**: Insert scraped words into user's Google Sheets
- **Formatting**: Apply headers and structure to exported data

### `"https://gmail.googleapis.com/*"`
**Gmail API**: Notification functionality (optional)
- **Status emails**: Send scraping completion notifications
- **Error alerts**: Notify users of scraping failures
- **User control**: Completely optional, disabled by default

### `"https://www.googleapis.com/*"`
**General Google APIs**: User profile and additional services
- **User profile**: Access name and email for personalization
- **API discovery**: Determine available Google services
- **Service integration**: Future-proof for additional Google API features

---

## 📁 File Access Configuration

### Content Scripts - REMOVED (Dynamic Injection Only)
```json
// NO STATIC CONTENT SCRIPTS - Using dynamic injection instead
// Content scripts are injected programmatically using:
// chrome.scripting.executeScript({
//   target: { tabId: tabId },
//   files: ['content-script.js']
// })
```

### Web Accessible Resources
```json
"web_accessible_resources": [
  {
    "resources": [
      "content-script.js",
      "icons/*.png"
    ],
    "matches": [
      "https://translate.google.com/*"
    ]
  }
]
```

### Service Worker Configuration
```json
"background": {
  "service_worker": "background.js"
  // NO "type": "module" - Ensures importScripts() compatibility
}
```

### Service Worker Files (Imported via importScripts)
- `background.js` (main service worker)
- `tab-manager.js` (imported by background.js)
- `auth.js` (imported by background.js)
- `scraper.js` (imported by background.js)
- `data-processor.js` (imported by background.js)

---

## 🔒 Security Measures

### Content Security Policy
```
script-src 'self'; 
object-src 'self'; 
connect-src 'self' https://oauth2.googleapis.com https://sheets.googleapis.com https://gmail.googleapis.com https://www.googleapis.com
```

- **Strict script sources**: Only extension scripts allowed
- **No inline scripts**: All JavaScript in separate files
- **Limited connections**: Only to specified Google API endpoints
- **No external resources**: All resources bundled with extension

### OAuth2 Configuration
```json
"oauth2": {
  "client_id": "YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE",  // MUST BE REPLACED
  "scopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile"
  ]
}
```

- **Client ID**: Replace placeholder with actual Google OAuth client ID
- **Minimal scope principle**: Only necessary permissions requested
- **User consent required**: Google's OAuth flow requires explicit user approval
- **Scope-specific access**: Limited to exact functionality needed
- **Revocable access**: Users can revoke permissions at any time

---

## 🚀 Chrome Web Store Compliance

### Manifest V3 Requirements
- ✅ **Service Worker**: Uses modern service worker instead of background pages
- ✅ **Dynamic imports**: All scripts properly imported using `importScripts()`
- ✅ **Host permissions**: Specific domains instead of broad permissions
- ✅ **Minimal permissions**: Only requests necessary permissions
- ✅ **Security**: Strict CSP and no remote code execution

### Privacy Compliance
- ✅ **No tracking**: Extension does not track user behavior
- ✅ **Local storage**: All data stored locally in user's browser
- ✅ **User control**: All features can be disabled by user
- ✅ **Transparent**: All functionality clearly explained to users

### Performance Optimization
- ✅ **Lazy loading**: Scripts only loaded when needed
- ✅ **Resource cleanup**: Proper cleanup of tabs and resources
- ✅ **Error handling**: Comprehensive error recovery mechanisms
- ✅ **Memory management**: Efficient data processing with limits

---

## 📋 Permission Alternatives Considered

### Why not `"<all_urls>"`?
- **Too broad**: Would grant access to all websites
- **Privacy concern**: Users expect limited, specific access
- **Security risk**: Unnecessary attack surface
- **Store policy**: Chrome Web Store discourages broad permissions

### Why not persistent background page?
- **Manifest V3**: Service workers are required for new extensions
- **Performance**: Service workers use fewer resources
- **Modern standard**: Aligns with Chrome's future direction
- **User experience**: Better battery life and performance

### Why dynamic script injection?
- **Precise control**: Only injects scripts when needed
- **Security**: No persistent content scripts on sensitive pages
- **Performance**: Reduces memory usage when not scraping
- **Flexibility**: Allows for advanced error handling and retry logic

---

## 🔧 Technical Implementation

### File Structure
```
/
├── manifest.json           (Extension configuration)
├── background.js          (Service worker - main logic)
├── content-script.js      (Injected for data extraction)
├── scraper.js            (Scraping controller)
├── data-processor.js     (Data cleaning and validation)
├── tab-manager.js        (Tab lifecycle management)
├── auth.js              (Authentication manager)
├── popup.html           (User interface)
├── popup.js             (UI logic)
├── popup.css            (UI styling)
└── icons/               (Extension icons)
```

### Data Flow
1. **User Action** → Popup UI triggers scraping
2. **Authentication** → Verify Google account access
3. **Tab Creation** → Hidden tab opens Google Translate
4. **Script Injection** → Content script extracts data
5. **Data Processing** → Clean, validate, and deduplicate
6. **Storage** → Save processed data locally
7. **Export** (Optional) → Send to Google Sheets
8. **Cleanup** → Close tabs and free resources

This permission structure ensures maximum functionality while respecting user privacy and maintaining Chrome Web Store compliance. 