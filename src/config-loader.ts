/**
 * Configuration loading and validation
 * 
 * Provides functions to load configuration from .cc.yaml files or use defaults.
 * Supports both .cc.yaml and .cc.yml extensions with graceful fallbacks.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { load as yamlLoad } from 'js-yaml';
import type { Config } from './types.js';
import { getGlobalResourcePath } from './global-resources.js';

/**
 * Returns the default configuration values
 */
export function getDefaultConfig(): Config {
  const promptsPath = './.claude/prompts';
  const templatesPath = './.claude/templates';
  const snippetsPath = './.claude/snippets';
  
  const globalResourcePath = getGlobalResourcePath();
  const globalPromptsPath = join(globalResourcePath, 'prompts');
  const globalTemplatesPath = join(globalResourcePath, 'templates');
  const globalSnippetsPath = join(globalResourcePath, 'snippets');
  
  return {
    promptsPath,
    logsPath: '.agent/log',
    taskPath: '.agent/task',
    templatesPath,
    snippetsPath,
    reviewPattern: '//Review:',
    reviewSearchPaths: ['src', 'test'],
    reviewSearchExtensions: ['.ts'],
    reviewSearchExcludes: [],
    modelMappings: {},
    includePaths: {
      prompts: promptsPath,
      templates: templatesPath,
      snippets: snippetsPath
    },
    globalPaths: {
      prompts: globalPromptsPath,
      templates: globalTemplatesPath,
      snippets: globalSnippetsPath
    }
  };
}

/**
 * Validates a configuration object to ensure it has the correct structure
 * @param config - Configuration object to validate
 * @returns Validated configuration object
 * @throws Error if configuration is invalid
 */
export function validateConfig(config: unknown): Partial<Config> {
  if (typeof config !== 'object' || config === null) {
    throw new Error('Configuration must be an object');
  }

  const configObj = config as Record<string, unknown>;
  
  // Validate individual fields if they exist
  if (configObj.promptsPath !== undefined && typeof configObj.promptsPath !== 'string') {
    throw new Error('Invalid configuration: promptsPath must be a string');
  }
  
  if (configObj.logsPath !== undefined && typeof configObj.logsPath !== 'string') {
    throw new Error('Invalid configuration: logsPath must be a string');
  }
  
  if (configObj.taskPath !== undefined && typeof configObj.taskPath !== 'string') {
    throw new Error('Invalid configuration: taskPath must be a string');
  }
  
  if (configObj.templatesPath !== undefined && typeof configObj.templatesPath !== 'string') {
    throw new Error('Invalid configuration: templatesPath must be a string');
  }
  
  if (configObj.snippetsPath !== undefined && typeof configObj.snippetsPath !== 'string') {
    throw new Error('Invalid configuration: snippetsPath must be a string');
  }
  
  if (configObj.reviewPattern !== undefined && typeof configObj.reviewPattern !== 'string') {
    throw new Error('Invalid configuration: reviewPattern must be a string');
  }
  
  if (configObj.reviewSearchPaths !== undefined) {
    if (!Array.isArray(configObj.reviewSearchPaths)) {
      throw new Error('Invalid configuration: reviewSearchPaths must be an array');
    }
    
    for (const path of configObj.reviewSearchPaths) {
      if (typeof path !== 'string') {
        throw new Error('Invalid configuration: reviewSearchPaths must contain only strings');
      }
    }
  }
  
  if (configObj.reviewSearchExtensions !== undefined) {
    if (!Array.isArray(configObj.reviewSearchExtensions)) {
      throw new Error('Invalid configuration: reviewSearchExtensions must be an array');
    }
    
    for (const ext of configObj.reviewSearchExtensions) {
      if (typeof ext !== 'string') {
        throw new Error('Invalid configuration: reviewSearchExtensions must contain only strings');
      }
      if (!ext.startsWith('.')) {
        throw new Error('Invalid configuration: reviewSearchExtensions must start with a dot (e.g., ".ts")');
      }
    }
  }
  
  if (configObj.reviewSearchExcludes !== undefined) {
    if (!Array.isArray(configObj.reviewSearchExcludes)) {
      throw new Error('Invalid configuration: reviewSearchExcludes must be an array');
    }
    
    for (const exclude of configObj.reviewSearchExcludes) {
      if (typeof exclude !== 'string') {
        throw new Error('Invalid configuration: reviewSearchExcludes must contain only strings');
      }
    }
  }
  
  if (configObj.modelMappings !== undefined) {
    if (typeof configObj.modelMappings !== 'object' || configObj.modelMappings === null) {
      throw new Error('Invalid configuration: modelMappings must be an object');
    }
    
    const mappings = configObj.modelMappings as Record<string, unknown>;
    for (const [key, value] of Object.entries(mappings)) {
      if (typeof value !== 'string') {
        throw new Error(`Invalid configuration: modelMappings.${key} must be a string`);
      }
    }
  }

  return configObj as Partial<Config>;
}

/**
 * Merges a base configuration with override values
 * @param base - Base configuration
 * @param override - Override configuration values
 * @returns Merged configuration
 */
export function mergeConfigs(base: Config, override: Partial<Config>): Config {
  const promptsPath = override.promptsPath ?? base.promptsPath;
  const templatesPath = override.templatesPath ?? base.templatesPath;
  const snippetsPath = override.snippetsPath ?? base.snippetsPath;
  
  return {
    promptsPath,
    logsPath: override.logsPath ?? base.logsPath,
    taskPath: override.taskPath ?? base.taskPath,
    templatesPath,
    snippetsPath,
    reviewPattern: override.reviewPattern ?? base.reviewPattern,
    reviewSearchPaths: override.reviewSearchPaths ?? base.reviewSearchPaths,
    reviewSearchExtensions: override.reviewSearchExtensions ?? base.reviewSearchExtensions,
    reviewSearchExcludes: override.reviewSearchExcludes ?? base.reviewSearchExcludes,
    modelMappings: {
      ...base.modelMappings,
      ...override.modelMappings
    },
    includePaths: {
      prompts: promptsPath,
      templates: templatesPath,
      snippets: snippetsPath
    },
    globalPaths: override.globalPaths ?? base.globalPaths
  };
}

/**
 * Loads configuration from file or returns defaults
 * @param configPath - Optional path to configuration file
 * @returns Complete configuration object
 * @throws Error if configuration file is invalid or not found when specified
 */
export function loadConfig(configPath?: string): Config {
  const defaultConfig = getDefaultConfig();

  // If specific config path provided, it must exist
  if (configPath) {
    if (!existsSync(configPath)) {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    
    try {
      const content = readFileSync(configPath, 'utf8');
      const parsed = yamlLoad(content);
      const validated = validateConfig(parsed);
      return mergeConfigs(defaultConfig, validated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Configuration file not found')) {
        throw error;
      }
      if (error instanceof Error && error.message.startsWith('Invalid configuration')) {
        throw error;
      }
      throw new Error(`Failed to parse configuration file: ${configPath}`);
    }
  }

  // Look for .cc.yaml in current working directory
  const yamlPath = '.cc.yaml';
  if (existsSync(yamlPath)) {
    try {
      const content = readFileSync(yamlPath, 'utf8');
      const parsed = yamlLoad(content);
      const validated = validateConfig(parsed);
      return mergeConfigs(defaultConfig, validated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid configuration')) {
        throw error;
      }
      throw new Error(`Failed to parse configuration file: ${yamlPath}`);
    }
  }

  // Look for .cc.yml as fallback
  const ymlPath = '.cc.yml';
  if (existsSync(ymlPath)) {
    try {
      const content = readFileSync(ymlPath, 'utf8');
      const parsed = yamlLoad(content);
      const validated = validateConfig(parsed);
      return mergeConfigs(defaultConfig, validated);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Invalid configuration')) {
        throw error;
      }
      throw new Error(`Failed to parse configuration file: ${ymlPath}`);
    }
  }

  // No configuration file found, return defaults
  return defaultConfig;
}