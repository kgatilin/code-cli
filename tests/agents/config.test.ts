import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups 
} from '../utils/index.js';

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
import { loadAgentConfig, getAgentConfigPath, loadBaseSystemPrompt } from '../../src/agents/config.js';

describe('agents/config', () => {
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
      testEnv.cleanupSafely(testHomeDir);
    });
  });

  afterEach(async () => {
    await executeAllCleanups();
  });

  describe('getAgentConfigPath', () => {
    it('returns the correct config file path', () => {
      const expectedPath = join(testHomeDir, '.code-cli', '.env');
      expect(getAgentConfigPath()).toBe(expectedPath);
    });
  });

  describe('loadAgentConfig', () => {
    it('loads valid configuration with all required fields', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROXY_PORT=8080',
        'DEBUG_MODE=true'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.VERTEX_AI_PROJECT).toBe('test-project');
      expect(config.VERTEX_AI_LOCATION).toBe('us-central1');
      expect(config.VERTEX_AI_MODEL).toBe('gemini-2.0-flash-exp');
      expect(config.PROXY_PORT).toBe(8080);
      expect(config.DEBUG_MODE).toBe(true);
    });

    it('applies default values for optional fields', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.PROXY_PORT).toBe(11434); // default
      expect(config.DEBUG_MODE).toBe(false); // default
    });

    it('handles quoted values correctly', () => {
      const envContent = [
        'VERTEX_AI_PROJECT="test-project"',
        "VERTEX_AI_LOCATION='us-central1'",
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.VERTEX_AI_PROJECT).toBe('test-project');
      expect(config.VERTEX_AI_LOCATION).toBe('us-central1');
    });

    it('ignores comments and empty lines', () => {
      const envContent = [
        '# This is a comment',
        '',
        'VERTEX_AI_PROJECT=test-project',
        '# Another comment',
        'VERTEX_AI_LOCATION=us-central1',
        '',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.VERTEX_AI_PROJECT).toBe('test-project');
      expect(config.VERTEX_AI_LOCATION).toBe('us-central1');
      expect(config.VERTEX_AI_MODEL).toBe('gemini-2.0-flash-exp');
    });

    it('throws error when config file does not exist', () => {
      expect(() => loadAgentConfig()).toThrow(/Configuration file not found/);
    });

    it('throws error when required variables are missing', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project'
        // Missing VERTEX_AI_LOCATION and VERTEX_AI_MODEL
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Missing required environment variables/);
    });

    it('throws error when required variables are empty', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Missing required environment variables/);
    });

    it('validates port number is numeric', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROXY_PORT=invalid'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Invalid PROXY_PORT/);
    });

    it('validates port number is within valid range', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROXY_PORT=70000'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Invalid PROXY_PORT/);
    });

    it('parses boolean values correctly', () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'True', expected: true },
        { value: 'TRUE', expected: true },
        { value: 'false', expected: false },
        { value: 'False', expected: false },
        { value: 'FALSE', expected: false },
        { value: 'anything-else', expected: false }
      ];

      testCases.forEach(({ value, expected }) => {
        // Ensure directory exists for each test case
        if (!existsSync(testCodeCliDir)) {
          mkdirSync(testCodeCliDir, { recursive: true });
        }
        
        const envContent = [
          'VERTEX_AI_PROJECT=test-project',
          'VERTEX_AI_LOCATION=us-central1',
          'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
          `DEBUG_MODE=${value}`
        ].join('\n');
        
        writeFileSync(testEnvFile, envContent);
        
        const config = loadAgentConfig();
        expect(config.DEBUG_MODE).toBe(expected);
      });
    });

    it('loads optional prompt configuration fields', () => {
      const promptsDir = join(testHomeDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        `PROMPTS_BASE_PATH=${promptsDir}`,
        'SYSTEM_PROMPT_PATH=base/system.md'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.PROMPTS_BASE_PATH).toBe(promptsDir);
      expect(config.SYSTEM_PROMPT_PATH).toBe('base/system.md');
    });

    it('handles absence of optional prompt configuration fields', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.PROMPTS_BASE_PATH).toBeUndefined();
      expect(config.SYSTEM_PROMPT_PATH).toBeUndefined();
    });

    it('validates PROMPTS_BASE_PATH exists when provided', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROMPTS_BASE_PATH=/nonexistent/path',
        'SYSTEM_PROMPT_PATH=base/system.md'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/PROMPTS_BASE_PATH does not exist/);
    });

    it('requires SYSTEM_PROMPT_PATH when PROMPTS_BASE_PATH is provided', () => {
      const promptsDir = join(testHomeDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        `PROMPTS_BASE_PATH=${promptsDir}`
        // Missing SYSTEM_PROMPT_PATH
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/SYSTEM_PROMPT_PATH is required when PROMPTS_BASE_PATH is provided/);
    });

    it('handles whitespace in prompt configuration paths', () => {
      const promptsDir = join(testHomeDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        `PROMPTS_BASE_PATH=  ${promptsDir}  `,
        'SYSTEM_PROMPT_PATH=  base/system.md  '
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.PROMPTS_BASE_PATH).toBe(promptsDir);
      expect(config.SYSTEM_PROMPT_PATH).toBe('base/system.md');
    });
    
    it('handles quoted prompt configuration paths', () => {
      const promptsDir = join(testHomeDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        `PROMPTS_BASE_PATH="${promptsDir}"`,
        'SYSTEM_PROMPT_PATH="base/system.md"'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.PROMPTS_BASE_PATH).toBe(promptsDir);
      expect(config.SYSTEM_PROMPT_PATH).toBe('base/system.md');
    });
  });

  describe('loadBaseSystemPrompt', () => {
    it('loads system prompt from configured path', () => {
      // Setup test directory structure
      const promptsDir = join(testHomeDir, 'prompts');
      const baseDir = join(promptsDir, 'base');
      mkdirSync(baseDir, { recursive: true });
      
      const systemPromptPath = join(baseDir, 'system.md');
      const promptContent = 'You are a helpful AI assistant.';
      writeFileSync(systemPromptPath, promptContent);

      const config = {
        VERTEX_AI_PROJECT: 'test-project',
        VERTEX_AI_LOCATION: 'us-central1',
        VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
        PROXY_PORT: 11434,
        DEBUG_MODE: false,
        PROMPTS_BASE_PATH: promptsDir,
        SYSTEM_PROMPT_PATH: 'base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      expect(result).toBe(promptContent);
    });

    it('handles system prompt with includes', () => {
      // Setup test directory structure
      const promptsDir = join(testHomeDir, 'prompts');
      const baseDir = join(promptsDir, 'base');
      const snippetsDir = join(promptsDir, 'snippets');
      mkdirSync(baseDir, { recursive: true });
      mkdirSync(snippetsDir, { recursive: true });
      
      // Create snippet file
      const snippetPath = join(snippetsDir, 'guidelines.md');
      writeFileSync(snippetPath, 'Follow these guidelines.');
      
      // Create system prompt with include
      const systemPromptPath = join(baseDir, 'system.md');
      const promptContent = `You are a helpful assistant.

{{include:snippets/guidelines}}

Be concise and helpful.`;
      writeFileSync(systemPromptPath, promptContent);

      const config = {
        VERTEX_AI_PROJECT: 'test-project',
        VERTEX_AI_LOCATION: 'us-central1',
        VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
        PROXY_PORT: 11434,
        DEBUG_MODE: false,
        PROMPTS_BASE_PATH: promptsDir,
        SYSTEM_PROMPT_PATH: 'base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('Follow these guidelines.');
      expect(result).toContain('Be concise and helpful.');
    });

    it('throws error when system prompt file does not exist', () => {
      const config = {
        VERTEX_AI_PROJECT: 'test-project',
        VERTEX_AI_LOCATION: 'us-central1',
        VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
        PROXY_PORT: 11434,
        DEBUG_MODE: false,
        PROMPTS_BASE_PATH: testHomeDir,
        SYSTEM_PROMPT_PATH: 'nonexistent/system.md'
      };

      expect(() => loadBaseSystemPrompt(config)).toThrow(/Failed to load base system prompt/);
    });

    it('handles system prompt with frontmatter', () => {
      // Setup test directory structure
      const promptsDir = join(testHomeDir, 'prompts');
      const baseDir = join(promptsDir, 'base');
      mkdirSync(baseDir, { recursive: true });
      
      const systemPromptPath = join(baseDir, 'system.md');
      const promptContent = `---
model: claude-3-opus
temperature: 0.7
---

You are a helpful AI assistant with these settings.`;
      writeFileSync(systemPromptPath, promptContent);

      const config = {
        VERTEX_AI_PROJECT: 'test-project',
        VERTEX_AI_LOCATION: 'us-central1',
        VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
        PROXY_PORT: 11434,
        DEBUG_MODE: false,
        PROMPTS_BASE_PATH: promptsDir,
        SYSTEM_PROMPT_PATH: 'base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      // Should load processed content (expanded includes, no frontmatter)
      expect(result).toBe('You are a helpful AI assistant with these settings.');
    });
  });
});