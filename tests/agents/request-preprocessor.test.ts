import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import type { OpenAIRequest, PromptConfig } from '../../src/types.js';

// Import the function we're testing (will implement after tests)
import { preprocessRequest } from '../../src/agents/request-preprocessor.js';

describe('agents/request-preprocessor', () => {
  let testDir: string;
  let promptConfig: PromptConfig;

  beforeEach(async () => {
    // Create test directory structure
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'request-preprocessor-test-'));
    
    const promptsDir = path.join(testDir, 'prompts');
    const baseDir = path.join(promptsDir, 'base');
    const agentsDir = path.join(promptsDir, 'agents');
    
    await fs.mkdir(promptsDir, { recursive: true });
    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(agentsDir, { recursive: true });

    // Create base system prompt
    await fs.writeFile(
      path.join(baseDir, 'system.md'),
      'You are a helpful AI assistant. Always be professional and accurate.'
    );

    // Create test prompts
    await fs.writeFile(
      path.join(agentsDir, 'researcher.md'),
      '---\nmodel: claude-3-opus\ntemperature: 0.3\n---\nYou are a research specialist. Focus on finding accurate, well-sourced information.'
    );

    await fs.writeFile(
      path.join(promptsDir, 'code-reviewer.md'),
      '---\ntools: [code_interpreter]\ntemperature: 0.1\n---\nYou are a code reviewer. Analyze code for bugs, style issues, and improvements.'
    );

    promptConfig = {
      basePath: promptsDir,
      systemPromptPath: 'base/system.md'
    };
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true });
    }
  });

  describe('preprocessRequest', () => {
    it('processes request with no prompt directive', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: 'Tell me about TypeScript'
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      expect(result.request).toEqual(request);
      expect(result.promptMetadata).toBeUndefined();
      expect(result.systemPrompt).toBe('You are a helpful AI assistant. Always be professional and accurate.');
    });

    it('processes request with single prompt directive', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: '{{prompt:agents/researcher}} Find information about React hooks'
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      // Check that the message was cleaned
      expect(result.request.messages[0].content).toBe('Find information about React hooks');
      
      // Check that metadata was extracted
      expect(result.promptMetadata).toEqual({
        model: 'claude-3-opus',
        temperature: 0.3
      });

      // Check that system prompt combines base + dynamic
      expect(result.systemPrompt).toBe(
        'You are a helpful AI assistant. Always be professional and accurate.\n\n' +
        'You are a research specialist. Focus on finding accurate, well-sourced information.'
      );
    });

    it('processes request with multiple messages, uses latest directive', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: '{{prompt:agents/researcher}} Find information about React'
          },
          {
            role: 'assistant',
            content: 'Here is information about React...'
          },
          {
            role: 'user',
            content: '{{prompt:code-reviewer}} Now review this React component'
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      // Check that the latest message was cleaned
      expect(result.request.messages[2].content).toBe('Now review this React component');
      
      // Check that metadata from latest directive was used
      expect(result.promptMetadata).toEqual({
        tools: ['code_interpreter'],
        temperature: 0.1
      });

      // Check that system prompt uses latest directive
      expect(result.systemPrompt).toBe(
        'You are a helpful AI assistant. Always be professional and accurate.\n\n' +
        'You are a code reviewer. Analyze code for bugs, style issues, and improvements.'
      );
    });

    it('ignores directives in system and assistant messages', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'system',
            content: '{{prompt:invalid}} This should be ignored'
          },
          {
            role: 'user',
            content: '{{prompt:agents/researcher}} Find information about Vue.js'
          },
          {
            role: 'assistant', 
            content: '{{prompt:invalid}} This should also be ignored'
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      // Only user message should be cleaned
      expect(result.request.messages[0].content).toBe('{{prompt:invalid}} This should be ignored');
      expect(result.request.messages[1].content).toBe('Find information about Vue.js');
      expect(result.request.messages[2].content).toBe('{{prompt:invalid}} This should also be ignored');
      
      // Should use metadata from user directive only
      expect(result.promptMetadata).toEqual({
        model: 'claude-3-opus',
        temperature: 0.3
      });
    });

    it('handles multimodal content with directive', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '{{prompt:code-reviewer}} Review this code in the image'
              },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,abc123' }
              }
            ]
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      // Check that text content was cleaned but image preserved
      const content = result.request.messages[0].content as any[];
      expect(content[0].text).toBe('Review this code in the image');
      expect(content[1]).toEqual({
        type: 'image_url',
        image_url: { url: 'data:image/png;base64,abc123' }
      });
      
      // Check metadata extraction
      expect(result.promptMetadata).toEqual({
        tools: ['code_interpreter'],
        temperature: 0.1
      });
    });

    it('preserves original request when no directives found', async () => {
      const originalRequest: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: 'Just a regular message'
          },
          {
            role: 'assistant',
            content: 'A regular response'
          }
        ]
      };

      const result = await preprocessRequest(originalRequest, promptConfig);

      // Request should be unchanged
      expect(result.request).toEqual(originalRequest);
      expect(result.promptMetadata).toBeUndefined();
      expect(result.systemPrompt).toBe('You are a helpful AI assistant. Always be professional and accurate.');
    });

    it('handles prompt without metadata', async () => {
      // Create a prompt without frontmatter
      await fs.writeFile(
        path.join(testDir, 'prompts', 'simple.md'),
        'You are a simple assistant without any special configuration.'
      );

      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: '{{prompt:simple}} Help me with something'
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      expect(result.request.messages[0].content).toBe('Help me with something');
      expect(result.promptMetadata).toEqual({});
      expect(result.systemPrompt).toBe(
        'You are a helpful AI assistant. Always be professional and accurate.\n\n' +
        'You are a simple assistant without any special configuration.'
      );
    });

    it('handles empty base system prompt', async () => {
      // Create empty base system prompt
      await fs.writeFile(
        path.join(testDir, 'prompts', 'base', 'system.md'),
        ''
      );

      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: '{{prompt:agents/researcher}} Find information about Node.js'
          }
        ]
      };

      const result = await preprocessRequest(request, promptConfig);

      // Should only use dynamic prompt when base is empty
      expect(result.systemPrompt).toBe('You are a research specialist. Focus on finding accurate, well-sourced information.');
    });

    it('throws error for invalid prompt reference', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: '{{prompt:nonexistent}} This prompt does not exist'
          }
        ]
      };

      await expect(preprocessRequest(request, promptConfig)).rejects.toThrow();
    });

    it('throws error when base system prompt is missing', async () => {
      const invalidConfig: PromptConfig = {
        basePath: testDir,
        systemPromptPath: 'nonexistent/system.md'
      };

      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: 'Regular message'
          }
        ]
      };

      await expect(preprocessRequest(request, invalidConfig)).rejects.toThrow();
    });

    it('handles empty messages array', async () => {
      const request: OpenAIRequest = {
        messages: []
      };

      const result = await preprocessRequest(request, promptConfig);

      expect(result.request).toEqual(request);
      expect(result.promptMetadata).toBeUndefined();
      expect(result.systemPrompt).toBe('You are a helpful AI assistant. Always be professional and accurate.');
    });

    it('preserves other request properties', async () => {
      const request: OpenAIRequest = {
        messages: [
          {
            role: 'user',
            content: '{{prompt:agents/researcher}} Find information about Python'
          }
        ],
        model: 'gpt-4',
        temperature: 0.5,
        max_tokens: 1000,
        stream: true
      };

      const result = await preprocessRequest(request, promptConfig);

      // All non-message properties should be preserved
      expect(result.request.model).toBe('gpt-4');
      expect(result.request.temperature).toBe(0.5);
      expect(result.request.max_tokens).toBe(1000);
      expect(result.request.stream).toBe(true);
    });
  });
});