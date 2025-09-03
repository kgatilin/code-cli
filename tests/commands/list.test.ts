import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { executeList } from '../../src/commands/list.js';
import type { Config } from '../../src/types.js';

describe('list command', () => {
  const testDir = join(process.cwd(), 'test-list');
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

  describe('executeList', () => {
    it('lists all resources when no arguments provided', async () => {
      const config = createTestConfig();
      
      // Create some test resources
      mkdirSync(config.promptsPath, { recursive: true });
      mkdirSync(config.templatesPath, { recursive: true });
      mkdirSync(config.globalPaths.prompts, { recursive: true });
      
      writeFileSync(join(config.promptsPath, 'local-prompt.md'), 'local content');
      writeFileSync(join(config.templatesPath, 'local-template.yaml'), 'local template');
      writeFileSync(join(config.globalPaths.prompts, 'global-prompt.md'), 'global content');
      
      const result = await executeList([], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('PROMPTS');
      expect(result.message).toContain('local-prompt (local)');
      expect(result.message).toContain('global-prompt (global)');
      expect(result.message).toContain('TEMPLATES');
      expect(result.message).toContain('local-template (local)');
    });

    it('lists only prompts when --prompts specified', async () => {
      const config = createTestConfig();
      
      // Create test resources
      mkdirSync(config.promptsPath, { recursive: true });
      mkdirSync(config.templatesPath, { recursive: true });
      
      writeFileSync(join(config.promptsPath, 'test-prompt.md'), 'content');
      writeFileSync(join(config.templatesPath, 'test-template.yaml'), 'content');
      
      const result = await executeList(['--prompts'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('PROMPTS');
      expect(result.message).toContain('test-prompt (local)');
      expect(result.message).not.toContain('TEMPLATES');
      expect(result.message).not.toContain('test-template');
    });

    it('lists only templates when --templates specified', async () => {
      const config = createTestConfig();
      
      // Create test resources
      mkdirSync(config.templatesPath, { recursive: true });
      mkdirSync(config.snippetsPath, { recursive: true });
      
      writeFileSync(join(config.templatesPath, 'test-template.yaml'), 'content');
      writeFileSync(join(config.snippetsPath, 'test-snippet.md'), 'content');
      
      const result = await executeList(['--templates'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('TEMPLATES');
      expect(result.message).toContain('test-template (local)');
      expect(result.message).not.toContain('SNIPPETS');
      expect(result.message).not.toContain('test-snippet');
    });

    it('lists only snippets when --snippets specified', async () => {
      const config = createTestConfig();
      
      // Create test resources
      mkdirSync(config.snippetsPath, { recursive: true });
      mkdirSync(config.promptsPath, { recursive: true });
      
      writeFileSync(join(config.snippetsPath, 'test-snippet.md'), 'content');
      writeFileSync(join(config.promptsPath, 'test-prompt.md'), 'content');
      
      const result = await executeList(['--snippets'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('SNIPPETS');
      expect(result.message).toContain('test-snippet (local)');
      expect(result.message).not.toContain('PROMPTS');
      expect(result.message).not.toContain('test-prompt');
    });

    it('shows local resources when --local specified', async () => {
      const config = createTestConfig();
      
      // Create local and global resources
      mkdirSync(config.promptsPath, { recursive: true });
      mkdirSync(config.globalPaths.prompts, { recursive: true });
      
      writeFileSync(join(config.promptsPath, 'local-only.md'), 'local content');
      writeFileSync(join(config.globalPaths.prompts, 'global-only.md'), 'global content');
      
      const result = await executeList(['--local'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('local-only (local)');
      expect(result.message).not.toContain('global-only (global)');
    });

    it('shows global resources when --global specified', async () => {
      const config = createTestConfig();
      
      // Create local and global resources
      mkdirSync(config.promptsPath, { recursive: true });
      mkdirSync(config.globalPaths.prompts, { recursive: true });
      
      writeFileSync(join(config.promptsPath, 'local-only.md'), 'local content');
      writeFileSync(join(config.globalPaths.prompts, 'global-only.md'), 'global content');
      
      const result = await executeList(['--global'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('global-only (global)');
      expect(result.message).not.toContain('local-only (local)');
    });

    it('handles nested directory structures', async () => {
      const config = createTestConfig();
      
      // Create nested structure
      const nestedLocalDir = join(config.promptsPath, 'typescript', 'patterns');
      const nestedGlobalDir = join(config.globalPaths.templates, 'ci', 'github');
      
      mkdirSync(nestedLocalDir, { recursive: true });
      mkdirSync(nestedGlobalDir, { recursive: true });
      
      writeFileSync(join(nestedLocalDir, 'factory.md'), 'local nested content');
      writeFileSync(join(nestedGlobalDir, 'workflow.yaml'), 'global nested content');
      
      const result = await executeList([], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('typescript/patterns/factory (local)');
      expect(result.message).toContain('ci/github/workflow (global)');
    });

    it('shows message when no resources found', async () => {
      const config = createTestConfig();
      
      const result = await executeList([], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('No resources found');
    });

    it('shows message when specific type has no resources', async () => {
      const config = createTestConfig();
      
      // Create only prompts
      mkdirSync(config.promptsPath, { recursive: true });
      writeFileSync(join(config.promptsPath, 'test.md'), 'content');
      
      const result = await executeList(['--templates'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('No templates found');
    });

    it('handles combining type and scope filters', async () => {
      const config = createTestConfig();
      
      // Create resources in different scopes and types
      mkdirSync(config.promptsPath, { recursive: true });
      mkdirSync(config.globalPaths.prompts, { recursive: true });
      mkdirSync(config.templatesPath, { recursive: true });
      
      writeFileSync(join(config.promptsPath, 'local-prompt.md'), 'content');
      writeFileSync(join(config.globalPaths.prompts, 'global-prompt.md'), 'content');
      writeFileSync(join(config.templatesPath, 'local-template.yaml'), 'content');
      
      const result = await executeList(['--prompts', '--global'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('global-prompt (global)');
      expect(result.message).not.toContain('local-prompt (local)');
      expect(result.message).not.toContain('local-template');
    });

    it('handles invalid arguments gracefully', async () => {
      const config = createTestConfig();
      
      const result = await executeList(['--invalid-option'], config);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown option: --invalid-option');
    });

    it('ignores non-resource files', async () => {
      const config = createTestConfig();
      
      mkdirSync(config.promptsPath, { recursive: true });
      
      // Create valid resource file
      writeFileSync(join(config.promptsPath, 'valid.md'), 'content');
      
      // Create files that should be ignored
      writeFileSync(join(config.promptsPath, '.hidden'), 'hidden');
      writeFileSync(join(config.promptsPath, 'README.txt'), 'readme');
      mkdirSync(join(config.promptsPath, '.git'), { recursive: true });
      
      const result = await executeList(['--prompts'], config);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('valid (local)');
      expect(result.message).not.toContain('.hidden');
      expect(result.message).not.toContain('README.txt');
    });

    it('sorts resources alphabetically', async () => {
      const config = createTestConfig();
      
      mkdirSync(config.promptsPath, { recursive: true });
      
      // Create files in non-alphabetical order
      writeFileSync(join(config.promptsPath, 'zebra.md'), 'content');
      writeFileSync(join(config.promptsPath, 'alpha.md'), 'content');
      writeFileSync(join(config.promptsPath, 'beta.md'), 'content');
      
      const result = await executeList(['--prompts'], config);
      
      expect(result.success).toBe(true);
      const message = result.message!;
      
      const alphaIndex = message.indexOf('alpha (local)');
      const betaIndex = message.indexOf('beta (local)');
      const zebraIndex = message.indexOf('zebra (local)');
      
      expect(alphaIndex).toBeLessThan(betaIndex);
      expect(betaIndex).toBeLessThan(zebraIndex);
    });
  });
});