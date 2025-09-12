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
let testBaseDir: string;

// Import the functions we're testing (will implement after tests)
import { 
  loadPromptConfig,
  loadBaseSystemPrompt 
} from '../../src/agents/prompt-config.js';

describe('agents/prompt-config', () => {
  beforeEach(() => {
    // Create safe test directory
    testBaseDir = testEnv.createSafeTestDir();
    
    // Register cleanup for this test
    registerCleanup(async () => {
      testEnv.cleanupSafely(testBaseDir);
    });
  });

  afterEach(async () => {
    // Clear environment variables
    delete process.env.PROMPTS_BASE_PATH;
    delete process.env.SYSTEM_PROMPT_PATH;
    
    await executeAllCleanups();
  });

  describe('loadPromptConfig', () => {
    it('loads configuration from environment variables', () => {
      // Create a test directory that actually exists
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      process.env.PROMPTS_BASE_PATH = promptsDir;
      process.env.SYSTEM_PROMPT_PATH = 'base/system.md';

      const config = loadPromptConfig();
      
      expect(config).toEqual({
        basePath: promptsDir,
        systemPromptPath: 'base/system.md'
      });
    });

    it('throws error when PROMPTS_BASE_PATH is missing', () => {
      process.env.SYSTEM_PROMPT_PATH = 'base/system.md';
      
      expect(() => loadPromptConfig()).toThrow(/PROMPTS_BASE_PATH environment variable is required/);
    });

    it('throws error when SYSTEM_PROMPT_PATH is missing', () => {
      process.env.PROMPTS_BASE_PATH = '/path/to/prompts';
      
      expect(() => loadPromptConfig()).toThrow(/SYSTEM_PROMPT_PATH environment variable is required/);
    });

    it('throws error when environment variables are empty', () => {
      process.env.PROMPTS_BASE_PATH = '';
      process.env.SYSTEM_PROMPT_PATH = 'base/system.md';
      
      expect(() => loadPromptConfig()).toThrow(/PROMPTS_BASE_PATH environment variable is required/);
    });

    it('handles whitespace in environment variables', () => {
      // Create a test directory that actually exists
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      process.env.PROMPTS_BASE_PATH = `  ${promptsDir}  `;
      process.env.SYSTEM_PROMPT_PATH = '  base/system.md  ';

      const config = loadPromptConfig();
      
      expect(config).toEqual({
        basePath: promptsDir,
        systemPromptPath: 'base/system.md'
      });
    });

    it('validates base path exists', () => {
      process.env.PROMPTS_BASE_PATH = '/nonexistent/path';
      process.env.SYSTEM_PROMPT_PATH = 'base/system.md';

      expect(() => loadPromptConfig()).toThrow(/Prompts base path does not exist/);
    });

    it('accepts existing base path', () => {
      const baseDir = join(testBaseDir, 'prompts');
      mkdirSync(baseDir, { recursive: true });
      
      process.env.PROMPTS_BASE_PATH = baseDir;
      process.env.SYSTEM_PROMPT_PATH = 'base/system.md';

      const config = loadPromptConfig();
      
      expect(config.basePath).toBe(baseDir);
    });
  });

  describe('loadBaseSystemPrompt', () => {
    it('loads system prompt from configured path', () => {
      // Setup test directory structure
      const promptsDir = join(testBaseDir, 'prompts');
      const baseDir = join(promptsDir, 'base');
      mkdirSync(baseDir, { recursive: true });
      
      const systemPromptPath = join(baseDir, 'system.md');
      const promptContent = 'You are a helpful AI assistant.';
      writeFileSync(systemPromptPath, promptContent);

      const config = {
        basePath: promptsDir,
        systemPromptPath: 'base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      expect(result).toBe(promptContent);
    });

    it('handles system prompt with includes', () => {
      // Setup test directory structure
      const promptsDir = join(testBaseDir, 'prompts');
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
        basePath: promptsDir,
        systemPromptPath: 'base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('Follow these guidelines.');
      expect(result).toContain('Be concise and helpful.');
    });

    it('throws error when system prompt file does not exist', () => {
      const config = {
        basePath: testBaseDir,
        systemPromptPath: 'nonexistent/system.md'
      };

      expect(() => loadBaseSystemPrompt(config)).toThrow(/Failed to load base system prompt/);
    });

    it('handles system prompt with frontmatter', () => {
      // Setup test directory structure
      const promptsDir = join(testBaseDir, 'prompts');
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
        basePath: promptsDir,
        systemPromptPath: 'base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      // Should load processed content (expanded includes, no frontmatter)
      expect(result).toBe('You are a helpful AI assistant with these settings.');
    });

    it('handles relative path resolution correctly', () => {
      // Setup nested directory structure
      const promptsDir = join(testBaseDir, 'prompts');
      const agentsDir = join(promptsDir, 'agents');
      const baseDir = join(agentsDir, 'base');
      mkdirSync(baseDir, { recursive: true });
      
      const systemPromptPath = join(baseDir, 'system.md');
      const promptContent = 'System prompt in nested directory.';
      writeFileSync(systemPromptPath, promptContent);

      const config = {
        basePath: promptsDir,
        systemPromptPath: 'agents/base/system.md'
      };

      const result = loadBaseSystemPrompt(config);
      
      expect(result).toBe(promptContent);
    });

    it('throws descriptive error for invalid include in system prompt', () => {
      // Setup test directory structure
      const promptsDir = join(testBaseDir, 'prompts');
      const baseDir = join(promptsDir, 'base');
      mkdirSync(baseDir, { recursive: true });
      
      const systemPromptPath = join(baseDir, 'system.md');
      const promptContent = `You are a helpful assistant.

{{include:nonexistent/file}}

This should fail.`;
      writeFileSync(systemPromptPath, promptContent);

      const config = {
        basePath: promptsDir,
        systemPromptPath: 'base/system.md'
      };

      expect(() => loadBaseSystemPrompt(config)).toThrow(/Failed to load base system prompt/);
    });
  });
});