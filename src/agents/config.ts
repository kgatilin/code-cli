/**
 * Environment configuration management for agent proxy server
 * 
 * Loads and validates configuration from ~/.code-cli/.env file,
 * providing defaults for optional settings and type-safe access.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentConfig, Config } from '../types.js';
import { processIncludes } from '../prompt-loader.js';

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
  const config: AgentConfig = {
    VERTEX_AI_PROJECT: vars.VERTEX_AI_PROJECT!,
    VERTEX_AI_LOCATION: vars.VERTEX_AI_LOCATION!,
    VERTEX_AI_MODEL: vars.VERTEX_AI_MODEL!,
    PROXY_PORT: vars.PROXY_PORT ? parseInt(vars.PROXY_PORT, 10) : DEFAULT_CONFIG.PROXY_PORT!,
    DEBUG_MODE: vars.DEBUG_MODE ? vars.DEBUG_MODE.toLowerCase() === 'true' : DEFAULT_CONFIG.DEBUG_MODE!,
  };

  // Handle optional prompt configuration fields
  if (vars.PROMPTS_BASE_PATH) {
    config.PROMPTS_BASE_PATH = vars.PROMPTS_BASE_PATH.trim();
  }
  
  if (vars.SYSTEM_PROMPT_PATH) {
    config.SYSTEM_PROMPT_PATH = vars.SYSTEM_PROMPT_PATH.trim();
  }

  return config;
}

/**
 * Validates prompt configuration fields
 * @param config - Agent configuration to validate
 * @throws Error if prompt configuration is invalid
 */
function validatePromptConfig(config: AgentConfig): void {
  // If PROMPTS_BASE_PATH is provided, validate it
  if (config.PROMPTS_BASE_PATH) {
    // Check if SYSTEM_PROMPT_PATH is also provided
    if (!config.SYSTEM_PROMPT_PATH) {
      throw new Error('SYSTEM_PROMPT_PATH is required when PROMPTS_BASE_PATH is provided');
    }
    
    // Check if PROMPTS_BASE_PATH exists
    if (!existsSync(config.PROMPTS_BASE_PATH)) {
      throw new Error(`PROMPTS_BASE_PATH does not exist: ${config.PROMPTS_BASE_PATH}`);
    }
  }
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
      '  DEBUG_MODE=false\n' +
      'Optional prompt composition variables:\n' +
      '  PROMPTS_BASE_PATH=/path/to/prompts\n' +
      '  SYSTEM_PROMPT_PATH=base/system.md'
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
    
    // Validate prompt configuration fields
    validatePromptConfig(config);
    
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

/**
 * Loads the base system prompt that's always included
 * Uses the existing prompt-loader to handle includes and processing
 * @param config - Agent configuration
 * @returns Processed system prompt content
 * @throws Error if system prompt cannot be loaded or prompt configuration is missing
 */
export function loadBaseSystemPrompt(config: AgentConfig): string {
  // Check if prompt configuration is available
  if (!config.PROMPTS_BASE_PATH || !config.SYSTEM_PROMPT_PATH) {
    throw new Error('Prompt configuration is not available. PROMPTS_BASE_PATH and SYSTEM_PROMPT_PATH must be configured.');
  }

  try {
    // Construct full path to system prompt
    const systemPromptFullPath = join(config.PROMPTS_BASE_PATH, config.SYSTEM_PROMPT_PATH);
    
    if (!existsSync(systemPromptFullPath)) {
      throw new Error(`System prompt file not found: ${systemPromptFullPath}`);
    }
    
    // Load raw content
    const rawContent = readFileSync(systemPromptFullPath, 'utf-8');
    
    // Create a minimal config object for processIncludes
    // This allows the system prompt to use includes relative to the base path
    const promptLoaderConfig: Config = {
      promptsPath: config.PROMPTS_BASE_PATH,
      logsPath: '',
      taskPath: '',
      templatesPath: join(config.PROMPTS_BASE_PATH, 'templates'),
      snippetsPath: join(config.PROMPTS_BASE_PATH, 'snippets'),
      reviewPattern: '',
      reviewSearchPaths: [],
      reviewSearchExtensions: [],
      reviewSearchExcludes: [],
      modelMappings: {},
      includePaths: {
        prompts: config.PROMPTS_BASE_PATH,
        templates: join(config.PROMPTS_BASE_PATH, 'templates'),
        snippets: join(config.PROMPTS_BASE_PATH, 'snippets')
      },
      globalPaths: {
        prompts: config.PROMPTS_BASE_PATH,
        templates: join(config.PROMPTS_BASE_PATH, 'templates'),
        snippets: join(config.PROMPTS_BASE_PATH, 'snippets')
      }
    };
    
    // Process includes in the system prompt
    const processedContent = processIncludes(
      rawContent, 
      promptLoaderConfig, 
      new Set<string>(),
      new Set<string>()
    );
    
    // Strip frontmatter if present (system prompts shouldn't have metadata
    // but we want to be robust)
    const frontmatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/;
    const match = processedContent.match(frontmatterRegex);
    
    if (match && match[1] !== undefined) {
      return match[1]; // Return content without frontmatter
    }
    
    return processedContent;
    
  } catch (error) {
    throw new Error(`Failed to load base system prompt: ${error instanceof Error ? error.message : String(error)}`);
  }
}