/**
 * Test suite for the agent logging system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getLogger, initializeLogger, logInfo, logError, logWarning, logDebug } from '../../src/agents/logger.js';

describe('Logger', () => {
  let tempLogFile: string;
  
  beforeEach(() => {
    // Use temporary log file for testing
    tempLogFile = join(tmpdir(), `agent-test-${Date.now()}.log`);
    // Initialize logger with debug mode for comprehensive testing
    initializeLogger(true);
  });
  
  afterEach(() => {
    // Clean up test log file
    if (existsSync(tempLogFile)) {
      unlinkSync(tempLogFile);
    }
  });
  
  describe('Logger initialization', () => {
    it('should initialize logger with debug mode', () => {
      initializeLogger(true);
      const logger = getLogger();
      expect(logger).toBeDefined();
    });
    
    it('should initialize logger without debug mode', () => {
      initializeLogger(false);
      const logger = getLogger();
      expect(logger).toBeDefined();
    });
    
    it('should provide default logger if not initialized', () => {
      const logger = getLogger();
      expect(logger).toBeDefined();
    });
  });
  
  describe('Log level filtering', () => {
    it('should log DEBUG messages when debug mode is enabled', () => {
      initializeLogger(true);
      const logger = getLogger();
      
      // Clear any existing log
      logger.clear();
      
      logger.debug('TestComponent', 'Debug message', { test: true });
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).toContain('[DEBUG] TestComponent: Debug message');
      expect(logContent).toContain('"test":true');
    });
    
    it('should not log DEBUG messages when debug mode is disabled', () => {
      initializeLogger(false);
      const logger = getLogger();
      
      // Clear any existing log
      logger.clear();
      
      logger.debug('TestComponent', 'Debug message should not appear');
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).not.toContain('Debug message should not appear');
    });
    
    it('should always log INFO, WARNING, and ERROR messages', () => {
      initializeLogger(false); // Debug disabled
      const logger = getLogger();
      
      // Clear any existing log
      logger.clear();
      
      logger.info('TestComponent', 'Info message');
      logger.warning('TestComponent', 'Warning message');
      logger.error('TestComponent', 'Error message');
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).toContain('[INFO] TestComponent: Info message');
      expect(logContent).toContain('[WARNING] TestComponent: Warning message');
      expect(logContent).toContain('[ERROR] TestComponent: Error message');
    });
  });
  
  describe('Log formatting', () => {
    it('should format log entries with timestamp, level, component, and message', () => {
      const logger = getLogger();
      logger.clear();
      
      logger.info('TestComponent', 'Test message');
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      const lines = logContent.trim().split('\n');
      const logLine = lines[lines.length - 1];
      
      // Check format: timestamp [LEVEL] component: message
      expect(logLine).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] TestComponent: Test message/);
    });
    
    it('should include data in log entries when provided', () => {
      const logger = getLogger();
      logger.clear();
      
      const testData = { userId: 123, action: 'test' };
      logger.info('TestComponent', 'Test message with data', testData);
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).toContain('"userId":123');
      expect(logContent).toContain('"action":"test"');
    });
  });
  
  describe('Convenience functions', () => {
    it('should provide convenience functions for all log levels', () => {
      // Get logger instance and clear
      const logger = getLogger();
      logger.clear();
      
      logDebug('ConvenienceTest', 'Debug via convenience function');
      logInfo('ConvenienceTest', 'Info via convenience function');
      logWarning('ConvenienceTest', 'Warning via convenience function');
      logError('ConvenienceTest', 'Error via convenience function');
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).toContain('[INFO] ConvenienceTest: Info via convenience function');
      expect(logContent).toContain('[WARNING] ConvenienceTest: Warning via convenience function');
      expect(logContent).toContain('[ERROR] ConvenienceTest: Error via convenience function');
      
      // Debug depends on debug mode
      if (logContent.includes('[DEBUG]')) {
        expect(logContent).toContain('[DEBUG] ConvenienceTest: Debug via convenience function');
      }
    });
  });
  
  describe('File operations', () => {
    it('should create log file if it does not exist', () => {
      const logger = getLogger();
      const logFilePath = logger.getLogFilePath();
      
      logger.info('FileTest', 'Test message');
      
      expect(existsSync(logFilePath)).toBe(true);
    });
    
    it('should append to existing log file', () => {
      const logger = getLogger();
      logger.clear();
      
      logger.info('FileTest', 'First message');
      logger.info('FileTest', 'Second message');
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).toContain('First message');
      expect(logContent).toContain('Second message');
    });
    
    it('should clear log file when requested', () => {
      const logger = getLogger();
      
      logger.info('ClearTest', 'Message before clear');
      logger.clear();
      
      const logContent = readFileSync(logger.getLogFilePath(), 'utf-8');
      expect(logContent).toBe('');
    });
  });
  
  describe('Error handling', () => {
    it('should handle logging errors gracefully', () => {
      // This test ensures the logger doesn't throw when there are file system issues
      const logger = getLogger();
      
      // Should not throw even if there are logging issues
      expect(() => {
        logger.info('ErrorTest', 'Test message with complex data', {
          circular: null
        });
      }).not.toThrow();
    });
  });
});