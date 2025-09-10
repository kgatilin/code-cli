/**
 * Tests for EPIPE error fixes in the logger
 * 
 * These tests verify that the logger can handle detached process environments
 * where console operations might fail with EPIPE errors.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeLogger, getLogger } from '../src/agents/logger.js';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

describe('Logger EPIPE Error Handling', () => {
  const logFilePath = join(homedir(), '.code-cli', 'agent.log');
  
  beforeEach(() => {
    // Clean up any existing logger state
    if (existsSync(logFilePath)) {
      unlinkSync(logFilePath);
    }
  });

  afterEach(() => {
    // Clean up log file after tests
    if (existsSync(logFilePath)) {
      unlinkSync(logFilePath);
    }
    // Restore console methods
    vi.restoreAllMocks();
  });

  describe('Console Availability Detection', () => {
    it('should detect when console is not available due to EPIPE', () => {
      // Mock console.log to throw EPIPE error
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        const error = new Error('write EPIPE');
        (error as any).code = 'EPIPE';
        throw error;
      });

      initializeLogger(true); // Enable debug mode
      const logger = getLogger();

      // This should not throw, even though console.log would throw EPIPE
      expect(() => {
        logger.info('TestComponent', 'Test message');
      }).not.toThrow();

      // Verify the mock was called (but silently handled the error)
      expect(consoleMock).toHaveBeenCalled();
      
      // Verify file logging still works by checking the log file was created
      expect(existsSync(logFilePath)).toBe(true);
    });

    it('should detect when stdout is not writable', () => {
      // Mock process.stdout to be non-writable
      const originalWritable = process.stdout.writable;
      Object.defineProperty(process.stdout, 'writable', {
        value: false,
        configurable: true
      });

      initializeLogger(true);
      const logger = getLogger();

      // Should not attempt console logging when stdout is not writable
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('Should not be called');
      });

      logger.info('TestComponent', 'Test message');

      // Console should not have been called
      expect(consoleMock).not.toHaveBeenCalled();
      
      // Restore original property
      Object.defineProperty(process.stdout, 'writable', {
        value: originalWritable,
        configurable: true
      });
    });
  });

  describe('Graceful EPIPE Handling', () => {
    it('should handle EPIPE errors in console.log without crashing', () => {
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        const error = new Error('write EPIPE');
        (error as any).message = 'write EPIPE';
        throw error;
      });

      initializeLogger(true); // Enable debug mode to trigger console logging
      const logger = getLogger();

      // Should not throw despite console.log throwing EPIPE
      expect(() => {
        logger.info('TestComponent', 'Test message with EPIPE error');
      }).not.toThrow();

      expect(consoleMock).toHaveBeenCalled();
    });

    it('should handle EPIPE errors in console.error without crashing', () => {
      // Mock console.error to throw EPIPE (simulating when it's used as fallback)
      const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {
        const error = new Error('write EPIPE');
        (error as any).message = 'write EPIPE';
        throw error;
      });

      initializeLogger(false); // Disable debug mode
      const logger = getLogger();

      // Trigger a scenario where console.error might be called (by calling clear with file error)
      // Should not throw despite console.error throwing EPIPE
      expect(() => {
        logger.clear(); // clear() uses console.error for fallback
      }).not.toThrow();

      consoleErrorMock.mockRestore();
    });
  });

  describe('File Logging Priority', () => {
    it('should prioritize file logging over console logging', () => {
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('Console should be secondary');
      });

      initializeLogger(true); // Enable debug mode
      const logger = getLogger();

      logger.info('TestComponent', 'Priority test message');

      // File should be created even if console fails
      expect(existsSync(logFilePath)).toBe(true);
      
      // Should have attempted console logging in debug mode
      expect(consoleMock).toHaveBeenCalled();
    });

    it('should continue file logging when console becomes unavailable', () => {
      initializeLogger(true);
      const logger = getLogger();

      // First call should work (assuming console is available initially)
      logger.info('TestComponent', 'First message');

      // Mock console.log to start throwing EPIPE errors
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        const error = new Error('write EPIPE');
        throw error;
      });

      // Subsequent calls should still work and write to file
      logger.info('TestComponent', 'Second message after EPIPE');
      logger.info('TestComponent', 'Third message after EPIPE');

      // File logging should continue working
      expect(existsSync(logFilePath)).toBe(true);
    });
  });

  describe('Multiple EPIPE Scenarios', () => {
    it('should handle repeated EPIPE errors gracefully', () => {
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        throw new Error('write EPIPE');
      });

      initializeLogger(true);
      const logger = getLogger();

      // Multiple logging calls should all succeed
      expect(() => {
        logger.debug('Component1', 'Debug message 1');
        logger.info('Component2', 'Info message 2');
        logger.warning('Component3', 'Warning message 3');
        logger.error('Component4', 'Error message 4');
      }).not.toThrow();

      // Console should be called once (for the first message) and then disabled
      // This is the correct behavior - after EPIPE, console is marked unavailable
      expect(consoleMock).toHaveBeenCalledTimes(1);
    });

    it('should disable console logging after detecting EPIPE', () => {
      let callCount = 0;
      const consoleMock = vi.spyOn(console, 'log').mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('write EPIPE');
        }
        return undefined;
      });

      initializeLogger(true);
      const logger = getLogger();

      // First call should trigger EPIPE and disable console
      logger.info('TestComponent', 'First message - should trigger EPIPE');
      
      // Second call should not attempt console since it was disabled
      logger.info('TestComponent', 'Second message - should skip console');

      // Console should only have been called once (for the first message)
      expect(consoleMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Log File Operations', () => {
    it('should create log file even when console is unavailable', () => {
      // Mock stdout as not writable to simulate detached process
      const originalWritable = process.stdout.writable;
      Object.defineProperty(process.stdout, 'writable', {
        value: false,
        configurable: true
      });

      initializeLogger(true);
      const logger = getLogger();

      logger.info('TestComponent', 'Message in detached process');

      expect(existsSync(logFilePath)).toBe(true);

      // Restore original property
      Object.defineProperty(process.stdout, 'writable', {
        value: originalWritable,
        configurable: true
      });
    });

    it('should clear log file without console errors', () => {
      const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => {
        throw new Error('write EPIPE');
      });

      initializeLogger(false);
      const logger = getLogger();

      // Should not throw even if console.error would throw
      expect(() => {
        logger.clear();
      }).not.toThrow();
    });
  });
});