import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'fs';
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
  resolvePromptReference,
  expandPromptWithContext 
} from '../../src/agents/prompt-resolver.js';

describe('agents/prompt-resolver', () => {
  beforeEach(() => {
    // Create safe test directory
    testBaseDir = testEnv.createSafeTestDir();
    
    // Register cleanup for this test
    registerCleanup(async () => {
      testEnv.cleanupSafely(testBaseDir);
    });
  });

  afterEach(async () => {
    await executeAllCleanups();
  });

  describe('resolvePromptReference', () => {
    it('resolves simple prompt reference', () => {
      // Setup test prompt
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const promptPath = join(promptsDir, 'analyzer.md');
      const promptContent = 'You are a code analyzer. Please analyze the following code.';
      writeFileSync(promptPath, promptContent);

      const result = resolvePromptReference('analyzer', promptsDir);
      
      expect(result.content).toBe(promptContent);
      expect(result.metadata).toEqual({});
    });

    it('resolves nested prompt reference', () => {
      // Setup nested prompt structure
      const promptsDir = join(testBaseDir, 'prompts');
      const agentsDir = join(promptsDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });
      
      const promptPath = join(agentsDir, 'researcher.md');
      const promptContent = 'You are a research assistant. Help find information.';
      writeFileSync(promptPath, promptContent);

      const result = resolvePromptReference('agents/researcher', promptsDir);
      
      expect(result.content).toBe(promptContent);
      expect(result.metadata).toEqual({});
    });

    it('resolves prompt with frontmatter metadata', () => {
      // Setup prompt with metadata
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const promptPath = join(promptsDir, 'writer.md');
      const promptContent = `---
model: claude-3-opus
temperature: 0.8
tools: [web_search]
---

You are a creative writer. Write engaging content.`;
      writeFileSync(promptPath, promptContent);

      const result = resolvePromptReference('writer', promptsDir);
      
      expect(result.content).toBe('You are a creative writer. Write engaging content.');
      expect(result.metadata).toEqual({
        model: 'claude-3-opus',
        temperature: 0.8,
        tools: ['web_search']
      });
    });

    it('resolves prompt with includes', () => {
      // Setup prompt structure with includes
      const promptsDir = join(testBaseDir, 'prompts');
      const snippetsDir = join(promptsDir, 'snippets');
      mkdirSync(promptsDir, { recursive: true });
      mkdirSync(snippetsDir, { recursive: true });
      
      // Create snippet
      const snippetPath = join(snippetsDir, 'guidelines.md');
      writeFileSync(snippetPath, 'Follow these coding guidelines.');
      
      // Create main prompt
      const promptPath = join(promptsDir, 'reviewer.md');
      const promptContent = `You are a code reviewer.

{{include:snippets/guidelines}}

Please review the following code.`;
      writeFileSync(promptPath, promptContent);

      const result = resolvePromptReference('reviewer', promptsDir);
      
      expect(result.content).toContain('You are a code reviewer.');
      expect(result.content).toContain('Follow these coding guidelines.');
      expect(result.content).toContain('Please review the following code.');
    });

    it('handles .md extension in reference', () => {
      // Setup test prompt
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const promptPath = join(promptsDir, 'analyzer.md');
      const promptContent = 'Analyzer prompt content.';
      writeFileSync(promptPath, promptContent);

      // Should work with or without .md extension
      const resultWithoutExt = resolvePromptReference('analyzer', promptsDir);
      const resultWithExt = resolvePromptReference('analyzer.md', promptsDir);
      
      expect(resultWithoutExt.content).toBe(promptContent);
      expect(resultWithExt.content).toBe(promptContent);
    });

    it('throws error when prompt file does not exist', () => {
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });

      expect(() => resolvePromptReference('nonexistent', promptsDir))
        .toThrow(/Failed to resolve prompt reference/);
    });

    it('throws error with descriptive message for invalid includes', () => {
      // Setup prompt with invalid include
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const promptPath = join(promptsDir, 'broken.md');
      const promptContent = `You are an assistant.

{{include:nonexistent/file}}

This should fail.`;
      writeFileSync(promptPath, promptContent);

      expect(() => resolvePromptReference('broken', promptsDir))
        .toThrow(/Failed to resolve prompt reference/);
    });

    it('handles circular include dependencies', () => {
      // Setup circular includes
      const promptsDir = join(testBaseDir, 'prompts');
      mkdirSync(promptsDir, { recursive: true });
      
      const promptA = join(promptsDir, 'a.md');
      const promptB = join(promptsDir, 'b.md');
      
      writeFileSync(promptA, 'Prompt A includes {{include:b}}');
      writeFileSync(promptB, 'Prompt B includes {{include:a}}');

      expect(() => resolvePromptReference('a', promptsDir))
        .toThrow(/Failed to resolve prompt reference/);
    });
  });

  describe('expandPromptWithContext', () => {
    it('expands prompt without context placeholders', () => {
      const resolvedPrompt = {
        content: 'You are a helpful assistant. Please help the user.',
        metadata: { model: 'claude-3-opus' }
      };

      const result = expandPromptWithContext(resolvedPrompt);
      
      expect(result).toBe('You are a helpful assistant. Please help the user.');
    });

    it('expands prompt with context placeholders', () => {
      const resolvedPrompt = {
        content: 'You are a {role}. Please help with {task}.',
        metadata: {}
      };

      const context = {
        role: 'code reviewer',
        task: 'analyzing this function'
      };

      const result = expandPromptWithContext(resolvedPrompt, context);
      
      expect(result).toBe('You are a code reviewer. Please help with analyzing this function.');
    });

    it('handles missing context values', () => {
      const resolvedPrompt = {
        content: 'You are a {role}. Please help with {task}.',
        metadata: {}
      };

      const context = {
        role: 'assistant'
        // task is missing
      };

      const result = expandPromptWithContext(resolvedPrompt, context);
      
      // Should leave unreplaced placeholders as-is
      expect(result).toBe('You are a assistant. Please help with {task}.');
    });

    it('handles context with no placeholders in prompt', () => {
      const resolvedPrompt = {
        content: 'Static prompt content.',
        metadata: {}
      };

      const context = {
        unused: 'value'
      };

      const result = expandPromptWithContext(resolvedPrompt, context);
      
      expect(result).toBe('Static prompt content.');
    });

    it('handles multiple occurrences of same placeholder', () => {
      const resolvedPrompt = {
        content: 'The {item} is important. Remember the {item} when you work.',
        metadata: {}
      };

      const context = {
        item: 'coding standard'
      };

      const result = expandPromptWithContext(resolvedPrompt, context);
      
      expect(result).toBe('The coding standard is important. Remember the coding standard when you work.');
    });

    it('handles context with special characters', () => {
      const resolvedPrompt = {
        content: 'Please analyze: {code}',
        metadata: {}
      };

      const context = {
        code: 'function test() { return "hello"; }'
      };

      const result = expandPromptWithContext(resolvedPrompt, context);
      
      expect(result).toBe('Please analyze: function test() { return "hello"; }');
    });

    it('handles empty context object', () => {
      const resolvedPrompt = {
        content: 'You are a {role}. Help with {task}.',
        metadata: {}
      };

      const result = expandPromptWithContext(resolvedPrompt, {});
      
      // Should leave placeholders unreplaced
      expect(result).toBe('You are a {role}. Help with {task}.');
    });

    it('handles undefined context', () => {
      const resolvedPrompt = {
        content: 'Static content without placeholders.',
        metadata: {}
      };

      const result = expandPromptWithContext(resolvedPrompt);
      
      expect(result).toBe('Static content without placeholders.');
    });
  });
});