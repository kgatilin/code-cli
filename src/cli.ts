#!/usr/bin/env node

/**
 * Command-line interface for Claude Code CLI
 * 
 * Entry point that handles argument parsing, validates inputs,
 * and orchestrates execution through other modules.
 */

import { loadConfig } from './config-loader.js';
import { loadPrompt, replacePlaceholders } from './prompt-loader.js';
import { executeCursor, executeClaude, getModelForPrompt } from './engine-executor.js';
import { buildContext } from './context-builder.js';
import { executeUtilityCommand } from './commands/index.js';
import type { CliOptions, Engine, PlaceholderContext } from './types.js';

/** Reserved commands that trigger utility command mode */
const RESERVED_COMMANDS = ['newtask', 'init', 'list', 'agents'] as const;

/** Command type detection result */
type CommandType = 'prompt' | 'utility';

/**
 * Detects whether the command should be treated as a prompt or utility command
 * @param args - Command line arguments (excluding node and script name)
 * @returns Command type: 'prompt' for prompt execution, 'utility' for utility commands
 */
export function detectCommandType(args: string[]): CommandType {
  const firstArg = args[0];
  if (!firstArg) return 'prompt';
  
  // Escape hatch: prompt:command forces prompt mode
  if (firstArg.startsWith('prompt:')) return 'prompt';
  
  // Check if first arg is a reserved command
  if (RESERVED_COMMANDS.includes(firstArg as any)) return 'utility';
  
  // Default to prompt mode for backward compatibility
  return 'prompt';
}

/**
 * Parses command-line arguments into CLI options
 * @param argv - Process arguments array
 * @returns Parsed CLI options
 * @throws Error for invalid arguments
 */
export function parseArguments(argv: string[]): CliOptions {
  // Remove 'node' and script name from argv
  const args = argv.slice(2);
  
  if (args.length === 0) {
    throw new Error('Prompt name is required');
  }

  const options: Partial<CliOptions> = {
    engine: 'claude', // default
    promptName: '',
    userText: undefined,
    dryRun: false,
    background: false,
    interactive: false,
    daemon: false,
    configPath: undefined
  };

  const nonFlagArgs: string[] = [];
  
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === undefined) {
      i += 1;
      continue;
    }
    
    if (arg === '--engine') {
      if (i + 1 >= args.length) {
        throw new Error('--engine requires a value');
      }
      const engineValue = args[i + 1];
      if (!engineValue) {
        throw new Error('--engine requires a value');
      }
      const engine = engineValue as Engine;
      if (engine !== 'cursor' && engine !== 'claude') {
        throw new Error(`Invalid engine: ${engine}. Must be "cursor" or "claude"`);
      }
      options.engine = engine;
      i += 2;
    } else if (arg === '--dry-run' || arg === '-n') {
      options.dryRun = true;
      i += 1;
    } else if (arg === '--background') {
      options.background = true;
      i += 1;
    } else if (arg === '--daemon' || arg === '-d') {
      options.daemon = true;
      i += 1;
    } else if (arg === '--config') {
      if (i + 1 >= args.length) {
        throw new Error('--config requires a value');
      }
      const configValue = args[i + 1];
      if (!configValue) {
        throw new Error('--config requires a value');
      }
      options.configPath = configValue;
      i += 2;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (arg.startsWith('-') && arg.length > 1) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      nonFlagArgs.push(arg);
      i += 1;
    }
  }

  if (nonFlagArgs.length === 0) {
    throw new Error('Prompt name is required');
  }

  let promptName = nonFlagArgs[0];
  if (!promptName) {
    throw new Error('Prompt name is required');
  }
  
  // Handle escape hatch: strip 'prompt:' prefix if present
  if (promptName.startsWith('prompt:')) {
    promptName = promptName.substring(7); // Remove 'prompt:' prefix
    if (!promptName) {
      throw new Error('Prompt name is required after prompt: prefix');
    }
  }

  let userText: string | undefined = undefined;
  if (nonFlagArgs.length > 1) {
    userText = nonFlagArgs.slice(1).join(' ');
  }

  // Calculate interactive mode: default to true unless daemon flag is set
  const isDaemon = options.daemon || false;
  const isInteractive = options.interactive || !isDaemon;

  const finalOptions: CliOptions = {
    engine: (options.engine as Engine) || 'claude',
    promptName,
    userText,
    dryRun: options.dryRun || false,
    background: options.background || false,
    interactive: isInteractive,
    daemon: isDaemon,
    configPath: options.configPath
  };

  return finalOptions;
}

/**
 * Prints usage information to console
 */
export function printUsage(): void {
  console.log('Usage: code-cli [options] <prompt_name> [user_text]');
  console.log('');
  console.log('Arguments:');
  console.log('  prompt_name    Name of the prompt to execute');
  console.log('  user_text      Optional text to include in the prompt');
  console.log('');
  console.log('Options:');
  console.log('  --engine <engine>    AI engine to use: "cursor" or "claude" (default: claude)');
  console.log('  --dry-run, -n       Show what would be executed without running');
  console.log('  --background        Run in background without real-time output');
  console.log('  --daemon, -d        Run in non-interactive (daemon) mode');
  console.log('  --config <path>     Path to configuration file (default: .cc.yaml)');
  console.log('  --help, -h          Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  code-cli implement "add user authentication"');
  console.log('  code-cli --engine claude review "check for bugs"');
  console.log('  code-cli --dry-run plan');
  console.log('  code-cli --config ./custom.yaml implement "new feature"');
}

/**
 * Main CLI execution function
 */
export async function main(): Promise<void> {
  try {
    // Remove 'node' and script name from argv  
    const args = process.argv.slice(2);
    
    // Handle help flag
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
      printUsage();
      process.exit(0);
    }

    // Detect command type before parsing
    const commandType = detectCommandType(args);
    
    if (commandType === 'utility') {
      // Route to utility command handler
      const commandName = args[0];
      if (!commandName) {
        console.error('Error: Utility command name is required');
        process.exit(1);
      }
      const commandArgs = args.slice(1);
      
      // Load configuration for utility commands
      const config = loadConfig();
      
      try {
        const result = await executeUtilityCommand(commandName, commandArgs, config);
        
        if (result.success) {
          if (result.message) {
            console.log(result.message);
          }
          process.exit(0);
        } else {
          console.error('Error:', result.error);
          process.exit(1);
        }
      } catch (error) {
        console.error('Unexpected error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    }

    // Parse arguments for prompt mode
    const options = parseArguments(process.argv);

    // Load configuration
    const config = loadConfig(options.configPath);

    // Load prompt
    let promptContent: string;
    try {
      promptContent = loadPrompt(options.promptName, config);
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      }
      process.exit(1);
    }

    // Prepare placeholder context using context-builder (Phase 3)
    const contextData = buildContext({
      logsPath: config.logsPath,
      taskPath: config.taskPath,
      reviewPattern: config.reviewPattern,
      reviewSearchPaths: config.reviewSearchPaths,
      reviewSearchExtensions: config.reviewSearchExtensions,
      reviewSearchExcludes: config.reviewSearchExcludes,
    });
    
    // Convert ContextData to PlaceholderContext format
    const context: PlaceholderContext = {
      userRequest: options.userText || undefined,
      relevantFiles: contextData.relevantFiles.length > 0 
        ? contextData.relevantFiles.join('\n') 
        : undefined,
      reviewComments: contextData.reviewComments.length > 0 
        ? contextData.reviewComments.join('\n') 
        : undefined,
    };

    // Replace placeholders
    const processedPrompt = replacePlaceholders(promptContent, context);

    // Handle dry-run mode
    if (options.dryRun) {
      console.log('=== DRY RUN ===');
      console.log('Engine:', options.engine);
      console.log('Prompt:', options.promptName);
      console.log('Config:', options.configPath || 'default (.cc.yaml)');
      console.log('');
      console.log('Processed prompt:');
      console.log('================');
      console.log(processedPrompt);
      console.log('================');
      return;
    }

    // Execute prompt
    console.log(`Executing ${options.promptName} with ${options.engine}...`);
    console.log('');

    let result;
    if (options.engine === 'cursor') {
      result = await executeCursor(processedPrompt, options.background, options.interactive);
    } else {
      const model = getModelForPrompt(options.promptName, config.modelMappings);
      if (model && !options.interactive) {
        console.log(`Using model: ${model}`);
      }
      result = await executeClaude(processedPrompt, model, options.background, options.interactive);
    }

    if (!result.success) {
      console.error('Execution failed:');
      console.error(result.error);
      process.exit(1);
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Prompt name is required') || 
          error.message.includes('Invalid engine') || 
          error.message.includes('requires a value') ||
          error.message.includes('Unknown option')) {
        console.error('Error:', error.message);
        console.error('');
        printUsage();
      } else {
        console.error('Error:', error.message);
      }
    } else {
      console.error('An unexpected error occurred');
    }
    process.exit(1);
  }
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}