/**
 * Init utility command implementation
 * 
 * Initializes project with global and local resource structure:
 * - Creates global resource directory at ~/.claude
 * - Creates local resource directories
 * - Sets up symlinks from local to global resources
 * - Updates .gitignore to exclude symlinks
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import type { CommandResult, Config } from '../types.js';
import { 
  ensureGlobalDirectory, 
  setupProjectSymlinks, 
  isGlobalResourcesAvailable 
} from '../global-resources.js';

/** Options for the init command */
interface InitOptions {
  globalOnly: boolean;
  localOnly: boolean;
}

/**
 * Parses command line arguments for init command
 * @param args - Command line arguments (excluding command name)
 * @returns Parsed options
 * @throws Error if invalid arguments provided
 */
function parseInitArgs(args: string[]): InitOptions {
  let globalOnly = false;
  let localOnly = false;
  
  for (const arg of args) {
    switch (arg) {
      case '--global-only':
        globalOnly = true;
        break;
      case '--local-only':
        localOnly = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}. Available options: --global-only, --local-only`);
    }
  }
  
  if (globalOnly && localOnly) {
    throw new Error('Cannot specify both --global-only and --local-only options');
  }
  
  return { globalOnly, localOnly };
}

/**
 * Creates local resource directory structure
 * @param config - Configuration object with local paths
 * @returns Success status
 */
function createLocalDirectories(config: Config): { success: boolean; error?: string } {
  try {
    const localPaths = [config.promptsPath, config.templatesPath, config.snippetsPath];
    
    for (const path of localPaths) {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true });
      }
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create local directories: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Ensures .gitignore contains entries for global symlinks
 * @param projectPath - Project root path
 * @returns Success status
 */
function updateGitignore(projectPath: string): { success: boolean; error?: string } {
  try {
    const gitignorePath = join(projectPath, '.gitignore');
    const ignorePattern = '.claude/*/global';
    
    let shouldAddEntry = true;
    
    // Check if gitignore exists and if entry is already there
    if (existsSync(gitignorePath)) {
      const content = readFileSync(gitignorePath, 'utf8');
      if (content.includes(ignorePattern) || content.includes('.claude/*/global')) {
        shouldAddEntry = false;
      }
    }
    
    if (shouldAddEntry) {
      const comment = '\n# Global resource symlinks (managed by claude-code-cli)\n';
      const entry = `${ignorePattern}\n`;
      
      if (existsSync(gitignorePath)) {
        appendFileSync(gitignorePath, comment + entry);
      } else {
        writeFileSync(gitignorePath, comment + entry);
      }
    }
    
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update .gitignore: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Executes the init command
 * @param args - Command line arguments
 * @param config - Configuration object
 * @returns Command execution result
 */
export async function executeInit(args: string[], config: Config): Promise<CommandResult> {
  try {
    // Parse arguments
    const options = parseInitArgs(args);
    const projectPath = process.cwd();
    
    let message = 'Initialization completed successfully!\n\n';
    const steps: string[] = [];
    
    // Step 1: Create global resources (unless local-only)
    if (!options.localOnly) {
      ensureGlobalDirectory();
      steps.push('✓ Global resource directory created at ~/.claude');
      
      if (!isGlobalResourcesAvailable()) {
        return {
          success: false,
          error: 'Failed to create global resources directory'
        };
      }
    }
    
    // Step 2: Create local directories (unless global-only)
    if (!options.globalOnly) {
      const localResult = createLocalDirectories(config);
      if (!localResult.success) {
        return { success: false, error: localResult.error || 'Failed to create local directories' };
      }
      steps.push('✓ Local resource directories created');
    }
    
    // Step 3: Setup symlinks (unless global-only or local-only)
    if (!options.globalOnly && !options.localOnly) {
      try {
        setupProjectSymlinks(projectPath);
        steps.push('✓ Symlinks created from local to global resources');
        
        // Step 4: Update .gitignore
        const gitignoreResult = updateGitignore(projectPath);
        if (!gitignoreResult.success) {
          return { success: false, error: gitignoreResult.error || 'Failed to update .gitignore' };
        }
        steps.push('✓ .gitignore updated to exclude global symlinks');
      } catch (error) {
        return {
          success: false,
          error: `Failed to setup symlinks: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
    
    message += steps.join('\n');
    
    // Add next steps information
    if (!options.globalOnly && !options.localOnly) {
      message += '\n\nNext steps:';
      message += '\n• Add prompts to .claude/prompts/ (local) or .claude/prompts/global/ (global)';
      message += '\n• Add templates to .claude/templates/ (local) or .claude/templates/global/ (global)';
      message += '\n• Add snippets to .claude/snippets/ (local) or .claude/snippets/global/ (global)';
      message += '\n• Local resources override global resources with the same name';
    } else if (options.globalOnly) {
      message += '\n\nGlobal-only initialization complete.';
      message += '\nRun "code-cli init --local-only" in projects to create local structure.';
    } else if (options.localOnly) {
      message += '\n\nLocal-only initialization complete.';
      message += '\nRun "code-cli init --global-only" to create global resource structure.';
    }
    
    return {
      success: true,
      message
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute init command'
    };
  }
}