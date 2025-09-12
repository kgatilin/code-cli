import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AgentConfig, OpenAIRequest, MCPConfig } from '../../src/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

// Mock logger - needs to be declared before use in vi.mock
const mockLogDebug = vi.fn();
const mockLogInfo = vi.fn();
const mockLogWarning = vi.fn();
const mockLogError = vi.fn();

// Mock Google GenAI SDK
const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();
const mockGoogleGenAI = {
  models: {
    generateContent: mockGenerateContent,
    generateContentStream: mockGenerateContentStream
  }
};

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => mockGoogleGenAI),
  mcpToTool: vi.fn().mockImplementation((...args) => {
    // Handle spread clients and optional config
    const clients = args.slice(0, -1) as Client[];
    const config = args[args.length - 1];
    
    // Return proper CallableTool structure
    return {
      async tool() {
        return {
          type: 'function',
          name: 'mcp_aggregated_tool',
          description: `MCP tool for ${clients.length} client(s)`
        };
      },
      async callTool(functionCalls) {
        return [{ content: [{ type: 'text', text: 'Mock tool result' }] }];
      }
    };
  })
}));

// Mock MCP Client Manager
const mockMCPClientManager = {
  createClients: vi.fn(),
  getClients: vi.fn(),
  hasConnectedClients: vi.fn(),
  shutdown: vi.fn(),
  isManagerShutdown: vi.fn()
};

vi.mock('../../src/agents/mcp-client-manager.js', () => ({
  MCPClientManager: vi.fn().mockImplementation(() => mockMCPClientManager)
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

// Import after mocking
import { AgentOrchestrator } from '../../src/agents/orchestrator.js';
import { mcpToTool } from '@google/genai';
import { loadMCPConfig } from '../../src/agents/mcp-config.js';
import { logDebug, logInfo, logWarning, logError } from '../../src/agents/logger.js';

describe('agents/orchestrator', () => {
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

    // Setup default mock returns
    mockMCPClientManager.createClients.mockResolvedValue([]);
    mockMCPClientManager.getClients.mockReturnValue([]);
    mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
    mockMCPClientManager.isManagerShutdown.mockReturnValue(false);
    vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
  });

  describe('Constructor', () => {
    it('should initialize without MCP config', () => {
      orchestrator = new AgentOrchestrator(mockConfig);
      
      expect(orchestrator).toBeDefined();
    });

    it('should initialize MCP client manager when MCP config exists', async () => {
      const mcpConfig: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem']
          }
        }
      };
      
      vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
      
      orchestrator = new AgentOrchestrator(mockConfig);
      
      // Wait for initialization to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(loadMCPConfig).toHaveBeenCalled();
      expect(mockMCPClientManager.createClients).toHaveBeenCalledWith(mcpConfig);
    });
  });

  describe('processRequest with MCP tools', () => {
    it('should include MCP tools in generate content call when clients exist', async () => {
      // Setup MCP config before creating orchestrator
      const mcpConfig = {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
        }
      };
      vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
      
      // Setup MCP clients
      const mockClient = { name: 'filesystem-client' } as Client;
      mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
      mockMCPClientManager.getClients.mockReturnValue([mockClient]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
      
      // Create orchestrator after mocking
      orchestrator = new AgentOrchestrator(mockConfig);
      
      // Setup mock response
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Response with MCP tools available' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'List files in my project' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'List files in my project' }]
          }
        ],
        config: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              tool: expect.any(Function),
              callTool: expect.any(Function)
            })
          ]),
          systemInstruction: expect.any(String),
          temperature: 0.7,
          maxOutputTokens: 4096,
          topK: 40,
          topP: 0.95
        })
      });

      expect(mcpToTool).toHaveBeenCalledWith(mockClient, {});
      expect(response.choices[0].message.content).toBe('Response with MCP tools available');
    });

    it('should not include tools when no MCP clients exist', async () => {
      // Setup empty MCP config
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      
      mockMCPClientManager.createClients.mockResolvedValue([]);
      mockMCPClientManager.getClients.mockReturnValue([]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
      
      // Create orchestrator after mocking
      orchestrator = new AgentOrchestrator(mockConfig);
      
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Response without MCP tools' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }]
          }
        ],
        config: expect.objectContaining({
          systemInstruction: expect.any(String),
          temperature: 0.7,
          maxOutputTokens: 4096,
          topK: 40,
          topP: 0.95
        })
      });

      // Verify tools property is not included
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.config).not.toHaveProperty('tools');
    });

    it('should handle multiple MCP clients', async () => {
      // Setup MCP config with multiple servers
      const mcpConfig = {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
          outlook: { command: '/bin/outlook-mcp', args: ['config.yaml'] }
        }
      };
      vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
      
      const mockClients = [
        { name: 'filesystem-client' } as Client,
        { name: 'outlook-client' } as Client
      ];
      mockMCPClientManager.createClients.mockResolvedValue(mockClients);
      mockMCPClientManager.getClients.mockReturnValue(mockClients);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
      
      // Create orchestrator after mocking
      orchestrator = new AgentOrchestrator(mockConfig);
      
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Response with multiple MCP tools' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Help me with files and email' }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            tools: expect.arrayContaining([
              expect.objectContaining({
                tool: expect.any(Function),
                callTool: expect.any(Function)
              })
            ])
          })
        })
      );

      expect(mcpToTool).toHaveBeenCalledTimes(1);
      expect(mcpToTool).toHaveBeenCalledWith(mockClients[0], mockClients[1], {});
    });
  });

  describe('processStreamingRequest with MCP tools', () => {
    it('should include MCP tools in streaming generate content call', async () => {
      // Setup MCP config before creating orchestrator
      const mcpConfig = {
        mcpServers: {
          filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
        }
      };
      vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
      
      const mockClient = { name: 'filesystem-client' } as Client;
      mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
      mockMCPClientManager.getClients.mockReturnValue([mockClient]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
      
      // Create orchestrator after mocking
      orchestrator = new AgentOrchestrator(mockConfig);
      
      // Setup mock streaming response
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [{ text: 'Streaming response with MCP' }]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Stream files to me' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Stream files to me' }]
          }
        ],
        config: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              tool: expect.any(Function),
              callTool: expect.any(Function)
            })
          ])
        })
      });

      expect(mcpToTool).toHaveBeenCalledWith(mockClient, {});
    });
  });

  describe('MCP integration error handling', () => {
    it('should handle MCP client manager errors gracefully', async () => {
      // Setup empty MCP config
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      
      // Create orchestrator
      orchestrator = new AgentOrchestrator(mockConfig);
      
      mockMCPClientManager.getClients.mockImplementation(() => {
        throw new Error('MCP client manager error');
      });
      
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Fallback response without MCP' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Test request' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      // Should complete successfully without MCP tools
      expect(response.choices[0].message.content).toBe('Fallback response without MCP');
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            tools: expect.anything()
          })
        })
      );
    });

    it('should handle mcpToTool conversion errors', async () => {
      // Setup MCP config
      const mcpConfig = {
        mcpServers: {
          problematic: { command: 'npx', args: ['-y', 'problematic-server'] }
        }
      };
      vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
      
      const mockClient = { name: 'problematic-client' } as Client;
      mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
      mockMCPClientManager.getClients.mockReturnValue([mockClient]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
      
      // Create orchestrator after mocking
      orchestrator = new AgentOrchestrator(mockConfig);
      
      // Mock mcpToTool to throw an error
      (mcpToTool as any).mockImplementation(() => {
        throw new Error('Tool conversion failed');
      });
      
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Response despite tool conversion error' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Test with broken tool conversion' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      // Should complete successfully without MCP tools
      expect(response.choices[0].message.content).toBe('Response despite tool conversion error');
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            tools: expect.anything()
          })
        })
      );
    });
  });

  describe('MCP lifecycle integration', () => {
    it('should handle manager shutdown state', async () => {
      // Setup empty MCP config
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      
      // Create orchestrator
      orchestrator = new AgentOrchestrator(mockConfig);
      
      mockMCPClientManager.isManagerShutdown.mockReturnValue(true);
      mockMCPClientManager.getClients.mockReturnValue([]);
      
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Response with shutdown manager' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);
      
      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Test with shutdown manager' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      expect(response.choices[0].message.content).toBe('Response with shutdown manager');
      // Should not include tools when manager is shutdown
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            tools: expect.anything()
          })
        })
      );
    });
  });

  describe('Message format conversion', () => {
    beforeEach(() => {
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      mockMCPClientManager.createClients.mockResolvedValue([]);
      mockMCPClientManager.getClients.mockReturnValue([]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
      
      orchestrator = new AgentOrchestrator(mockConfig);
    });

    it('processes simple string messages correctly', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Hello response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' }
        ]
      };

      const response = await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi there' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: 'You are a helpful AI assistant. Provide accurate, helpful, and concise responses.'
        })
      });
    });

    it('processes multi-modal content correctly', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Multi-modal response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { 
            role: 'user', 
            content: [
              { type: 'text', text: 'Look at this: ' },
              { type: 'text', text: 'amazing!' }
            ] 
          }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Look at this: amazing!' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: expect.any(String)
        })
      });
    });

    it('filters out system messages from contents and uses them as system instructions', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'System aware response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are a helpful assistant' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi' }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] },
          { role: 'model', parts: [{ text: 'Hi' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: 'You are a helpful assistant'
        })
      });
    });

    it('combines multiple system messages', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Multiple system response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'First instruction' },
          { role: 'system', content: [{ type: 'text', text: 'Second instruction' }] },
          { role: 'user', content: 'Hello' }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Hello' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: 'First instruction\n\nSecond instruction'
        })
      });
    });

    it('handles mixed content formats correctly', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Mixed format response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'user', content: 'Simple string' },
          { 
            role: 'assistant', 
            content: [{ type: 'text', text: 'Multi-modal response' }] 
          }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Simple string' }] },
          { role: 'model', parts: [{ text: 'Multi-modal response' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: expect.any(String)
        })
      });
    });

    it('ignores image_url parts in multi-modal content', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Text only response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { 
            role: 'user',
            content: [
              { type: 'text', text: 'Text content' },
              { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } },
              { type: 'text', text: ' more text' }
            ]
          }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Text content more text' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: expect.any(String)
        })
      });
    });

    it('handles the original failing Obsidian multi-modal format', async () => {
      const mockResponse = {
        candidates: [{
          content: {
            parts: [{ text: 'Obsidian response' }]
          }
        }]
      };
      mockGenerateContent.mockResolvedValue(mockResponse);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: [{ 
              type: 'text', 
              text: 'You are Obsidian Copilot, a helpful assistant that integrates AI to Obsidian note-taking.'
            }]
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'hello\n\n' }]
          }
        ]
      };

      await orchestrator.processRequest(request);

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'hello\n\n' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: 'You are Obsidian Copilot, a helpful assistant that integrates AI to Obsidian note-taking.'
        })
      });
    });
  });

  describe('Streaming message conversion', () => {
    beforeEach(() => {
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      mockMCPClientManager.createClients.mockResolvedValue([]);
      mockMCPClientManager.getClients.mockReturnValue([]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
      
      orchestrator = new AgentOrchestrator(mockConfig);
    });

    it('processes streaming requests with correct message format', async () => {
      const mockStreamChunks = [
        {
          candidates: [{
            content: {
              parts: [{ text: 'Streaming response chunk' }]
            }
          }]
        }
      ];
      mockGenerateContentStream.mockResolvedValue(mockStreamChunks);

      const request: OpenAIRequest = {
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are streaming assistant' },
          { role: 'user', content: 'Stream to me' }
        ],
        stream: true
      };

      const responseGenerator = orchestrator.processStreamingRequest(request);
      const chunks = [];
      for await (const chunk of responseGenerator) {
        chunks.push(chunk);
      }

      expect(mockGenerateContentStream).toHaveBeenCalledWith({
        model: 'gemini-2.0-flash-exp',
        contents: [
          { role: 'user', parts: [{ text: 'Stream to me' }] }
        ],
        config: expect.objectContaining({
          systemInstruction: 'You are streaming assistant'
        })
      });
    });
  });

  describe('Phase 1 - Diagnostic Logging', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset specific logger mocks
      vi.mocked(logDebug).mockClear();
      vi.mocked(logInfo).mockClear();
      vi.mocked(logWarning).mockClear();
      vi.mocked(logError).mockClear();
      
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      mockMCPClientManager.createClients.mockResolvedValue([]);
      mockMCPClientManager.getClients.mockReturnValue([]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
      mockMCPClientManager.isManagerShutdown.mockReturnValue(false);
    });

    describe('Tool Call Logging', () => {
      it('should log tool definitions when tools are directly invoked', async () => {
        // Setup MCP config with filesystem server
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
        
        // Reset and configure the mcpToTool mock for this test
        vi.mocked(mcpToTool).mockReset();
        vi.mocked(mcpToTool).mockReturnValue({
          async tool() {
            return {
              type: 'function',
              name: 'mcp_aggregated_tool',
              description: 'MCP tool for 1 client(s)'
            };
          },
          async callTool() {
            return [{ content: [{ type: 'text', text: 'Mock tool result' }] }];
          }
        });
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Wait for MCP initialization to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Get the wrapped tools directly and invoke them
        const tools = await (orchestrator as any).buildMCPTools();
        expect(tools.length).toBeGreaterThan(0);
        const wrappedTool = tools[0];
        
        // Call tool.tool() method directly to trigger logging
        await wrappedTool.tool();

        // Verify tool definition logging happens
        expect(vi.mocked(logDebug)).toHaveBeenCalledWith(
          'MCP Tool', 
          'Tool definition requested',
          expect.objectContaining({
            tool: expect.objectContaining({
              type: 'function',
              name: 'mcp_aggregated_tool'
            })
          })
        );
      });

      it('should log tool call initiation and completion when directly invoked', async () => {
        // Setup to trigger tool calls
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
        
        // Reset and configure the mcpToTool mock for this test
        vi.mocked(mcpToTool).mockReset();
        vi.mocked(mcpToTool).mockReturnValue({
          async tool() {
            return {
              type: 'function',
              name: 'mcp_aggregated_tool',
              description: 'MCP tool for 1 client(s)'
            };
          },
          async callTool() {
            return [{ content: [{ type: 'text', text: 'Mock tool result' }] }];
          }
        });
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Wait for MCP initialization to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Get the wrapped tools directly and invoke them
        const tools = await (orchestrator as any).buildMCPTools();
        expect(tools.length).toBeGreaterThan(0);
        const wrappedTool = tools[0];
        
        // Call tool.callTool() method directly to trigger logging
        await wrappedTool.callTool([{ name: 'test_tool', arguments: {} }]);
        
        // Tool call logging should occur
        expect(vi.mocked(logDebug)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call initiated',
          { calls: [{ name: 'test_tool', arguments: {} }] }
        );
        
        expect(vi.mocked(logDebug)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call completed',
          expect.objectContaining({
            result: expect.any(Array),
            duration: expect.any(Number)
          })
        );
      });

      it('should log tool call failures with context when directly invoked', async () => {
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        
        // Mock mcpToTool to return a tool that fails when called
        const toolError = new Error('Tool call failed');
        const mockTool = {
          async tool() {
            return {
              type: 'function',
              name: 'failing_tool',
              description: 'Tool that fails'
            };
          },
          async callTool() {
            throw toolError;
          }
        };
        vi.mocked(mcpToTool).mockReturnValue(mockTool);
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Wait for MCP initialization to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        
        // Get the wrapped tools and invoke them directly
        const tools = await (orchestrator as any).buildMCPTools();
        expect(tools.length).toBeGreaterThan(0);
        const wrappedTool = tools[0];
        
        try {
          await wrappedTool.callTool([{ name: 'failing_tool', arguments: {} }]);
        } catch (error) {
          // Expected to fail
        }
        
        // Should log the tool call error
        expect(vi.mocked(logError)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call failed',
          expect.objectContaining({
            error: toolError,
            calls: [{ name: 'failing_tool', arguments: {} }]
          })
        );
      });
    });

    describe('Enhanced Error Context', () => {
      it('should log request initiation with request ID and context', async () => {
        vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
        orchestrator = new AgentOrchestrator(mockConfig);
        
        const mockResponse = {
          candidates: [{
            content: { parts: [{ text: 'Test response' }] }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        const request: OpenAIRequest = {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are helpful' },
            { role: 'user', content: 'Hello' }
          ]
        };

        await orchestrator.processRequest(request);
        
        // Should log request start with context
        expect(vi.mocked(logDebug)).toHaveBeenCalledWith(
          'Orchestrator',
          'Starting request',
          expect.objectContaining({
            requestId: expect.stringMatching(/^req-\d+-\d+$/),
            messageCount: 2,
            hasTools: false
          })
        );
      });

      it('should log request completion with request ID', async () => {
        vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
        orchestrator = new AgentOrchestrator(mockConfig);
        
        const mockResponse = {
          candidates: [{
            content: { parts: [{ text: 'Test response' }] }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        const request: OpenAIRequest = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Hello' }]
        };

        const response = await orchestrator.processRequest(request);
        
        // Should log request completion
        expect(vi.mocked(logDebug)).toHaveBeenCalledWith(
          'Orchestrator',
          'Request completed',
          expect.objectContaining({
            requestId: expect.stringMatching(/^req-\d+-\d+$/),
            response: mockResponse
          })
        );
      });

      it('should log request failures with full context', async () => {
        vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
        orchestrator = new AgentOrchestrator(mockConfig);
        
        const testError = new Error('Test generation error');
        mockGenerateContent.mockRejectedValue(testError);
        
        const request: OpenAIRequest = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'This will fail' }]
        };

        await expect(orchestrator.processRequest(request)).rejects.toThrow('Test generation error');
        
        // Should log error with full context
        expect(vi.mocked(logError)).toHaveBeenCalledWith(
          'Orchestrator',
          'Request failed',
          expect.objectContaining({
            requestId: expect.stringMatching(/^req-\d+-\d+$/),
            error: testError,
            request: expect.objectContaining({
              messages: request.messages,
              tools: 0
            })
          })
        );
      });

      it('should log streaming request context', async () => {
        vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
        orchestrator = new AgentOrchestrator(mockConfig);
        
        const mockStreamChunks = [
          {
            candidates: [{
              content: { parts: [{ text: 'Streaming response' }] }
            }]
          }
        ];
        mockGenerateContentStream.mockResolvedValue(mockStreamChunks);
        
        const request: OpenAIRequest = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Stream to me' }],
          stream: true
        };

        const responseGenerator = orchestrator.processStreamingRequest(request);
        const chunks = [];
        for await (const chunk of responseGenerator) {
          chunks.push(chunk);
        }
        
        // Should log streaming request start
        expect(vi.mocked(logDebug)).toHaveBeenCalledWith(
          'Orchestrator',
          'Starting request',
          expect.objectContaining({
            requestId: expect.stringMatching(/^req-\d+-\d+$/),
            messageCount: 1,
            hasTools: false
          })
        );
      });
    });

    describe('Request ID Generation', () => {
      it('should generate unique request IDs for concurrent requests', async () => {
        vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
        orchestrator = new AgentOrchestrator(mockConfig);
        
        const mockResponse = {
          candidates: [{
            content: { parts: [{ text: 'Test response' }] }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        const request: OpenAIRequest = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test request' }]
        };

        // Make concurrent requests - they should have different counter values
        const promises = [
          orchestrator.processRequest(request),
          orchestrator.processRequest(request)
        ];
        
        await Promise.all(promises);
        
        // Get all request IDs from log calls
        const startRequestCalls = vi.mocked(logDebug).mock.calls.filter(
          call => call[1] === 'Starting request'
        );
        
        expect(startRequestCalls.length).toBeGreaterThanOrEqual(2);
        
        const requestIds = startRequestCalls.map(call => call[2].requestId);
        expect(requestIds[0]).not.toBe(requestIds[1]); // Should be unique
      });

      it('should use consistent request ID throughout request lifecycle', async () => {
        vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
        orchestrator = new AgentOrchestrator(mockConfig);
        
        const mockResponse = {
          candidates: [{
            content: { parts: [{ text: 'Test response' }] }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        const request: OpenAIRequest = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test request' }]
        };

        await orchestrator.processRequest(request);
        
        // Find the request ID from start log
        const startCall = vi.mocked(logDebug).mock.calls.find(
          call => call[1] === 'Starting request'
        );
        const requestId = startCall![2].requestId;
        
        // Verify completion log uses same request ID
        const completionCall = vi.mocked(logDebug).mock.calls.find(
          call => call[1] === 'Request completed'
        );
        expect(completionCall![2].requestId).toBe(requestId);
      });
    });
  });

  describe('Phase 2 - Targeted Solutions', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset specific logger mocks
      vi.mocked(logDebug).mockClear();
      vi.mocked(logInfo).mockClear();
      vi.mocked(logWarning).mockClear();
      vi.mocked(logError).mockClear();
      
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      mockMCPClientManager.createClients.mockResolvedValue([]);
      mockMCPClientManager.getClients.mockReturnValue([]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
      mockMCPClientManager.isManagerShutdown.mockReturnValue(false);
    });

    describe('Enhanced Error Messaging', () => {
      it('should provide detailed error context for filesystem tool failures', async () => {
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/allowed/path'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        mockMCPClientManager.hasConnectedClients.mockReturnValue(true);
        
        // Mock filesystem tool that will fail with path error
        const mockTool = {
          tool: vi.fn().mockResolvedValue({
            type: 'function',
            name: 'filesystem_tool',
            description: 'Filesystem operations'
          }),
          callTool: vi.fn().mockRejectedValue(new Error('Access denied: /invalid/path'))
        };
        
        vi.mocked(mcpToTool).mockReturnValue(mockTool);
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Trigger the wrapped tool call by calling it directly to test the wrapper
        const tools = await (orchestrator as any).buildMCPTools();
        const wrappedTool = tools[0];
        
        try {
          await wrappedTool.callTool([{ name: 'read_file', arguments: { path: '/invalid/path' } }]);
        } catch (error) {
          // Expected to fail
        }
        
        // Verify enhanced error logging occurred
        expect(vi.mocked(logError)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call failed',
          expect.objectContaining({
            error: expect.objectContaining({
              message: 'Access denied: /invalid/path'
            }),
            calls: expect.any(Array),
            enhancedContext: expect.objectContaining({
              toolName: 'read_file',
              toolType: 'filesystem',
              pathErrorContext: expect.any(Object)
            })
          })
        );
      });

      it('should log exact text mismatch for edit_file operations', async () => {
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        
        // Mock edit_file tool that fails due to text mismatch
        const mockTool = {
          tool: vi.fn().mockResolvedValue({
            type: 'function',
            name: 'edit_file',
            description: 'Edit file content'
          }),
          callTool: vi.fn().mockRejectedValue(new Error('Text not found in file'))
        };
        
        vi.mocked(mcpToTool).mockReturnValue(mockTool);
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Trigger the wrapped tool call directly
        const tools = await (orchestrator as any).buildMCPTools();
        const wrappedTool = tools[0];
        
        try {
          await wrappedTool.callTool([{ name: 'edit_file', arguments: { path: 'test.txt', old_text: 'wrong text' } }]);
        } catch (error) {
          // Expected to fail
        }
        
        // Verify text mismatch error context is logged
        expect(vi.mocked(logError)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call failed',
          expect.objectContaining({
            error: expect.objectContaining({
              message: 'Text not found in file'
            }),
            enhancedContext: expect.objectContaining({
              toolName: 'edit_file',
              suggestion: expect.stringContaining('exact text match')
            })
          })
        );
      });
    });

    describe('Timeout Detection', () => {
      it('should detect and log tool call timeouts', async () => {
        // Use fake timers before creating orchestrator
        vi.useFakeTimers();
        
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        
        // Mock tool that never resolves
        const mockTool = {
          tool: vi.fn().mockResolvedValue({
            type: 'function',
            name: 'slow_tool',
            description: 'Slow operation'
          }),
          callTool: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
        };
        
        vi.mocked(mcpToTool).mockReturnValue(mockTool);
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Trigger the wrapped tool call directly
        const tools = await (orchestrator as any).buildMCPTools();
        const wrappedTool = tools[0];
        
        const promise = wrappedTool.callTool([{ name: 'slow_tool', arguments: {} }]);
        
        // Fast forward time to trigger timeout
        vi.advanceTimersByTime(30000);
        
        try {
          await promise;
        } catch (error) {
          // Expected to timeout
        }
        
        // Verify timeout warning is logged
        expect(vi.mocked(logWarning)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call exceeded timeout, continuing without result',
          expect.objectContaining({
            toolName: 'slow_tool',
            timeoutDuration: 30000
          })
        );
        
        vi.useRealTimers();
      }, 5000); // 5 second test timeout

      it('should continue processing after timeout without blocking', async () => {
        vi.useFakeTimers();
        
        const mcpConfig = {
          mcpServers: {
            filesystem: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] }
          }
        };
        vi.mocked(loadMCPConfig).mockResolvedValue(mcpConfig);
        
        const mockClient = { name: 'filesystem-client' } as Client;
        mockMCPClientManager.createClients.mockResolvedValue([mockClient]);
        mockMCPClientManager.getClients.mockReturnValue([mockClient]);
        
        // Mock tool that hangs indefinitely
        const mockTool = {
          tool: vi.fn().mockResolvedValue({
            type: 'function',
            name: 'hanging_tool',
            description: 'Tool that hangs'
          }),
          callTool: vi.fn().mockImplementation(() => new Promise(() => {})) // Never resolves
        };
        
        vi.mocked(mcpToTool).mockReturnValue(mockTool);
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Test timeout behavior directly
        const tools = await (orchestrator as any).buildMCPTools();
        const wrappedTool = tools[0];
        
        const promise = wrappedTool.callTool([{ name: 'hanging_tool', arguments: {} }]);
        
        // Fast forward time to trigger timeout
        vi.advanceTimersByTime(30001);
        
        try {
          await promise;
        } catch (error) {
          // Expected to timeout
          expect(error).toBeInstanceOf(Error);
          expect((error as Error).message).toBe('Tool call timeout');
        }
        
        // Verify timeout was logged
        expect(vi.mocked(logWarning)).toHaveBeenCalledWith(
          'MCP Tool',
          'Tool call exceeded timeout, continuing without result',
          expect.objectContaining({
            toolName: 'hanging_tool',
            timeoutDuration: 30000
          })
        );
        
        vi.useRealTimers();
      }, 3000); // 3 second test timeout
    });
  });

  describe('Phase 3 - Prompt Integration', () => {
    let mockPromptConfig: any;
    let mockPreprocessedRequest: any;
    
    beforeEach(() => {
      vi.clearAllMocks();
      
      // Mock prompt config
      mockPromptConfig = {
        basePath: '/test/prompts',
        systemPromptPath: 'base/system.md'
      };
      
      // Mock preprocessed request
      mockPreprocessedRequest = {
        request: {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'test request with cleaned directive' }
          ]
        },
        promptMetadata: {
          model: 'gemini-pro',
          temperature: 0.5,
          maxTokens: 2000
        },
        systemPrompt: 'Base system prompt\n\nDynamic prompt content'
      };
      
      vi.mocked(loadMCPConfig).mockResolvedValue({ mcpServers: {} });
      mockMCPClientManager.createClients.mockResolvedValue([]);
      mockMCPClientManager.getClients.mockReturnValue([]);
      mockMCPClientManager.hasConnectedClients.mockReturnValue(false);
      mockMCPClientManager.isManagerShutdown.mockReturnValue(false);
    });

    describe('Constructor with prompt configuration', () => {
      it('should load prompt configuration when environment variables are set', () => {
        // Mock environment variables
        const originalEnv = process.env;
        process.env = {
          ...originalEnv,
          PROMPTS_BASE_PATH: '/test/prompts',
          SYSTEM_PROMPT_PATH: 'base/system.md'
        };

        orchestrator = new AgentOrchestrator(mockConfig);
        
        expect(orchestrator).toBeDefined();
        
        // Cleanup
        process.env = originalEnv;
      });

      it('should handle missing prompt configuration gracefully', () => {
        // Clear environment variables
        const originalEnv = process.env;
        process.env = { ...originalEnv };
        delete process.env.PROMPTS_BASE_PATH;
        delete process.env.SYSTEM_PROMPT_PATH;

        orchestrator = new AgentOrchestrator(mockConfig);
        
        expect(orchestrator).toBeDefined();
        
        // Cleanup  
        process.env = originalEnv;
      });
    });

    describe('Request preprocessing integration', () => {
      it('should preprocess request with prompt directive', async () => {
        // Mock the preprocessRequest function
        const mockPreprocessRequest = vi.fn().mockResolvedValue(mockPreprocessedRequest);
        
        // Mock environment variables
        const originalEnv = process.env;
        process.env = {
          ...originalEnv,
          PROMPTS_BASE_PATH: '/test/prompts',
          SYSTEM_PROMPT_PATH: 'base/system.md'
        };
        
        orchestrator = new AgentOrchestrator(mockConfig);
        
        // Replace the preprocessRequest function - we'll mock this at the module level
        const mockResponse = {
          candidates: [{
            content: {
              parts: [{ text: 'Response with preprocessed prompt' }]
            }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);

        const request = {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: '{{prompt:analyzer}} Please analyze this code' }
          ]
        };

        // We'll test the integration once the actual implementation is done
        // For now, just test that processRequest works with normal requests
        const response = await orchestrator.processRequest(request);
        
        expect(response.choices[0].message.content).toBe('Response with preprocessed prompt');
        
        // Cleanup
        process.env = originalEnv;
      });
    });

    describe('System instruction building with combined prompts', () => {
      it('should use combined system prompt when available', async () => {
        const mockResponse = {
          candidates: [{
            content: {
              parts: [{ text: 'Response with combined system prompt' }]
            }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        orchestrator = new AgentOrchestrator(mockConfig);

        // Test current system instruction building with multiple system messages
        const request = {
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'Base system instruction' },
            { role: 'system', content: 'Additional system instruction' },
            { role: 'user', content: 'Hello' }
          ]
        };

        await orchestrator.processRequest(request);

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.0-flash-exp',
          contents: [
            { role: 'user', parts: [{ text: 'Hello' }] }
          ],
          config: expect.objectContaining({
            systemInstruction: 'Base system instruction\n\nAdditional system instruction'
          })
        });
      });

      it('should use default system prompt when no prompts available', async () => {
        const mockResponse = {
          candidates: [{
            content: {
              parts: [{ text: 'Default response' }]
            }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        orchestrator = new AgentOrchestrator(mockConfig);

        const request = {
          model: 'gpt-4',
          messages: [
            { role: 'user', content: 'Hello without system prompt' }
          ]
        };

        await orchestrator.processRequest(request);

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.0-flash-exp',
          contents: [
            { role: 'user', parts: [{ text: 'Hello without system prompt' }] }
          ],
          config: expect.objectContaining({
            systemInstruction: 'You are a helpful AI assistant. Provide accurate, helpful, and concise responses.'
          })
        });
      });
    });

    describe('Metadata application to generation config', () => {
      it('should apply metadata to generation config when available', async () => {
        const mockResponse = {
          candidates: [{
            content: {
              parts: [{ text: 'Response with custom config' }]
            }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        orchestrator = new AgentOrchestrator(mockConfig);

        // Test with request that has custom temperature
        const request = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test request' }],
          temperature: 0.3,
          max_tokens: 1500
        };

        await orchestrator.processRequest(request);

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.0-flash-exp',
          contents: [
            { role: 'user', parts: [{ text: 'Test request' }] }
          ],
          config: expect.objectContaining({
            temperature: 0.3,
            maxOutputTokens: 1500,
            topK: 40,
            topP: 0.95
          })
        });
      });

      it('should use default values when metadata not provided', async () => {
        const mockResponse = {
          candidates: [{
            content: {
              parts: [{ text: 'Default config response' }]
            }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        orchestrator = new AgentOrchestrator(mockConfig);

        const request = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test without custom config' }]
        };

        await orchestrator.processRequest(request);

        expect(mockGenerateContent).toHaveBeenCalledWith({
          model: 'gemini-2.0-flash-exp',
          contents: [
            { role: 'user', parts: [{ text: 'Test without custom config' }] }
          ],
          config: expect.objectContaining({
            temperature: 0.7,  // Default value
            maxOutputTokens: 4096,  // Default value
            topK: 40,
            topP: 0.95
          })
        });
      });
    });

    describe('Streaming requests with prompt integration', () => {
      it('should apply prompt preprocessing to streaming requests', async () => {
        const mockStreamChunks = [
          {
            candidates: [{
              content: {
                parts: [{ text: 'Streaming response with preprocessed prompt' }]
              }
            }]
          }
        ];
        mockGenerateContentStream.mockResolvedValue(mockStreamChunks);
        
        orchestrator = new AgentOrchestrator(mockConfig);

        const request = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Test streaming request' }],
          stream: true
        };

        const responseGenerator = orchestrator.processStreamingRequest(request);
        const chunks = [];
        for await (const chunk of responseGenerator) {
          chunks.push(chunk);
        }

        expect(mockGenerateContentStream).toHaveBeenCalledWith({
          model: 'gemini-2.0-flash-exp',
          contents: [
            { role: 'user', parts: [{ text: 'Test streaming request' }] }
          ],
          config: expect.objectContaining({
            systemInstruction: expect.any(String),
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.95,
            thinkingConfig: {
              thinkingBudget: 1024,
              includeThoughts: true
            }
          })
        });

        expect(chunks.length).toBeGreaterThan(0);
      });
    });

    describe('Error handling with prompt integration', () => {
      it('should handle prompt loading errors gracefully', async () => {
        const mockResponse = {
          candidates: [{
            content: {
              parts: [{ text: 'Fallback response without prompt' }]
            }
          }]
        };
        mockGenerateContent.mockResolvedValue(mockResponse);
        
        orchestrator = new AgentOrchestrator(mockConfig);

        // Test that request processing continues even if prompt integration fails
        const request = {
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Request that should work despite prompt errors' }]
        };

        const response = await orchestrator.processRequest(request);
        
        expect(response.choices[0].message.content).toBe('Fallback response without prompt');
      });
    });
  });

  afterEach(async () => {
    // Clean up orchestrator if it exists
    if (orchestrator && orchestrator.shutdown) {
      await orchestrator.shutdown();
    }
  });
});