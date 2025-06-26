/**
 * Google Translate Data Processor
 * Provides comprehensive utilities for processing, cleaning, and manipulating scraped data
 * Compatible with Chrome Extension Manifest V3 service worker architecture
 */

// Configuration constants
const PROCESSOR_CONFIG = {
  MAX_TEXT_LENGTH: 5000, // Maximum text length for validation
  MIN_TEXT_LENGTH: 1, // Minimum text length
  MAX_BATCH_SIZE: 1000, // Maximum batch size for processing
  DEFAULT_BATCH_SIZE: 100, // Default batch size
  SUPPORTED_LANGUAGES: [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar', 'hi',
    'th', 'vi', 'tr', 'pl', 'nl', 'sv', 'da', 'no', 'fi', 'el', 'he', 'cs',
    'sk', 'hu', 'ro', 'bg', 'hr', 'sl', 'et', 'lv', 'lt', 'mt', 'ga', 'cy'
  ],
  CSV_DELIMITER: ',',
  CSV_QUOTE: '"',
  CSV_ESCAPE: '""',
  DEBUG: true
};

// Performance and statistics tracking
const PROCESSOR_STATS = {
  operationsCount: 0,
  totalProcessingTime: 0,
  duplicatesRemoved: 0,
  invalidEntriesFiltered: 0,
  batchesProcessed: 0,
  errorCount: 0,
  lastOperation: null,
  operationHistory: []
};

/**
 * Data validation schemas
 */
const VALIDATION_SCHEMAS = {
  WORD_ENTRY: {
    required: ['originalText', 'translatedText'],
    optional: ['sourceLanguage', 'targetLanguage', 'id', 'extractedAt', 'confidence'],
    types: {
      originalText: 'string',
      translatedText: 'string',
      sourceLanguage: 'string',
      targetLanguage: 'string',
      id: 'string',
      extractedAt: 'string',
      confidence: 'number'
    }
  },
  FILTER_OPTIONS: {
    languages: 'array',
    dateRange: 'object',
    textLengthRange: 'object',
    confidence: 'object',
    excludeEmpty: 'boolean'
  }
};

/**
 * Main data processor class with static methods
 */
class DataProcessor {
  /**
   * Debug logging utility
   */
  static debugLog(message, data = null) {
    if (PROCESSOR_CONFIG.DEBUG) {
      const timestamp = new Date().toISOString();
      if (data) {
        console.log(`[Data Processor ${timestamp}] ${message}`, data);
      } else {
        console.log(`[Data Processor ${timestamp}] ${message}`);
      }
    }
  }

  /**
   * Record operation for statistics
   */
  static recordOperation(operationType, duration, itemsProcessed = 0, errors = 0) {
    PROCESSOR_STATS.operationsCount++;
    PROCESSOR_STATS.totalProcessingTime += duration;
    PROCESSOR_STATS.errorCount += errors;
    PROCESSOR_STATS.lastOperation = {
      type: operationType,
      timestamp: new Date().toISOString(),
      duration,
      itemsProcessed,
      errors
    };
    
    // Keep last 20 operations in history
    PROCESSOR_STATS.operationHistory.push(PROCESSOR_STATS.lastOperation);
    if (PROCESSOR_STATS.operationHistory.length > 20) {
      PROCESSOR_STATS.operationHistory.shift();
    }

    this.debugLog(`Operation recorded: ${operationType}`, {
      duration: `${duration.toFixed(2)}ms`,
      itemsProcessed,
      errors
    });
  }

  /**
   * Clean and validate word entries
   */
  static async cleanAndValidateWords(rawWords) {
    const startTime = performance.now();
    this.debugLog('Starting word cleaning and validation', { count: rawWords?.length });

    try {
      if (!rawWords || !Array.isArray(rawWords)) {
        throw new Error('Invalid input: rawWords must be an array');
      }

      const cleanedWords = [];
      const errors = [];
      let processedCount = 0;

      for (let i = 0; i < rawWords.length; i++) {
        try {
          const word = rawWords[i];
          const cleanedWord = await this.cleanSingleWordEntry(word, i);
          
          if (cleanedWord) {
            const validation = this.validateWordEntry(cleanedWord);
            if (validation.isValid) {
              cleanedWords.push(cleanedWord);
            } else {
              errors.push({
                index: i,
                word: word,
                error: validation.error,
                type: 'validation_failed'
              });
            }
          }
          
          processedCount++;
        } catch (error) {
          errors.push({
            index: i,
            word: rawWords[i],
            error: error.message,
            type: 'processing_error'
          });
        }
      }

      const duration = performance.now() - startTime;
      this.recordOperation('cleanAndValidate', duration, processedCount, errors.length);

      this.debugLog('Word cleaning completed', {
        original: rawWords.length,
        cleaned: cleanedWords.length,
        errors: errors.length,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        words: cleanedWords,
        originalCount: rawWords.length,
        cleanedCount: cleanedWords.length,
        errors: errors,
        stats: {
          successRate: ((cleanedWords.length / rawWords.length) * 100).toFixed(2) + '%',
          errorRate: ((errors.length / rawWords.length) * 100).toFixed(2) + '%',
          processingTime: duration
        }
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('cleanAndValidate', duration, 0, 1);
      
      this.debugLog('Word cleaning failed:', error);
      return {
        success: false,
        error: error.message,
        words: [],
        originalCount: rawWords?.length || 0,
        cleanedCount: 0
      };
    }
  }

  /**
   * Clean a single word entry
   */
  static async cleanSingleWordEntry(word, index) {
    if (!word || typeof word !== 'object') {
      return null;
    }

    try {
      const cleaned = {
        id: word.id || `word_${index}_${Date.now()}`,
        originalText: this.cleanText(word.originalText),
        translatedText: this.cleanText(word.translatedText),
        sourceLanguage: this.normalizeLanguageCode(word.sourceLanguage),
        targetLanguage: this.normalizeLanguageCode(word.targetLanguage),
        extractedAt: word.extractedAt || new Date().toISOString(),
        confidence: this.normalizeConfidence(word.confidence)
      };

      // Remove undefined/null values
      Object.keys(cleaned).forEach(key => {
        if (cleaned[key] === undefined || cleaned[key] === null) {
          delete cleaned[key];
        }
      });

      return cleaned;

    } catch (error) {
      this.debugLog(`Error cleaning word at index ${index}:`, error);
      return null;
    }
  }

  /**
   * Clean and normalize text content
   */
  static cleanText(text) {
    if (typeof text !== 'string') {
      return '';
    }

    return text
      .trim() // Remove leading/trailing whitespace
      .replace(/\s+/g, ' ') // Normalize multiple spaces
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width characters
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Remove control characters
      .substring(0, PROCESSOR_CONFIG.MAX_TEXT_LENGTH); // Enforce length limit
  }

  /**
   * Normalize language codes
   */
  static normalizeLanguageCode(langCode) {
    if (typeof langCode !== 'string') {
      return 'unknown';
    }

    const normalized = langCode.toLowerCase().substring(0, 2);
    return PROCESSOR_CONFIG.SUPPORTED_LANGUAGES.includes(normalized) ? normalized : 'unknown';
  }

  /**
   * Normalize confidence scores
   */
  static normalizeConfidence(confidence) {
    if (typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
      return Math.round(confidence * 100) / 100; // Round to 2 decimal places
    }
    return undefined;
  }

  /**
   * Validate individual word entry
   */
  static validateWordEntry(word) {
    const schema = VALIDATION_SCHEMAS.WORD_ENTRY;
    
    try {
      // Check required fields
      for (const field of schema.required) {
        if (!word[field] || typeof word[field] !== schema.types[field]) {
          return {
            isValid: false,
            error: `Missing or invalid required field: ${field}`
          };
        }

        // Specific validation for text fields
        if (field.includes('Text') && word[field].length < PROCESSOR_CONFIG.MIN_TEXT_LENGTH) {
          return {
            isValid: false,
            error: `Text field ${field} is too short`
          };
        }
      }

      // Check optional fields types
      for (const field of schema.optional) {
        if (word[field] && typeof word[field] !== schema.types[field]) {
          return {
            isValid: false,
            error: `Invalid type for optional field: ${field}`
          };
        }
      }

      return { isValid: true };

    } catch (error) {
      return {
        isValid: false,
        error: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Remove duplicate entries with various strategies
   */
  static async removeDuplicates(words, strategy = 'exact') {
    const startTime = performance.now();
    this.debugLog('Starting duplicate removal', { count: words?.length, strategy });

    try {
      if (!words || !Array.isArray(words)) {
        throw new Error('Invalid input: words must be an array');
      }

      let uniqueWords;
      let duplicatesCount = 0;

      switch (strategy) {
        case 'exact':
          uniqueWords = this.removeExactDuplicates(words);
          break;
        case 'text_only':
          uniqueWords = this.removeTextDuplicates(words);
          break;
        case 'language_pair':
          uniqueWords = this.removeLanguagePairDuplicates(words);
          break;
        case 'fuzzy':
          uniqueWords = await this.removeFuzzyDuplicates(words);
          break;
        default:
          throw new Error(`Unknown deduplication strategy: ${strategy}`);
      }

      duplicatesCount = words.length - uniqueWords.length;
      PROCESSOR_STATS.duplicatesRemoved += duplicatesCount;

      const duration = performance.now() - startTime;
      this.recordOperation('removeDuplicates', duration, words.length, 0);

      this.debugLog('Duplicate removal completed', {
        original: words.length,
        unique: uniqueWords.length,
        duplicatesRemoved: duplicatesCount,
        strategy,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        words: uniqueWords,
        originalCount: words.length,
        uniqueCount: uniqueWords.length,
        duplicatesRemoved: duplicatesCount,
        strategy: strategy
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('removeDuplicates', duration, 0, 1);
      
      this.debugLog('Duplicate removal failed:', error);
      return {
        success: false,
        error: error.message,
        words: words || [],
        originalCount: words?.length || 0,
        uniqueCount: 0,
        duplicatesRemoved: 0
      };
    }
  }

  /**
   * Remove exact duplicates (all fields match)
   */
  static removeExactDuplicates(words) {
    const seen = new Set();
    return words.filter(word => {
      const key = JSON.stringify(word);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicates based on text content only
   */
  static removeTextDuplicates(words) {
    const seen = new Set();
    return words.filter(word => {
      const key = `${word.originalText}::${word.translatedText}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicates based on text and language pair
   */
  static removeLanguagePairDuplicates(words) {
    const seen = new Set();
    return words.filter(word => {
      const key = `${word.originalText}::${word.translatedText}::${word.sourceLanguage}::${word.targetLanguage}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove fuzzy duplicates (similar text content)
   */
  static async removeFuzzyDuplicates(words) {
    // Simple fuzzy matching based on normalized text
    const seen = new Map();
    const uniqueWords = [];

    for (const word of words) {
      const normalizedOriginal = this.normalizeForFuzzyMatch(word.originalText);
      const normalizedTranslated = this.normalizeForFuzzyMatch(word.translatedText);
      const key = `${normalizedOriginal}::${normalizedTranslated}`;

      if (!seen.has(key)) {
        seen.set(key, word);
        uniqueWords.push(word);
      }
    }

    return uniqueWords;
  }

  /**
   * Normalize text for fuzzy matching
   */
  static normalizeForFuzzyMatch(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
  }

  /**
   * Convert words to CSV format
   */
  static async convertToCSV(words, options = {}) {
    const startTime = performance.now();
    this.debugLog('Converting to CSV format', { count: words?.length });

    try {
      if (!words || !Array.isArray(words)) {
        throw new Error('Invalid input: words must be an array');
      }

      const delimiter = options.delimiter || PROCESSOR_CONFIG.CSV_DELIMITER;
      const quote = options.quote || PROCESSOR_CONFIG.CSV_QUOTE;
      const includeHeaders = options.includeHeaders !== false;

      // Define CSV columns
      const columns = [
        'id',
        'originalText',
        'translatedText',
        'sourceLanguage',
        'targetLanguage',
        'extractedAt',
        'confidence'
      ];

      let csvContent = '';

      // Add headers if requested
      if (includeHeaders) {
        csvContent += columns.map(col => this.escapeCsvValue(col, quote)).join(delimiter) + '\n';
      }

      // Add data rows
      for (const word of words) {
        const row = columns.map(col => {
          const value = word[col] || '';
          return this.escapeCsvValue(String(value), quote);
        }).join(delimiter);
        
        csvContent += row + '\n';
      }

      const duration = performance.now() - startTime;
      this.recordOperation('convertToCSV', duration, words.length, 0);

      this.debugLog('CSV conversion completed', {
        rows: words.length,
        columns: columns.length,
        size: `${csvContent.length} characters`,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        csv: csvContent,
        rowCount: words.length,
        columnCount: columns.length,
        options: options
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('convertToCSV', duration, 0, 1);
      
      this.debugLog('CSV conversion failed:', error);
      return {
        success: false,
        error: error.message,
        csv: '',
        rowCount: 0
      };
    }
  }

  /**
   * Escape CSV values
   */
  static escapeCsvValue(value, quote) {
    if (value.includes(quote) || value.includes(',') || value.includes('\n')) {
      return quote + value.replace(new RegExp(quote, 'g'), quote + quote) + quote;
    }
    return value;
  }

  /**
   * Convert to Google Sheets format
   */
  static async convertToGoogleSheetsFormat(words, options = {}) {
    const startTime = performance.now();
    this.debugLog('Converting to Google Sheets format', { count: words?.length });

    try {
      if (!words || !Array.isArray(words)) {
        throw new Error('Invalid input: words must be an array');
      }

      const includeHeaders = options.includeHeaders !== false;
      const sheetName = options.sheetName || 'Starred Words';

      // Define column headers
      const headers = [
        'ID',
        'Original Text',
        'Translated Text',
        'Source Language',
        'Target Language',
        'Extracted At',
        'Confidence Score'
      ];

      // Create data matrix
      const values = [];

      // Add headers if requested
      if (includeHeaders) {
        values.push(headers);
      }

      // Add data rows
      for (const word of words) {
        const row = [
          word.id || '',
          word.originalText || '',
          word.translatedText || '',
          word.sourceLanguage || '',
          word.targetLanguage || '',
          word.extractedAt || '',
          word.confidence || ''
        ];
        values.push(row);
      }

      const sheetsData = {
        range: `${sheetName}!A1:${String.fromCharCode(65 + headers.length - 1)}${values.length}`,
        majorDimension: 'ROWS',
        values: values
      };

      const duration = performance.now() - startTime;
      this.recordOperation('convertToSheets', duration, words.length, 0);

      this.debugLog('Google Sheets conversion completed', {
        rows: values.length,
        columns: headers.length,
        range: sheetsData.range,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        sheetsData: sheetsData,
        metadata: {
          rowCount: values.length,
          columnCount: headers.length,
          hasHeaders: includeHeaders,
          sheetName: sheetName,
          range: sheetsData.range
        }
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('convertToSheets', duration, 0, 1);
      
      this.debugLog('Google Sheets conversion failed:', error);
      return {
        success: false,
        error: error.message,
        sheetsData: null
      };
    }
  }

  /**
   * Merge new words with existing data
   */
  static async mergeWithExistingData(newWords, existingWords, strategy = 'append') {
    const startTime = performance.now();
    this.debugLog('Merging datasets', { 
      newCount: newWords?.length, 
      existingCount: existingWords?.length, 
      strategy 
    });

    try {
      if (!newWords || !Array.isArray(newWords)) {
        throw new Error('Invalid input: newWords must be an array');
      }

      if (!existingWords || !Array.isArray(existingWords)) {
        existingWords = [];
      }

      let mergedWords;
      let duplicatesFound = 0;

      switch (strategy) {
        case 'append':
          mergedWords = [...existingWords, ...newWords];
          break;
        
        case 'replace':
          mergedWords = newWords;
          break;
        
        case 'merge_unique':
          const combined = [...existingWords, ...newWords];
          const deduped = await this.removeDuplicates(combined, 'language_pair');
          mergedWords = deduped.words;
          duplicatesFound = deduped.duplicatesRemoved;
          break;
        
        case 'update_existing':
          mergedWords = await this.updateExistingEntries(existingWords, newWords);
          break;
        
        default:
          throw new Error(`Unknown merge strategy: ${strategy}`);
      }

      const duration = performance.now() - startTime;
      this.recordOperation('mergeData', duration, newWords.length + existingWords.length, 0);

      this.debugLog('Data merge completed', {
        newWords: newWords.length,
        existingWords: existingWords.length,
        mergedWords: mergedWords.length,
        duplicatesFound,
        strategy,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        words: mergedWords,
        originalCounts: {
          new: newWords.length,
          existing: existingWords.length
        },
        mergedCount: mergedWords.length,
        duplicatesFound,
        strategy
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('mergeData', duration, 0, 1);
      
      this.debugLog('Data merge failed:', error);
      return {
        success: false,
        error: error.message,
        words: existingWords || [],
        mergedCount: 0
      };
    }
  }

  /**
   * Update existing entries with new data
   */
  static async updateExistingEntries(existingWords, newWords) {
    const existingMap = new Map();
    
    // Create map of existing words by key
    existingWords.forEach(word => {
      const key = `${word.originalText}::${word.sourceLanguage}::${word.targetLanguage}`;
      existingMap.set(key, word);
    });

    // Update or add new words
    newWords.forEach(newWord => {
      const key = `${newWord.originalText}::${newWord.sourceLanguage}::${newWord.targetLanguage}`;
      if (existingMap.has(key)) {
        // Update existing entry
        const existing = existingMap.get(key);
        existingMap.set(key, { ...existing, ...newWord, id: existing.id });
      } else {
        // Add new entry
        existingMap.set(key, newWord);
      }
    });

    return Array.from(existingMap.values());
  }

  /**
   * Filter words based on criteria
   */
  static async filterWords(words, filters = {}) {
    const startTime = performance.now();
    this.debugLog('Filtering words', { count: words?.length, filters });

    try {
      if (!words || !Array.isArray(words)) {
        throw new Error('Invalid input: words must be an array');
      }

      let filteredWords = [...words];
      const appliedFilters = [];

      // Language filter
      if (filters.languages && Array.isArray(filters.languages) && filters.languages.length > 0) {
        filteredWords = filteredWords.filter(word => 
          filters.languages.includes(word.sourceLanguage) || 
          filters.languages.includes(word.targetLanguage)
        );
        appliedFilters.push(`languages: ${filters.languages.join(', ')}`);
      }

      // Date range filter
      if (filters.dateRange && filters.dateRange.start && filters.dateRange.end) {
        const startDate = new Date(filters.dateRange.start);
        const endDate = new Date(filters.dateRange.end);
        
        filteredWords = filteredWords.filter(word => {
          if (!word.extractedAt) return false;
          const wordDate = new Date(word.extractedAt);
          return wordDate >= startDate && wordDate <= endDate;
        });
        appliedFilters.push(`dateRange: ${filters.dateRange.start} to ${filters.dateRange.end}`);
      }

      // Text length filter
      if (filters.textLengthRange) {
        const minLength = filters.textLengthRange.min || 0;
        const maxLength = filters.textLengthRange.max || Infinity;
        
        filteredWords = filteredWords.filter(word => {
          const originalLength = word.originalText?.length || 0;
          const translatedLength = word.translatedText?.length || 0;
          return originalLength >= minLength && originalLength <= maxLength &&
                 translatedLength >= minLength && translatedLength <= maxLength;
        });
        appliedFilters.push(`textLength: ${minLength}-${maxLength}`);
      }

      // Confidence filter
      if (filters.confidence) {
        const minConfidence = filters.confidence.min || 0;
        const maxConfidence = filters.confidence.max || 1;
        
        filteredWords = filteredWords.filter(word => {
          if (word.confidence === undefined) return true; // Include words without confidence
          return word.confidence >= minConfidence && word.confidence <= maxConfidence;
        });
        appliedFilters.push(`confidence: ${minConfidence}-${maxConfidence}`);
      }

      // Exclude empty text filter
      if (filters.excludeEmpty) {
        filteredWords = filteredWords.filter(word => 
          word.originalText && word.originalText.trim().length > 0 &&
          word.translatedText && word.translatedText.trim().length > 0
        );
        appliedFilters.push('excludeEmpty: true');
      }

      const filteredCount = words.length - filteredWords.length;
      PROCESSOR_STATS.invalidEntriesFiltered += filteredCount;

      const duration = performance.now() - startTime;
      this.recordOperation('filterWords', duration, words.length, 0);

      this.debugLog('Word filtering completed', {
        original: words.length,
        filtered: filteredWords.length,
        removed: filteredCount,
        appliedFilters,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        words: filteredWords,
        originalCount: words.length,
        filteredCount: filteredWords.length,
        removedCount: filteredCount,
        appliedFilters
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('filterWords', duration, 0, 1);
      
      this.debugLog('Word filtering failed:', error);
      return {
        success: false,
        error: error.message,
        words: words || [],
        filteredCount: 0
      };
    }
  }

  /**
   * Generate comprehensive data statistics
   */
  static async generateDataStatistics(words) {
    const startTime = performance.now();
    this.debugLog('Generating data statistics', { count: words?.length });

    try {
      if (!words || !Array.isArray(words)) {
        throw new Error('Invalid input: words must be an array');
      }

      const stats = {
        overview: {
          totalWords: words.length,
          uniqueOriginalTexts: new Set(words.map(w => w.originalText)).size,
          uniqueTranslatedTexts: new Set(words.map(w => w.translatedText)).size,
          avgOriginalLength: 0,
          avgTranslatedLength: 0,
          dateRange: { earliest: null, latest: null }
        },
        languages: {
          sourceLanguages: {},
          targetLanguages: {},
          languagePairs: {},
          topSourceLanguages: [],
          topTargetLanguages: [],
          topLanguagePairs: []
        },
        textAnalysis: {
          lengthDistribution: {
            short: 0, // 1-10 chars
            medium: 0, // 11-50 chars
            long: 0, // 51+ chars
          },
          emptyEntries: 0,
          withConfidence: 0,
          averageConfidence: 0
        },
        timeAnalysis: {
          entriesByDate: {},
          extractionTimespan: 0,
          recentEntries: 0 // Last 7 days
        }
      };

      let totalOriginalLength = 0;
      let totalTranslatedLength = 0;
      let totalConfidence = 0;
      let confidenceCount = 0;
      const dates = [];
      const recentThreshold = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago

      // Process each word for statistics
      for (const word of words) {
        // Length analysis
        const origLen = word.originalText?.length || 0;
        const transLen = word.translatedText?.length || 0;
        
        totalOriginalLength += origLen;
        totalTranslatedLength += transLen;

        // Categorize by length
        const avgLen = (origLen + transLen) / 2;
        if (avgLen <= 10) {
          stats.textAnalysis.lengthDistribution.short++;
        } else if (avgLen <= 50) {
          stats.textAnalysis.lengthDistribution.medium++;
        } else {
          stats.textAnalysis.lengthDistribution.long++;
        }

        // Empty entries
        if (!word.originalText?.trim() || !word.translatedText?.trim()) {
          stats.textAnalysis.emptyEntries++;
        }

        // Language analysis
        const sourceLang = word.sourceLanguage || 'unknown';
        const targetLang = word.targetLanguage || 'unknown';
        const langPair = `${sourceLang} → ${targetLang}`;

        stats.languages.sourceLanguages[sourceLang] = (stats.languages.sourceLanguages[sourceLang] || 0) + 1;
        stats.languages.targetLanguages[targetLang] = (stats.languages.targetLanguages[targetLang] || 0) + 1;
        stats.languages.languagePairs[langPair] = (stats.languages.languagePairs[langPair] || 0) + 1;

        // Confidence analysis
        if (word.confidence !== undefined) {
          stats.textAnalysis.withConfidence++;
          totalConfidence += word.confidence;
          confidenceCount++;
        }

        // Date analysis
        if (word.extractedAt) {
          const date = new Date(word.extractedAt);
          dates.push(date);
          
          const dateStr = date.toISOString().split('T')[0];
          stats.timeAnalysis.entriesByDate[dateStr] = (stats.timeAnalysis.entriesByDate[dateStr] || 0) + 1;

          if (date.getTime() > recentThreshold) {
            stats.timeAnalysis.recentEntries++;
          }
        }
      }

      // Calculate averages
      if (words.length > 0) {
        stats.overview.avgOriginalLength = Math.round(totalOriginalLength / words.length);
        stats.overview.avgTranslatedLength = Math.round(totalTranslatedLength / words.length);
      }

      if (confidenceCount > 0) {
        stats.textAnalysis.averageConfidence = Math.round((totalConfidence / confidenceCount) * 100) / 100;
      }

      // Date range
      if (dates.length > 0) {
        dates.sort();
        stats.overview.dateRange.earliest = dates[0].toISOString();
        stats.overview.dateRange.latest = dates[dates.length - 1].toISOString();
        stats.timeAnalysis.extractionTimespan = dates[dates.length - 1].getTime() - dates[0].getTime();
      }

      // Top languages and pairs
      stats.languages.topSourceLanguages = Object.entries(stats.languages.sourceLanguages)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([lang, count]) => ({ language: lang, count }));

      stats.languages.topTargetLanguages = Object.entries(stats.languages.targetLanguages)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([lang, count]) => ({ language: lang, count }));

      stats.languages.topLanguagePairs = Object.entries(stats.languages.languagePairs)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([pair, count]) => ({ pair, count }));

      const duration = performance.now() - startTime;
      this.recordOperation('generateStats', duration, words.length, 0);

      this.debugLog('Statistics generation completed', {
        totalWords: words.length,
        languages: Object.keys(stats.languages.sourceLanguages).length,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        statistics: stats,
        generatedAt: new Date().toISOString(),
        processingTime: duration
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('generateStats', duration, 0, 1);
      
      this.debugLog('Statistics generation failed:', error);
      return {
        success: false,
        error: error.message,
        statistics: null
      };
    }
  }

  /**
   * Process data in batches for large datasets
   */
  static async batchProcess(words, batchSize, processor, options = {}) {
    const startTime = performance.now();
    this.debugLog('Starting batch processing', { 
      totalWords: words?.length, 
      batchSize, 
      processor: processor.name 
    });

    try {
      if (!words || !Array.isArray(words)) {
        throw new Error('Invalid input: words must be an array');
      }

      if (typeof processor !== 'function') {
        throw new Error('Processor must be a function');
      }

      const validBatchSize = Math.min(
        Math.max(batchSize || PROCESSOR_CONFIG.DEFAULT_BATCH_SIZE, 1),
        PROCESSOR_CONFIG.MAX_BATCH_SIZE
      );

      const results = [];
      const errors = [];
      let processedCount = 0;

      // Process in batches
      for (let i = 0; i < words.length; i += validBatchSize) {
        const batch = words.slice(i, i + validBatchSize);
        const batchNumber = Math.floor(i / validBatchSize) + 1;
        const totalBatches = Math.ceil(words.length / validBatchSize);

        this.debugLog(`Processing batch ${batchNumber}/${totalBatches}`, {
          batchSize: batch.length,
          startIndex: i
        });

        try {
          const batchResult = await processor(batch, {
            batchNumber,
            totalBatches,
            startIndex: i,
            ...options
          });

          results.push(batchResult);
          processedCount += batch.length;
          PROCESSOR_STATS.batchesProcessed++;

        } catch (error) {
          this.debugLog(`Batch ${batchNumber} failed:`, error);
          errors.push({
            batchNumber,
            startIndex: i,
            batchSize: batch.length,
            error: error.message
          });
        }

        // Optional delay between batches
        if (options.delayMs && i + validBatchSize < words.length) {
          await new Promise(resolve => setTimeout(resolve, options.delayMs));
        }
      }

      const duration = performance.now() - startTime;
      this.recordOperation('batchProcess', duration, processedCount, errors.length);

      this.debugLog('Batch processing completed', {
        totalWords: words.length,
        processedWords: processedCount,
        batches: results.length,
        errors: errors.length,
        duration: `${duration.toFixed(2)}ms`
      });

      return {
        success: true,
        results: results,
        totalWords: words.length,
        processedWords: processedCount,
        batchCount: results.length,
        errors: errors,
        processingTime: duration
      };

    } catch (error) {
      const duration = performance.now() - startTime;
      this.recordOperation('batchProcess', duration, 0, 1);
      
      this.debugLog('Batch processing failed:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        processedWords: 0
      };
    }
  }

  /**
   * Get processor statistics and performance metrics
   */
  static getProcessorStatistics() {
    const avgProcessingTime = PROCESSOR_STATS.operationsCount > 0 ?
      PROCESSOR_STATS.totalProcessingTime / PROCESSOR_STATS.operationsCount : 0;

    return {
      performance: {
        totalOperations: PROCESSOR_STATS.operationsCount,
        averageProcessingTime: `${avgProcessingTime.toFixed(2)}ms`,
        totalProcessingTime: `${PROCESSOR_STATS.totalProcessingTime.toFixed(2)}ms`,
        errorRate: PROCESSOR_STATS.operationsCount > 0 ?
          `${((PROCESSOR_STATS.errorCount / PROCESSOR_STATS.operationsCount) * 100).toFixed(2)}%` : '0%'
      },
      dataProcessing: {
        duplicatesRemoved: PROCESSOR_STATS.duplicatesRemoved,
        invalidEntriesFiltered: PROCESSOR_STATS.invalidEntriesFiltered,
        batchesProcessed: PROCESSOR_STATS.batchesProcessed
      },
      lastOperation: PROCESSOR_STATS.lastOperation,
      recentOperations: PROCESSOR_STATS.operationHistory.slice(-5),
      configuration: { ...PROCESSOR_CONFIG }
    };
  }

  /**
   * Reset processor statistics
   */
  static resetStatistics() {
    PROCESSOR_STATS.operationsCount = 0;
    PROCESSOR_STATS.totalProcessingTime = 0;
    PROCESSOR_STATS.duplicatesRemoved = 0;
    PROCESSOR_STATS.invalidEntriesFiltered = 0;
    PROCESSOR_STATS.batchesProcessed = 0;
    PROCESSOR_STATS.errorCount = 0;
    PROCESSOR_STATS.lastOperation = null;
    PROCESSOR_STATS.operationHistory = [];
    
    this.debugLog('Processor statistics reset');
  }

  /**
   * Update processor configuration
   */
  static updateConfiguration(newConfig) {
    Object.assign(PROCESSOR_CONFIG, newConfig);
    this.debugLog('Processor configuration updated:', newConfig);
  }

  /**
   * Get current configuration
   */
  static getConfiguration() {
    return { ...PROCESSOR_CONFIG };
  }
}

/**
 * Export for different environments
 */
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = { 
    DataProcessor, 
    PROCESSOR_CONFIG, 
    PROCESSOR_STATS, 
    VALIDATION_SCHEMAS 
  };
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
  globalObj.DataProcessor = DataProcessor;
  globalObj.PROCESSOR_CONFIG = PROCESSOR_CONFIG;
  globalObj.PROCESSOR_STATS = PROCESSOR_STATS;
  globalObj.VALIDATION_SCHEMAS = VALIDATION_SCHEMAS;
  
  console.log('Data Processor loaded successfully');
} 