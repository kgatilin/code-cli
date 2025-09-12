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

/** Configuration for the agent proxy server */
export interface AgentConfig {
  /** Google Cloud project ID - required */
  VERTEX_AI_PROJECT: string;
  /** Vertex AI region (e.g., us-central1) - required */
  VERTEX_AI_LOCATION: string;
  /** Vertex AI model name (e.g., gemini-2.0-flash-exp) - required */
  VERTEX_AI_MODEL: string;
  /** Proxy server port - defaults to 11434 */
  PROXY_PORT: number;
  /** Enable debug logging - defaults to false */
  DEBUG_MODE: boolean;
}

/** Valid actions for the agents command */
export type AgentAction = 'start' | 'stop' | 'status' | 'restart';

/** Status of the agent proxy server process */
export interface ProcessStatus {
  /** Whether the process is currently running */
  running: boolean;
  /** Process ID if running */
  pid?: number;
  /** Port the server is listening on if running */
  port?: number;
  /** Status message */
  message: string;
}

/** Result of process management operations */
export interface ProcessResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Success or error message */
  message: string;
  /** Process ID if operation started a process */
  pid?: number;
}

/** OpenAI content part for multi-modal messages */
export interface OpenAIContentPart {
  /** Type of content part */
  type: 'text' | 'image_url';
  /** Text content (for text parts) */
  text?: string;
  /** Image URL content (for image parts) */
  image_url?: {
    /** URL of the image */
    url: string;
  };
}

/** OpenAI-compatible message format */
export interface OpenAIMessage {
  /** Role of the message sender */
  role: 'system' | 'user' | 'assistant';
  /** Content of the message - can be string (simple) or array (multi-modal) */
  content: string | OpenAIContentPart[];
}

/** OpenAI-compatible chat completion request */
export interface OpenAIRequest {
  /** Array of conversation messages */
  messages: OpenAIMessage[];
  /** Model name to use for completion */
  model?: string;
  /** Maximum number of tokens to generate */
  max_tokens?: number;
  /** Temperature for response randomness (0-2) */
  temperature?: number;
  /** Whether to stream the response */
  stream?: boolean;
  /** Number of completions to generate */
  n?: number;
  /** Sequences where the API will stop generating */
  stop?: string | string[];
}

/** OpenAI-compatible chat completion response */
export interface OpenAIResponse {
  /** Unique identifier for the completion */
  id: string;
  /** Object type (always 'chat.completion') */
  object: 'chat.completion';
  /** Unix timestamp of completion creation */
  created: number;
  /** Model used for the completion */
  model: string;
  /** Array of completion choices */
  choices: OpenAIChoice[];
  /** Token usage statistics */
  usage: {
    /** Number of tokens in the prompt */
    prompt_tokens: number;
    /** Number of tokens in the completion */
    completion_tokens: number;
    /** Total tokens used (prompt + completion) */
    total_tokens: number;
  };
}

/** Individual choice in OpenAI completion response */
export interface OpenAIChoice {
  /** Index of this choice */
  index: number;
  /** The generated message */
  message: OpenAIMessage;
  /** Reason the completion finished */
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
}

/** OpenAI-compatible streaming chunk */
export interface OpenAIStreamChunk {
  /** Unique identifier for the completion */
  id: string;
  /** Object type (always 'chat.completion.chunk') */
  object: 'chat.completion.chunk';
  /** Unix timestamp of chunk creation */
  created: number;
  /** Model used for the completion */
  model: string;
  /** Array of streaming choices */
  choices: OpenAIStreamChoice[];
}

/** Individual streaming choice in OpenAI chunk */
export interface OpenAIStreamChoice {
  /** Index of this choice */
  index: number;
  /** Delta containing new content */
  delta: {
    /** Role (only in first chunk) */
    role?: 'assistant';
    /** Content chunk */
    content?: string;
  };
  /** Reason the completion finished (null except last chunk) */
  finish_reason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
}

/** OpenAI-compatible error response */
export interface OpenAIError {
  /** Error details */
  error: {
    /** Human-readable error message */
    message: string;
    /** Error type classification */
    type: 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'api_error' | 'server_error';
    /** Parameter that caused the error (if applicable) */
    param?: string | null;
    /** Specific error code */
    code?: string | null;
  };
}

/** OpenAI-compatible streaming error chunk */
export interface OpenAIStreamErrorChunk {
  /** Unique identifier for the error */
  id: string;
  /** Object type for error chunks */
  object: 'error';
  /** Unix timestamp of error */
  created: number;
  /** Error details */
  error: {
    /** Human-readable error message */
    message: string;
    /** Error type classification */
    type: 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'api_error' | 'server_error';
    /** Parameter that caused the error (if applicable) */
    param?: string | null;
    /** Specific error code */
    code?: string | null;
  };
}

/** Configuration for a single MCP server */
export interface MCPServerConfig {
  /** Command to execute for the MCP server */
  command: string;
  /** Arguments to pass to the MCP server command */
  args: string[];
}

/** MCP configuration loaded from ~/.code-cli/mcp.json */
export interface MCPConfig {
  /** Map of MCP server name to configuration */
  mcpServers: Record<string, MCPServerConfig>;
}

/** Prompt directive extracted from user messages */
export interface PromptDirective {
  /** Extracted prompt path */
  reference: string;
  /** Message without directive */
  cleanedMessage: string;
  /** Index of message containing directive */
  messageIndex: number;
}

/** Metadata extracted from prompt frontmatter */
export interface PromptMetadata {
  /** Model to use for this prompt */
  model?: string;
  /** Required tools for this prompt */
  tools?: string[];
  /** Temperature setting */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Top-p sampling parameter */
  topP?: number;
  /** Top-k sampling parameter */
  topK?: number;
  /** Additional metadata parameters */
  [key: string]: unknown;
}

/** Resolved prompt with content and metadata */
export interface ResolvedPrompt {
  /** Prompt content without frontmatter */
  content: string;
  /** Extracted metadata */
  metadata: PromptMetadata;
}

/** Configuration for prompt composition */
export interface PromptConfig {
  /** Base directory for prompts */
  basePath: string;
  /** Path to base system prompt (relative to basePath) */
  systemPromptPath: string;
}

/** Preprocessed request with expanded prompts */
export interface ProcessedRequest {
  /** Modified request (with cleaned messages) */
  request: OpenAIRequest;
  /** Metadata to apply */
  promptMetadata?: PromptMetadata;
  /** Combined system prompt (base + dynamic) */
  systemPrompt: string;
}