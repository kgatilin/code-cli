/**
 * Newtask utility command implementation
 * 
 * Creates task structure for new work including:
 * - Git branch with descriptive name
 * - Task directory structure  
 * - Stage file from template with placeholder replacement
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CommandResult, Config, NewtaskOptions } from '../types.js';
import { processIncludes } from '../prompt-loader.js';


/**
 * Parses command line arguments for newtask command
 * @param args - Command line arguments (excluding command name)
 * @returns Parsed options
 * @throws Error if required arguments missing
 */
function parseNewtaskArgs(args: string[]): NewtaskOptions {
  if (args.length < 2) {
    throw new Error('Branch name and task description are required. Usage: code-cli newtask "branch-name" "task description"');
  }

  const branch = args[0];
  const description = args[1];
  
  if (!branch) {
    throw new Error('Branch name is required as first argument');
  }
  
  if (!description) {
    throw new Error('Task description is required as second argument');
  }

  return { description, branch };
}

/**
 * Creates a git branch for the task
 * @param branchName - Name of the branch to create
 * @returns Success status
 */
function createGitBranch(branchName: string): { success: boolean; error?: string } {
  try {
    // Check if branch already exists
    try {
      execSync(`git rev-parse --verify ${branchName}`, { stdio: 'ignore' });
      return { success: false, error: `Branch '${branchName}' already exists` };
    } catch {
      // Branch doesn't exist, which is what we want
    }

    // Create and checkout new branch
    execSync(`git checkout -b ${branchName}`, { stdio: 'inherit' });
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: `Failed to create git branch: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
}

/**
 * Creates the task directory structure
 * @param taskPath - Base task path from config
 * @param branchName - Branch name for directory
 * @returns Task directory path
 */
function createTaskDirectory(taskPath: string, branchName: string): string {
  const taskDir = join(taskPath, branchName);
  
  if (!existsSync(taskDir)) {
    mkdirSync(taskDir, { recursive: true });
  }
  
  return taskDir;
}

/**
 * Generates task files from templates with placeholder replacement
 * @param taskDir - Task directory path
 * @param branchName - Branch name
 * @param description - Task description
 * @param config - Configuration object
 * @returns Success status
 */
function generateTaskFiles(
  taskDir: string,
  branchName: string,
  description: string,
  config: Config
): { success: boolean; error?: string } {
  try {
    // Define placeholder values for stage file
    const placeholders = {
      timestamp: new Date().toISOString(),
      branch_name: branchName
    };

    // Process stage template with placeholders
    const stageContent = processIncludes(
      '{{include: templates/stage}}',
      config,
      new Set(),
      undefined,
      placeholders
    );

    // Write stage file
    const stageFilePath = join(taskDir, 'stage.yaml');
    writeFileSync(stageFilePath, stageContent);

    // Write task description to task.md
    const taskFilePath = join(taskDir, 'task.md');
    writeFileSync(taskFilePath, `# ${branchName}\n\n${description}\n`);

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: `Failed to generate task files: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Executes the newtask command
 * @param args - Command line arguments
 * @param config - Configuration object
 * @returns Command execution result
 */
export async function executeNewtask(args: string[], config: Config): Promise<CommandResult> {
  try {
    // Parse arguments
    const options = parseNewtaskArgs(args);
    const branchName = options.branch!; // Branch is now required, not optional

    // Create git branch
    const branchResult = createGitBranch(branchName);
    if (!branchResult.success) {
      return { success: false, error: branchResult.error || 'Failed to create git branch' };
    }

    // Create task directory
    const taskDir = createTaskDirectory(config.taskPath, branchName);

    // Generate task files
    const filesResult = generateTaskFiles(taskDir, branchName, options.description, config);
    if (!filesResult.success) {
      return { success: false, error: filesResult.error || 'Failed to generate task files' };
    }

    return {
      success: true,
      message: `Task created successfully!
- Branch: ${branchName}
- Directory: ${taskDir}
- Task file: ${join(taskDir, 'task.md')}
- Stage file: ${join(taskDir, 'stage.yaml')}`
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute newtask command'
    };
  }
}