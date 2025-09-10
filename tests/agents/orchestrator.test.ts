import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AgentConfig, OpenAIRequest, MCPConfig } from '../../src/types.js';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

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
  mcpToTool: vi.fn().mockImplementation((client: Client) => ({ 
    type: 'function',
    name: `mcp_tool_${client.name}`,
    description: 'MCP tool converted via mcpToTool'
  }))
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
              type: 'function',
              name: 'mcp_tool_filesystem-client',
              description: 'MCP tool converted via mcpToTool'
            })
          ]),
          systemInstruction: expect.any(String),
          temperature: 0.7,
          maxOutputTokens: 4096,
          topK: 40,
          topP: 0.95
        })
      });

      expect(mcpToTool).toHaveBeenCalledWith(mockClient);
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
                name: 'mcp_tool_filesystem-client'
              }),
              expect.objectContaining({
                name: 'mcp_tool_outlook-client'
              })
            ])
          })
        })
      );

      expect(mcpToTool).toHaveBeenCalledTimes(2);
      expect(mcpToTool).toHaveBeenCalledWith(mockClients[0]);
      expect(mcpToTool).toHaveBeenCalledWith(mockClients[1]);
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
              type: 'function',
              name: 'mcp_tool_filesystem-client'
            })
          ])
        })
      });

      expect(mcpToTool).toHaveBeenCalledWith(mockClient);
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

  afterEach(async () => {
    // Clean up orchestrator if it exists
    if (orchestrator && orchestrator.shutdown) {
      await orchestrator.shutdown();
    }
  });
});