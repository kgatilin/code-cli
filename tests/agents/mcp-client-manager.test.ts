import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { MCPConfig } from '../../src/types.js';

// Mock the logger module

// Mock the MCP SDK modules
const mockClient = {
  connect: vi.fn(),
  close: vi.fn()
};

const mockTransport = {
  start: vi.fn(),
  close: vi.fn()
};

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn().mockImplementation(() => mockClient)
}));

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => mockTransport)
}));

// Mock the logger module
vi.mock('../../src/agents/logger.js', () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn()
}));

// Import after mocking
import { MCPClientManager } from '../../src/agents/mcp-client-manager.js';
import { Client as ClientConstructor } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport as TransportConstructor } from '@modelcontextprotocol/sdk/client/stdio.js';
import { logDebug, logInfo, logWarning, logError } from '../../src/agents/logger.js';

describe('agents/mcp-client-manager', () => {
  let clientManager: MCPClientManager;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create a fresh client manager instance
    clientManager = new MCPClientManager();
  });

  afterEach(async () => {
    // Clean up by shutting down the client manager
    if (!clientManager.isManagerShutdown()) {
      await clientManager.shutdown();
    }
  });

  describe('Constructor', () => {
    it('should create manager with empty client map', () => {
      expect(clientManager.getConnectedCount()).toBe(0);
      expect(clientManager.hasConnectedClients()).toBe(false);
      expect(clientManager.isManagerShutdown()).toBe(false);
    });
  });

  describe('createClients', () => {
    it('should return empty array for empty configuration', async () => {
      const config: MCPConfig = { mcpServers: {} };
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toEqual([]);
      expect(clientManager.getConnectedCount()).toBe(0);
    });

    it('should create client for single server configuration', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path']
          }
        }
      };

      mockClient.connect.mockResolvedValueOnce(undefined);
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(1);
      expect(clientManager.getConnectedCount()).toBe(1);
      expect(clientManager.hasConnectedClients()).toBe(true);
      
      // Verify SDK classes were called correctly
      expect(TransportConstructor).toHaveBeenCalledWith({
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/path']
      });
      expect(ClientConstructor).toHaveBeenCalledWith({
        name: 'claude-code-cli-filesystem',
        version: '1.0.0'
      }, {
        capabilities: {
          resources: {},
          tools: {}
        }
      });
      expect(mockClient.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should create clients for multiple server configurations', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path1']
          },
          outlook: {
            command: '/bin/outlook-mcp',
            args: ['config.yaml', '.env']
          }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(2);
      expect(clientManager.getConnectedCount()).toBe(2);
      expect(clientManager.hasConnectedClients()).toBe(true);
      
      expect(TransportConstructor).toHaveBeenCalledTimes(2);
      expect(ClientConstructor).toHaveBeenCalledTimes(2);
      expect(mockClient.connect).toHaveBeenCalledTimes(2);
    });

    it('should handle connection failures gracefully', async () => {
      const config: MCPConfig = {
        mcpServers: {
          failing: {
            command: 'nonexistent-command',
            args: ['arg1']
          },
          working: {
            command: 'working-command',
            args: ['arg1']
          }
        }
      };

      // First connection fails, second succeeds
      mockClient.connect
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(undefined);
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(1); // Only successful connection
      expect(clientManager.getConnectedCount()).toBe(1);
    });

    it('should handle all connections failing', async () => {
      const config: MCPConfig = {
        mcpServers: {
          failing1: {
            command: 'fail1',
            args: []
          },
          failing2: {
            command: 'fail2', 
            args: []
          }
        }
      };

      mockClient.connect.mockRejectedValue(new Error('All connections fail'));
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(0);
      expect(clientManager.getConnectedCount()).toBe(0);
      expect(clientManager.hasConnectedClients()).toBe(false);
    });

    it('should return empty array when manager is shutdown', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem']
          }
        }
      };

      await clientManager.shutdown();
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toEqual([]);
      expect(mockClient.connect).not.toHaveBeenCalled();
    });
  });

  describe('getClients', () => {
    it('should return array of connected clients', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem']
          }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      const clients = clientManager.getClients();
      
      expect(clients).toHaveLength(1);
      expect(clients[0]).toBe(mockClient);
    });

    it('should return empty array when shutdown', async () => {
      await clientManager.shutdown();
      
      const clients = clientManager.getClients();
      
      expect(clients).toEqual([]);
    });
  });

  describe('getClient', () => {
    it('should return specific client by server name', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem']
          }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      
      const client = clientManager.getClient('filesystem');
      
      expect(client).toBe(mockClient);
    });

    it('should return undefined for nonexistent server', async () => {
      const client = clientManager.getClient('nonexistent');
      
      expect(client).toBeUndefined();
    });

    it('should return undefined when shutdown', async () => {
      await clientManager.shutdown();
      
      const client = clientManager.getClient('filesystem');
      
      expect(client).toBeUndefined();
    });
  });

  describe('getConnectedCount', () => {
    it('should return correct count after creating clients', async () => {
      const config: MCPConfig = {
        mcpServers: {
          server1: { command: 'cmd1', args: [] },
          server2: { command: 'cmd2', args: [] },
          server3: { command: 'cmd3', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      
      expect(clientManager.getConnectedCount()).toBe(3);
    });

    it('should return zero after shutdown', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'cmd', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      expect(clientManager.getConnectedCount()).toBe(1);
      
      await clientManager.shutdown();
      expect(clientManager.getConnectedCount()).toBe(0);
    });
  });

  describe('hasConnectedClients', () => {
    it('should return true when clients are connected', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'cmd', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      
      expect(clientManager.hasConnectedClients()).toBe(true);
    });

    it('should return false when no clients are connected', () => {
      expect(clientManager.hasConnectedClients()).toBe(false);
    });

    it('should return false after shutdown', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'cmd', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      await clientManager.shutdown();
      
      expect(clientManager.hasConnectedClients()).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should disconnect all clients', async () => {
      const config: MCPConfig = {
        mcpServers: {
          server1: { command: 'cmd1', args: [] },
          server2: { command: 'cmd2', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.close.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      expect(clientManager.getConnectedCount()).toBe(2);
      
      await clientManager.shutdown();
      
      expect(mockClient.close).toHaveBeenCalledTimes(2);
      expect(clientManager.getConnectedCount()).toBe(0);
      expect(clientManager.isManagerShutdown()).toBe(true);
    });

    it('should handle client disconnect failures gracefully', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'cmd', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.close.mockRejectedValue(new Error('Disconnect failed'));
      
      await clientManager.createClients(config);
      
      // Should not throw even if disconnect fails
      await expect(clientManager.shutdown()).resolves.toBeUndefined();
      
      expect(clientManager.getConnectedCount()).toBe(0);
      expect(clientManager.isManagerShutdown()).toBe(true);
    });

    it('should be idempotent', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'cmd', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.close.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      
      // First shutdown
      await clientManager.shutdown();
      expect(mockClient.close).toHaveBeenCalledTimes(1);
      
      // Second shutdown - should not call close again
      await clientManager.shutdown();
      expect(mockClient.close).toHaveBeenCalledTimes(1);
      
      expect(clientManager.isManagerShutdown()).toBe(true);
    });

    it('should clear all state', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: { command: 'cmd', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      mockClient.close.mockResolvedValue(undefined);
      
      await clientManager.createClients(config);
      
      await clientManager.shutdown();
      
      expect(clientManager.getConnectedCount()).toBe(0);
      expect(clientManager.hasConnectedClients()).toBe(false);
      expect(clientManager.getClients()).toEqual([]);
      expect(clientManager.getClient('filesystem')).toBeUndefined();
    });
  });

  describe('isManagerShutdown', () => {
    it('should return false initially', () => {
      expect(clientManager.isManagerShutdown()).toBe(false);
    });

    it('should return true after shutdown', async () => {
      await clientManager.shutdown();
      
      expect(clientManager.isManagerShutdown()).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle server names with special characters', async () => {
      const config: MCPConfig = {
        mcpServers: {
          'server-with-dashes': { command: 'cmd1', args: [] },
          'server_with_underscores': { command: 'cmd2', args: [] },
          'server.with.dots': { command: 'cmd3', args: [] }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(3);
      expect(clientManager.getClient('server-with-dashes')).toBeDefined();
      expect(clientManager.getClient('server_with_underscores')).toBeDefined();
      expect(clientManager.getClient('server.with.dots')).toBeDefined();
    });

    it('should handle empty args array', async () => {
      const config: MCPConfig = {
        mcpServers: {
          filesystem: {
            command: 'some-command',
            args: []
          }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(1);
      expect(TransportConstructor).toHaveBeenCalledWith({
        command: 'some-command',
        args: []
      });
    });

    it('should handle configuration from task example', async () => {
      const config: MCPConfig = {
        mcpServers: {
          "outlook-mcp": {
            command: "/Users/kgatilin/Projects/outlookmcp/bin/outlookmcp",
            args: [
              "/Users/kgatilin/Projects/outlookmcp/config.yaml",
              "/Users/kgatilin/Projects/outlookmcp/.env"
            ]
          },
          filesystem: {
            command: "npx",
            args: [
              "-y",
              "@modelcontextprotocol/server-filesystem",
              "/Users/kgatilin/Documents/Obsidian/SmartNotes",
              "/Users/kgatilin/PersonalProjects"
            ]
          }
        }
      };

      mockClient.connect.mockResolvedValue(undefined);
      
      const clients = await clientManager.createClients(config);
      
      expect(clients).toHaveLength(2);
      expect(clientManager.getClient('outlook-mcp')).toBeDefined();
      expect(clientManager.getClient('filesystem')).toBeDefined();
    });
  });

  describe('Phase 1 - MCP Server Configuration Logging', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset specific logger mocks
      vi.mocked(logDebug).mockClear();
      vi.mocked(logInfo).mockClear();
      vi.mocked(logWarning).mockClear();
      vi.mocked(logError).mockClear();
      
      clientManager = new MCPClientManager();
    });

    describe('Server Configuration Logging', () => {
      it('should log full server configuration during connection', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files']
            }
          }
        };

        mockClient.connect.mockResolvedValue(undefined);
        
        await clientManager.createClients(config);
        
        // Should log detailed configuration
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/files']
          }
        );
      });

      it('should log configuration for multiple servers', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/docs']
            },
            outlook: {
              command: '/bin/outlook-mcp',
              args: ['config.yaml', '.env']
            }
          }
        };

        mockClient.connect.mockResolvedValue(undefined);
        
        await clientManager.createClients(config);
        
        // Should log configuration for filesystem server
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/home/user/docs']
          }
        );
        
        // Should log configuration for outlook server
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'outlook',
            command: '/bin/outlook-mcp',
            args: ['config.yaml', '.env']
          }
        );
      });

      it('should log configuration with complex arguments', async () => {
        const config: MCPConfig = {
          mcpServers: {
            'complex-server': {
              command: 'node',
              args: [
                'server.js',
                '--port', '3000',
                '--config', '/path/with spaces/config.json',
                '--env', 'development'
              ]
            }
          }
        };

        mockClient.connect.mockResolvedValue(undefined);
        
        await clientManager.createClients(config);
        
        // Should log full complex configuration
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'complex-server',
            command: 'node',
            args: [
              'server.js',
              '--port', '3000',
              '--config', '/path/with spaces/config.json',
              '--env', 'development'
            ]
          }
        );
      });

      it('should log configuration with empty args', async () => {
        const config: MCPConfig = {
          mcpServers: {
            'simple-server': {
              command: 'simple-mcp-server',
              args: []
            }
          }
        };

        mockClient.connect.mockResolvedValue(undefined);
        
        await clientManager.createClients(config);
        
        // Should log configuration with empty args
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'simple-server',
            command: 'simple-mcp-server',
            args: []
          }
        );
      });

      it('should log configuration for servers that fail to connect', async () => {
        const config: MCPConfig = {
          mcpServers: {
            'failing-server': {
              command: 'nonexistent-command',
              args: ['arg1', 'arg2']
            }
          }
        };

        mockClient.connect.mockRejectedValue(new Error('Connection failed'));
        
        await clientManager.createClients(config);
        
        // Should still log configuration even if connection fails
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'failing-server',
            command: 'nonexistent-command',
            args: ['arg1', 'arg2']
          }
        );
        
        // Should also log the error
        expect(vi.mocked(logError)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Failed to establish MCP server connection',
          expect.objectContaining({
            serverName: 'failing-server',
            command: 'nonexistent-command',
            error: 'Connection failed'
          })
        );
      });

      it('should log configuration from real-world filesystem example', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: [
                '-y',
                '@modelcontextprotocol/server-filesystem',
                '/Users/kgatilin/Documents/Obsidian/SmartNotes',
                '/Users/kgatilin/PersonalProjects'
              ]
            }
          }
        };

        mockClient.connect.mockResolvedValue(undefined);
        
        await clientManager.createClients(config);
        
        // Should log the real-world configuration
        expect(vi.mocked(logInfo)).toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          {
            serverName: 'filesystem',
            command: 'npx',
            args: [
              '-y',
              '@modelcontextprotocol/server-filesystem',
              '/Users/kgatilin/Documents/Obsidian/SmartNotes',
              '/Users/kgatilin/PersonalProjects'
            ]
          }
        );
      });

      it('should not log configuration when manager is shutdown', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem']
            }
          }
        };

        await clientManager.shutdown();
        
        await clientManager.createClients(config);
        
        // Should not log configuration when shutdown
        expect(vi.mocked(logInfo)).not.toHaveBeenCalledWith(
          'MCPClientManager',
          'Connecting with configuration',
          expect.any(Object)
        );
      });
    });

    describe('Configuration Logging Integration', () => {
      it('should log configuration before connection attempts', async () => {
        const config: MCPConfig = {
          mcpServers: {
            filesystem: {
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-filesystem']
            }
          }
        };

        // Track call order
        const callOrder: string[] = [];
        
        vi.mocked(logInfo).mockImplementation((module, message) => {
          callOrder.push(`${module}:${message}`);
        });
        
        mockClient.connect.mockImplementation(async () => {
          callOrder.push('connect');
          return undefined;
        });
        
        await clientManager.createClients(config);
        
        // Configuration logging should happen before connection
        expect(callOrder).toEqual([
          'MCPClientManager:Creating MCP clients',
          'MCPClientManager:Connecting with configuration',
          'connect',
          'MCPClientManager:Successfully connected to MCP server',
          'MCPClientManager:MCP client creation completed'
        ]);
      });
    });
  });
});