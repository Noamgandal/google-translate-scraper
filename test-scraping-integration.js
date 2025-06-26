/**
 * Chrome Extension Scraping System Integration Test
 * Validates all components of the enhanced Google Translate scraper
 * 
 * Usage:
 * - From popup: Add script tag to popup.html and call runIntegrationTest()
 * - From background: Import and call runIntegrationTest()
 * - From console: Copy-paste and run in extension context
 */

// Test configuration
const TEST_CONFIG = {
  enableDetailedLogging: true,
  testTimeout: 30000, // 30 seconds
  sampleDataSize: 10,
  mockScrapingResults: true
};

// Test state tracking
const testState = {
  totalTests: 0,
  passedTests: 0,
  failedTests: 0,
  startTime: null,
  testResults: [],
  errors: [],
  performance: {
    benchmarks: {},
    componentTimings: {}
  }
};

// Performance tracking utilities
const PerformanceTracker = {
  start(testName) {
    return {
      name: testName,
      startTime: performance.now(),
      startMemory: this.getMemoryUsage()
    };
  },
  
  end(benchmark) {
    const endTime = performance.now();
    const endMemory = this.getMemoryUsage();
    const duration = endTime - benchmark.startTime;
    const memoryDelta = endMemory - benchmark.startMemory;
    
    testState.performance.benchmarks[benchmark.name] = {
      duration: duration,
      memoryDelta: memoryDelta,
      startMemory: benchmark.startMemory,
      endMemory: endMemory
    };
    
    return {
      duration,
      memoryDelta,
      startMemory: benchmark.startMemory,
      endMemory
    };
  },
  
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  },
  
  logBenchmark(testName, result) {
    const color = result.duration < 100 ? '🟢' : result.duration < 500 ? '🟡' : '🔴';
    logInfo(`${color} ${testName}: ${result.duration.toFixed(2)}ms, Memory: ${result.memoryDelta.toFixed(2)}MB`);
  }
};

// Color-coded logging utilities
const Colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

/**
 * Main test runner function
 */
async function runIntegrationTest() {
  console.log('🚀 Starting Chrome Extension Scraping System Integration Test');
  console.log('═══════════════════════════════════════════════════════════════');
  
  testState.startTime = Date.now();
  
  try {
    // Test 1: Module Loading and Accessibility
    await testModuleLoading();
    
    // Test 2: Chrome API Permissions
    await testChromeAPIPermissions();
    
    // Test 3: ScrapingController Functionality
    await testScrapingController();
    
    // Test 4: DataProcessor Methods
    await testDataProcessor();
    
    // Test 5: Background Message Handling
    await testBackgroundMessageHandling();
    
    // Test 6: Content Script Injection (Mock)
    await testContentScriptInjection();
    
    // Test 7: Error Handling and Edge Cases
    await testErrorHandling();
    
    // Test 8: Component Integration
    await testComponentIntegration();
    
    // Test 9: Data Processing Pipeline
    await testDataProcessingPipeline();
    
    // Test 10: Storage Operations
    await testStorageOperations();
    
    // Test 11: Manifest Permissions Validation
    await testManifestPermissions();
    
    // Generate final report
    generateTestReport();
    
  } catch (error) {
    logError('Critical test failure', error);
    generateTestReport();
  }
}

/**
 * Test 1: Module Loading and Accessibility
 */
async function testModuleLoading() {
  logTestStart('Module Loading and Accessibility');
  
  const modules = [
    { name: 'TabManager', object: 'TabManager' },
    { name: 'AuthManager', object: 'authManager' },
    { name: 'ScrapingController', object: 'ScrapingController' },
    { name: 'DataProcessor', object: 'DataProcessor' }
  ];
  
  for (const module of modules) {
    try {
      const moduleExists = (typeof globalThis[module.object] !== 'undefined') ||
                          (typeof self[module.object] !== 'undefined') ||
                          (typeof window !== 'undefined' && typeof window[module.object] !== 'undefined');
      
      if (moduleExists) {
        logSuccess(`✅ ${module.name} module loaded successfully`);
        recordTest(`${module.name} Module Loading`, true);
      } else {
        logError(`❌ ${module.name} module not found`);
        recordTest(`${module.name} Module Loading`, false, `Module ${module.name} not accessible`);
      }
    } catch (error) {
      logError(`❌ Error checking ${module.name}:`, error);
      recordTest(`${module.name} Module Loading`, false, error.message);
    }
  }
  
  logTestEnd('Module Loading and Accessibility');
}

/**
 * Test 2: Chrome API Permissions
 */
async function testChromeAPIPermissions() {
  logTestStart('Chrome API Permissions');
  
  const chromeAPIs = [
    { name: 'chrome.storage', api: () => chrome.storage },
    { name: 'chrome.alarms', api: () => chrome.alarms },
    { name: 'chrome.tabs', api: () => chrome.tabs },
    { name: 'chrome.scripting', api: () => chrome.scripting },
    { name: 'chrome.identity', api: () => chrome.identity },
    { name: 'chrome.runtime', api: () => chrome.runtime }
  ];
  
  for (const apiTest of chromeAPIs) {
    try {
      const api = apiTest.api();
      if (api) {
        logSuccess(`✅ ${apiTest.name} API available`);
        recordTest(`${apiTest.name} API Access`, true);
      } else {
        logError(`❌ ${apiTest.name} API not available`);
        recordTest(`${apiTest.name} API Access`, false, 'API not accessible');
      }
    } catch (error) {
      logError(`❌ Error accessing ${apiTest.name}:`, error);
      recordTest(`${apiTest.name} API Access`, false, error.message);
    }
  }
  
  // Test storage permissions specifically
  try {
    await chrome.storage.local.get(['testKey']);
    logSuccess('✅ Storage API read access confirmed');
    recordTest('Storage Read Access', true);
  } catch (error) {
    logError('❌ Storage API read access failed:', error);
    recordTest('Storage Read Access', false, error.message);
  }
  
  logTestEnd('Chrome API Permissions');
}

/**
 * Test 3: ScrapingController Functionality
 */
async function testScrapingController() {
  logTestStart('ScrapingController Functionality');
  
  try {
    // Test ScrapingController initialization
    if (typeof ScrapingController !== 'undefined') {
      const benchmark = PerformanceTracker.start('ScrapingController.initialization');
      const controller = new ScrapingController();
      const perfResult = PerformanceTracker.end(benchmark);
      
      logSuccess('✅ ScrapingController initialized successfully');
      PerformanceTracker.logBenchmark('ScrapingController Initialization', perfResult);
      recordTest('ScrapingController Initialization', true);
      
      // Test configuration access
      try {
        const config = controller.getConfiguration();
        if (config && typeof config === 'object') {
          logSuccess('✅ ScrapingController configuration accessible');
          logInfo(`Configuration: ${JSON.stringify(config, null, 2)}`);
          recordTest('ScrapingController Configuration', true);
        } else {
          logError('❌ ScrapingController configuration invalid');
          recordTest('ScrapingController Configuration', false, 'Invalid configuration');
        }
      } catch (error) {
        logError('❌ ScrapingController configuration error:', error);
        recordTest('ScrapingController Configuration', false, error.message);
      }
      
      // Test metrics access
      try {
        const metrics = controller.getScrapingMetrics();
        if (metrics && typeof metrics === 'object') {
          logSuccess('✅ ScrapingController metrics accessible');
          logInfo(`Initial metrics: ${JSON.stringify(metrics, null, 2)}`);
          recordTest('ScrapingController Metrics', true);
        } else {
          logError('❌ ScrapingController metrics invalid');
          recordTest('ScrapingController Metrics', false, 'Invalid metrics');
        }
      } catch (error) {
        logError('❌ ScrapingController metrics error:', error);
        recordTest('ScrapingController Metrics', false, error.message);
      }
      
      // Test status check
      try {
        const isRunning = controller.isScrapingInProgress();
        logSuccess(`✅ ScrapingController status check: ${isRunning ? 'running' : 'idle'}`);
        recordTest('ScrapingController Status Check', true);
      } catch (error) {
        logError('❌ ScrapingController status check error:', error);
        recordTest('ScrapingController Status Check', false, error.message);
      }
      
    } else {
      logError('❌ ScrapingController not available');
      recordTest('ScrapingController Initialization', false, 'ScrapingController not defined');
    }
  } catch (error) {
    logError('❌ ScrapingController test error:', error);
    recordTest('ScrapingController Functionality', false, error.message);
  }
  
  logTestEnd('ScrapingController Functionality');
}

/**
 * Test 4: DataProcessor Methods
 */
async function testDataProcessor() {
  logTestStart('DataProcessor Methods');
  
  if (typeof DataProcessor === 'undefined') {
    logError('❌ DataProcessor not available');
    recordTest('DataProcessor Availability', false, 'DataProcessor not defined');
    logTestEnd('DataProcessor Methods');
    return;
  }
  
  recordTest('DataProcessor Availability', true);
  
  // Create sample test data in content-script.js format
  const mockScrapingResult = createSampleWordData();
  const sampleWords = mockScrapingResult.words;
  logInfo(`Created ${sampleWords.length} sample words for testing from ${mockScrapingResult.totalContainers} containers`);
  
  // Test 4.1: Clean and Validate Words
  try {
    const benchmark = PerformanceTracker.start('DataProcessor.cleanAndValidateWords');
    const cleanResult = await DataProcessor.cleanAndValidateWords(sampleWords);
    const perfResult = PerformanceTracker.end(benchmark);
    
    if (cleanResult.success) {
      logSuccess(`✅ Data cleaning successful: ${cleanResult.cleanedCount}/${cleanResult.originalCount} words`);
      PerformanceTracker.logBenchmark('Clean and Validate', perfResult);
      recordTest('DataProcessor Clean and Validate', true);
    } else {
      logError(`❌ Data cleaning failed: ${cleanResult.error}`);
      recordTest('DataProcessor Clean and Validate', false, cleanResult.error);
    }
  } catch (error) {
    logError('❌ Data cleaning error:', error);
    recordTest('DataProcessor Clean and Validate', false, error.message);
  }
  
  // Test 4.2: Remove Duplicates
  try {
    const duplicateData = [...sampleWords, ...sampleWords.slice(0, 3)]; // Add some duplicates
    const benchmark = PerformanceTracker.start('DataProcessor.removeDuplicates');
    const dedupeResult = await DataProcessor.removeDuplicates(duplicateData, 'exact');
    const perfResult = PerformanceTracker.end(benchmark);
    
    if (dedupeResult.success) {
      logSuccess(`✅ Duplicate removal successful: removed ${dedupeResult.duplicatesRemoved} duplicates`);
      PerformanceTracker.logBenchmark('Remove Duplicates', perfResult);
      recordTest('DataProcessor Remove Duplicates', true);
    } else {
      logError(`❌ Duplicate removal failed: ${dedupeResult.error}`);
      recordTest('DataProcessor Remove Duplicates', false, dedupeResult.error);
    }
  } catch (error) {
    logError('❌ Duplicate removal error:', error);
    recordTest('DataProcessor Remove Duplicates', false, error.message);
  }
  
  // Test 4.3: Convert to CSV
  try {
    const benchmark = PerformanceTracker.start('DataProcessor.convertToCSV');
    const csvResult = await DataProcessor.convertToCSV(sampleWords);
    const perfResult = PerformanceTracker.end(benchmark);
    
    if (csvResult.success && csvResult.csv) {
      logSuccess(`✅ CSV conversion successful: ${csvResult.rowCount} rows`);
      PerformanceTracker.logBenchmark('CSV Conversion', perfResult);
      recordTest('DataProcessor CSV Conversion', true);
    } else {
      logError(`❌ CSV conversion failed: ${csvResult.error}`);
      recordTest('DataProcessor CSV Conversion', false, csvResult.error);
    }
  } catch (error) {
    logError('❌ CSV conversion error:', error);
    recordTest('DataProcessor CSV Conversion', false, error.message);
  }
  
  // Test 4.4: Convert to Google Sheets Format
  try {
    const benchmark = PerformanceTracker.start('DataProcessor.convertToGoogleSheetsFormat');
    const sheetsResult = await DataProcessor.convertToGoogleSheetsFormat(sampleWords);
    const perfResult = PerformanceTracker.end(benchmark);
    
    if (sheetsResult.success && sheetsResult.sheetsData) {
      logSuccess(`✅ Google Sheets conversion successful: ${sheetsResult.metadata.rowCount} rows`);
      PerformanceTracker.logBenchmark('Google Sheets Conversion', perfResult);
      recordTest('DataProcessor Sheets Conversion', true);
    } else {
      logError(`❌ Google Sheets conversion failed: ${sheetsResult.error}`);
      recordTest('DataProcessor Sheets Conversion', false, sheetsResult.error);
    }
  } catch (error) {
    logError('❌ Google Sheets conversion error:', error);
    recordTest('DataProcessor Sheets Conversion', false, error.message);
  }
  
  // Test 4.5: Generate Statistics
  try {
    const benchmark = PerformanceTracker.start('DataProcessor.generateDataStatistics');
    const statsResult = await DataProcessor.generateDataStatistics(sampleWords);
    const perfResult = PerformanceTracker.end(benchmark);
    
    if (statsResult.success && statsResult.statistics) {
      logSuccess(`✅ Statistics generation successful`);
      PerformanceTracker.logBenchmark('Statistics Generation', perfResult);
      logInfo(`Statistics overview: ${JSON.stringify(statsResult.statistics.overview, null, 2)}`);
      recordTest('DataProcessor Statistics', true);
    } else {
      logError(`❌ Statistics generation failed: ${statsResult.error}`);
      recordTest('DataProcessor Statistics', false, statsResult.error);
    }
  } catch (error) {
    logError('❌ Statistics generation error:', error);
    recordTest('DataProcessor Statistics', false, error.message);
  }
  
  logTestEnd('DataProcessor Methods');
}

/**
 * Test 5: Background Message Handling
 */
async function testBackgroundMessageHandling() {
  logTestStart('Background Message Handling - Simulating Popup Messages');
  
  // Test different message types if chrome.runtime is available
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    const messageTests = [
      { action: 'getScrapingStats', description: 'Get Scraping Statistics', data: {} },
      { action: 'getScrapedData', description: 'Get Scraped Data', data: {} },
      { action: 'getAlarmStatus', description: 'Get Alarm Status', data: {} },
      { action: 'manualScrape', description: 'Manual Scrape Trigger', data: {} },
      { action: 'settingsUpdated', description: 'Settings Update', data: { enabled: true, interval: 30 } },
      { action: 'authenticate', description: 'Authentication Request', data: {} },
      { action: 'getAuthStatus', description: 'Get Auth Status', data: {} },
      { action: 'resetScrapingStats', description: 'Reset Scraping Stats', data: {} }
    ];
    
    for (const messageTest of messageTests) {
      try {
        // Performance tracking for message handling
        const benchmark = PerformanceTracker.start(`Message.${messageTest.action}`);
        
        // Use promise wrapper for chrome.runtime.sendMessage with enhanced payload
        const response = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Message timeout'));
          }, 5000);
          
          const messagePayload = {
            action: messageTest.action,
            ...messageTest.data,
            timestamp: Date.now(),
            testMode: true
          };
          
          chrome.runtime.sendMessage(messagePayload, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
        
        const perfResult = PerformanceTracker.end(benchmark);
        
        if (response && response.success !== false) {
          logSuccess(`✅ Message handling test passed: ${messageTest.description}`);
          PerformanceTracker.logBenchmark(`Message: ${messageTest.action}`, perfResult);
          recordTest(`Message: ${messageTest.action}`, true);
          
          // Log response structure for debugging
          if (response.data || response.stats || response.status) {
            logInfo(`📨 Response preview: ${JSON.stringify(response, null, 2).substring(0, 200)}...`);
          }
        } else {
          logWarning(`⚠️ Message returned error: ${messageTest.description} - ${response?.error || 'Unknown error'}`);
          recordTest(`Message: ${messageTest.action}`, false, response?.error || 'Unknown error');
        }
      } catch (error) {
        logWarning(`⚠️ Message test failed: ${messageTest.description} - ${error.message}`);
        recordTest(`Message: ${messageTest.action}`, false, error.message);
      }
    }
  } else {
    logWarning('⚠️ Chrome runtime not available for message testing');
    recordTest('Background Message Handling', false, 'Chrome runtime not available');
  }
  
  logTestEnd('Background Message Handling');
}

/**
 * Test 6: Content Script Injection (Mock)
 */
async function testContentScriptInjection() {
  logTestStart('Content Script Injection (Mock Test)');
  
  try {
    if (typeof chrome !== 'undefined' && chrome.scripting) {
      logSuccess('✅ Chrome scripting API available');
      recordTest('Chrome Scripting API', true);
      
      // Test if we can access the executeScript method
      if (typeof chrome.scripting.executeScript === 'function') {
        logSuccess('✅ executeScript method available');
        recordTest('executeScript Method', true);
        
        // We can't actually inject without a valid tab, but we can test the API structure
        logInfo('ℹ️ Content script injection would use: chrome.scripting.executeScript({target: {tabId}, files: ["content-script.js"]})');
        recordTest('Content Script Injection Setup', true);
      } else {
        logError('❌ executeScript method not available');
        recordTest('executeScript Method', false, 'Method not available');
      }
    } else {
      logError('❌ Chrome scripting API not available');
      recordTest('Chrome Scripting API', false, 'API not available');
    }
  } catch (error) {
    logError('❌ Content script injection test error:', error);
    recordTest('Content Script Injection', false, error.message);
  }
  
  logTestEnd('Content Script Injection (Mock Test)');
}

/**
 * Test 7: Error Handling and Edge Cases
 */
async function testErrorHandling() {
  logTestStart('Error Handling and Edge Cases');
  
  // Test 7.1: DataProcessor with invalid data
  if (typeof DataProcessor !== 'undefined') {
    try {
      const invalidResult = await DataProcessor.cleanAndValidateWords(null);
      if (!invalidResult.success) {
        logSuccess('✅ DataProcessor correctly handles null input');
        recordTest('DataProcessor Null Handling', true);
      } else {
        logError('❌ DataProcessor should reject null input');
        recordTest('DataProcessor Null Handling', false, 'Should reject null input');
      }
    } catch (error) {
      logSuccess(`✅ DataProcessor throws appropriate error for null input: ${error.message}`);
      recordTest('DataProcessor Null Handling', true);
    }
    
    // Test with empty array
    try {
      const emptyResult = await DataProcessor.cleanAndValidateWords([]);
      if (emptyResult.success && emptyResult.cleanedCount === 0) {
        logSuccess('✅ DataProcessor correctly handles empty array');
        recordTest('DataProcessor Empty Array Handling', true);
      } else {
        logError('❌ DataProcessor should handle empty array gracefully');
        recordTest('DataProcessor Empty Array Handling', false, 'Should handle empty array');
      }
    } catch (error) {
      logError('❌ DataProcessor error with empty array:', error);
      recordTest('DataProcessor Empty Array Handling', false, error.message);
    }
    
    // Test with malformed data
    try {
      const malformedData = [
        { invalidField: 'test' },
        { originalText: 'valid', translatedText: 'valid' },
        null,
        'string instead of object'
      ];
      const malformedResult = await DataProcessor.cleanAndValidateWords(malformedData);
      if (malformedResult.success && malformedResult.cleanedCount < malformedData.length) {
        logSuccess('✅ DataProcessor correctly filters malformed data');
        recordTest('DataProcessor Malformed Data Handling', true);
      } else {
        logWarning('⚠️ DataProcessor malformed data handling unclear');
        recordTest('DataProcessor Malformed Data Handling', false, 'Unclear handling');
      }
    } catch (error) {
      logError('❌ DataProcessor error with malformed data:', error);
      recordTest('DataProcessor Malformed Data Handling', false, error.message);
    }
  }
  
  // Test 7.2: ScrapingController error conditions
  if (typeof ScrapingController !== 'undefined') {
    try {
      const controller = new ScrapingController();
      
      // Test concurrent scraping prevention
      if (controller.isScrapingInProgress && typeof controller.isScrapingInProgress === 'function') {
        const isRunning = controller.isScrapingInProgress();
        logSuccess(`✅ ScrapingController status check works: ${isRunning}`);
        recordTest('ScrapingController Status Check', true);
      }
    } catch (error) {
      logError('❌ ScrapingController error handling test failed:', error);
      recordTest('ScrapingController Error Handling', false, error.message);
    }
  }
  
  logTestEnd('Error Handling and Edge Cases');
}

/**
 * Test 8: Component Integration
 */
async function testComponentIntegration() {
  logTestStart('Component Integration');
  
  try {
    // Test if all components can work together
    let integrationScore = 0;
    const maxScore = 4;
    
    // Check TabManager integration
    if (typeof TabManager !== 'undefined' || typeof globalThis.TabManager !== 'undefined') {
      integrationScore++;
      logSuccess('✅ TabManager available for integration');
    }
    
    // Check AuthManager integration
    if (typeof authManager !== 'undefined' || typeof globalThis.authManager !== 'undefined') {
      integrationScore++;
      logSuccess('✅ AuthManager available for integration');
    }
    
    // Check ScrapingController integration
    if (typeof ScrapingController !== 'undefined') {
      integrationScore++;
      logSuccess('✅ ScrapingController available for integration');
    }
    
    // Check DataProcessor integration
    if (typeof DataProcessor !== 'undefined') {
      integrationScore++;
      logSuccess('✅ DataProcessor available for integration');
    }
    
    const integrationPercentage = (integrationScore / maxScore) * 100;
    logInfo(`Integration Score: ${integrationScore}/${maxScore} (${integrationPercentage}%)`);
    
    if (integrationScore === maxScore) {
      logSuccess('✅ All components available for full integration');
      recordTest('Component Integration', true);
    } else {
      logWarning(`⚠️ Partial integration possible: ${integrationScore}/${maxScore} components`);
      recordTest('Component Integration', false, `Missing ${maxScore - integrationScore} components`);
    }
    
  } catch (error) {
    logError('❌ Component integration test error:', error);
    recordTest('Component Integration', false, error.message);
  }
  
  logTestEnd('Component Integration');
}

/**
 * Test 9: Data Processing Pipeline
 */
async function testDataProcessingPipeline() {
  logTestStart('Data Processing Pipeline');
  
  if (typeof DataProcessor === 'undefined') {
    logError('❌ DataProcessor not available for pipeline test');
    recordTest('Data Processing Pipeline', false, 'DataProcessor not available');
    logTestEnd('Data Processing Pipeline');
    return;
  }
  
  try {
    // Create sample raw data in content-script.js format
    const rawScrapingData = createSampleWordData(); // This now returns the full scraping result format
    
    logInfo(`Starting pipeline with ${rawScrapingData.words.length} raw words`);
    
    // Step 1: Clean and validate
    const cleanedData = await DataProcessor.cleanAndValidateWords(rawScrapingData.words);
    if (!cleanedData.success) {
      throw new Error(`Cleaning failed: ${cleanedData.error}`);
    }
    logSuccess(`✅ Step 1 - Cleaning: ${cleanedData.cleanedCount} words cleaned`);
    
    // Step 2: Remove duplicates
    const deduplicatedData = await DataProcessor.removeDuplicates(cleanedData.words, 'language_pair');
    if (!deduplicatedData.success) {
      throw new Error(`Deduplication failed: ${deduplicatedData.error}`);
    }
    logSuccess(`✅ Step 2 - Deduplication: ${deduplicatedData.duplicatesRemoved} duplicates removed`);
    
    // Step 3: Generate statistics
    const statisticsData = await DataProcessor.generateDataStatistics(deduplicatedData.words);
    if (!statisticsData.success) {
      throw new Error(`Statistics failed: ${statisticsData.error}`);
    }
    logSuccess(`✅ Step 3 - Statistics: Generated for ${statisticsData.statistics.overview.totalWords} words`);
    
    // Step 4: Convert to export format
    const exportData = await DataProcessor.convertToGoogleSheetsFormat(deduplicatedData.words);
    if (!exportData.success) {
      throw new Error(`Export formatting failed: ${exportData.error}`);
    }
    logSuccess(`✅ Step 4 - Export Format: ${exportData.metadata.rowCount} rows formatted`);
    
    logSuccess('✅ Complete data processing pipeline successful');
    recordTest('Data Processing Pipeline', true);
    
  } catch (error) {
    logError('❌ Data processing pipeline error:', error);
    recordTest('Data Processing Pipeline', false, error.message);
  }
  
  logTestEnd('Data Processing Pipeline');
}

/**
 * Test 10: Storage Operations
 */
async function testStorageOperations() {
  logTestStart('Storage Operations');
  
  if (typeof chrome === 'undefined' || !chrome.storage) {
    logError('❌ Chrome storage API not available');
    recordTest('Storage Operations', false, 'Chrome storage not available');
    logTestEnd('Storage Operations');
    return;
  }
  
  try {
    // Test basic storage operations
    const testKey = 'integrationTest_' + Date.now();
    const testData = { testValue: 'integration_test_data', timestamp: Date.now() };
    
    // Test write
    await chrome.storage.local.set({ [testKey]: testData });
    logSuccess('✅ Storage write operation successful');
    
    // Test read
    const result = await chrome.storage.local.get([testKey]);
    if (result[testKey] && result[testKey].testValue === testData.testValue) {
      logSuccess('✅ Storage read operation successful');
      recordTest('Storage Read/Write', true);
    } else {
      logError('❌ Storage read operation failed - data mismatch');
      recordTest('Storage Read/Write', false, 'Data mismatch');
    }
    
    // Test remove
    await chrome.storage.local.remove([testKey]);
    const verifyResult = await chrome.storage.local.get([testKey]);
    if (!verifyResult[testKey]) {
      logSuccess('✅ Storage remove operation successful');
      recordTest('Storage Remove', true);
    } else {
      logError('❌ Storage remove operation failed');
      recordTest('Storage Remove', false, 'Data not removed');
    }
    
    // Test settings structure
    try {
      const settings = await chrome.storage.local.get(['settings']);
      if (settings.settings) {
        logSuccess('✅ Settings structure exists in storage');
        logInfo(`Settings keys: ${Object.keys(settings.settings).join(', ')}`);
        recordTest('Settings Structure', true);
      } else {
        logWarning('⚠️ Settings structure not found in storage');
        recordTest('Settings Structure', false, 'Settings not found');
      }
    } catch (error) {
      logError('❌ Settings structure test error:', error);
      recordTest('Settings Structure', false, error.message);
    }
    
  } catch (error) {
    logError('❌ Storage operations test error:', error);
    recordTest('Storage Operations', false, error.message);
  }
  
  logTestEnd('Storage Operations');
}

/**
 * Test 11: Manifest Permissions Validation
 */
async function testManifestPermissions() {
  logTestStart('Manifest Permissions Validation');
  
  try {
    // Test if we can fetch and validate the manifest
    const manifestUrl = chrome.runtime.getURL('manifest.json');
    
    try {
      const response = await fetch(manifestUrl);
      const manifest = await response.json();
      
      logSuccess('✅ Manifest.json loaded successfully');
      recordTest('Manifest Loading', true);
      
      // Check required permissions
      const requiredPermissions = [
        'storage',
        'alarms', 
        'tabs',
        'activeTab',
        'scripting',
        'identity'
      ];
      
      const manifestPermissions = manifest.permissions || [];
      
      for (const permission of requiredPermissions) {
        if (manifestPermissions.includes(permission)) {
          logSuccess(`✅ Required permission '${permission}' found in manifest`);
          recordTest(`Manifest Permission: ${permission}`, true);
        } else {
          logError(`❌ Required permission '${permission}' missing from manifest`);
          recordTest(`Manifest Permission: ${permission}`, false, 'Permission not found in manifest');
        }
      }
      
      // Check host permissions
      const hostPermissions = manifest.host_permissions || [];
      const requiredHosts = [
        'https://translate.google.com/*'
      ];
      
      for (const host of requiredHosts) {
        const hasPermission = hostPermissions.some(hp => 
          hp === host || 
          hp.includes('translate.google.com') ||
          hp === '*://*/*' ||
          hp === 'https://*/*'
        );
        
        if (hasPermission) {
          logSuccess(`✅ Required host permission for '${host}' found`);
          recordTest(`Host Permission: ${host}`, true);
        } else {
          logError(`❌ Required host permission for '${host}' missing`);
          recordTest(`Host Permission: ${host}`, false, 'Host permission not found');
        }
      }
      
      // Check OAuth configuration
      if (manifest.oauth2) {
        logSuccess('✅ OAuth2 configuration found in manifest');
        recordTest('OAuth2 Configuration', true);
        
        if (manifest.oauth2.client_id) {
          logSuccess('✅ OAuth2 client_id configured');
          recordTest('OAuth2 Client ID', true);
        } else {
          logError('❌ OAuth2 client_id missing');
          recordTest('OAuth2 Client ID', false, 'Client ID not configured');
        }
        
        if (manifest.oauth2.scopes && manifest.oauth2.scopes.length > 0) {
          logSuccess(`✅ OAuth2 scopes configured: ${manifest.oauth2.scopes.length} scopes`);
          recordTest('OAuth2 Scopes', true);
        } else {
          logError('❌ OAuth2 scopes missing or empty');
          recordTest('OAuth2 Scopes', false, 'Scopes not configured');
        }
      } else {
        logError('❌ OAuth2 configuration missing from manifest');
        recordTest('OAuth2 Configuration', false, 'OAuth2 not configured');
      }
      
      // Check content scripts configuration
      if (manifest.content_scripts) {
        logSuccess('✅ Content scripts configuration found');
        recordTest('Content Scripts Configuration', true);
      } else {
        logInfo('ℹ️ No content scripts configured (using dynamic injection)');
        recordTest('Content Scripts Configuration', true); // This is OK for dynamic injection
      }
      
      // Check background script configuration
      if (manifest.background) {
        logSuccess('✅ Background script configuration found');
        recordTest('Background Script Configuration', true);
        
        if (manifest.background.service_worker) {
          logSuccess('✅ Service worker configured for Manifest V3');
          recordTest('Service Worker Configuration', true);
        } else {
          logError('❌ Service worker not configured');
          recordTest('Service Worker Configuration', false, 'Service worker missing');
        }
      } else {
        logError('❌ Background script configuration missing');
        recordTest('Background Script Configuration', false, 'Background config missing');
      }
      
      // Check manifest version
      if (manifest.manifest_version === 3) {
        logSuccess('✅ Manifest V3 confirmed');
        recordTest('Manifest Version', true);
      } else {
        logError(`❌ Incorrect manifest version: ${manifest.manifest_version}`);
        recordTest('Manifest Version', false, `Expected V3, got V${manifest.manifest_version}`);
      }
      
      logInfo(`Manifest summary: ${Object.keys(manifest).length} configuration keys`);
      
    } catch (error) {
      logError('❌ Failed to load or parse manifest.json:', error);
      recordTest('Manifest Loading', false, error.message);
    }
    
  } catch (error) {
    logError('❌ Manifest permissions test error:', error);
    recordTest('Manifest Permissions Validation', false, error.message);
  }
  
  logTestEnd('Manifest Permissions Validation');
}

/**
 * Helper Functions
 */

function createSampleWordData() {
  // Mock scraping result that matches content-script.js output format exactly
  const baseTime = Date.now();
  const mockScrapingResult = {
    success: true,
    words: [
      {
        id: `word_0_${baseTime}`,
        originalText: "Hola",
        translatedText: "Hello",
        sourceLanguage: "es", 
        targetLanguage: "en",
        extractedAt: new Date(baseTime).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 0
      },
      {
        id: `word_1_${baseTime + 1}`, 
        originalText: "Bonjour",
        translatedText: "Good morning",
        sourceLanguage: "fr",
        targetLanguage: "en", 
        extractedAt: new Date(baseTime + 1).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 1
      },
      {
        id: `word_2_${baseTime + 2}`,
        originalText: "Guten Tag",
        translatedText: "Good day",
        sourceLanguage: "de",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 2).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 2
      },
      {
        id: `word_3_${baseTime + 3}`,
        originalText: "Grazie",
        translatedText: "Thank you",
        sourceLanguage: "it",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 3).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 3
      },
      {
        id: `word_4_${baseTime + 4}`,
        originalText: "こんにちは",
        translatedText: "Hello",
        sourceLanguage: "ja",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 4).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 4
      },
      {
        id: `word_5_${baseTime + 5}`,
        originalText: "Obrigado",
        translatedText: "Thank you",
        sourceLanguage: "pt",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 5).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 5
      },
      {
        id: `word_6_${baseTime + 6}`,
        originalText: "Спасибо",
        translatedText: "Thank you",
        sourceLanguage: "ru",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 6).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 6
      },
      {
        id: `word_7_${baseTime + 7}`,
        originalText: "شكرا",
        translatedText: "Thank you",
        sourceLanguage: "ar",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 7).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 7
      },
      {
        id: `word_8_${baseTime + 8}`,
        originalText: "감사합니다",
        translatedText: "Thank you",
        sourceLanguage: "ko",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 8).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 8
      },
      {
        id: `word_9_${baseTime + 9}`,
        originalText: "谢谢",
        translatedText: "Thank you",
        sourceLanguage: "zh",
        targetLanguage: "en",
        extractedAt: new Date(baseTime + 9).toISOString(),
        extractionMethod: "content-script",
        containerIndex: 9
      }
    ],
    count: 10,
    totalContainers: 10,
    extractedAt: new Date(baseTime + 10).toISOString(),
    pageUrl: "https://translate.google.com/saved"
  };
  
  return mockScrapingResult;
}

/**
 * Create minimal sample data (just words array for compatibility)
 */
function createSampleWordsArray() {
  const mockResult = createSampleWordData();
  return mockResult.words;
}

function recordTest(testName, passed, error = null) {
  testState.totalTests++;
  if (passed) {
    testState.passedTests++;
  } else {
    testState.failedTests++;
    if (error) {
      testState.errors.push({ test: testName, error: error });
    }
  }
  
  testState.testResults.push({
    name: testName,
    passed: passed,
    error: error,
    timestamp: new Date().toISOString()
  });
}

function generateTestReport() {
  const duration = Date.now() - testState.startTime;
  const successRate = testState.totalTests > 0 ? (testState.passedTests / testState.totalTests * 100).toFixed(1) : 0;
  
  console.log('\n🔍 INTEGRATION TEST REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📊 Total Tests: ${testState.totalTests}`);
  console.log(`✅ Passed: ${testState.passedTests}`);
  console.log(`❌ Failed: ${testState.failedTests}`);
  console.log(`📈 Success Rate: ${successRate}%`);
  console.log(`⏱️ Duration: ${duration}ms`);
  
  if (testState.errors.length > 0) {
    console.log('\n❌ ERRORS FOUND:');
    testState.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.test}: ${error.error}`);
    });
  }
  
  console.log('\n📋 DETAILED RESULTS:');
  testState.testResults.forEach((result) => {
    const icon = result.passed ? '✅' : '❌';
    const errorText = result.error ? ` (${result.error})` : '';
    console.log(`${icon} ${result.name}${errorText}`);
  });
  
  // Performance Report
  console.log('\n⚡ PERFORMANCE BENCHMARKS:');
  const benchmarks = testState.performance.benchmarks;
  if (Object.keys(benchmarks).length > 0) {
    const sortedBenchmarks = Object.entries(benchmarks)
      .sort(([,a], [,b]) => b.duration - a.duration)
      .slice(0, 10); // Top 10 slowest operations
    
    sortedBenchmarks.forEach(([name, data]) => {
      const color = data.duration < 50 ? '🟢' : data.duration < 200 ? '🟡' : '🔴';
      const memoryColor = data.memoryDelta < 1 ? '💚' : data.memoryDelta < 5 ? '💛' : '❤️';
      console.log(`${color} ${name}: ${data.duration.toFixed(2)}ms ${memoryColor} ${data.memoryDelta.toFixed(2)}MB`);
    });
    
    // Calculate statistics
    const durations = Object.values(benchmarks).map(b => b.duration);
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    const maxDuration = Math.max(...durations);
    const minDuration = Math.min(...durations);
    
    console.log(`\n📊 Performance Summary:`);
    console.log(`   Average: ${avgDuration.toFixed(2)}ms`);
    console.log(`   Fastest: ${minDuration.toFixed(2)}ms`);
    console.log(`   Slowest: ${maxDuration.toFixed(2)}ms`);
    console.log(`   Total Operations: ${durations.length}`);
  } else {
    console.log('   No performance data collected');
  }
  
  // Overall status
  if (testState.failedTests === 0) {
    console.log(`\n${Colors.green}🎉 ALL TESTS PASSED! The scraping system integration is ready.${Colors.reset}`);
  } else if (testState.passedTests > testState.failedTests) {
    console.log(`\n${Colors.yellow}⚠️ MOSTLY FUNCTIONAL with some issues. Review failed tests.${Colors.reset}`);
  } else {
    console.log(`\n${Colors.red}🚨 CRITICAL ISSUES FOUND. Address failed tests before proceeding.${Colors.reset}`);
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
}

// Logging utilities
function logTestStart(testName) {
  if (TEST_CONFIG.enableDetailedLogging) {
    console.log(`\n🧪 Starting: ${testName}`);
    console.log('─'.repeat(50));
  }
}

function logTestEnd(testName) {
  if (TEST_CONFIG.enableDetailedLogging) {
    console.log('─'.repeat(50));
    console.log(`✨ Completed: ${testName}\n`);
  }
}

function logSuccess(message) {
  console.log(`${Colors.green}${message}${Colors.reset}`);
}

function logError(message, error = null) {
  console.error(`${Colors.red}${message}${Colors.reset}`);
  if (error && TEST_CONFIG.enableDetailedLogging) {
    console.error(`${Colors.red}`, error, `${Colors.reset}`);
  }
}

function logWarning(message) {
  console.warn(`${Colors.yellow}${message}${Colors.reset}`);
}

function logInfo(message) {
  if (TEST_CONFIG.enableDetailedLogging) {
    console.log(`${Colors.cyan}ℹ️ ${message}${Colors.reset}`);
  }
}

function logPerformance(message) {
  console.log(`${Colors.magenta}⚡ ${message}${Colors.reset}`);
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runIntegrationTest, createSampleWordData };
} else {
  // Make functions globally available for console/popup usage
  if (typeof globalThis !== 'undefined') {
    globalThis.runIntegrationTest = runIntegrationTest;
    globalThis.createSampleWordData = createSampleWordData;
    globalThis.createSampleWordsArray = createSampleWordsArray;
    globalThis.PerformanceTracker = PerformanceTracker;
  } else if (typeof window !== 'undefined') {
    window.runIntegrationTest = runIntegrationTest;
    window.createSampleWordData = createSampleWordData;
    window.createSampleWordsArray = createSampleWordsArray;
    window.PerformanceTracker = PerformanceTracker;
  }
}

// Auto-run in certain environments
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
  console.log('🚀 Integration test loaded and ready!');
  console.log('📝 Run: runIntegrationTest() to start testing');
  console.log('🔧 Or add to popup.html: <script src="test-scraping-integration.js"></script>');
} 