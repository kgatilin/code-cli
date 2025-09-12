import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AgentConfig, OpenAIRequest } from '../../src/types.js';

// Mock Google GenAI SDK
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContentStream: vi.fn()
    }
  })),
  mcpToTool: vi.fn().mockImplementation(() => ({
    async tool() {
      return { type: 'function', name: 'mcp_tool', description: 'Test MCP tool' };
    },
    async callTool() {
      return [{ content: [{ type: 'text', text: 'Mock tool result' }] }];
    }
  }))
}));

// Mock MCP Client Manager
vi.mock('../../src/agents/mcp-client-manager.js', () => ({
  MCPClientManager: vi.fn().mockImplementation(() => ({
    createClients: vi.fn(),
    getClients: vi.fn(),
    hasConnectedClients: vi.fn(),
    shutdown: vi.fn(),
    isManagerShutdown: vi.fn()
  }))
}));

// Mock MCP Config
vi.mock('../../src/agents/mcp-config.js', () => ({
  loadMCPConfig: vi.fn()
}));

// Mock logger
vi.mock('../../src/agents/logger.js', () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn()
}));

// Mock filesystem helper
vi.mock('../../src/agents/filesystem-helper.js', () => ({
  FilesystemHelper: vi.fn().mockImplementation(() => ({
    getPathErrorContext: vi.fn(),
    extractPrimaryPath: vi.fn()
  }))
}));

// Mock prompt config
vi.mock('../../src/agents/prompt-config.js', () => ({
  loadPromptConfig: vi.fn().mockImplementation(() => {
    throw new Error('No prompt config available');
  })
}));

// Mock request preprocessor
vi.mock('../../src/agents/request-preprocessor.js', () => ({
  preprocessRequest: vi.fn()
}));

// Import after mocking
import { AgentOrchestrator } from '../../src/agents/orchestrator.js';
import { loadMCPConfig } from '../../src/agents/mcp-config.js';
import { GoogleGenAI } from '@google/genai';

describe('agents/orchestrator - think tags (Phase 1)', () => {
  let orchestrator: AgentOrchestrator;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create test configuration
    mockConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
      PROXY_PORT: 11434,
      DEBUG_MODE: false
    };

    // Setup MCP config mock
    vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });

    // Create orchestrator
    orchestrator = new AgentOrchestrator(mockConfig);
  });

  afterEach(async () => {
    if (orchestrator && orchestrator.shutdown) {
      await orchestrator.shutdown();
    }
  });

  describe('Phase 1: Streaming thought detection and wrapping', () => {
    let mockGenerateContentStream: any;

    beforeEach(() => {
      // Get the mock function from the mocked GoogleGenAI instance
      mockGenerateContentStream = vi.mocked(GoogleGenAI).mock.results[0].value.models.generateContentStream;
    });

    it('should wrap thought part content in <think> tags during streaming', async () => {
      // Mock streaming response with a thought part
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [{ text: 'Let me analyze this request carefully...', thought: true }]
            }
          }]
        }
      ];
      
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What should I consider when planning this project?' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      // Find content chunks
      const contentChunks = chunks.filter(chunk => 
        chunk.choices[0]?.delta?.content && 
        chunk.choices[0].delta.content.length > 0
      );

      expect(contentChunks.length).toBeGreaterThan(0);
      
      // Should contain wrapped thought content
      const allContent = contentChunks
        .map(chunk => chunk.choices[0].delta.content)
        .join('');
      
      expect(allContent).toContain('<think>');
      expect(allContent).toContain('Let me analyze this request carefully...');
      expect(allContent).toContain('</think>');
    });

    it('should not wrap non-thought parts in streaming response', async () => {
      // Mock streaming response with non-thought part
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [{ text: 'Here is my recommendation for your project...', thought: false }]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What should I do?' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      // Find content chunks
      const contentChunks = chunks.filter(chunk => 
        chunk.choices[0]?.delta?.content && 
        chunk.choices[0].delta.content.length > 0
      );

      expect(contentChunks.length).toBeGreaterThan(0);
      
      // Should contain unwrapped content
      const allContent = contentChunks
        .map(chunk => chunk.choices[0].delta.content)
        .join('');
      
      expect(allContent).not.toContain('<think>');
      expect(allContent).not.toContain('</think>');
      expect(allContent).toContain('Here is my recommendation for your project...');
    });

    it('should handle mixed thought and non-thought parts in streaming response', async () => {
      // Mock streaming response with mixed parts
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [
                { text: 'I need to think about this...', thought: true },
                { text: 'Based on my analysis, I recommend...', thought: false }
              ]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Help me with this decision' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      // Find content chunks
      const contentChunks = chunks.filter(chunk => 
        chunk.choices[0]?.delta?.content && 
        chunk.choices[0].delta.content.length > 0
      );

      expect(contentChunks.length).toBeGreaterThan(0);
      
      // Should contain both wrapped and unwrapped content
      const allContent = contentChunks
        .map(chunk => chunk.choices[0].delta.content)
        .join('');
      
      // Should wrap the thought part
      expect(allContent).toContain('<think>');
      expect(allContent).toContain('I need to think about this...');
      expect(allContent).toContain('</think>');
      
      // Should not wrap the non-thought part
      expect(allContent).toContain('Based on my analysis, I recommend...');
    });

    it('should handle multiple consecutive thought parts in streaming response', async () => {
      // Mock streaming response with multiple thought parts
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [
                { text: 'First, let me consider the timeline...', thought: true },
                { text: 'Then I should evaluate the resources...', thought: true },
                { text: 'My final recommendation is...', thought: false }
              ]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What\'s the best approach here?' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      // Find content chunks
      const contentChunks = chunks.filter(chunk => 
        chunk.choices[0]?.delta?.content && 
        chunk.choices[0].delta.content.length > 0
      );

      expect(contentChunks.length).toBeGreaterThan(0);
      
      const allContent = contentChunks
        .map(chunk => chunk.choices[0].delta.content)
        .join('');
      
      // Should wrap consecutive thought parts together
      expect(allContent).toContain('<think>');
      expect(allContent).toContain('First, let me consider the timeline...');
      expect(allContent).toContain('Then I should evaluate the resources...');
      expect(allContent).toContain('</think>');
      
      // Should not wrap the final non-thought part
      expect(allContent).toContain('My final recommendation is...');
    });

    it('should handle thought part transitions correctly in streaming response', async () => {
      // Mock streaming response with alternating thought and non-thought parts
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [
                { text: 'Initial thought process...', thought: true },
                { text: 'Here\'s what I found...', thought: false },
                { text: 'Let me think more about this...', thought: true },
                { text: 'Final answer is...', thought: false }
              ]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'I need a thorough analysis' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      // Find content chunks
      const contentChunks = chunks.filter(chunk => 
        chunk.choices[0]?.delta?.content && 
        chunk.choices[0].delta.content.length > 0
      );

      expect(contentChunks.length).toBeGreaterThan(0);
      
      const allContent = contentChunks
        .map(chunk => chunk.choices[0].delta.content)
        .join('');
      
      // Should have two separate thought sections
      const thinkCount = (allContent.match(/<think>/g) || []).length;
      const thinkCloseCount = (allContent.match(/<\/think>/g) || []).length;
      
      expect(thinkCount).toBe(2);
      expect(thinkCloseCount).toBe(2);
      
      // Should contain all content
      expect(allContent).toContain('Initial thought process...');
      expect(allContent).toContain('Here\'s what I found...');
      expect(allContent).toContain('Let me think more about this...');
      expect(allContent).toContain('Final answer is...');
    });

    it('should handle empty or undefined thought property in streaming response', async () => {
      // Mock streaming response with parts that have no thought property
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [
                { text: 'Content without thought property' },
                { text: 'Another part without thought property' }
              ]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Simple request' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      // Find content chunks
      const contentChunks = chunks.filter(chunk => 
        chunk.choices[0]?.delta?.content && 
        chunk.choices[0].delta.content.length > 0
      );

      expect(contentChunks.length).toBeGreaterThan(0);
      
      const allContent = contentChunks
        .map(chunk => chunk.choices[0].delta.content)
        .join('');
      
      // Should not wrap content without thought property
      expect(allContent).not.toContain('<think>');
      expect(allContent).not.toContain('</think>');
      expect(allContent).toContain('Content without thought property');
      expect(allContent).toContain('Another part without thought property');
    });
  });

  describe('Phase 2: Non-streaming thought detection and wrapping', () => {
    let mockGenerateContent: any;

    beforeEach(() => {
      // Get the mock function from the mocked GoogleGenAI instance
      const mockGoogleGenAI = vi.mocked(GoogleGenAI).mock.results[0].value;
      mockGenerateContent = vi.fn();
      mockGoogleGenAI.models.generateContent = mockGenerateContent;
    });

    it('should wrap thought part content in <think> tags in non-streaming response', async () => {
      // Mock non-streaming response with a thought part
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Let me analyze this request carefully...', thought: true }]
          }
        }]
      };
      
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What should I consider when planning this project?' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      expect(response.choices[0].message.content).toContain('<think>');
      expect(response.choices[0].message.content).toContain('Let me analyze this request carefully...');
      expect(response.choices[0].message.content).toContain('</think>');
    });

    it('should not wrap non-thought parts in non-streaming response', async () => {
      // Mock non-streaming response with non-thought part
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Here is my recommendation for your project...', thought: false }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What should I do?' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      expect(response.choices[0].message.content).not.toContain('<think>');
      expect(response.choices[0].message.content).not.toContain('</think>');
      expect(response.choices[0].message.content).toContain('Here is my recommendation for your project...');
    });

    it('should handle mixed thought and non-thought parts in non-streaming response', async () => {
      // Mock non-streaming response with mixed parts
      const mockResponse = {
        candidates: [{
          content: {
            parts: [
              { text: 'I need to think about this...', thought: true },
              { text: 'Based on my analysis, I recommend...', thought: false }
            ]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Help me with this decision' }
        ]
      };

      const response = await orchestrator.processRequest(request);
      const content = response.choices[0].message.content;

      // Should wrap the thought part
      expect(content).toContain('<think>');
      expect(content).toContain('I need to think about this...');
      expect(content).toContain('</think>');
      
      // Should not wrap the non-thought part
      expect(content).toContain('Based on my analysis, I recommend...');
    });

    it('should handle multiple consecutive thought parts in non-streaming response', async () => {
      // Mock non-streaming response with multiple thought parts
      const mockResponse = {
        candidates: [{
          content: {
            parts: [
              { text: 'First, let me consider the timeline...', thought: true },
              { text: 'Then I should evaluate the resources...', thought: true },
              { text: 'My final recommendation is...', thought: false }
            ]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'What\'s the best approach here?' }
        ]
      };

      const response = await orchestrator.processRequest(request);
      const content = response.choices[0].message.content;
      
      // Should wrap consecutive thought parts together
      expect(content).toContain('<think>');
      expect(content).toContain('First, let me consider the timeline...');
      expect(content).toContain('Then I should evaluate the resources...');
      expect(content).toContain('</think>');
      
      // Should not wrap the final non-thought part
      expect(content).toContain('My final recommendation is...');
    });

    it('should handle empty or undefined thought property in non-streaming response', async () => {
      // Mock non-streaming response with parts that have no thought property
      const mockResponse = {
        candidates: [{
          content: {
            parts: [
              { text: 'Content without thought property' },
              { text: 'Another part without thought property' }
            ]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Simple request' }
        ]
      };

      const response = await orchestrator.processRequest(request);
      const content = response.choices[0].message.content;
      
      // Should not wrap content without thought property
      expect(content).not.toContain('<think>');
      expect(content).not.toContain('</think>');
      expect(content).toContain('Content without thought property');
      expect(content).toContain('Another part without thought property');
    });
  });
});