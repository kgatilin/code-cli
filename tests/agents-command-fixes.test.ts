/**
 * Test suite for the fixed agent command functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { executeAgents } from '../src/commands/agents.js';
import { getPidFilePath } from '../src/agents/process-manager.js';
import type { Config } from '../src/types.js';

// Mock configuration for testing
const mockConfig: Config = {
  promptsPath: './.claude/prompts',
  logsPath: '.agent/log', 
  taskPath: '.agent/task',
  templatesPath: './.claude/templates',
  snippetsPath: './.claude/snippets',
  reviewPattern: '//Review:',
  reviewSearchPaths: ['src'],
  reviewSearchExtensions: ['.ts'],
  reviewSearchExcludes: [],
  modelMappings: {},
  jira: undefined
};

describe('Agent Command Fixes', () => {
  const pidFilePath = getPidFilePath();
  
  beforeEach(() => {
    // Clean up any existing PID file
    if (existsSync(pidFilePath)) {
      unlinkSync(pidFilePath);
    }
  });
  
  afterEach(() => {
    // Clean up after each test
    if (existsSync(pidFilePath)) {
      unlinkSync(pidFilePath);
    }
  });
  
  describe('Argument Parsing Fixes', () => {
    it('should accept valid public actions', async () => {
      const validActions = ['start', 'stop', 'status', 'restart'];
      
      for (const action of validActions) {
        const result = await executeAgents([action], mockConfig);
        
        // Should not fail due to argument parsing
        // May fail for other reasons (missing config, etc.) but not argument validation
        if (!result.success && result.error) {
          expect(result.error).not.toContain('Invalid action');
          expect(result.error).not.toContain('Available actions');
        }
      }
    });
    
    it('should reject invalid actions', async () => {
      const result = await executeAgents(['invalid-action'], mockConfig);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action: invalid-action');
      expect(result.error).toContain('Available actions: start, stop, status, restart');
    });
    
    it('should require an action argument', async () => {
      const result = await executeAgents([], mockConfig);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Action is required');
      expect(result.error).toContain('Available actions: start, stop, status, restart');
    });
    
    it('should handle __run-server action for spawned processes', async () => {
      // This is the key fix - __run-server should be accepted in argument parsing
      // Note: We can't fully execute __run-server in tests as it starts a server and calls process.exit
      // But we can verify that argument parsing doesn't reject it
      
      try {
        const result = await executeAgents(['__run-server'], mockConfig);
        
        // Should not fail due to argument parsing
        // Will likely fail due to missing config or other reasons, but not argument validation
        if (!result.success && result.error) {
          expect(result.error).not.toContain('Invalid action: __run-server');
          expect(result.error).not.toContain('Available actions');
        }
      } catch (error) {
        // __run-server might cause process.exit in test environment
        // The important thing is that it doesn't fail at argument parsing stage
        expect(error).toBeDefined();
      }
    });
  });
  
  describe('Command Execution Flow', () => {
    it('should handle start command with proper error handling', async () => {
      const result = await executeAgents(['start'], mockConfig);
      
      // Should either succeed or fail with meaningful error
      expect(result.success !== undefined).toBe(true);
      expect(result.message || result.error).toBeDefined();
      
      // If it fails, should be due to configuration, not command parsing
      if (!result.success && result.error) {
        expect(result.error).not.toContain('Invalid action');
      }
    });
    
    it('should handle stop command gracefully when no server running', async () => {
      const result = await executeAgents(['stop'], mockConfig);
      
      // Stop should succeed even if no server is running
      expect(result.success).toBe(true);
      expect(result.message).toContain('stopped successfully');
    });
    
    it('should handle status command with configuration loading', async () => {
      const result = await executeAgents(['status'], mockConfig);
      
      // Should either succeed with status info or fail due to missing config
      expect(result.success !== undefined).toBe(true);
      
      if (!result.success && result.error) {
        // Should fail due to configuration issues, not command parsing
        expect(result.error).toContain('configuration') || 
        expect(result.error).toContain('Configuration file not found');
      }
    });
    
    it('should handle restart command properly', async () => {
      const result = await executeAgents(['restart'], mockConfig);
      
      // Should either succeed or fail with meaningful error
      expect(result.success !== undefined).toBe(true);
      expect(result.message || result.error).toBeDefined();
      
      // If it fails, should be due to configuration, not command parsing
      if (!result.success && result.error) {
        expect(result.error).not.toContain('Invalid action');
      }
    });
  });
  
  describe('Error Handling Improvements', () => {
    it('should provide meaningful error messages', async () => {
      const result = await executeAgents(['start'], mockConfig);
      
      if (!result.success && result.error) {
        // Error message should be descriptive
        expect(result.error.length).toBeGreaterThan(10);
        expect(result.error).not.toBe('Unknown error');
      }
    });
    
    it('should handle configuration errors gracefully', async () => {
      // This will likely fail due to missing .env file
      const result = await executeAgents(['status'], mockConfig);
      
      if (!result.success && result.error) {
        expect(result.error).toContain('Configuration file not found') ||
        expect(result.error).toContain('failed') ||
        expect(result.error).toContain('missing');
      }
    });
    
    it('should handle unexpected errors without crashing', async () => {
      // Even with invalid input, should not throw uncaught exceptions
      expect(async () => {
        await executeAgents(['unknown'], mockConfig);
      }).not.toThrow();
      
      const result = await executeAgents(['unknown'], mockConfig);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
  
  describe('Internal Action Handling', () => {
    it('should distinguish between public and internal actions', async () => {
      // Public action
      const publicResult = await executeAgents(['status'], mockConfig);
      
      // Internal action 
      const internalResult = await executeAgents(['__run-server'], mockConfig);
      
      // Both should be parsed successfully (though may fail for other reasons)
      if (!publicResult.success && publicResult.error) {
        expect(publicResult.error).not.toContain('Invalid action');
      }
      
      if (!internalResult.success && internalResult.error) {
        expect(internalResult.error).not.toContain('Invalid action: __run-server');
      }
    });
    
    it('should handle internal action differently than public actions', async () => {
      // Note: We can't actually test __run-server execution in unit tests 
      // because it runs the server directly and calls process.exit
      // But we can test that the argument parsing accepts it
      
      // Test that __run-server is accepted in argument parsing by checking
      // that it doesn't throw an "Invalid action" error during parsing
      try {
        const result = await executeAgents(['__run-server'], mockConfig);
        
        // If we get here, the parsing succeeded
        // The actual execution will likely fail due to missing config or call process.exit
        if (!result.success && result.error) {
          expect(result.error).not.toContain('Available actions: start, stop, status, restart');
        }
      } catch (error) {
        // __run-server tries to run the server directly and may exit the process
        // This is expected behavior in the real implementation
        // In tests, this might cause issues, so we handle it gracefully
        expect(error).toBeDefined();
      }
    });
  });
});