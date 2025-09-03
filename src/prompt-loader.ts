/**
 * Prompt loading and processing
 * 
 * Phase 1: Basic prompt loading and placeholder replacement
 * Phase 2: Include processing with circular dependency detection
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import type { PlaceholderContext, Config } from './types.js';

/**
 * Loads a prompt file from the specified prompts directory and processes all includes
 * @param promptName - Name of the prompt (without .md extension)
 * @param config - Full configuration object for include path resolution
 * @returns Prompt content with all includes processed
 * @throws Error if prompt file not found, prompts directory doesn't exist, or circular dependency detected
 */
export function loadPrompt(promptName: string, config: Config): string {
  // Try local prompts path first
  const localPromptsPath = config.promptsPath;
  const localPromptFilePath = join(localPromptsPath, `${promptName}.md`);
  
  // Try global prompts path as fallback
  const globalPromptsPath = config.globalPaths.prompts;
  const globalPromptFilePath = join(globalPromptsPath, `${promptName}.md`);
  
  let promptFilePath: string;
  let rawContent: string;
  
  // Check local first, then global
  if (existsSync(localPromptFilePath)) {
    promptFilePath = localPromptFilePath;
  } else if (existsSync(globalPromptFilePath)) {
    promptFilePath = globalPromptFilePath;
  } else {
    // Neither exists, provide helpful error message
    const localPrompts = listAvailablePrompts(localPromptsPath);
    const globalPrompts = listAvailablePrompts(globalPromptsPath);
    
    let errorMessage = `Prompt file not found: ${promptName}.md`;
    
    if (localPrompts.length > 0) {
      errorMessage += `\n\nAvailable local prompts:\n${localPrompts.map(p => `  - ${p}`).join('\n')}`;
    }
    
    if (globalPrompts.length > 0) {
      errorMessage += `\n\nAvailable global prompts:\n${globalPrompts.map(p => `  - ${p}`).join('\n')}`;
    }
    
    throw new Error(errorMessage);
  }

  try {
    rawContent = readFileSync(promptFilePath, 'utf8');
  } catch {
    throw new Error(`Failed to read prompt file: ${promptFilePath}`);
  }

  // Process includes with circular dependency detection
  // Start with the main prompt file in the visited set
  const visitedFiles = new Set<string>();
  visitedFiles.add(promptName);
  
  return processIncludes(rawContent, config, visitedFiles);
}

/**
 * Lists all available prompt files in the prompts directory
 * @param promptsPath - Path to the prompts directory
 * @returns Array of prompt names (without .md extension), sorted alphabetically
 */
export function listAvailablePrompts(promptsPath: string): string[] {
  if (!existsSync(promptsPath)) {
    return [];
  }

  try {
    const files = readdirSync(promptsPath);
    return files
      .filter(file => extname(file) === '.md')
      .map(file => file.replace('.md', ''))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Processes include directives recursively with directory prefix support and circular dependency detection
 * @param content - Content with potential include directives
 * @param config - Configuration object with include paths
 * @param visitedFiles - Set of already processed files to detect circular dependencies
 * @param currentPath - Set tracking current processing path for circular dependency detection
 * @param placeholderContext - Optional context for placeholder replacement in template files
 * @returns Content with all includes processed
 * @throws Error if circular dependency detected or include file not found
 */
export function processIncludes(
  content: string, 
  config: Config, 
  visitedFiles: Set<string>, 
  currentPath?: Set<string>,
  placeholderContext?: Record<string, string>
): string {
  // Initialize current path if not provided (for backward compatibility with tests)
  const path = currentPath || new Set<string>();

  // Regular expression to match include directives with optional whitespace
  // Matches: {{include:filename}}, {{ include:filename }}, {{include: filename}}, {{ include: filename }}
  const includeRegex = /\{\{\s*include\s*:\s*([^}]+?)\s*\}\}/g;

  return content.replace(includeRegex, (match, filename) => {
    const trimmedFilename = filename.trim();
    
    // Check for circular dependency using current path
    if (path.has(trimmedFilename)) {
      throw new Error(`Circular dependency detected: ${trimmedFilename} is already being processed`);
    }

    // Resolve include path with dual-scope support
    const { directory, fullPath } = resolveWithScope(trimmedFilename, config);

    // Read the include file
    let includeContent: string;
    try {
      includeContent = readFileSync(fullPath, 'utf8');
    } catch {
      throw new Error(`Failed to read include file: ${fullPath}`);
    }

    // Apply placeholder replacement for template files
    if (directory === 'templates' && placeholderContext) {
      includeContent = replaceTemplatePlaceholders(includeContent, placeholderContext);
    }

    // Add current file to both visited files (record) and current path (circular detection)
    visitedFiles.add(trimmedFilename);
    path.add(trimmedFilename);

    // Recursively process includes in the included content
    const processedContent = processIncludes(includeContent, config, visitedFiles, path, placeholderContext);
    
    // Remove from current path after processing (but keep in visited files record)
    path.delete(trimmedFilename);
    
    return processedContent;
  });
}

/**
 * Resolves include path with directory prefix support and scope detection
 * @param includePath - Include path (e.g., "templates/stage.yaml", "global:base.md", "local:base.md")
 * @param config - Configuration object with include paths
 * @param forceScope - Optional scope to force ('local' or 'global')
 * @returns Resolved path information including scope
 */
function resolveIncludePath(
  includePath: string, 
  config: Config, 
  forceScope?: 'local' | 'global'
): { directory: string, fileName: string, fullPath: string, scope: 'local' | 'global', actualPath: string } {
  // Check for explicit scope prefix (global: or local:)
  let scope: 'local' | 'global' = forceScope || 'local';
  let pathWithoutScope = includePath;
  
  if (includePath.startsWith('global:')) {
    scope = 'global';
    pathWithoutScope = includePath.substring(7);
  } else if (includePath.startsWith('local:')) {
    scope = 'local';
    pathWithoutScope = includePath.substring(6);
  }
  
  // Parse the path components
  const pathParts = pathWithoutScope.split('/');
  
  let directory = 'prompts'; // default
  let actualPath = pathWithoutScope;
  
  // Handle different path formats
  if (pathParts.length === 1) {
    // Simple filename - default to prompts directory
    directory = 'prompts';
  } else if (pathParts.length >= 2) {
    // Check if first part is a resource type
    const firstPart = pathParts[0]!; // Safe because length >= 2
    if (['prompts', 'templates', 'snippets'].includes(firstPart)) {
      directory = firstPart;
      actualPath = pathParts.slice(1).join('/');
    } else {
      // Assume it's a nested path within prompts directory
      directory = 'prompts';
      actualPath = pathWithoutScope;
    }
  }
  
  // Get base paths based on scope
  const basePath = scope === 'global' ? 
    getGlobalIncludeBasePath(directory, config) : 
    getIncludeBasePath(directory, config);
  
  // Determine file extension
  const fileName = actualPath.split('/').pop() || '';
  const fileExtension = getIncludeFileExtension(directory, fileName);
  
  const fullPath = join(basePath, `${actualPath}${fileExtension}`);
  
  return {
    directory,
    fileName: actualPath,
    fullPath,
    scope,
    actualPath: pathWithoutScope
  };
}

/**
 * Gets the base path for an include directory
 * @param directory - Directory name (e.g., "prompts", "templates")
 * @param config - Configuration object
 * @returns Base path for the directory
 */
function getIncludeBasePath(directory: string, config: Config): string {
  switch (directory) {
    case 'prompts':
      return config.includePaths.prompts;
    case 'templates':
      return config.includePaths.templates;
    case 'snippets':
      if (config.includePaths.snippets) {
        return config.includePaths.snippets;
      }
      throw new Error(`Snippets directory not configured`);
    default:
      throw new Error(`Unknown include directory: ${directory}. Supported: prompts, templates, snippets`);
  }
}

/**
 * Gets the global base path for an include directory
 * @param directory - Directory name (e.g., "prompts", "templates") 
 * @param config - Configuration object
 * @returns Global base path for the directory
 */
function getGlobalIncludeBasePath(directory: string, config: Config): string {
  switch (directory) {
    case 'prompts':
      return config.globalPaths.prompts;
    case 'templates':
      return config.globalPaths.templates;
    case 'snippets':
      return config.globalPaths.snippets;
    default:
      throw new Error(`Unknown include directory: ${directory}. Supported: prompts, templates, snippets`);
  }
}

/**
 * Gets the appropriate file extension for an include directory
 * @param directory - Directory name
 * @param fileName - File name (may already include extension)
 * @returns File extension to use
 */
function getIncludeFileExtension(directory: string, fileName: string): string {
  // If filename already has an extension, use it as-is
  if (fileName.includes('.')) {
    return '';
  }
  
  // Apply default extensions based on directory
  switch (directory) {
    case 'prompts':
      return '.md';
    case 'templates':
      return '.yaml';
    case 'snippets':
      return '.md';
    default:
      return '.md';
  }
}

/**
 * Resolves include path with dual-scope support (local first, then global)
 * @param includePath - Include path to resolve
 * @param config - Configuration object
 * @returns Resolved path information with the first available scope
 * @throws Error if not found in either scope
 */
function resolveWithScope(includePath: string, config: Config): { 
  directory: string, 
  fileName: string, 
  fullPath: string, 
  scope: 'local' | 'global', 
  actualPath: string 
} {
  // If explicit scope is provided, use it
  if (includePath.startsWith('global:') || includePath.startsWith('local:')) {
    const resolved = resolveIncludePath(includePath, config);
    if (!existsSync(resolved.fullPath)) {
      const scopeName = resolved.scope === 'global' ? 'global scope' : 'local scope';
      throw new Error(`Include file not found in ${scopeName}: ${resolved.actualPath}`);
    }
    return resolved;
  }
  
  // Try local scope first
  try {
    const localResolved = resolveIncludePath(includePath, config, 'local');
    if (existsSync(localResolved.fullPath)) {
      return localResolved;
    }
  } catch {
    // Ignore local resolution errors, try global
  }
  
  // Try global scope
  try {
    const globalResolved = resolveIncludePath(includePath, config, 'global');
    if (existsSync(globalResolved.fullPath)) {
      return globalResolved;
    }
  } catch {
    // Ignore global resolution errors
  }
  
  // Not found in either scope
  throw new Error(`Include file not found in local or global scope: ${includePath}`);
}

/**
 * Replaces template-specific placeholders in content
 * @param content - Template content with placeholders
 * @param context - Context values for placeholder replacement
 * @returns Content with placeholders replaced
 */
function replaceTemplatePlaceholders(content: string, context: Record<string, string>): string {
  let result = content;
  
  // Replace all placeholders in the context
  for (const [key, value] of Object.entries(context)) {
    const placeholder = `{${key}}`;
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
  }
  
  return result;
}

/**
 * Replaces placeholders in prompt content with context values
 * @param content - Prompt content with placeholders
 * @param context - Context values for placeholder replacement
 * @returns Content with placeholders replaced
 */
export function replacePlaceholders(content: string, context: PlaceholderContext): string {
  let result = content;

  // Replace {user_request} placeholder
  if (context.userRequest !== undefined) {
    result = result.replace(/{user_request}/g, context.userRequest);
  } else {
    result = result.replace(/{user_request}/g, '');
  }

  // Replace {relevant_files} placeholder
  if (context.relevantFiles !== undefined) {
    result = result.replace(/{relevant_files}/g, context.relevantFiles);
  } else {
    result = result.replace(/{relevant_files}/g, '');
  }

  // Replace {review_comments} placeholder
  if (context.reviewComments !== undefined) {
    result = result.replace(/{review_comments}/g, context.reviewComments);
  } else {
    result = result.replace(/{review_comments}/g, '');
  }

  return result;
}