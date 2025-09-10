/**
 * Test suite for message conversion functionality in orchestrator.ts
 * Tests both simple string and multi-modal content format handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../src/agents/orchestrator.js';
import type { AgentConfig, OpenAIRequest, OpenAIMessage, OpenAIContentPart } from '../src/types.js';

// Mock the Google GenAI library
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn(),
      generateContentStream: vi.fn()
    }
  }))
}));

// Mock the logger
vi.mock('../src/agents/logger.js', () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn()
}));

describe('AgentOrchestrator Message Conversion', () => {
  let orchestrator: AgentOrchestrator;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-2.5-flash',
      PROXY_PORT: 11434,
      DEBUG_MODE: false
    };

    orchestrator = new AgentOrchestrator(mockConfig);
  });

  describe('extractTextContent', () => {
    it('should handle simple string content', () => {
      const content = 'Hello, world!';
      // Using any to access private method for testing
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('Hello, world!');
    });

    it('should handle multi-modal content with single text part', () => {
      const content: OpenAIContentPart[] = [
        { type: 'text', text: 'Hello from multi-modal!' }
      ];
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('Hello from multi-modal!');
    });

    it('should handle multi-modal content with multiple text parts', () => {
      const content: OpenAIContentPart[] = [
        { type: 'text', text: 'Part one. ' },
        { type: 'text', text: 'Part two.' }
      ];
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('Part one. Part two.');
    });

    it('should ignore non-text parts in multi-modal content', () => {
      const content: OpenAIContentPart[] = [
        { type: 'text', text: 'Text content' },
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
        { type: 'text', text: ' more text' }
      ];
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('Text content more text');
    });

    it('should handle empty multi-modal content', () => {
      const content: OpenAIContentPart[] = [];
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('');
    });

    it('should handle multi-modal content with no text parts', () => {
      const content: OpenAIContentPart[] = [
        { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
      ];
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('');
    });

    it('should handle text parts with undefined text', () => {
      const content: OpenAIContentPart[] = [
        { type: 'text' }, // no text field
        { type: 'text', text: 'Valid text' }
      ];
      const result = (orchestrator as any).extractTextContent(content);
      expect(result).toBe('Valid text');
    });
  });

  describe('buildContents', () => {
    it('should convert simple string messages correctly', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ];

      const result = (orchestrator as any).buildContents(messages);
      
      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] }
      ]);
    });

    it('should convert multi-modal messages correctly', () => {
      const messages: OpenAIMessage[] = [
        { 
          role: 'user', 
          content: [
            { type: 'text', text: 'Look at this: ' },
            { type: 'text', text: 'amazing!' }
          ] 
        }
      ];

      const result = (orchestrator as any).buildContents(messages);
      
      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Look at this: amazing!' }] }
      ]);
    });

    it('should filter out system messages', () => {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' }
      ];

      const result = (orchestrator as any).buildContents(messages);
      
      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi' }] }
      ]);
    });

    it('should handle mixed content formats', () => {
      const messages: OpenAIMessage[] = [
        { role: 'user', content: 'Simple string' },
        { 
          role: 'assistant', 
          content: [{ type: 'text', text: 'Multi-modal response' }] 
        }
      ];

      const result = (orchestrator as any).buildContents(messages);
      
      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'Simple string' }] },
        { role: 'model', parts: [{ text: 'Multi-modal response' }] }
      ]);
    });

    it('should handle assistant role to model mapping', () => {
      const messages: OpenAIMessage[] = [
        { role: 'assistant', content: 'I am the assistant' }
      ];

      const result = (orchestrator as any).buildContents(messages);
      
      expect(result).toEqual([
        { role: 'model', parts: [{ text: 'I am the assistant' }] }
      ]);
    });
  });

  describe('buildSystemInstructions', () => {
    it('should extract system messages with string content', () => {
      const request: Partial<OpenAIRequest> = {
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' }
        ]
      };

      const result = (orchestrator as any).buildSystemInstructions(request);
      expect(result).toBe('You are helpful');
    });

    it('should extract system messages with multi-modal content', () => {
      const request: Partial<OpenAIRequest> = {
        messages: [
          { 
            role: 'system', 
            content: [
              { type: 'text', text: 'You are ' },
              { type: 'text', text: 'helpful' }
            ] 
          },
          { role: 'user', content: 'Hello' }
        ]
      };

      const result = (orchestrator as any).buildSystemInstructions(request);
      expect(result).toBe('You are helpful');
    });

    it('should combine multiple system messages', () => {
      const request: Partial<OpenAIRequest> = {
        messages: [
          { role: 'system', content: 'First instruction' },
          { role: 'system', content: [{ type: 'text', text: 'Second instruction' }] },
          { role: 'user', content: 'Hello' }
        ]
      };

      const result = (orchestrator as any).buildSystemInstructions(request);
      expect(result).toBe('First instruction\n\nSecond instruction');
    });

    it('should return default instructions when no system messages', () => {
      const request: Partial<OpenAIRequest> = {
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      const result = (orchestrator as any).buildSystemInstructions(request);
      expect(result).toBe('You are a helpful AI assistant. Provide accurate, helpful, and concise responses.');
    });
  });

  describe('Integration Tests', () => {
    it('should handle the original failing multi-modal format', () => {
      // This is the exact format that was causing the original error
      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello\n\n' }]
        }
      ];

      const result = (orchestrator as any).buildContents(messages);
      
      // Should produce correct Google AI format
      expect(result).toEqual([
        { role: 'user', parts: [{ text: 'hello\n\n' }] }
      ]);
    });

    it('should handle Obsidian-style system message with multi-modal content', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'system',
          content: [{ 
            type: 'text', 
            text: 'You are Obsidian Copilot, a helpful assistant that integrates AI to Obsidian note-taking.'
          }]
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }]
        }
      ];

      const contents = (orchestrator as any).buildContents(messages);
      const systemInstructions = (orchestrator as any).buildSystemInstructions({ messages });

      // System message should be in instructions, not contents
      expect(contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] }
      ]);
      
      expect(systemInstructions).toBe(
        'You are Obsidian Copilot, a helpful assistant that integrates AI to Obsidian note-taking.'
      );
    });
  });
});