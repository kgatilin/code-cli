/**
 * Environment configuration management for agent proxy server
 * 
 * Loads and validates configuration from ~/.code-cli/.env file,
 * providing defaults for optional settings and type-safe access.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentConfig } from '../types.js';

/** Default configuration values */
const DEFAULT_CONFIG: Partial<AgentConfig> = {
  PROXY_PORT: 11434,
  DEBUG_MODE: false,
};

/** Required environment variables */
const REQUIRED_VARS = [
  'VERTEX_AI_PROJECT',
  'VERTEX_AI_LOCATION', 
  'VERTEX_AI_MODEL'
] as const;

/**
 * Parses environment variables from .env file content
 * @param content - Raw .env file content
 * @returns Object with parsed key-value pairs
 */
function parseEnvContent(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE format
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    
    const key = trimmed.substring(0, equalIndex).trim();
    const value = trimmed.substring(equalIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      vars[key] = value.slice(1, -1);
    } else {
      vars[key] = value;
    }
  }
  
  return vars;
}

/**
 * Validates that all required environment variables are present
 * @param vars - Environment variables object
 * @throws Error if required variables are missing
 */
function validateRequiredVars(vars: Record<string, string>): void {
  const missing = REQUIRED_VARS.filter(key => !vars[key] || vars[key].trim() === '');
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in ~/.code-cli/.env: ${missing.join(', ')}\n` +
      'Required variables:\n' +
      '  VERTEX_AI_PROJECT: Google Cloud project ID\n' +
      '  VERTEX_AI_LOCATION: Vertex AI region (e.g., us-central1)\n' +
      '  VERTEX_AI_MODEL: Model name (e.g., gemini-2.0-flash-exp)'
    );
  }
}

/**
 * Converts string values to appropriate types
 * @param vars - Raw environment variables
 * @returns Typed configuration object
 */
function convertTypes(vars: Record<string, string>): AgentConfig {
  // At this point, validateRequiredVars has already ensured these values exist
  return {
    VERTEX_AI_PROJECT: vars.VERTEX_AI_PROJECT!,
    VERTEX_AI_LOCATION: vars.VERTEX_AI_LOCATION!,
    VERTEX_AI_MODEL: vars.VERTEX_AI_MODEL!,
    PROXY_PORT: vars.PROXY_PORT ? parseInt(vars.PROXY_PORT, 10) : DEFAULT_CONFIG.PROXY_PORT!,
    DEBUG_MODE: vars.DEBUG_MODE ? vars.DEBUG_MODE.toLowerCase() === 'true' : DEFAULT_CONFIG.DEBUG_MODE!,
  };
}

/**
 * Loads agent configuration from ~/.code-cli/.env file
 * @returns Validated agent configuration
 * @throws Error if configuration file doesn't exist or is invalid
 */
export function loadAgentConfig(): AgentConfig {
  const envPath = join(homedir(), '.code-cli', '.env');
  
  if (!existsSync(envPath)) {
    throw new Error(
      `Configuration file not found: ${envPath}\n` +
      'Please create ~/.code-cli/.env with the following required variables:\n' +
      '  VERTEX_AI_PROJECT=your-gcp-project-id\n' +
      '  VERTEX_AI_LOCATION=us-central1\n' +
      '  VERTEX_AI_MODEL=gemini-2.0-flash-exp\n' +
      'Optional variables:\n' +
      '  PROXY_PORT=11434\n' +
      '  DEBUG_MODE=false'
    );
  }
  
  try {
    const content = readFileSync(envPath, 'utf8');
    const vars = parseEnvContent(content);
    
    // Validate required variables
    validateRequiredVars(vars);
    
    // Convert to typed config
    const config = convertTypes(vars);
    
    // Validate port number
    if (isNaN(config.PROXY_PORT) || config.PROXY_PORT < 1 || config.PROXY_PORT > 65535) {
      throw new Error(`Invalid PROXY_PORT: ${vars.PROXY_PORT}. Must be a number between 1 and 65535.`);
    }
    
    return config;
    
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load agent configuration: ${error.message}`);
    }
    throw new Error('Failed to load agent configuration: Unknown error');
  }
}

/**
 * Gets the path to the agent configuration file
 * @returns Path to ~/.code-cli/.env file
 */
export function getAgentConfigPath(): string {
  return join(homedir(), '.code-cli', '.env');
}