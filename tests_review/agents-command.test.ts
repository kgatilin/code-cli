import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { Config } from '../src/types.js';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups 
} from './utils/index.js';

// Create safe test environment
const testEnv = new TestEnvironment({ debug: false });
let testHomeDir: string;

// Mock the os module to use safe test directory
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    homedir: () => testHomeDir
  };
});

// Import after mocking
import { executeAgents } from '../src/commands/agents.js';

describe('commands/agents', () => {
  let testCodeCliDir: string;
  let testEnvFile: string;

  beforeEach(() => {
    // Create safe test directory
    testHomeDir = testEnv.createSafeTestDir();
    testCodeCliDir = join(testHomeDir, '.code-cli');
    testEnvFile = join(testCodeCliDir, '.env');
    
    // Create test directory structure
    if (!existsSync(testCodeCliDir)) {
      mkdirSync(testCodeCliDir, { recursive: true });
    }

    // Register cleanup for this test
    registerCleanup(async () => {
      // Clean up test files safely
      testEnv.cleanupSafely(testHomeDir);
    });
  });

  afterEach(async () => {
    // Execute all registered cleanups
    await executeAllCleanups();
  });

  function createTestConfig(): Config {
    return {
      promptsPath: '.claude/prompts',
      logsPath: '.agent/log',
      taskPath: '.agent/task',
      templatesPath: '.claude/templates',
      snippetsPath: '.claude/snippets',
      reviewPattern: '//Review:',
      reviewSearchPaths: ['src'],
      reviewSearchExtensions: ['.ts'],
      reviewSearchExcludes: [],
      modelMappings: {},
      includePaths: {
        prompts: '.claude/prompts',
        templates: '.claude/templates',
        snippets: '.claude/snippets'
      },
      globalPaths: {
        prompts: join(testHomeDir, '.claude', 'prompts'),
        templates: join(testHomeDir, '.claude', 'templates'),
        snippets: join(testHomeDir, '.claude', 'snippets')
      }
    };
  }

  function createValidEnvFile(): void {
    const envContent = [
      'VERTEX_AI_PROJECT=test-project',
      'VERTEX_AI_LOCATION=us-central1',
      'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
      'PROXY_PORT=8080',
      'DEBUG_MODE=true'
    ].join('\n');
    
    writeFileSync(testEnvFile, envContent);
  }

  describe('argument parsing', () => {
    it('should require an action argument', async () => {
      const config = createTestConfig();
      
      const result = await executeAgents([], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Action is required');
      expect(result.error).toContain('start, stop, status, restart');
    });

    it('should reject invalid actions', async () => {
      const config = createTestConfig();
      
      const result = await executeAgents(['invalid-action'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid action: invalid-action');
      expect(result.error).toContain('start, stop, status, restart');
    });

    it('should accept valid actions', async () => {
      createValidEnvFile();
      const config = createTestConfig();
      
      const validActions = ['start', 'stop', 'status', 'restart'];
      
      for (const action of validActions) {
        const result = await executeAgents([action], config);
        // Should not fail due to invalid action (may fail for other reasons like missing implementation)
        if (!result.success) {
          expect(result.error).not.toContain('Invalid action');
        }
      }
    });
  });

  describe('status action', () => {
    it('should return configuration information when config is valid', async () => {
      createValidEnvFile();
      const config = createTestConfig();
      
      const result = await executeAgents(['status'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('test-project');
      expect(result.message).toContain('us-central1');
      expect(result.message).toContain('gemini-2.0-flash-exp');
      expect(result.message).toContain('8080');
      expect(result.message).toContain('true');
    });

    it('should return error when config file is missing', async () => {
      const config = createTestConfig();
      
      const result = await executeAgents(['status'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Configuration file not found');
    });

    it('should return error when required config variables are missing', async () => {
      // Create incomplete config
      const envContent = 'VERTEX_AI_PROJECT=test-project'; // Missing other required vars
      writeFileSync(testEnvFile, envContent);
      
      const config = createTestConfig();
      
      const result = await executeAgents(['status'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required environment variables');
    });
  });

  describe('start action', () => {
    it('should load and validate configuration', async () => {
      createValidEnvFile();
      const config = createTestConfig();
      
      const result = await executeAgents(['start'], config);
      
      // Phase 1: Should indicate functionality not implemented but show config was loaded
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
      expect(result.error).toContain('test-project');
      expect(result.error).toContain('us-central1');
    });

    it('should return error when config is invalid', async () => {
      // Create invalid config
      const envContent = 'VERTEX_AI_PROJECT='; // Empty required variable
      writeFileSync(testEnvFile, envContent);
      
      const config = createTestConfig();
      
      const result = await executeAgents(['start'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required environment variables');
    });
  });

  describe('stop action', () => {
    it('should indicate functionality not yet implemented', async () => {
      const config = createTestConfig();
      
      const result = await executeAgents(['stop'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
      expect(result.error).toContain('Phase 2');
    });
  });

  describe('restart action', () => {
    it('should indicate functionality not yet implemented', async () => {
      const config = createTestConfig();
      
      const result = await executeAgents(['restart'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not yet implemented');
      expect(result.error).toContain('Phase 2');
    });
  });

  describe('error handling', () => {
    it('should handle configuration loading errors gracefully', async () => {
      // Don't create config file so loadAgentConfig will throw an error
      const config = createTestConfig();
      
      const result = await executeAgents(['status'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Configuration file not found');
    });
  });
});