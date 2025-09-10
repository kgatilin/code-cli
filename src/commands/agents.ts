/**
 * Agents utility command implementation
 * 
 * Handles `code-cli agents [action]` commands for managing the
 * local LLM proxy server that provides OpenAI-compatible API
 * endpoints backed by Google Vertex AI.
 */

import type { CommandResult, Config, AgentAction, AgentConfig } from '../types.js';
import { loadAgentConfig, getAgentConfigPath } from '../agents/config.js';
import { spawnServerProcess, killServerProcess, getProcessStatus } from '../agents/process-manager.js';
import { createServer } from '../agents/server.js';
import { logDebug, logInfo, logError, initializeLogger, getLogger } from '../agents/logger.js';

/** Options for the agents command */
interface AgentsOptions {
  /** Action to perform */
  action: AgentAction;
  /** Additional arguments for the action */
  args: string[];
}

/**
 * Parses command line arguments for agents command
 * @param args - Command line arguments (excluding command name)
 * @returns Parsed options
 * @throws Error if invalid arguments provided
 */
function parseAgentsArgs(args: string[]): AgentsOptions {
  if (args.length === 0) {
    throw new Error('Action is required. Available actions: start, stop, status, restart');
  }
  
  const actionStr = args[0];
  const validActions: AgentAction[] = ['start', 'stop', 'status', 'restart'];
  
  // Special case: __run-server is used internally by spawned processes
  if (actionStr === '__run-server') {
    return {
      action: '__run-server' as AgentAction,
      args: args.slice(1)
    };
  }
  
  const action = actionStr as AgentAction;
  if (!validActions.includes(action)) {
    throw new Error(`Invalid action: ${action}. Available actions: ${validActions.join(', ')}`);
  }
  
  return {
    action,
    args: args.slice(1)
  };
}

/**
 * Handles the 'start' action
 * @param _options - Parsed options (unused in Phase 1)
 * @returns Command result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleStartAction(_options: AgentsOptions): Promise<CommandResult> {
  try {
    // Load and validate configuration
    const agentConfig = loadAgentConfig();
    
    // Attempt to start server process
    const result = await spawnServerProcess(agentConfig);
    
    if (result.success) {
      return {
        success: true,
        message: result.message
      };
    } else {
      return {
        success: false,
        error: result.message
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start agent server'
    };
  }
}

/**
 * Handles the 'stop' action
 * @param _options - Parsed options (unused in Phase 1)
 * @returns Command result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleStopAction(_options: AgentsOptions): Promise<CommandResult> {
  try {
    const success = await killServerProcess();
    
    if (success) {
      return {
        success: true,
        message: 'Agent server stopped successfully'
      };
    } else {
      return {
        success: false,
        error: 'Failed to stop agent server'
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop agent server'
    };
  }
}

/**
 * Handles the 'status' action
 * @param _options - Parsed options (unused in Phase 1)
 * @returns Command result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleStatusAction(_options: AgentsOptions): Promise<CommandResult> {
  try {
    // Load configuration to validate it exists
    const agentConfig = loadAgentConfig();
    
    // Get process status
    const processStatus = await getProcessStatus();
    
    const message = `Configuration file: ${getAgentConfigPath()}\n` +
                   `  Project: ${agentConfig.VERTEX_AI_PROJECT}\n` +
                   `  Location: ${agentConfig.VERTEX_AI_LOCATION}\n` +
                   `  Model: ${agentConfig.VERTEX_AI_MODEL}\n` +
                   `  Port: ${agentConfig.PROXY_PORT}\n` +
                   `  Debug: ${agentConfig.DEBUG_MODE}\n` +
                   `Server status: ${processStatus.message}`;
    
    return {
      success: true,
      message
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check agent status'
    };
  }
}

/**
 * Handles the 'restart' action
 * @param _options - Parsed options (unused in Phase 1)
 * @returns Command result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleRestartAction(_options: AgentsOptions): Promise<CommandResult> {
  try {
    // Load configuration
    const agentConfig = loadAgentConfig();
    
    // Stop existing server
    await killServerProcess();
    
    // Wait a moment for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Start server again
    const result = await spawnServerProcess(agentConfig);
    
    if (result.success) {
      return {
        success: true,
        message: `Agent server restarted successfully\n${result.message}`
      };
    } else {
      return {
        success: false,
        error: `Failed to restart agent server: ${result.message}`
      };
    }
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to restart agent server'
    };
  }
}

/**
 * Special handler to run the server directly (used by spawned processes)
 * @param config - Agent configuration
 */
async function runServerDirectly(config: AgentConfig): Promise<void> {
  // Initialize logger for the server process
  initializeLogger(config.DEBUG_MODE);
  
  // Clear log file on server startup to manage file size
  const logger = getLogger();
  logger.clear();
  
  logInfo('ServerMain', 'Starting server process', { 
    port: config.PROXY_PORT, 
    debug: config.DEBUG_MODE,
    pid: process.pid
  });
  
  try {
    const app = createServer(config);
    
    const server = app.listen(config.PROXY_PORT, () => {
      logInfo('ServerMain', `Server started and listening on port ${config.PROXY_PORT}`, { pid: process.pid });
    });
    
    // Handle server errors
    server.on('error', (error) => {
      logError('ServerMain', 'Server error', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    // Handle shutdown signals
    process.on('SIGTERM', () => {
      logInfo('ServerMain', 'Received SIGTERM, shutting down gracefully...');
      server.close(() => {
        logInfo('ServerMain', 'Server shut down successfully');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      logInfo('ServerMain', 'Received SIGINT, shutting down gracefully...');
      server.close(() => {
        logInfo('ServerMain', 'Server shut down successfully');
        process.exit(0);
      });
    });
    
    process.on('uncaughtException', (error) => {
      logError('ServerMain', 'Uncaught exception', { error: error.message, stack: error.stack });
      process.exit(1);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      logError('ServerMain', 'Unhandled rejection', { reason: String(reason), promise: String(promise) });
      process.exit(1);
    });
    
    logInfo('ServerMain', 'Server initialization complete, ready to handle requests');
    
    // Keep process alive
    await new Promise(() => {});
    
  } catch (error) {
    logError('ServerMain', 'Failed to start server', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

/**
 * Executes the agents command
 * @param args - Command line arguments
 * @param _config - Configuration object (unused)
 * @returns Command execution result
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function executeAgents(args: string[], _config: Config): Promise<CommandResult> {
  try {
    // Parse arguments
    const options = parseAgentsArgs(args);
    
    logDebug('AgentsCommand', 'Executing agents command', { action: options.action });
    
    // Special case: __run-server is used internally by spawned processes
    if (options.action === '__run-server' as AgentAction) {
      logInfo('AgentsCommand', 'Running server directly (spawned process mode)');
      
      try {
        const agentConfig = loadAgentConfig();
        await runServerDirectly(agentConfig);
        // This should never return
        return { success: false, error: 'Server unexpectedly terminated' };
      } catch (error) {
        logError('AgentsCommand', 'Failed to run server directly', { 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }
    
    // Route to appropriate handler
    switch (options.action) {
      case 'start':
        return await handleStartAction(options);
      case 'stop':
        return await handleStopAction(options);
      case 'status':
        return await handleStatusAction(options);
      case 'restart':
        return await handleRestartAction(options);
      default:
        return {
          success: false,
          error: `Unknown action: ${options.action}`
        };
    }
    
  } catch (error) {
    logError('AgentsCommand', 'Failed to execute agents command', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute agents command'
    };
  }
}