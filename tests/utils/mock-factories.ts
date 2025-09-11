import { vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { 
  openAIResponses, 
  googleAIErrors,
  googleAIResponses,
  mcpConfigs
} from '../fixtures/index.js';

/**
 * Mock object factories for consistent test setup
 */

/**
 * Factory for creating mock MCP clients
 */
export const createMockMCPClient = (overrides: Partial<Client> = {}): Client => {
  const mockClient = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue({ content: [] }),
    onNotification: vi.fn(),
    onRequest: vi.fn(),
    transport: {
      start: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      send: vi.fn(),
      onMessage: vi.fn(),
      onClose: vi.fn(),
      onError: vi.fn()
    },
    ...overrides
  } as unknown as Client;

  return mockClient;
};

/**
 * Factory for creating mock MCP client managers
 */
export const createMockMCPClientManager = (overrides: Record<string, unknown> = {}) => {
  const mockManager = {
    createClients: vi.fn().mockResolvedValue([]),
    getClients: vi.fn().mockReturnValue([]),
    hasConnectedClients: vi.fn().mockReturnValue(false),
    shutdown: vi.fn().mockResolvedValue(undefined),
    isManagerShutdown: vi.fn().mockReturnValue(false),
    ...overrides
  };

  return mockManager;
};

/**
 * Factory for creating mock Google GenAI instances
 */
export const createMockGoogleGenAI = (overrides: Record<string, unknown> = {}) => {
  const mockInstance = {
    models: {
      generateContent: vi.fn().mockResolvedValue(googleAIResponses.simple),
      generateContentStream: vi.fn().mockReturnValue(async function* () {
        yield { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] };
        yield { candidates: [{ content: { parts: [{ text: ' world' }] } }] };
      })
    },
    ...overrides
  };

  return mockInstance;
};

/**
 * Factory for creating mock orchestrators
 */
export const createMockOrchestrator = (overrides: Record<string, unknown> = {}) => {
  const mockOrchestrator = {
    processRequest: vi.fn().mockResolvedValue(openAIResponses.simple),
    processStreamingRequest: vi.fn().mockImplementation(async function* () {
      yield 'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n';
      yield 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n';
      yield 'data: [DONE]\n\n';
    }),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides
  };

  return mockOrchestrator;
};

/**
 * Factory for creating mock file system operations
 */
export const createMockFileSystem = (overrides: Record<string, unknown> = {}) => {
  const mockFs = {
    readFileSync: vi.fn().mockImplementation((path: string) => {
      if (path.includes('.env')) {
        return `VERTEX_AI_PROJECT=test-project
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.0-flash-exp
PROXY_PORT=11434
DEBUG_MODE=false`;
      }
      if (path.includes('mcp.json')) {
        return JSON.stringify({ mcpServers: {} });
      }
      if (path.includes('.pid')) {
        return '12345\n11434';
      }
      throw new Error(`File not found: ${path}`);
    }),
    writeFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    ...overrides
  };

  return mockFs;
};

/**
 * Factory for creating mock child processes
 */
export const createMockChildProcess = (overrides: Record<string, unknown> = {}) => {
  const mockProcess = {
    pid: 12345,
    stdout: {
      on: vi.fn(),
      pipe: vi.fn()
    },
    stderr: {
      on: vi.fn(),
      pipe: vi.fn()
    },
    on: vi.fn(),
    kill: vi.fn().mockReturnValue(true),
    unref: vi.fn(),
    disconnect: vi.fn(),
    ...overrides
  };

  const mockSpawn = vi.fn().mockReturnValue(mockProcess);
  
  return { mockProcess, mockSpawn };
};

/**
 * Factory for creating mock HTTP servers
 */
export const createMockHttpServer = (overrides: Record<string, unknown> = {}) => {
  const mockServer = {
    listen: vi.fn((port, callback) => {
      // Default to successful binding unless overridden
      if (callback) {
        setTimeout(() => callback(), 0);
      }
    }),
    close: vi.fn((callback) => {
      if (callback) {
        setTimeout(() => callback(), 0);
      }
    }),
    on: vi.fn(),
    address: vi.fn().mockReturnValue({ port: 11434 }),
    ...overrides
  };

  return mockServer;
};

/**
 * Factory for creating mock Express applications
 */
export const createMockExpressApp = (overrides: Record<string, unknown> = {}) => {
  const mockApp = {
    use: vi.fn().mockReturnThis(),
    get: vi.fn().mockReturnThis(),
    post: vi.fn().mockReturnThis(),
    put: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    listen: vi.fn(),
    set: vi.fn().mockReturnThis(),
    locals: {},
    ...overrides
  };

  return mockApp;
};

/**
 * Factory for creating mock loggers
 */
export const createMockLogger = (overrides: Record<string, unknown> = {}) => {
  const mockLogger = {
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarning: vi.fn(),
    logError: vi.fn(),
    ...overrides
  };

  return mockLogger;
};

/**
 * Factory for creating mock process kill functions
 */
export const createMockProcessKill = (processExists: boolean = true) => {
  return vi.fn().mockImplementation(() => {
    if (!processExists) {
      const error = new Error(`kill ESRCH`) as NodeJS.ErrnoException;
      error.code = 'ESRCH';
      throw error;
    }
    return true;
  });
};

/**
 * Factory for creating mock port availability checkers
 */
export const createMockPortChecker = (portsInUse: number[] = []) => {
  return vi.fn().mockImplementation((port: number) => {
    return new Promise((resolve, reject) => {
      if (portsInUse.includes(port)) {
        const error = new Error('Port in use') as NodeJS.ErrnoException;
        error.code = 'EADDRINUSE';
        reject(error);
      } else {
        resolve(true);
      }
    });
  });
};

/**
 * Factory for creating mock error objects
 */
export const createMockError = (type: 'google' | 'openai' | 'node', errorType?: string) => {
  if (type === 'google') {
    const errorData = errorType ? googleAIErrors[errorType as keyof typeof googleAIErrors] : googleAIErrors.serverError;
    return new Error(JSON.stringify(errorData));
  }
  
  if (type === 'openai') {
    return {
      error: {
        message: 'Test error message',
        type: errorType || 'api_error',
        code: 'test_error',
        param: null
      }
    };
  }
  
  // Node error
  const error = new Error('Test node error') as NodeJS.ErrnoException;
  if (errorType) {
    error.code = errorType;
  }
  return error;
};

/**
 * Mock object creation helpers for common test scenarios
 * 
 * These functions create mock objects but do NOT call vi.mock() to avoid
 * Vitest hoisting issues with closure variables. Individual tests should
 * call vi.mock() themselves with the returned objects.
 */
export const mockSets = {
  /**
   * Creates mock objects for orchestrator tests
   * Tests should call vi.mock() with these objects
   */
  createOrchestratorMocks: () => {
    const googleAI = createMockGoogleGenAI();
    const mcpClientManager = createMockMCPClientManager();
    const logger = createMockLogger();
    const mcpConfig = mcpConfigs.empty;

    return { googleAI, mcpClientManager, logger, mcpConfig };
  },

  /**
   * Creates mock objects for server tests
   * Tests should call vi.mock() with these objects
   */
  createServerMocks: () => {
    const orchestrator = createMockOrchestrator();
    const logger = createMockLogger();
    const httpServer = createMockHttpServer();

    return { orchestrator, logger, httpServer };
  },

  /**
   * Creates mock objects for process manager tests
   * Tests should call vi.mock() with these objects
   */
  createProcessManagerMocks: () => {
    const fs = createMockFileSystem();
    const { mockProcess, mockSpawn } = createMockChildProcess();
    const httpServer = createMockHttpServer();
    const logger = createMockLogger();

    return { fs, mockProcess, mockSpawn, httpServer, logger };
  },

  /**
   * Creates mock objects for config tests
   * Tests should call vi.mock() with these objects
   */
  createConfigMocks: () => {
    const fs = createMockFileSystem();
    const logger = createMockLogger();

    return { fs, logger };
  }
};