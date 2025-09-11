/**
 * Test suite for agent log cleanup functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, readFileSync, unlinkSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getLogger, initializeLogger } from '../src/agents/logger.js';

describe('Agent Log Cleanup', () => {
  let tempDir: string;
  let originalHome: string;
  
  beforeEach(() => {
    // Create temp directory for testing
    tempDir = join(tmpdir(), `agent-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    
    // Mock home directory to use temp directory
    originalHome = process.env.HOME || '';
    process.env.HOME = tempDir;
  });
  
  afterEach(() => {
    // Restore original home directory
    process.env.HOME = originalHome;
    
    // Clean up temp directory
    try {
      if (existsSync(tempDir)) {
        const files = require('fs').readdirSync(tempDir);
        for (const file of files) {
          unlinkSync(join(tempDir, file));
        }
        require('fs').rmdirSync(tempDir);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('Log cleanup on server startup', () => {
    it('should clear existing log file when server starts', () => {
      // Create .code-cli directory in temp location
      const codeCliDir = join(tempDir, '.code-cli');
      mkdirSync(codeCliDir, { recursive: true });
      
      // Create a log file with some existing content
      const logPath = join(codeCliDir, 'agent.log');
      const existingContent = 'Old log entry 1\nOld log entry 2\nOld log entry 3\n';
      writeFileSync(logPath, existingContent);
      
      // Verify the file exists and has content
      expect(existsSync(logPath)).toBe(true);
      expect(readFileSync(logPath, 'utf-8')).toBe(existingContent);
      
      // Initialize logger (this is what happens in runServerDirectly)
      initializeLogger(true);
      
      // Clear the log (simulating server startup)
      const logger = getLogger();
      logger.clear();
      
      // Verify log file is now empty
      expect(existsSync(logPath)).toBe(true);
      expect(readFileSync(logPath, 'utf-8')).toBe('');
    });
    
    it('should create log file if it does not exist during cleanup', () => {
      // Create .code-cli directory in temp location
      const codeCliDir = join(tempDir, '.code-cli');
      mkdirSync(codeCliDir, { recursive: true });
      
      const logPath = join(codeCliDir, 'agent.log');
      
      // Verify log file doesn't exist
      expect(existsSync(logPath)).toBe(false);
      
      // Initialize logger and clear (this should create the file)
      initializeLogger(true);
      const logger = getLogger();
      logger.clear();
      
      // Verify log file now exists and is empty
      expect(existsSync(logPath)).toBe(true);
      expect(readFileSync(logPath, 'utf-8')).toBe('');
    });
    
    it('should allow new logs after cleanup', () => {
      // Create .code-cli directory in temp location
      const codeCliDir = join(tempDir, '.code-cli');
      mkdirSync(codeCliDir, { recursive: true });
      
      const logPath = join(codeCliDir, 'agent.log');
      
      // Create a log file with existing content
      writeFileSync(logPath, 'Old content that should be cleared\n');
      
      // Initialize logger, clear, and add new content
      initializeLogger(true);
      const logger = getLogger();
      logger.clear();
      
      // Add new log entry
      logger.info('ServerMain', 'New server session started');
      
      // Verify only new content is present
      const logContent = readFileSync(logPath, 'utf-8');
      expect(logContent).not.toContain('Old content');
      expect(logContent).toContain('New server session started');
      expect(logContent).toContain('[INFO] ServerMain: New server session started');
    });
    
    it('should preserve log file permissions after cleanup', () => {
      // Create .code-cli directory in temp location
      const codeCliDir = join(tempDir, '.code-cli');
      mkdirSync(codeCliDir, { recursive: true });
      
      const logPath = join(codeCliDir, 'agent.log');
      
      // Create log file with content
      writeFileSync(logPath, 'Some content\n');
      
      // Get original file stats
      const originalStats = require('fs').statSync(logPath);
      
      // Clear the log
      initializeLogger(true);
      const logger = getLogger();
      logger.clear();
      
      // Check file still exists and has similar permissions
      expect(existsSync(logPath)).toBe(true);
      const newStats = require('fs').statSync(logPath);
      
      // File should still be readable and writable
      expect(newStats.mode & 0o600).toBeGreaterThan(0);
    });
  });
  
  describe('Log cleanup behavior', () => {
    it('should only clear on explicit clear() call, not on logger initialization', () => {
      // Create .code-cli directory in temp location
      const codeCliDir = join(tempDir, '.code-cli');
      mkdirSync(codeCliDir, { recursive: true });
      
      const logPath = join(codeCliDir, 'agent.log');
      const existingContent = 'Existing log content\n';
      writeFileSync(logPath, existingContent);
      
      // Just initialize logger without clearing
      initializeLogger(true);
      const logger = getLogger();
      
      // Add a log entry
      logger.info('TestComponent', 'Test message');
      
      // Verify original content is preserved and new content is appended
      const logContent = readFileSync(logPath, 'utf-8');
      expect(logContent).toContain('Existing log content');
      expect(logContent).toContain('Test message');
    });
    
    it('should handle errors during log cleanup gracefully', () => {
      // This test ensures cleanup doesn't crash if there are file system issues
      initializeLogger(true);
      const logger = getLogger();
      
      // Should not throw even if there are issues
      expect(() => {
        logger.clear();
      }).not.toThrow();
    });
  });
});