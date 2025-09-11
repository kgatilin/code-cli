import type { AgentConfig, MCPConfig } from '../../src/types.js';

/**
 * Common agent configuration fixtures for testing
 */
export const agentConfigs = {
  /**
   * Minimal valid configuration
   */
  minimal: {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 11434,
    DEBUG_MODE: false
  } as AgentConfig,

  /**
   * Configuration with debug enabled
   */
  withDebug: {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1', 
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 8890,
    DEBUG_MODE: true
  } as AgentConfig,

  /**
   * Configuration with different model
   */
  withDifferentModel: {
    VERTEX_AI_PROJECT: 'production-project',
    VERTEX_AI_LOCATION: 'us-west1',
    VERTEX_AI_MODEL: 'gemini-1.5-pro',
    PROXY_PORT: 11435,
    DEBUG_MODE: false
  } as AgentConfig,

  /**
   * Configuration with custom port
   */
  withCustomPort: {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 9000,
    DEBUG_MODE: false
  } as AgentConfig,

  /**
   * Configuration for testing port validation (invalid port)
   */
  withInvalidPort: {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 99999, // Invalid port number
    DEBUG_MODE: false
  } as AgentConfig
};

/**
 * Environment file content fixtures for testing config loading
 */
export const envFileContents = {
  /**
   * Basic valid .env file content
   */
  basic: `VERTEX_AI_PROJECT=test-project
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.0-flash-exp
PROXY_PORT=11434
DEBUG_MODE=false`,

  /**
   * .env file with comments and empty lines
   */
  withComments: `# Agent Configuration
VERTEX_AI_PROJECT=test-project
VERTEX_AI_LOCATION=us-central1

# Model configuration
VERTEX_AI_MODEL=gemini-2.0-flash-exp

# Server configuration
PROXY_PORT=11434
DEBUG_MODE=false

# End of configuration`,

  /**
   * .env file with quotes
   */
  withQuotes: `VERTEX_AI_PROJECT="test-project"
VERTEX_AI_LOCATION='us-central1'
VERTEX_AI_MODEL="gemini-2.0-flash-exp"
PROXY_PORT=11434
DEBUG_MODE="false"`,

  /**
   * .env file with mixed case boolean values
   */
  withMixedBooleans: `VERTEX_AI_PROJECT=test-project
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.0-flash-exp
PROXY_PORT=11434
DEBUG_MODE=True`,

  /**
   * .env file missing required fields
   */
  missingRequired: `VERTEX_AI_PROJECT=test-project
PROXY_PORT=11434
DEBUG_MODE=false`,

  /**
   * .env file with invalid port
   */
  invalidPort: `VERTEX_AI_PROJECT=test-project
VERTEX_AI_LOCATION=us-central1
VERTEX_AI_MODEL=gemini-2.0-flash-exp
PROXY_PORT=abc
DEBUG_MODE=false`,

  /**
   * Empty .env file
   */
  empty: ``
};

/**
 * MCP configuration fixtures for testing
 */
export const mcpConfigs = {
  /**
   * Empty MCP configuration
   */
  empty: {
    mcpServers: {}
  } as MCPConfig,

  /**
   * MCP configuration with filesystem server
   */
  withFilesystem: {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/allowed/path']
      }
    }
  } as MCPConfig,

  /**
   * MCP configuration with multiple servers
   */
  withMultipleServers: {
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/allowed/path']
      },
      database: {
        command: 'node',
        args: ['/path/to/db-server.js']
      },
      weather: {
        command: 'python',
        args: ['/path/to/weather-server.py', '--api-key', 'test']
      }
    }
  } as MCPConfig,

  /**
   * Invalid MCP configuration (missing args)
   */
  invalid: {
    mcpServers: {
      filesystem: {
        command: 'npx'
        // Missing args
      }
    }
  } as Partial<MCPConfig>
};

/**
 * Server health response fixtures
 */
export const healthResponses = {
  /**
   * Healthy server response
   */
  healthy: {
    status: 'healthy',
    version: '1.0.0',
    config: {
      model: 'gemini-2.0-flash-exp',
      project: 'test-project',
      location: 'us-central1'
    }
  },

  /**
   * Health response for different config
   */
  healthyDifferentConfig: {
    status: 'healthy',
    version: '1.0.0',
    config: {
      model: 'gemini-1.5-pro',
      project: 'production-project',
      location: 'us-west1'
    }
  }
};

/**
 * Process status fixtures for testing process management
 */
export const processStatuses = {
  /**
   * Process running status
   */
  running: {
    running: true,
    pid: 12345,
    port: 11434,
    uptime: '2 minutes'
  },

  /**
   * Process not running status
   */
  notRunning: {
    running: false,
    pid: null,
    port: null,
    uptime: null
  },

  /**
   * Process with different port
   */
  runningCustomPort: {
    running: true,
    pid: 54321,
    port: 9000,
    uptime: '5 minutes'
  }
};

/**
 * PID file content fixtures
 */
export const pidFileContents = {
  /**
   * Valid PID file content
   */
  valid: '12345\n11434',

  /**
   * Valid PID file with different port
   */
  validCustomPort: '54321\n9000',

  /**
   * Invalid PID file (non-numeric PID)
   */
  invalidPid: 'abc\n11434',

  /**
   * Invalid PID file (non-numeric port)
   */
  invalidPort: '12345\nxyz',

  /**
   * Malformed PID file (missing port)
   */
  missingPort: '12345',

  /**
   * Empty PID file
   */
  empty: ''
};

/**
 * Utility functions for creating test configurations
 */
export const agentConfigHelpers = {
  /**
   * Create a custom agent configuration with overrides
   */
  createConfig: (overrides: Partial<AgentConfig>): AgentConfig => ({
    ...agentConfigs.minimal,
    ...overrides
  }),

  /**
   * Create environment file content from config object
   */
  configToEnvContent: (config: AgentConfig): string => {
    return Object.entries(config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
  },

  /**
   * Create a custom MCP configuration with overrides
   */
  createMCPConfig: (overrides: Partial<MCPConfig>): MCPConfig => ({
    ...mcpConfigs.empty,
    ...overrides
  }),

  /**
   * Create a health response for a given config
   */
  createHealthResponse: (config: AgentConfig) => ({
    status: 'healthy',
    version: '1.0.0',
    config: {
      model: config.VERTEX_AI_MODEL,
      project: config.VERTEX_AI_PROJECT,
      location: config.VERTEX_AI_LOCATION
    }
  }),

  /**
   * Create PID file content for given PID and port
   */
  createPidFileContent: (pid: number, port: number): string => {
    return `${pid}\n${port}`;
  }
};