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
import { loadJiraConfigFromEnv, parseJiraInput, fetchJiraTicket, validateJiraConfig } from '../jira-client.js';


/**
 * Parses command line arguments for newtask command
 * Supports both traditional and Jira modes:
 * - Traditional: newtask "branch-name" "task description" 
 * - Jira: newtask --jira <ticket-id-or-url> [branch-name]
 * @param args - Command line arguments (excluding command name)
 * @returns Parsed options
 * @throws Error if required arguments missing or invalid
 */
function parseNewtaskArgs(args: string[]): NewtaskOptions {
  if (args.length === 0) {
    throw new Error('Arguments are required. Usage: code-cli newtask "branch-name" "task description" OR code-cli newtask --jira <ticket-id-or-url> [branch-name]');
  }

  // Check for Jira mode
  if (args[0] === '--jira') {
    if (args.length < 2) {
      throw new Error('Jira ticket ID or URL is required after --jira flag. Usage: code-cli newtask --jira <ticket-id-or-url> [branch-name]');
    }
    
    const jiraInput = args[1];
    if (!jiraInput) {
      throw new Error('Jira ticket ID or URL cannot be empty');
    }
    
    // Optional branch name (3rd argument)
    const customBranch = args.length >= 3 ? args[2] : undefined;
    
    // Load Jira configuration from environment
    const jiraConfig = loadJiraConfigFromEnv();
    
    // Build options object conditionally
    const options: NewtaskOptions = {
      description: '', // Will be populated from Jira
      jira: {
        input: jiraInput,
        config: jiraConfig
      }
    };
    
    // Only add branch if it exists
    if (customBranch) {
      options.branch = customBranch;
    }
    
    return options;
  }

  // Traditional mode - require both branch and description
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
 * Generates a branch name from ticket information
 * @param ticketKey - Jira ticket key (e.g., PROJ-123)
 * @param summary - Ticket summary text
 * @returns Generated branch name
 */
function generateBranchName(ticketKey: string, summary: string): string {
  // Use ticket key as base, add simplified summary
  const sanitizedSummary = summary
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 30); // Limit length

  const ticketKeyLower = ticketKey.toLowerCase();
  
  if (sanitizedSummary) {
    return `${ticketKeyLower}-${sanitizedSummary}`;
  } else {
    return ticketKeyLower;
  }
}

/**
 * Resolves task content and branch name from either Jira or traditional input
 * @param options - Parsed newtask options
 * @returns Promise resolving to resolved task information
 */
async function resolveTaskContent(options: NewtaskOptions): Promise<{
  description: string;
  branchName: string;
  jiraTicket?: { key: string; summary: string; description: string };
}> {
  // Jira mode
  if (options.jira) {
    try {
      // Validate Jira configuration first
      validateJiraConfig(options.jira.config);
      
      // Parse Jira input to extract ticket key
      const parsedInput = parseJiraInput(options.jira.input);
      
      // If URL provided a base URL, use it, otherwise use config base URL
      const effectiveConfig = parsedInput.baseUrl
        ? { ...options.jira.config, baseUrl: parsedInput.baseUrl }
        : options.jira.config;
      
      // Fetch ticket from Jira
      const jiraTicket = await fetchJiraTicket(parsedInput.ticketKey, effectiveConfig);
      
      // Generate branch name if not provided
      const branchName = options.branch || generateBranchName(jiraTicket.key, jiraTicket.summary);
      
      // Combine summary and description for task content
      const description = `**Jira Ticket**: ${jiraTicket.key}\n**Summary**: ${jiraTicket.summary}\n\n## Description\n\n${jiraTicket.description}`;
      
      return {
        description,
        branchName,
        jiraTicket
      };
    } catch (error) {
      throw new Error(`Failed to fetch Jira ticket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Traditional mode
  if (!options.branch) {
    throw new Error('Branch name is required in traditional mode');
  }
  
  return {
    description: options.description,
    branchName: options.branch
  };
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

    // Resolve task content and branch name (handles both Jira and traditional modes)
    const resolved = await resolveTaskContent(options);

    // Create git branch
    const branchResult = createGitBranch(resolved.branchName);
    if (!branchResult.success) {
      return { success: false, error: branchResult.error || 'Failed to create git branch' };
    }

    // Create task directory
    const taskDir = createTaskDirectory(config.taskPath, resolved.branchName);

    // Generate task files with resolved content
    const filesResult = generateTaskFiles(taskDir, resolved.branchName, resolved.description, config);
    if (!filesResult.success) {
      return { success: false, error: filesResult.error || 'Failed to generate task files' };
    }

    // Build success message
    let message = `Task created successfully!
- Branch: ${resolved.branchName}
- Directory: ${taskDir}
- Task file: ${join(taskDir, 'task.md')}
- Stage file: ${join(taskDir, 'stage.yaml')}`;

    // Add Jira information if applicable
    if (resolved.jiraTicket) {
      message += `
- Jira Ticket: ${resolved.jiraTicket.key}
- Summary: ${resolved.jiraTicket.summary}`;
    }

    return {
      success: true,
      message
    };

  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to execute newtask command'
    };
  }
}