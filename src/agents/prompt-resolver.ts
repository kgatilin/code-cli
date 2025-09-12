/**
 * Dynamic prompt resolver
 * 
 * Bridges between the agents module and the prompt-loader to resolve
 * prompt references into full content with metadata.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ResolvedPrompt, Config } from '../types.js';
import { processIncludes, replacePlaceholders } from '../prompt-loader.js';
import { parsePromptMetadata } from './prompt-metadata.js';

/**
 * Resolves a prompt reference to its content and metadata
 * @param reference - Prompt reference (e.g., 'analyzer' or 'agents/researcher')
 * @param basePath - Base directory for prompts
 * @returns Resolved prompt with content and metadata
 * @throws Error if prompt cannot be resolved
 */
export function resolvePromptReference(reference: string, basePath: string): ResolvedPrompt {
  try {
    // Handle .md extension in reference (remove it if present)
    const cleanReference = reference.endsWith('.md') ? reference.slice(0, -3) : reference;
    const promptPath = join(basePath, `${cleanReference}.md`);
    
    if (!existsSync(promptPath)) {
      throw new Error(`Prompt file not found: ${promptPath}`);
    }
    
    // Load raw content
    const rawContent = readFileSync(promptPath, 'utf-8');
    
    // Parse metadata from frontmatter
    const { metadata, content: contentWithoutFrontmatter } = parsePromptMetadata(rawContent);
    
    // Create a minimal config object for processIncludes
    const promptLoaderConfig: Config = {
      promptsPath: basePath,
      logsPath: '',
      taskPath: '',
      templatesPath: join(basePath, 'templates'),
      snippetsPath: join(basePath, 'snippets'),
      reviewPattern: '',
      reviewSearchPaths: [],
      reviewSearchExtensions: [],
      reviewSearchExcludes: [],
      modelMappings: {},
      includePaths: {
        prompts: basePath,
        templates: join(basePath, 'templates'),
        snippets: join(basePath, 'snippets')
      },
      globalPaths: {
        prompts: basePath,
        templates: join(basePath, 'templates'),
        snippets: join(basePath, 'snippets')
      }
    };
    
    // Process includes in the content
    const processedContent = processIncludes(
      contentWithoutFrontmatter, 
      promptLoaderConfig, 
      new Set<string>(),
      new Set<string>()
    );
    
    return {
      content: processedContent,
      metadata
    };
    
  } catch (error) {
    throw new Error(`Failed to resolve prompt reference "${reference}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Expands a resolved prompt with context placeholders
 * @param prompt - Resolved prompt to expand
 * @param context - Optional context for placeholder replacement
 * @returns Final expanded content
 */
export function expandPromptWithContext(
  prompt: ResolvedPrompt, 
  context?: Record<string, string>
): string {
  if (!context || Object.keys(context).length === 0) {
    return prompt.content;
  }
  
  // Use the existing placeholder replacement system
  // Convert context to the expected PlaceholderContext format
  const placeholderContext = {
    userRequest: context.userRequest,
    relevantFiles: context.relevantFiles,
    reviewComments: context.reviewComments
  };
  
  // Replace known placeholders first
  let expandedContent = replacePlaceholders(prompt.content, placeholderContext);
  
  // Replace any additional context placeholders using simple string replacement
  for (const [key, value] of Object.entries(context)) {
    // Skip placeholders already handled by replacePlaceholders
    if (['userRequest', 'relevantFiles', 'reviewComments'].includes(key)) {
      continue;
    }
    
    // Replace {key} with value
    const placeholder = `{${key}}`;
    expandedContent = expandedContent.split(placeholder).join(value);
  }
  
  return expandedContent;
}