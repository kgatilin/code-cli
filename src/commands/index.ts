/**
 * Command registry and router for utility commands
 * 
 * Provides a central registry for utility commands and routing logic.
 * Each command implements a standard interface and can be executed independently.
 */

import type { CommandResult, Config } from '../types.js';
import { executeNewtask } from './newtask.js';
import { executeInit } from './init.js';
import { executeList } from './list.js';

/** Interface for utility command implementation */
export interface UtilityCommand {
  /** Command name */
  name: string;
  /** Command description */  
  description: string;
  /** Execute the command with parsed arguments */
  execute(args: string[], config: Config): Promise<CommandResult>;
}

/** Registry of available utility commands */
const COMMAND_REGISTRY: Record<string, UtilityCommand> = {
  newtask: {
    name: 'newtask',
    description: 'Create task structure with branch and task files. Usage: newtask "branch-name" "task description"',
    execute: executeNewtask
  },
  init: {
    name: 'init',
    description: 'Initialize project with global and local resource structure. Options: --global-only, --local-only',
    execute: executeInit
  },
  list: {
    name: 'list',
    description: 'List available resources. Options: --prompts, --templates, --snippets, --local, --global',
    execute: executeList
  }
};

/**
 * Executes a utility command by name
 * @param commandName - Name of the command to execute
 * @param args - Command line arguments (excluding command name)
 * @param config - Configuration object
 * @returns Command execution result
 * @throws Error if command not found
 */
export async function executeUtilityCommand(
  commandName: string,
  args: string[],
  config: Config
): Promise<CommandResult> {
  const command = COMMAND_REGISTRY[commandName];
  
  if (!command) {
    const availableCommands = Object.keys(COMMAND_REGISTRY).join(', ');
    return {
      success: false,
      error: `Unknown utility command: ${commandName}. Available commands: ${availableCommands}`
    };
  }

  try {
    return await command.execute(args, config);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Command execution failed'
    };
  }
}

/**
 * Lists all available utility commands
 * @returns Array of available commands with descriptions
 */
export function listUtilityCommands(): { name: string; description: string }[] {
  return Object.values(COMMAND_REGISTRY).map(cmd => ({
    name: cmd.name,
    description: cmd.description
  }));
}