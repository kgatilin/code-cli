import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { executeInit } from '../../src/commands/init.js';
import type { Config } from '../../src/types.js';

describe('init command', () => {
  const testDir = join(process.cwd(), 'test-init');
  const originalHome = process.env.HOME;

  function createTestConfig(): Config {
    const testHomeDir = join(testDir, 'home');
    return {
      promptsPath: join(testDir, '.claude', 'prompts'),
      logsPath: join(testDir, '.agent', 'log'),
      taskPath: join(testDir, '.agent', 'task'),
      templatesPath: join(testDir, '.claude', 'templates'),
      snippetsPath: join(testDir, '.claude', 'snippets'),
      reviewPattern: '//Review:',
      reviewSearchPaths: ['src', 'test'],
      reviewSearchExtensions: ['.ts'],
      reviewSearchExcludes: [],
      modelMappings: {},
      includePaths: {
        prompts: join(testDir, '.claude', 'prompts'),
        templates: join(testDir, '.claude', 'templates'),
        snippets: join(testDir, '.claude', 'snippets')
      },
      globalPaths: {
        prompts: join(testHomeDir, '.claude', 'prompts'),
        templates: join(testHomeDir, '.claude', 'templates'),
        snippets: join(testHomeDir, '.claude', 'snippets')
      }
    };
  }

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    
    // Create test directory
    mkdirSync(testDir, { recursive: true });
    
    // Change to test directory for relative paths
    process.chdir(testDir);
    
    // Mock home directory
    process.env.HOME = join(testDir, 'home');
  });

  afterEach(() => {
    // Restore original home directory
    if (originalHome) {
      process.env.HOME = originalHome;
    } else {
      delete process.env.HOME;
    }
    
    // Change back to original directory
    process.chdir(join(testDir, '..'));
    
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('executeInit', () => {
    it('initializes project with local and global resource structure', async () => {
      const config = createTestConfig();
      
      const result = await executeInit([], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Initialization completed successfully');
      
      // Check local directories were created
      expect(existsSync(join(testDir, '.claude', 'prompts'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'templates'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'snippets'))).toBe(true);
      
      // Check global directories were created
      const homeDir = join(testDir, 'home');
      expect(existsSync(join(homeDir, '.claude', 'prompts'))).toBe(true);
      expect(existsSync(join(homeDir, '.claude', 'templates'))).toBe(true);
      expect(existsSync(join(homeDir, '.claude', 'snippets'))).toBe(true);
      
      // Check symlinks were created
      expect(existsSync(join(testDir, '.claude', 'prompts', 'global'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'templates', 'global'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'snippets', 'global'))).toBe(true);
    });

    it('creates gitignore entries for symlinks', async () => {
      const config = createTestConfig();
      
      await executeInit([], config);
      
      // Check that gitignore was created/updated
      const gitignorePath = join(testDir, '.gitignore');
      expect(existsSync(gitignorePath)).toBe(true);
      
      const gitignoreContent = readFileSync(gitignorePath, 'utf8');
      expect(gitignoreContent).toContain('.claude/*/global');
    });

    it('does not overwrite existing gitignore entries', async () => {
      const config = createTestConfig();
      const gitignorePath = join(testDir, '.gitignore');
      
      // Create existing gitignore
      writeFileSync(gitignorePath, 'node_modules/\n*.log\n');
      
      await executeInit([], config);
      
      const gitignoreContent = readFileSync(gitignorePath, 'utf8');
      expect(gitignoreContent).toContain('node_modules/');
      expect(gitignoreContent).toContain('*.log');
      expect(gitignoreContent).toContain('.claude/*/global');
    });

    it('handles --global-only option', async () => {
      const config = createTestConfig();
      
      const result = await executeInit(['--global-only'], config);
      
      expect(result.success).toBe(true);
      
      // Check global directories were created
      const homeDir = join(testDir, 'home');
      expect(existsSync(join(homeDir, '.claude', 'prompts'))).toBe(true);
      expect(existsSync(join(homeDir, '.claude', 'templates'))).toBe(true);
      expect(existsSync(join(homeDir, '.claude', 'snippets'))).toBe(true);
      
      // Check local directories were NOT created
      expect(existsSync(join(testDir, '.claude', 'prompts'))).toBe(false);
      expect(existsSync(join(testDir, '.claude', 'templates'))).toBe(false);
      expect(existsSync(join(testDir, '.claude', 'snippets'))).toBe(false);
    });

    it('handles --local-only option', async () => {
      const config = createTestConfig();
      
      const result = await executeInit(['--local-only'], config);
      
      expect(result.success).toBe(true);
      
      // Check local directories were created
      expect(existsSync(join(testDir, '.claude', 'prompts'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'templates'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'snippets'))).toBe(true);
      
      // Check global directories were NOT created
      const homeDir = join(testDir, 'home');
      expect(existsSync(join(homeDir, '.claude'))).toBe(false);
      
      // Check symlinks were NOT created
      expect(existsSync(join(testDir, '.claude', 'prompts', 'global'))).toBe(false);
      expect(existsSync(join(testDir, '.claude', 'templates', 'global'))).toBe(false);
      expect(existsSync(join(testDir, '.claude', 'snippets', 'global'))).toBe(false);
    });

    it('is idempotent (safe to run multiple times)', async () => {
      const config = createTestConfig();
      
      // Run init twice
      const result1 = await executeInit([], config);
      const result2 = await executeInit([], config);
      
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // Should still have all the expected structure
      expect(existsSync(join(testDir, '.claude', 'prompts'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'prompts', 'global'))).toBe(true);
    });

    it('validates symlinks during initialization', async () => {
      const config = createTestConfig();
      
      // Create global resources first
      const homeDir = join(testDir, 'home');
      mkdirSync(join(homeDir, '.claude', 'prompts'), { recursive: true });
      mkdirSync(join(homeDir, '.claude', 'templates'), { recursive: true });
      mkdirSync(join(homeDir, '.claude', 'snippets'), { recursive: true });
      
      // Create local directories
      mkdirSync(join(testDir, '.claude', 'prompts'), { recursive: true });
      
      // Create invalid symlink
      writeFileSync(join(testDir, '.claude', 'prompts', 'global'), 'not a symlink');
      
      const result = await executeInit([], config);
      
      expect(result.success).toBe(true);
      
      // Should have replaced invalid file with proper symlink
      expect(existsSync(join(testDir, '.claude', 'prompts', 'global'))).toBe(true);
    });

    it('provides helpful error messages on failure', async () => {
      const config = createTestConfig();
      
      // Create a config with invalid paths to force an error
      const invalidConfig = {
        ...config,
        promptsPath: '/invalid/path/that/cannot/be/created',
        templatesPath: '/invalid/path/that/cannot/be/created',
        snippetsPath: '/invalid/path/that/cannot/be/created'
      };
      
      const result = await executeInit(['--local-only'], invalidConfig);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('Failed to create local directories');
    });

    it('handles invalid command line arguments', async () => {
      const config = createTestConfig();
      
      const result = await executeInit(['--invalid-option'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown option: --invalid-option');
    });
  });
});