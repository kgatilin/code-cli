import { vi } from 'vitest';
import type { Express } from 'express';
import type { AgentConfig, MCPConfig, OpenAIRequest, OpenAIResponse } from '../../src/types.js';
import { agentConfigs, mcpConfigs, openAIRequests, openAIResponses } from '../fixtures/index.js';

/**
 * Agent-specific test utilities and helpers
 */

/**
 * Mock creation helpers for agent tests
 * 
 * These functions create mock objects but do NOT call vi.mock() to avoid
 * Vitest hoisting issues. Individual tests should call vi.mock() with the
 * returned objects.
 */
export const mockHelpers = {
  /**
   * Create mocks for Google GenAI SDK
   * Tests should call vi.mock('@google/genai', () => ...) with these objects
   */
  createGoogleGenAIMocks: () => {
    const mockGenerateContent = vi.fn();
    const mockGenerateContentStream = vi.fn();
    const mockGoogleGenAI = {
      models: {
        generateContent: mockGenerateContent,
        generateContentStream: mockGenerateContentStream
      }
    };

    const GoogleGenAI = vi.fn().mockImplementation(() => mockGoogleGenAI);
    const mcpToTool = vi.fn().mockImplementation((...args: unknown[]) => {
      const clients = args.slice(0, -1);
      return {
        type: 'function',
        name: 'mcp_aggregated_tool',
        description: `MCP tool for ${clients.length} client(s)`
      };
    });

    return {
      mockGenerateContent,
      mockGenerateContentStream,
      mockGoogleGenAI,
      GoogleGenAI,
      mcpToTool
    };
  },

  /**
   * Create mocks for MCP client manager
   * Tests should call vi.mock() with the returned MCPClientManager
   */
  createMCPClientManagerMocks: () => {
    const mockMCPClientManager = {
      createClients: vi.fn().mockResolvedValue([]),
      getClients: vi.fn().mockReturnValue([]),
      hasConnectedClients: vi.fn().mockReturnValue(false),
      shutdown: vi.fn().mockResolvedValue(undefined),
      isManagerShutdown: vi.fn().mockReturnValue(false)
    };

    const MCPClientManager = vi.fn().mockImplementation(() => mockMCPClientManager);

    return { mockMCPClientManager, MCPClientManager };
  },

  /**
   * Create mocks for MCP config loading
   * Tests should call vi.mock() with the returned loadMCPConfig function
   */
  createMCPConfigMocks: (mockConfig: MCPConfig = mcpConfigs.empty) => {
    const loadMCPConfig = vi.fn().mockResolvedValue(mockConfig);

    return { loadMCPConfig };
  },

  /**
   * Create mocks for agent logger
   * Tests should call vi.mock() with the returned logger object
   */
  createLoggerMocks: () => {
    const mockLogger = {
      logDebug: vi.fn(),
      logInfo: vi.fn(),
      logWarning: vi.fn(),
      logError: vi.fn()
    };

    return mockLogger;
  },

  /**
   * Create mocks for process management (fs, os, child_process)
   * Tests should call vi.mock() with the returned objects
   */
  createProcessMocks: () => {
    const mockFs = {
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      existsSync: vi.fn(),
      unlinkSync: vi.fn(),
      mkdirSync: vi.fn()
    };

    const mockOs = {
      homedir: vi.fn().mockReturnValue('/mock/home')
    };

    const mockChildProcess = {
      spawn: vi.fn()
    };

    const mockServer = {
      listen: vi.fn(),
      close: vi.fn()
    };

    const createServer = vi.fn().mockReturnValue(mockServer);

    return {
      mockFs,
      mockOs,
      mockChildProcess,
      mockServer,
      createServer
    };
  },

  /**
   * Create orchestrator mocks for server tests
   * Tests should call vi.mock() with the returned AgentOrchestrator
   */
  createOrchestratorMocks: () => {
    const mockOrchestrator = {
      processRequest: vi.fn().mockResolvedValue(openAIResponses.simple),
      processStreamingRequest: vi.fn().mockImplementation(async function* () {
        yield 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n';
        yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n';
        yield 'data: [DONE]\n\n';
      })
    };

    const AgentOrchestrator = vi.fn().mockImplementation(() => mockOrchestrator);

    return { mockOrchestrator, AgentOrchestrator };
  }
};

/**
 * Test data generators for agent tests
 */
export const testDataGenerators = {
  /**
   * Generate a valid agent config with optional overrides
   */
  createAgentConfig: (overrides: Partial<AgentConfig> = {}): AgentConfig => ({
    ...agentConfigs.minimal,
    ...overrides
  }),

  /**
   * Generate an OpenAI request with optional overrides
   */
  createOpenAIRequest: (overrides: Partial<OpenAIRequest> = {}): OpenAIRequest => ({
    ...openAIRequests.simple,
    ...overrides
  }),

  /**
   * Generate an OpenAI response with optional overrides
   */
  createOpenAIResponse: (overrides: Partial<OpenAIResponse> = {}): OpenAIResponse => ({
    ...openAIResponses.simple,
    ...overrides
  }),

  /**
   * Generate MCP config with optional overrides
   */
  createMCPConfig: (overrides: Partial<MCPConfig> = {}): MCPConfig => ({
    ...mcpConfigs.empty,
    ...overrides
  }),

  /**
   * Generate environment variable content
   */
  createEnvContent: (config: AgentConfig): string => {
    return Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  }
};

/**
 * Common test assertions for agent tests
 */
export const testAssertions = {
  /**
   * Assert that response matches OpenAI format
   */
  assertOpenAIFormat: (response: unknown) => {
    expect(response).toHaveProperty('id');
    expect(response).toHaveProperty('object');
    expect(response).toHaveProperty('created');
    expect(response).toHaveProperty('model');
    expect(response).toHaveProperty('choices');
    expect(Array.isArray(response.choices)).toBe(true);
  },

  /**
   * Assert that error matches OpenAI error format
   */
  assertOpenAIErrorFormat: (error: unknown) => {
    expect(error).toHaveProperty('error');
    expect(error.error).toHaveProperty('message');
    expect(error.error).toHaveProperty('type');
    expect(error.error).toHaveProperty('code');
    expect(error.error).toHaveProperty('param');
  },

  /**
   * Assert that stream chunk matches OpenAI streaming format
   */
  assertOpenAIStreamChunkFormat: (chunk: unknown) => {
    expect(chunk).toHaveProperty('id');
    expect(chunk).toHaveProperty('object', 'chat.completion.chunk');
    expect(chunk).toHaveProperty('created');
    expect(chunk).toHaveProperty('model');
    expect(chunk).toHaveProperty('choices');
    expect(Array.isArray(chunk.choices)).toBe(true);
  },

  /**
   * Assert that health response matches expected format
   */
  assertHealthResponseFormat: (response: unknown, expectedConfig: AgentConfig) => {
    expect(response).toEqual({
      status: 'healthy',
      version: '1.0.0',
      config: {
        model: expectedConfig.VERTEX_AI_MODEL,
        project: expectedConfig.VERTEX_AI_PROJECT,
        location: expectedConfig.VERTEX_AI_LOCATION
      }
    });
  },

  /**
   * Assert that config contains required fields
   */
  assertValidAgentConfig: (config: unknown) => {
    expect(config).toHaveProperty('VERTEX_AI_PROJECT');
    expect(config).toHaveProperty('VERTEX_AI_LOCATION');
    expect(config).toHaveProperty('VERTEX_AI_MODEL');
    expect(config).toHaveProperty('PROXY_PORT');
    expect(config).toHaveProperty('DEBUG_MODE');
    
    expect(typeof config.VERTEX_AI_PROJECT).toBe('string');
    expect(typeof config.VERTEX_AI_LOCATION).toBe('string');
    expect(typeof config.VERTEX_AI_MODEL).toBe('string');
    expect(typeof config.PROXY_PORT).toBe('number');
    expect(typeof config.DEBUG_MODE).toBe('boolean');
  }
};

/**
 * Test environment setup helpers
 */
export const testEnvironmentHelpers = {
  /**
   * Setup isolated test environment for agent tests
   */
  setupIsolatedEnvironment: () => {
    const originalEnv = process.env;
    const mockEnv = { ...originalEnv };
    
    beforeEach(() => {
      vi.clearAllMocks();
      process.env = mockEnv;
    });

    afterEach(() => {
      process.env = originalEnv;
      vi.restoreAllMocks();
    });
  },

  /**
   * Create temporary home directory mock for config tests
   * Tests should call vi.mock('os', () => mockOs) with the returned object
   */
  createTempHomeDirMock: (tempHomeDir: string) => {
    const mockOs = {
      homedir: vi.fn().mockReturnValue(tempHomeDir)
    };
    
    return mockOs;
  },

  /**
   * Setup mock HTTP server for port testing
   */
  setupMockHttpServer: () => {
    const mockServer = {
      listen: vi.fn((port, callback) => {
        // Simulate successful binding
        if (callback) callback();
      }),
      close: vi.fn((callback) => {
        if (callback) callback();
      }),
      on: vi.fn()
    };

    return mockServer;
  }
};

/**
 * Request/Response test helpers
 */
export const requestResponseHelpers = {
  /**
   * Create a mock Express app for testing
   */
  createMockExpressApp: (): Partial<Express> => ({
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn(),
    close: vi.fn()
  }),

  /**
   * Simulate streaming response chunks
   */
  simulateStreamingResponse: function* (content: string) {
    // Role chunk
    yield `data: {"id":"test-123","object":"chat.completion.chunk","created":${Date.now()},"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n`;
    
    // Content chunks
    const words = content.split(' ');
    for (const word of words) {
      yield `data: {"id":"test-123","object":"chat.completion.chunk","created":${Date.now()},"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{"content":"${word} "},"finish_reason":null}]}\n\n`;
    }
    
    // Final chunk
    yield `data: {"id":"test-123","object":"chat.completion.chunk","created":${Date.now()},"model":"gpt-3.5-turbo","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`;
    yield 'data: [DONE]\n\n';
  },

  /**
   * Parse SSE (Server-Sent Events) chunks from response
   */
  parseSSEChunks: (response: string): unknown[] => {
    const chunks: unknown[] = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          const data = JSON.parse(line.substring(6));
          chunks.push(data);
        } catch {
          // Skip invalid JSON
        }
      }
    }
    
    return chunks;
  }
};