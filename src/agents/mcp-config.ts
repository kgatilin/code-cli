/**
 * MCP configuration management for agent proxy server
 * 
 * Loads and validates MCP server configuration from ~/.code-cli/mcp.json file,
 * providing graceful fallback when no configuration exists.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { MCPConfig, MCPServerConfig } from '../types.js';

/** Default empty configuration when no MCP config file exists */
const DEFAULT_CONFIG: MCPConfig = {
  mcpServers: {},
};

/**
 * Validates MCP server configuration structure
 * @param serverConfig - Server configuration to validate
 * @param serverName - Name of server for error messages
 * @throws Error if configuration is invalid
 */
function validateServerConfig(serverConfig: unknown, serverName: string): MCPServerConfig {
  if (!serverConfig || typeof serverConfig !== 'object') {
    throw new Error(`Invalid MCP server configuration for '${serverName}': must be an object`);
  }

  const config = serverConfig as Record<string, unknown>;

  if (!config.command || typeof config.command !== 'string') {
    throw new Error(`Invalid MCP server configuration for '${serverName}': 'command' must be a non-empty string`);
  }

  if (!config.args || !Array.isArray(config.args)) {
    throw new Error(`Invalid MCP server configuration for '${serverName}': 'args' must be an array`);
  }

  // Validate all args are strings
  for (let i = 0; i < config.args.length; i++) {
    if (typeof config.args[i] !== 'string') {
      throw new Error(`Invalid MCP server configuration for '${serverName}': all 'args' must be strings`);
    }
  }

  return {
    command: config.command,
    args: config.args as string[],
  };
}

/**
 * Validates and normalizes MCP configuration structure
 * @param rawConfig - Raw configuration object from JSON
 * @returns Validated MCP configuration
 * @throws Error if configuration is invalid
 */
function validateMCPConfig(rawConfig: unknown): MCPConfig {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Invalid MCP configuration: must be an object');
  }

  const config = rawConfig as Record<string, unknown>;

  if (!config.mcpServers || typeof config.mcpServers !== 'object') {
    throw new Error("Invalid MCP configuration: 'mcpServers' must be an object");
  }

  const mcpServers: Record<string, MCPServerConfig> = {};
  const servers = config.mcpServers as Record<string, unknown>;

  // Validate each server configuration
  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (!serverName || typeof serverName !== 'string') {
      throw new Error('Invalid MCP configuration: server names must be non-empty strings');
    }

    mcpServers[serverName] = validateServerConfig(serverConfig, serverName);
  }

  return { mcpServers };
}

/**
 * Loads MCP configuration from ~/.code-cli/mcp.json file
 * @returns MCP configuration with graceful fallback to empty config
 * @throws Error only if configuration file exists but is malformed
 */
export function loadMCPConfig(): MCPConfig {
  const configPath = getMCPConfigPath();
  
  // Graceful fallback when no config file exists
  if (!existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }
  
  try {
    const content = readFileSync(configPath, 'utf8');
    const rawConfig = JSON.parse(content);
    
    return validateMCPConfig(rawConfig);
    
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in MCP configuration file: ${configPath}\n${error.message}`);
    }
    
    if (error instanceof Error) {
      throw new Error(`Failed to load MCP configuration: ${error.message}`);
    }
    
    throw new Error('Failed to load MCP configuration: Unknown error');
  }
}

/**
 * Gets the path to the MCP configuration file
 * @returns Path to ~/.code-cli/mcp.json file
 */
export function getMCPConfigPath(): string {
  return join(homedir(), '.code-cli', 'mcp.json');
}

/**
 * Checks if MCP configuration exists
 * @returns True if ~/.code-cli/mcp.json exists
 */
export function mcpConfigExists(): boolean {
  return existsSync(getMCPConfigPath());
}