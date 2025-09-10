/**
 * MCP client lifecycle management for agent proxy server
 * 
 * Manages MCP client connections using the MCP SDK, handling client lifecycle
 * operations including connection, disconnection, and cleanup.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPConfig, MCPServerConfig } from '../types.js';
import { logDebug, logInfo, logWarning, logError } from './logger.js';

/**
 * MCP Client Manager handles lifecycle of MCP client connections
 * 
 * Creates and manages MCP clients using the MCP SDK's Client and StdioClientTransport.
 * Handles connection establishment, cleanup, and error recovery.
 */
export class MCPClientManager {
  /** Map of server name to connected MCP clients */
  private clients: Map<string, Client> = new Map();

  /** Flag to track if manager has been shutdown */
  private isShutdown = false;

  /**
   * Creates and connects MCP clients based on configuration
   * @param config MCP configuration containing server definitions
   * @returns Array of successfully connected clients
   */
  async createClients(config: MCPConfig): Promise<Client[]> {
    if (this.isShutdown) {
      logWarning('MCPClientManager', 'Attempted to create clients on shutdown manager');
      return [];
    }

    logInfo('MCPClientManager', 'Creating MCP clients', { 
      serverCount: Object.keys(config.mcpServers).length 
    });

    const connectedClients: Client[] = [];
    const connectionPromises: Promise<void>[] = [];

    // Create connection promises for all servers
    for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
      const connectionPromise = this.connectToServer(serverName, serverConfig)
        .then((client) => {
          if (client) {
            connectedClients.push(client);
            logInfo('MCPClientManager', 'Successfully connected to MCP server', { 
              serverName, 
              command: serverConfig.command 
            });
          }
        })
        .catch((error) => {
          logError('MCPClientManager', 'Failed to connect to MCP server', { 
            serverName, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        });

      connectionPromises.push(connectionPromise);
    }

    // Wait for all connection attempts to complete
    await Promise.allSettled(connectionPromises);

    logInfo('MCPClientManager', 'MCP client creation completed', { 
      totalServers: Object.keys(config.mcpServers).length,
      connectedClients: connectedClients.length,
      failedConnections: Object.keys(config.mcpServers).length - connectedClients.length
    });

    return connectedClients;
  }

  /**
   * Establishes connection to a single MCP server
   * @param serverName Name of the server for logging
   * @param serverConfig Configuration for the MCP server
   * @returns Connected client or null if connection failed
   */
  private async connectToServer(serverName: string, serverConfig: MCPServerConfig): Promise<Client | null> {
    if (this.isShutdown) {
      logWarning('MCPClientManager', 'Attempted to connect to server on shutdown manager', { serverName });
      return null;
    }

    logDebug('MCPClientManager', 'Connecting to MCP server', { 
      serverName, 
      command: serverConfig.command, 
      args: serverConfig.args 
    });

    try {
      // Create transport using SDK's StdioClientTransport
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args,
      });

      // Create client using SDK's Client
      const client = new Client({
        name: `claude-code-cli-${serverName}`,
        version: '1.0.0',
      }, {
        capabilities: {
          resources: {},
          tools: {},
        }
      });

      // Connect client to transport
      await client.connect(transport);

      // Store client for lifecycle management
      this.clients.set(serverName, client);

      logDebug('MCPClientManager', 'MCP server connection established', { 
        serverName
      });

      return client;

    } catch (error) {
      logError('MCPClientManager', 'Failed to establish MCP server connection', { 
        serverName, 
        command: serverConfig.command,
        error: error instanceof Error ? error.message : 'Unknown error' 
      });

      return null;
    }
  }

  /**
   * Gets all currently connected clients
   * @returns Array of connected MCP clients
   */
  getClients(): Client[] {
    if (this.isShutdown) {
      logWarning('MCPClientManager', 'Attempted to get clients on shutdown manager');
      return [];
    }

    return Array.from(this.clients.values());
  }

  /**
   * Gets a specific client by server name
   * @param serverName Name of the MCP server
   * @returns Client if connected, undefined otherwise
   */
  getClient(serverName: string): Client | undefined {
    if (this.isShutdown) {
      logWarning('MCPClientManager', 'Attempted to get client on shutdown manager', { serverName });
      return undefined;
    }

    return this.clients.get(serverName);
  }

  /**
   * Gets the number of connected clients
   * @returns Number of currently connected clients
   */
  getConnectedCount(): number {
    return this.clients.size;
  }

  /**
   * Checks if manager has any connected clients
   * @returns True if any clients are connected
   */
  hasConnectedClients(): boolean {
    return this.clients.size > 0;
  }

  /**
   * Disconnects and cleans up all MCP clients
   * 
   * Gracefully shuts down all client connections and clears internal state.
   * This method is idempotent and safe to call multiple times.
   */
  async shutdown(): Promise<void> {
    if (this.isShutdown) {
      logDebug('MCPClientManager', 'Manager already shutdown, skipping');
      return;
    }

    logInfo('MCPClientManager', 'Shutting down MCP clients', { 
      clientCount: this.clients.size 
    });

    const shutdownPromises: Promise<void>[] = [];

    // Disconnect all clients
    for (const [serverName, client] of this.clients.entries()) {
      const shutdownPromise = this.disconnectClient(serverName, client);
      shutdownPromises.push(shutdownPromise);
    }

    // Wait for all disconnections to complete
    await Promise.allSettled(shutdownPromises);

    // Clear client map and mark as shutdown
    this.clients.clear();
    this.isShutdown = true;

    logInfo('MCPClientManager', 'MCP clients shutdown completed');
  }

  /**
   * Disconnects a single MCP client
   * @param serverName Name of the server for logging
   * @param client MCP client to disconnect
   */
  private async disconnectClient(serverName: string, client: Client): Promise<void> {
    try {
      logDebug('MCPClientManager', 'Disconnecting MCP client', { serverName });
      
      await client.close();
      
      logDebug('MCPClientManager', 'MCP client disconnected successfully', { serverName });
    } catch (error) {
      logWarning('MCPClientManager', 'Error disconnecting MCP client', { 
        serverName, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Continue with shutdown even if individual client disconnect fails
    }
  }

  /**
   * Checks if the manager has been shutdown
   * @returns True if manager is shutdown
   */
  isManagerShutdown(): boolean {
    return this.isShutdown;
  }
}