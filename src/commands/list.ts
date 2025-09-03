/**
 * List utility command implementation
 * 
 * Lists available resources with scope information:
 * - Shows local vs global resources
 * - Supports filtering by resource type (prompts, templates, snippets)
 * - Supports filtering by scope (local, global)
 * - Handles nested directory structures
 */

import { existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import type { CommandResult, Config } from '../types.js';

/** Options for the list command */
interface ListOptions {
  prompts: boolean;
  templates: boolean;
  snippets: boolean;
  local: boolean;
  global: boolean;
}

/** Resource item with metadata */
interface ResourceItem {
  name: string;
  path: string;
  scope: 'local' | 'global';
  type: 'prompts' | 'templates' | 'snippets';
}

/**
 * Parses command line arguments for list command
 * @param args - Command line arguments (excluding command name)
 * @returns Parsed options
 * @throws Error if invalid arguments provided
 */
function parseListArgs(args: string[]): ListOptions {
  let prompts = false;
  let templates = false;
  let snippets = false;
  let local = false;
  let global = false;
  
  for (const arg of args) {
    switch (arg) {
      case '--prompts':
        prompts = true;
        break;
      case '--templates':
        templates = true;
        break;
      case '--snippets':
        snippets = true;
        break;
      case '--local':
        local = true;
        break;
      case '--global':
        global = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}. Available options: --prompts, --templates, --snippets, --local, --global`);
    }
  }
  
  // If no type specified, show all types
  if (!prompts && !templates && !snippets) {
    prompts = templates = snippets = true;
  }
  
  // If no scope specified, show both scopes
  if (!local && !global) {
    local = global = true;
  }
  
  return { prompts, templates, snippets, local, global };
}

/**
 * Gets the expected file extension for a resource type
 * @param resourceType - Type of resource
 * @returns Expected file extension (with dot)
 */
function getResourceExtension(resourceType: 'prompts' | 'templates' | 'snippets'): string {
  switch (resourceType) {
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
 * Recursively scans a directory for resource files
 * @param dirPath - Directory path to scan
 * @param resourceType - Type of resource to look for
 * @param scope - Scope of the resources (local or global)
 * @param relativePath - Current relative path for nested structure
 * @returns Array of resource items
 */
function scanResourceDirectory(
  dirPath: string, 
  resourceType: 'prompts' | 'templates' | 'snippets',
  scope: 'local' | 'global',
  relativePath = ''
): ResourceItem[] {
  const resources: ResourceItem[] = [];
  
  if (!existsSync(dirPath)) {
    return resources;
  }
  
  try {
    const items = readdirSync(dirPath);
    const expectedExtension = getResourceExtension(resourceType);
    
    for (const item of items) {
      // Skip hidden files and directories
      if (item.startsWith('.')) {
        continue;
      }
      
      const itemPath = join(dirPath, item);
      const currentRelativePath = relativePath ? join(relativePath, item) : item;
      
      try {
        const stats = statSync(itemPath);
        
        if (stats.isDirectory()) {
          // Recursively scan subdirectories
          const nestedResources = scanResourceDirectory(
            itemPath, 
            resourceType, 
            scope, 
            currentRelativePath
          );
          resources.push(...nestedResources);
        } else if (stats.isFile()) {
          // Check if file has the expected extension
          const ext = extname(item);
          if (ext === expectedExtension || (ext && expectedExtension === '.md')) {
            // Remove extension from name for display
            const nameWithoutExt = item.replace(ext, '');
            const displayPath = relativePath ? join(relativePath, nameWithoutExt) : nameWithoutExt;
            
            resources.push({
              name: displayPath,
              path: itemPath,
              scope,
              type: resourceType
            });
          }
        }
      } catch {
        // Skip items we can't stat (permission issues, etc.)
        continue;
      }
    }
  } catch {
    // Skip directories we can't read
  }
  
  return resources;
}

/**
 * Lists resources for a specific type and scope combination
 * @param config - Configuration object
 * @param resourceType - Type of resource to list
 * @param options - List options for filtering
 * @returns Array of resource items
 */
function listResourcesOfType(
  config: Config, 
  resourceType: 'prompts' | 'templates' | 'snippets',
  options: ListOptions
): ResourceItem[] {
  const resources: ResourceItem[] = [];
  
  // Get local resources if requested
  if (options.local) {
    let localPath: string;
    switch (resourceType) {
      case 'prompts':
        localPath = config.promptsPath;
        break;
      case 'templates':
        localPath = config.templatesPath;
        break;
      case 'snippets':
        localPath = config.snippetsPath;
        break;
    }
    
    const localResources = scanResourceDirectory(localPath, resourceType, 'local');
    resources.push(...localResources);
  }
  
  // Get global resources if requested
  if (options.global) {
    const globalPath = config.globalPaths[resourceType];
    const globalResources = scanResourceDirectory(globalPath, resourceType, 'global');
    resources.push(...globalResources);
  }
  
  return resources;
}

/**
 * Formats resources into a readable string
 * @param resources - Resources to format
 * @param resourceType - Type of resources
 * @returns Formatted string
 */
function formatResourceList(
  resources: ResourceItem[], 
  resourceType: 'prompts' | 'templates' | 'snippets'
): string {
  if (resources.length === 0) {
    return `No ${resourceType} found.`;
  }
  
  // Sort resources alphabetically by name
  const sorted = resources.sort((a, b) => a.name.localeCompare(b.name));
  
  const typeHeader = resourceType.toUpperCase();
  const lines = [`${typeHeader}:`];
  
  for (const resource of sorted) {
    lines.push(`  ${resource.name} (${resource.scope})`);
  }
  
  return lines.join('\n');
}

/**
 * Executes the list command
 * @param args - Command line arguments
 * @param config - Configuration object
 * @returns Command execution result
 */
export async function executeList(args: string[], config: Config): Promise<CommandResult> {
  try {
    // Parse arguments
    const options = parseListArgs(args);
    
    const sections: string[] = [];
    let totalResources = 0;
    
    // List each requested resource type
    const resourceTypes: ('prompts' | 'templates' | 'snippets')[] = [];
    if (options.prompts) resourceTypes.push('prompts');
    if (options.templates) resourceTypes.push('templates');
    if (options.snippets) resourceTypes.push('snippets');
    
    for (const resourceType of resourceTypes) {
      const resources = listResourcesOfType(config, resourceType, options);
      totalResources += resources.length;
      
      const formattedList = formatResourceList(resources, resourceType);
      sections.push(formattedList);
    }
    
    let message: string;
    if (totalResources === 0) {
      message = 'No resources found.';
      
      // Add more specific message based on filters
      if (options.prompts && !options.templates && !options.snippets) {
        message = 'No prompts found.';
      } else if (options.templates && !options.prompts && !options.snippets) {
        message = 'No templates found.';
      } else if (options.snippets && !options.prompts && !options.templates) {
        message = 'No snippets found.';
      }
      
      if (options.local && !options.global) {
        message = message.replace('No ', 'No local ');
      } else if (options.global && !options.local) {
        message = message.replace('No ', 'No global ');
      }
    } else {
      message = sections.join('\n\n');
    }
    
    return {
      success: true,
      message
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute list command'
    };
  }
}