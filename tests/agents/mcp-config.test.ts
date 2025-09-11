import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups 
} from '../utils/index.js';

// Create safe test environment
const testEnv = new TestEnvironment({ debug: false });
let testHomeDir: string;

// Mock the os module to use safe test directory
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    homedir: () => testHomeDir
  };
});

// Import after mocking
import { loadMCPConfig, getMCPConfigPath, mcpConfigExists } from '../../src/agents/mcp-config.js';

describe('agents/mcp-config', () => {
  let testCodeCliDir: string;
  let testMCPFile: string;

  beforeEach(() => {
    // Create safe test directory
    testHomeDir = testEnv.createSafeTestDir();
    testCodeCliDir = join(testHomeDir, '.code-cli');
    testMCPFile = join(testCodeCliDir, 'mcp.json');
    
    // Create test directory structure
    if (!existsSync(testCodeCliDir)) {
      mkdirSync(testCodeCliDir, { recursive: true });
    }

    // Register cleanup for this test
    registerCleanup(async () => {
      // Clean up test files safely
      testEnv.cleanupSafely(testHomeDir);
    });
  });

  afterEach(async () => {
    // Execute all registered cleanups
    await executeAllCleanups();
  });

  describe('getMCPConfigPath', () => {
    it('should return the correct config file path', () => {
      const expectedPath = join(testHomeDir, '.code-cli', 'mcp.json');
      expect(getMCPConfigPath()).toBe(expectedPath);
    });
  });

  describe('mcpConfigExists', () => {
    it('should return false when config file does not exist', () => {
      expect(mcpConfigExists()).toBe(false);
    });

    it('should return true when config file exists', () => {
      const validConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path']
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(validConfig, null, 2));
      expect(mcpConfigExists()).toBe(true);
    });
  });

  describe('loadMCPConfig', () => {
    it('should return empty config when no file exists', () => {
      const config = loadMCPConfig();
      
      expect(config).toEqual({
        mcpServers: {}
      });
    });

    it('should load valid configuration with multiple servers', () => {
      const validConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/path1', '/path2']
          },
          outlook: {
            command: '/usr/local/bin/outlook-mcp',
            args: ['config.yaml', '.env']
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(validConfig, null, 2));
      
      const config = loadMCPConfig();
      
      expect(config.mcpServers.filesystem.command).toBe('npx');
      expect(config.mcpServers.filesystem.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem', '/path1', '/path2']);
      expect(config.mcpServers.outlook.command).toBe('/usr/local/bin/outlook-mcp');
      expect(config.mcpServers.outlook.args).toEqual(['config.yaml', '.env']);
    });

    it('should load configuration with empty mcpServers object', () => {
      const emptyConfig = {
        mcpServers: {}
      };
      
      writeFileSync(testMCPFile, JSON.stringify(emptyConfig, null, 2));
      
      const config = loadMCPConfig();
      
      expect(config.mcpServers).toEqual({});
    });

    it('should throw error for invalid JSON', () => {
      writeFileSync(testMCPFile, '{ invalid json }');
      
      expect(() => loadMCPConfig()).toThrow(/Invalid JSON in MCP configuration file/);
    });

    it('should throw error when root is not an object', () => {
      writeFileSync(testMCPFile, JSON.stringify('not an object'));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP configuration: must be an object/);
    });

    it('should throw error when mcpServers is missing', () => {
      const invalidConfig = {
        someOtherField: 'value'
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP configuration: 'mcpServers' must be an object/);
    });

    it('should throw error when mcpServers is not an object', () => {
      const invalidConfig = {
        mcpServers: 'not an object'
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP configuration: 'mcpServers' must be an object/);
    });

    it('should throw error when server configuration is not an object', () => {
      const invalidConfig = {
        mcpServers: {
          filesystem: 'not an object'
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP server configuration for 'filesystem': must be an object/);
    });

    it('should throw error when server command is missing', () => {
      const invalidConfig = {
        mcpServers: {
          filesystem: {
            args: ['arg1']
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP server configuration for 'filesystem': 'command' must be a non-empty string/);
    });

    it('should throw error when server command is not a string', () => {
      const invalidConfig = {
        mcpServers: {
          filesystem: {
            command: 123,
            args: ['arg1']
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP server configuration for 'filesystem': 'command' must be a non-empty string/);
    });

    it('should throw error when server args is missing', () => {
      const invalidConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx'
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP server configuration for 'filesystem': 'args' must be an array/);
    });

    it('should throw error when server args is not an array', () => {
      const invalidConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: 'not an array'
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP server configuration for 'filesystem': 'args' must be an array/);
    });

    it('should throw error when server args contains non-string', () => {
      const invalidConfig = {
        mcpServers: {
          filesystem: {
            command: 'npx',
            args: ['valid-arg', 123, 'another-valid-arg']
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(invalidConfig));
      
      expect(() => loadMCPConfig()).toThrow(/Invalid MCP server configuration for 'filesystem': all 'args' must be strings/);
    });

    it('should handle empty args array', () => {
      const validConfig = {
        mcpServers: {
          filesystem: {
            command: 'some-command',
            args: []
          }
        }
      };
      
      writeFileSync(testMCPFile, JSON.stringify(validConfig));
      
      const config = loadMCPConfig();
      
      expect(config.mcpServers.filesystem.args).toEqual([]);
    });

    it('should handle configuration from example in task description', () => {
      const exampleConfig = {
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
      
      writeFileSync(testMCPFile, JSON.stringify(exampleConfig, null, 2));
      
      const config = loadMCPConfig();
      
      expect(config.mcpServers['outlook-mcp'].command).toBe("/Users/kgatilin/Projects/outlookmcp/bin/outlookmcp");
      expect(config.mcpServers['outlook-mcp'].args).toEqual([
        "/Users/kgatilin/Projects/outlookmcp/config.yaml",
        "/Users/kgatilin/Projects/outlookmcp/.env"
      ]);
      expect(config.mcpServers.filesystem.command).toBe("npx");
      expect(config.mcpServers.filesystem.args).toEqual([
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/kgatilin/Documents/Obsidian/SmartNotes",
        "/Users/kgatilin/PersonalProjects"
      ]);
    });
  });
});