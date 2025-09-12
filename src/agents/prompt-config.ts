/**
 * Prompt configuration management
 * 
 * Provides functions to load prompt configuration from environment variables
 * and load the base system prompt that's always included.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PromptConfig, Config } from '../types.js';
import { processIncludes } from '../prompt-loader.js';

/**
 * Loads prompt configuration from environment variables
 * @returns Prompt configuration object
 * @throws Error if required environment variables are missing or invalid
 */
export function loadPromptConfig(): PromptConfig {
  const basePath = process.env.PROMPTS_BASE_PATH?.trim();
  const systemPromptPath = process.env.SYSTEM_PROMPT_PATH?.trim();
  
  // Validate required environment variables
  if (!basePath) {
    throw new Error('PROMPTS_BASE_PATH environment variable is required');
  }
  
  if (!systemPromptPath) {
    throw new Error('SYSTEM_PROMPT_PATH environment variable is required');
  }
  
  // Validate that base path exists
  if (!existsSync(basePath)) {
    throw new Error(`Prompts base path does not exist: ${basePath}`);
  }
  
  return {
    basePath,
    systemPromptPath
  };
}

/**
 * Loads the base system prompt that's always included
 * Uses the existing prompt-loader to handle includes and processing
 * @param config - Prompt configuration
 * @returns Processed system prompt content
 * @throws Error if system prompt cannot be loaded
 */
export function loadBaseSystemPrompt(config: PromptConfig): string {
  try {
    // Construct full path to system prompt
    const systemPromptFullPath = join(config.basePath, config.systemPromptPath);
    
    if (!existsSync(systemPromptFullPath)) {
      throw new Error(`System prompt file not found: ${systemPromptFullPath}`);
    }
    
    // Load raw content
    const rawContent = readFileSync(systemPromptFullPath, 'utf-8');
    
    // Create a minimal config object for processIncludes
    // This allows the system prompt to use includes relative to the base path
    const promptLoaderConfig: Config = {
      promptsPath: config.basePath,
      logsPath: '',
      taskPath: '',
      templatesPath: join(config.basePath, 'templates'),
      snippetsPath: join(config.basePath, 'snippets'),
      reviewPattern: '',
      reviewSearchPaths: [],
      reviewSearchExtensions: [],
      reviewSearchExcludes: [],
      modelMappings: {},
      includePaths: {
        prompts: config.basePath,
        templates: join(config.basePath, 'templates'),
        snippets: join(config.basePath, 'snippets')
      },
      globalPaths: {
        prompts: config.basePath,
        templates: join(config.basePath, 'templates'),
        snippets: join(config.basePath, 'snippets')
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