import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups 
} from './utils/index.js';
import { loadPrompt, replacePlaceholders, listAvailablePrompts, processIncludes } from '../src/prompt-loader.js';
import type { PlaceholderContext, Config } from '../src/types.js';

// Create safe test environment
const testEnv = new TestEnvironment({ debug: false });

describe('prompt-loader', () => {
  let testDir: string;
  let promptsPath: string;
  let templatesPath: string;

  function createTestConfig(overrides?: Partial<Config>): Config {
    const snippetsPath = join(testDir, '.claude', 'snippets');
    return {
      promptsPath,
      logsPath: '.agent/log',
      taskPath: '.agent/task',
      templatesPath,
      snippetsPath,
      reviewPattern: '//Review:',
      reviewSearchPaths: ['src', 'test'],
      reviewSearchExtensions: ['.ts'],
      reviewSearchExcludes: [],
      modelMappings: {},
      includePaths: {
        prompts: promptsPath,
        templates: templatesPath,
        snippets: snippetsPath
      },
      globalPaths: {
        prompts: join(testDir, 'global', 'prompts'),
        templates: join(testDir, 'global', 'templates'),
        snippets: join(testDir, 'global', 'snippets')
      },
      ...overrides
    };
  }

  beforeEach(() => {
    // Create safe test directory
    testDir = testEnv.createSafeTestDir();
    promptsPath = join(testDir, '.claude', 'prompts');
    templatesPath = join(testDir, '.claude', 'templates');
    
    // Create test directory structure
    if (!existsSync(promptsPath)) {
      mkdirSync(promptsPath, { recursive: true });
    }
    if (!existsSync(templatesPath)) {
      mkdirSync(templatesPath, { recursive: true });
    }
    
    // Register cleanup for this test
    registerCleanup(async () => {
      testEnv.cleanupSafely(testDir);
    });
  });

  afterEach(async () => {
    // Execute all registered cleanups
    await executeAllCleanups();
  });

  describe('loadPrompt', () => {
    it('loads existing prompt file', () => {
      const promptContent = 'This is a test prompt with user request: {user_request}';
      writeFileSync(join(promptsPath, 'test.md'), promptContent);

      const content = loadPrompt('test', createTestConfig());

      expect(content).toBe(promptContent);
    });

    it('adds .md extension automatically', () => {
      const promptContent = 'Test prompt content';
      writeFileSync(join(promptsPath, 'implement.md'), promptContent);

      const content = loadPrompt('implement', createTestConfig());

      expect(content).toBe(promptContent);
    });

    it('throws error for missing prompt file', () => {
      expect(() => loadPrompt('nonexistent', createTestConfig())).toThrow('Prompt file not found: nonexistent.md');
    });

    it('throws error with available prompts when prompt not found', () => {
      writeFileSync(join(promptsPath, 'available1.md'), 'content1');
      writeFileSync(join(promptsPath, 'available2.md'), 'content2');

      try {
        loadPrompt('missing', createTestConfig());
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        const errorMessage = (error as Error).message;
        expect(errorMessage).toContain('Prompt file not found: missing.md');
        expect(errorMessage).toContain('Available local prompts:');
        expect(errorMessage).toContain('available1');
        expect(errorMessage).toContain('available2');
      }
    });

    it('throws error when prompts directory does not exist', () => {
      const nonexistentPath = join(testDir, 'nonexistent');
      
      const configWithNonexistentPath = createTestConfig({ promptsPath: nonexistentPath });
      expect(() => loadPrompt('test', configWithNonexistentPath)).toThrow('Prompt file not found: test.md');
    });
  });

  describe('listAvailablePrompts', () => {
    it('returns list of available prompt files', () => {
      writeFileSync(join(promptsPath, 'implement.md'), 'content');
      writeFileSync(join(promptsPath, 'review.md'), 'content');
      writeFileSync(join(promptsPath, 'plan.md'), 'content');
      writeFileSync(join(promptsPath, 'not-a-prompt.txt'), 'content'); // should be ignored

      const prompts = listAvailablePrompts(promptsPath);

      expect(prompts).toEqual(['implement', 'plan', 'review']); // sorted alphabetically
    });

    it('returns empty array when no prompts exist', () => {
      const prompts = listAvailablePrompts(promptsPath);

      expect(prompts).toEqual([]);
    });

    it('returns empty array when directory does not exist', () => {
      const nonexistentPath = join(testDir, 'nonexistent');
      
      const prompts = listAvailablePrompts(nonexistentPath);

      expect(prompts).toEqual([]);
    });

    it('ignores non-.md files', () => {
      writeFileSync(join(promptsPath, 'prompt1.md'), 'content');
      writeFileSync(join(promptsPath, 'readme.txt'), 'content');
      writeFileSync(join(promptsPath, 'config.json'), 'content');

      const prompts = listAvailablePrompts(promptsPath);

      expect(prompts).toEqual(['prompt1']);
    });
  });

  describe('replacePlaceholders', () => {
    it('replaces user_request placeholder', () => {
      const content = 'Please implement: {user_request}';
      const context: PlaceholderContext = {
        userRequest: 'user authentication'
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe('Please implement: user authentication');
    });

    it('replaces relevant_files placeholder', () => {
      const content = 'Files to consider: {relevant_files}';
      const context: PlaceholderContext = {
        relevantFiles: 'src/auth.ts, src/user.ts'
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe('Files to consider: src/auth.ts, src/user.ts');
    });

    it('replaces review_comments placeholder', () => {
      const content = 'Review feedback: {review_comments}';
      const context: PlaceholderContext = {
        reviewComments: 'Consider error handling, Add type safety'
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe('Review feedback: Consider error handling, Add type safety');
    });

    it('replaces multiple placeholders', () => {
      const content = 'User wants: {user_request}\\nFiles: {relevant_files}\\nReviews: {review_comments}';
      const context: PlaceholderContext = {
        userRequest: 'new feature',
        relevantFiles: 'app.ts',
        reviewComments: 'looks good'
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe('User wants: new feature\\nFiles: app.ts\\nReviews: looks good');
    });

    it('handles missing context values gracefully', () => {
      const content = 'Request: {user_request}, Files: {relevant_files}';
      const context: PlaceholderContext = {
        userRequest: 'implement feature'
        // missing relevantFiles
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe('Request: implement feature, Files: ');
    });

    it('handles empty context', () => {
      const content = 'Static content without placeholders';
      const context: PlaceholderContext = {};

      const result = replacePlaceholders(content, context);

      expect(result).toBe('Static content without placeholders');
    });

    it('handles content with no placeholders', () => {
      const content = 'This is a simple prompt without any dynamic content.';
      const context: PlaceholderContext = {
        userRequest: 'ignored'
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe('This is a simple prompt without any dynamic content.');
    });

    it('handles undefined context values', () => {
      const content = '{user_request} - {relevant_files} - {review_comments}';
      const context: PlaceholderContext = {
        userRequest: undefined,
        relevantFiles: undefined,
        reviewComments: undefined
      };

      const result = replacePlaceholders(content, context);

      expect(result).toBe(' -  - ');
    });
  });

  describe('processIncludes', () => {
    it('processes single include', () => {
      writeFileSync(join(promptsPath, 'main.md'), 'Before include\n{{include:shared}}\nAfter include');
      writeFileSync(join(promptsPath, 'shared.md'), 'Shared content');

      const result = processIncludes('Before include\n{{include:shared}}\nAfter include', createTestConfig(), new Set());

      expect(result).toBe('Before include\nShared content\nAfter include');
    });

    it('processes multiple includes', () => {
      writeFileSync(join(promptsPath, 'main.md'), '{{include:header}}\nMain content\n{{include:footer}}');
      writeFileSync(join(promptsPath, 'header.md'), 'Header content');
      writeFileSync(join(promptsPath, 'footer.md'), 'Footer content');

      const result = processIncludes('{{include:header}}\nMain content\n{{include:footer}}', createTestConfig(), new Set());

      expect(result).toBe('Header content\nMain content\nFooter content');
    });

    it('processes nested includes', () => {
      writeFileSync(join(promptsPath, 'main.md'), 'Main: {{include:middle}}');
      writeFileSync(join(promptsPath, 'middle.md'), 'Middle: {{include:inner}}');
      writeFileSync(join(promptsPath, 'inner.md'), 'Inner content');

      const result = processIncludes('Main: {{include:middle}}', createTestConfig(), new Set());

      expect(result).toBe('Main: Middle: Inner content');
    });

    it('detects circular dependencies', () => {
      writeFileSync(join(promptsPath, 'circular1.md'), 'Content1: {{include:circular2}}');
      writeFileSync(join(promptsPath, 'circular2.md'), 'Content2: {{include:circular1}}');

      expect(() => {
        processIncludes('{{include:circular1}}', createTestConfig(), new Set());
      }).toThrow('Circular dependency detected');
    });

    it('detects self-referencing circular dependencies', () => {
      writeFileSync(join(promptsPath, 'self.md'), 'Self: {{include:self}}');

      expect(() => {
        processIncludes('{{include:self}}', createTestConfig(), new Set());
      }).toThrow('Circular dependency detected');
    });

    it('throws error for missing include file', () => {
      const content = 'Before {{include:missing}} After';

      expect(() => {
        processIncludes(content, createTestConfig(), new Set());
      }).toThrow('Include file not found in local or global scope: missing');
    });

    it('handles empty include files', () => {
      writeFileSync(join(promptsPath, 'empty.md'), '');
      
      const result = processIncludes('Before {{include:empty}} After', createTestConfig(), new Set());

      expect(result).toBe('Before  After');
    });

    it('preserves content with no includes', () => {
      const content = 'This is content without any includes';
      
      const result = processIncludes(content, createTestConfig(), new Set());

      expect(result).toBe('This is content without any includes');
    });

    it('handles includes with whitespace variations', () => {
      writeFileSync(join(promptsPath, 'test.md'), 'Test content');

      const variations = [
        '{{include:test}}',
        '{{ include:test }}',
        '{{include: test}}',
        '{{ include: test }}'
      ];

      variations.forEach(includePattern => {
        const result = processIncludes(includePattern, createTestConfig(), new Set());
        expect(result).toBe('Test content');
      });
    });

    it('handles complex nested scenario without circular dependency', () => {
      writeFileSync(join(promptsPath, 'main.md'), 'Main {{include:section1}} {{include:section2}}');
      writeFileSync(join(promptsPath, 'section1.md'), 'Section1 {{include:common}}');
      writeFileSync(join(promptsPath, 'section2.md'), 'Section2 {{include:common}}');
      writeFileSync(join(promptsPath, 'common.md'), 'Common content');

      const result = processIncludes('Main {{include:section1}} {{include:section2}}', createTestConfig(), new Set());

      expect(result).toBe('Main Section1 Common content Section2 Common content');
    });

    it('maintains visited set across recursive calls', () => {
      writeFileSync(join(promptsPath, 'level1.md'), '{{include:level2}}');
      writeFileSync(join(promptsPath, 'level2.md'), '{{include:level3}}');
      writeFileSync(join(promptsPath, 'level3.md'), 'Final content');

      const visitedSet = new Set<string>();
      const result = processIncludes('{{include:level1}}', createTestConfig(), visitedSet);

      expect(result).toBe('Final content');
      expect(visitedSet.has('level1')).toBe(true);
      expect(visitedSet.has('level2')).toBe(true);
      expect(visitedSet.has('level3')).toBe(true);
    });

    it('throws error when prompts directory does not exist for includes', () => {
      const nonexistentPath = join(testDir, 'nonexistent');
      
      expect(() => {
        const configWithNonexistentPath = createTestConfig({ promptsPath: nonexistentPath });
        processIncludes('{{include:test}}', configWithNonexistentPath, new Set());
      }).toThrow('Include file not found in local or global scope: test');
    });
  });

  describe('dual-scope include resolution', () => {
    beforeEach(() => {
      // Create test global directories
      const config = createTestConfig();
      mkdirSync(config.globalPaths.prompts, { recursive: true });
      mkdirSync(config.globalPaths.templates, { recursive: true });
      mkdirSync(config.globalPaths.snippets, { recursive: true });
    });

    it('resolves includes from local scope first', () => {
      const config = createTestConfig();
      
      // Create both local and global versions
      writeFileSync(join(promptsPath, 'base.md'), 'Local base content');
      writeFileSync(join(config.globalPaths.prompts, 'base.md'), 'Global base content');
      
      const result = processIncludes('Start {{include:base}} end', config, new Set());
      
      expect(result).toBe('Start Local base content end');
    });

    it('resolves includes from global scope when not found locally', () => {
      const config = createTestConfig();
      
      // Only create global version
      writeFileSync(join(config.globalPaths.prompts, 'global-only.md'), 'Global only content');
      
      const result = processIncludes('Start {{include:global-only}} end', config, new Set());
      
      expect(result).toBe('Start Global only content end');
    });

    it('resolves explicit local scope includes', () => {
      const config = createTestConfig();
      
      // Create both local and global versions
      writeFileSync(join(promptsPath, 'base.md'), 'Local base content');
      writeFileSync(join(config.globalPaths.prompts, 'base.md'), 'Global base content');
      
      const result = processIncludes('Start {{include:local:base}} end', config, new Set());
      
      expect(result).toBe('Start Local base content end');
    });

    it('resolves explicit global scope includes', () => {
      const config = createTestConfig();
      
      // Create both local and global versions
      writeFileSync(join(promptsPath, 'base.md'), 'Local base content');
      writeFileSync(join(config.globalPaths.prompts, 'base.md'), 'Global base content');
      
      const result = processIncludes('Start {{include:global:base}} end', config, new Set());
      
      expect(result).toBe('Start Global base content end');
    });

    it('resolves nested paths across scopes', () => {
      const config = createTestConfig();
      
      // Create nested global resource
      const globalNestedDir = join(config.globalPaths.templates, 'typescript');
      mkdirSync(globalNestedDir, { recursive: true });
      writeFileSync(join(globalNestedDir, 'pattern.yaml'), 'Nested global template');
      
      const result = processIncludes('{{include:templates/typescript/pattern}}', config, new Set());
      
      expect(result).toBe('Nested global template');
    });

    it('resolves cross-resource type includes', () => {
      const config = createTestConfig();
      
      // Create template in global scope
      writeFileSync(join(config.globalPaths.templates, 'stage.yaml'), 'Global stage template');
      
      const result = processIncludes('{{include:templates/stage}}', config, new Set());
      
      expect(result).toBe('Global stage template');
    });

    it('throws enhanced error when resource not found in any scope', () => {
      const config = createTestConfig();
      
      expect(() => {
        processIncludes('{{include:nonexistent}}', config, new Set());
      }).toThrow('Include file not found in local or global scope: nonexistent');
    });

    it('throws error for explicit local scope when not found', () => {
      const config = createTestConfig();
      
      // Only create global version
      writeFileSync(join(config.globalPaths.prompts, 'global-only.md'), 'Global only content');
      
      expect(() => {
        processIncludes('{{include:local:global-only}}', config, new Set());
      }).toThrow('Include file not found in local scope: global-only');
    });

    it('throws error for explicit global scope when not found', () => {
      const config = createTestConfig();
      
      // Only create local version
      writeFileSync(join(promptsPath, 'local-only.md'), 'Local only content');
      
      expect(() => {
        processIncludes('{{include:global:local-only}}', config, new Set());
      }).toThrow('Include file not found in global scope: local-only');
    });

    it('handles template placeholders in global includes', () => {
      const config = createTestConfig();
      
      // Create global template with placeholder
      writeFileSync(join(config.globalPaths.templates, 'task.yaml'), 'stage: {stage}');
      
      const placeholderContext = { stage: 'implementation' };
      const result = processIncludes('{{include:templates/task}}', config, new Set(), undefined, placeholderContext);
      
      expect(result).toBe('stage: implementation');
    });

    it('maintains circular dependency detection across scopes', () => {
      const config = createTestConfig();
      
      // Create circular dependency across scopes
      writeFileSync(join(promptsPath, 'circular1.md'), '{{include:global:circular2}}');
      writeFileSync(join(config.globalPaths.prompts, 'circular2.md'), '{{include:circular1}}');
      
      expect(() => {
        processIncludes('{{include:circular1}}', config, new Set());
      }).toThrow('Circular dependency detected');
    });

    it('supports deeply nested directory structures', () => {
      const config = createTestConfig();
      
      // Create deeply nested structure
      const deepDir = join(config.globalPaths.snippets, 'typescript', 'patterns', 'factory');
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(join(deepDir, 'advanced.md'), 'Deep nested content');
      
      const result = processIncludes('{{include:snippets/typescript/patterns/factory/advanced}}', config, new Set());
      
      expect(result).toBe('Deep nested content');
    });

    it('handles mixed scope includes in single content', () => {
      const config = createTestConfig();
      
      // Create resources in different scopes
      writeFileSync(join(promptsPath, 'local-intro.md'), 'Local intro');
      writeFileSync(join(config.globalPaths.prompts, 'global-outro.md'), 'Global outro');
      writeFileSync(join(config.globalPaths.templates, 'separator.yaml'), ' - ');
      
      const content = '{{include:local-intro}}{{include:templates/separator}}{{include:global:global-outro}}';
      const result = processIncludes(content, config, new Set());
      
      expect(result).toBe('Local intro - Global outro');
    });
  });
});