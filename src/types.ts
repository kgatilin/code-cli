/**
 * Shared type definitions for Claude Code CLI
 * 
 * Contains interfaces and types used across multiple modules.
 * Module-specific types should remain in their respective files.
 */

import type { JiraConfig } from './jira-client.js';

/** Supported AI engines for prompt execution */
export type Engine = 'cursor' | 'claude';

/** Command-line interface options */
export interface CliOptions {
  /** The AI engine to use for execution */
  engine: Engine;
  /** Name of the prompt to execute */
  promptName: string;
  /** Optional user text/request to include in prompt */
  userText?: string | undefined;
  /** Show what would be executed without running */
  dryRun: boolean;
  /** Run in background without real-time output */
  background: boolean;
  /** Launch interactive Claude CLI session */
  interactive: boolean;
  /** Optional path to configuration file */
  configPath?: string | undefined;
}

/** Configuration settings loaded from .cc.yaml or defaults */
export interface Config {
  /** Path to prompts directory */
  promptsPath: string;
  /** Path to agent logs directory */
  logsPath: string;
  /** Path to task files directory */
  taskPath: string;
  /** Path to templates directory */
  templatesPath: string;
  /** Path to snippets directory */
  snippetsPath: string;
  /** Pattern for identifying review comments */
  reviewPattern: string;
  /** Directories to search for review comments */
  reviewSearchPaths: string[];
  /** File extensions to search for review comments */
  reviewSearchExtensions: string[];
  /** File patterns to exclude from review comment search */
  reviewSearchExcludes: string[];
  /** Mapping of prompt names to specific models */
  modelMappings: Record<string, string>;
  /** Include path mappings for unified include system */
  includePaths: {
    /** Maps to promptsPath */
    prompts: string;
    /** Maps to templatesPath */
    templates: string;
    /** Maps to snippetsPath */
    snippets: string;
  };
  /** Global resource paths */
  globalPaths: {
    /** Path to global prompts directory */
    prompts: string;
    /** Path to global templates directory */
    templates: string;
    /** Path to global snippets directory */
    snippets: string;
  };
}

/** Prompt content with processing metadata */
export interface PromptContent {
  /** Original raw prompt content */
  raw: string;
  /** Processed content with includes and placeholders resolved */
  processed: string;
  /** List of files that were included during processing */
  includedFiles: string[];
}

/** Context data for placeholder replacement */
export interface PlaceholderContext {
  /** User's request text */
  userRequest?: string | undefined;
  /** Relevant files found in the project */
  relevantFiles?: string | undefined;
  /** Review comments extracted from code */
  reviewComments?: string | undefined;
}

/** Context data aggregated from git and file system */
export interface ContextData {
  /** Current git branch name */
  currentBranch: string;
  /** List of relevant files found */
  relevantFiles: string[];
  /** List of review comments found in code */
  reviewComments: string[];
}

/** Configuration for context building operations */
export interface ContextConfig {
  /** Path to agent logs directory */
  logsPath: string;
  /** Path to task files directory */
  taskPath: string;
  /** Pattern for identifying review comments */
  reviewPattern: string;
  /** Directories to search for review comments */
  reviewSearchPaths: string[];
  /** File extensions to search for review comments */
  reviewSearchExtensions: string[];
  /** File patterns to exclude from review comment search */
  reviewSearchExcludes: string[];
}

/** Result of executing a prompt through an engine */
export interface ExecutionResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Output from successful execution */
  output?: string;
  /** Error message from failed execution */
  error?: string;
}

/** Result of executing a utility command */
export interface CommandResult {
  /** Whether command completed successfully */
  success: boolean;
  /** Success message from command execution */
  message?: string;
  /** Error message from failed execution */
  error?: string;
}

/** Options for the newtask utility command */
export interface NewtaskOptions {
  /** Task description provided by user (or fetched from Jira) */
  description: string;
  /** Optional custom branch name (auto-generated if not provided with Jira) */
  branch?: string;
  /** Jira integration configuration */
  jira?: {
    /** Ticket ID or URL input from user */
    input: string;
    /** Jira connection configuration */
    config: JiraConfig;
  };
}