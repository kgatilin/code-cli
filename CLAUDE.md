# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A TypeScript CLI tool for executing AI prompts through Claude or Cursor engines. It processes prompt templates with includes and placeholders, gathers context from the codebase, and executes prompts with proper configuration management.

## Essential Commands

```bash
npm run build      # Compile TypeScript to dist/
npm test           # Run all tests with Vitest
npm run test:run   # Run tests once (no watch)
npm run lint       # Check code style with ESLint
npm run dev        # Direct TS execution via tsx for testing
```

## Architecture Overview

### Core Modules
- **cli.ts**: Entry point - handles argument parsing, detects command type (prompt vs utility), orchestrates execution
- **config-loader.ts**: Loads `.cc.yaml` configuration with sensible defaults, supports global config fallback
- **prompt-loader.ts**: Processes prompt templates, handles includes (`{include: path}`), resolves placeholders
- **context-builder.ts**: Gathers git branch info, agent files from previous runs, extracts review comments from code
- **engine-executor.ts**: Executes prompts via `cursor-agent` or `claude` CLI tools, handles model mapping
- **global-resources.ts**: Manages global prompt/template resources in user home directory
- **types.ts**: Shared TypeScript interfaces and type definitions

### Agents Module
- **agents/config.ts**: Environment configuration management for agent proxy server
- **agents/server.ts**: Express.js server providing OpenAI-compatible API endpoints
- **agents/orchestrator.ts**: OpenAI to Google Vertex AI format conversion, request orchestration, and MCP tool integration via SDK's mcpToTool()
- **agents/process-manager.ts**: Background server process lifecycle management with PID tracking
- **agents/error-handler.ts**: Google AI error parsing and OpenAI-compatible error formatting
- **agents/logger.ts**: File-based logging system with EPIPE resilience for detached processes
- **agents/mcp-config.ts**: Loads MCP server configurations from ~/.code-cli/mcp.json with validation
- **agents/mcp-client-manager.ts**: Manages MCP client lifecycle using SDK's Client and StdioClientTransport

### Command System
- **commands/index.ts**: Router for utility commands
- **commands/init.ts**: Initializes new projects with `.cc.yaml` and prompt structure
- **commands/list.ts**: Lists available prompts, templates, and snippets
- **commands/newtask.ts**: Creates new task branches with directory structure
- **commands/agents.ts**: Manages local LLM proxy server with start/stop/status/restart actions

### Test Utilities
- **tests/utils/test-environment.ts**: Safe test directory management with OS temp directory enforcement and path validation
- **tests/utils/test-process-manager.ts**: Process lifecycle management with automatic cleanup and port allocation
- **tests/utils/test-config.ts**: Isolated test configuration generation and environment mocking
- **tests/utils/cleanup-manager.ts**: Coordinated cleanup with global handlers and timeout management

## How It Works

### Prompt Execution Flow
1. User runs: `code-cli implement "add dark mode"`
2. CLI detects prompt mode (not a utility command)
3. Loads config from `.cc.yaml` (or uses defaults)
4. Loads prompt from `.claude/prompts/implement.md`
5. Processes includes: `{include: templates/base}` or `{include: snippets/header}`
6. Gathers context: git branch, previous agent logs, review comments
7. Replaces placeholders: `{user_request}`, `{relevant_files}`, `{review_comments}`
8. Executes through selected engine (cursor or claude)

### Utility Commands
- `code-cli init`: Set up new project with prompts structure
- `code-cli list [type]`: Show available prompts/templates/snippets
- `code-cli newtask "task-description"`: Create task branch and files
- `code-cli agents [action]`: Manage local LLM proxy server (start/stop/status/restart)

## Configuration

`.cc.yaml` structure (all fields optional):
```yaml
promptsPath: ./.claude/prompts       # Local prompt templates
logsPath: .agent/log                 # Agent execution logs
taskPath: .agent/task                # Task-specific files
templatesPath: ./.claude/templates   # Reusable template fragments
snippetsPath: ./.claude/snippets     # Small reusable snippets
reviewPattern: "//Review:"           # Comment pattern for reviews
reviewSearchPaths: [src, test]       # Where to search for reviews
reviewSearchExtensions: [.ts]        # File types to search
modelMappings:                       # Prompt-to-model mapping
  plan: opus
  implement: sonnet
```

Agent proxy configuration via `~/.code-cli/.env`:
```bash
VERTEX_AI_PROJECT=your-gcp-project   # Required: Google Cloud project ID
VERTEX_AI_LOCATION=us-central1       # Required: Vertex AI region
VERTEX_AI_MODEL=gemini-2.0-flash-exp # Required: Model name
PROXY_PORT=11434                     # Optional: Server port (default: 11434)
DEBUG_MODE=false                     # Optional: Enable debug logging (default: false)
```

MCP server configuration via `~/.code-cli/mcp.json`:
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"]
    }
  }
}
```

## Testing Strategy

- **Test Framework**: Vitest with Node environment
- **Test Location**: `tests/` directory mirrors `src/` structure
- **Test Utilities**: Located in `tests/utils/` for test infrastructure (not `src/`)
- **Safety First**: All test artifacts created in OS temp directory, never in project root
- **Process Management**: Automatic cleanup of spawned processes with test environment detection
- **Mock Strategy**: Use `memfs` for file system operations, minimal mocking elsewhere
- **Coverage**: All core modules have comprehensive test suites
- **Agent Testing**: Extensive test coverage with 18 test suites for agents module including MCP integration (config, server, orchestrator, process management, error handling, logging, MCP config, MCP client manager)
- **Run Single Test**: `npx vitest run tests/prompt-loader.test.ts`

## Include System

Prompts support a unified include system:
- `{include: prompts/shared}` - Include from prompts directory
- `{include: templates/base}` - Include from templates directory  
- `{include: snippets/header}` - Include from snippets directory
- `{include: global:prompts/common}` - Include from global resources
- Recursive includes are supported with cycle detection
- File extensions (.md) are optional

## Global Resources

The CLI supports global resources in `~/.claude/`:
- Global prompts: `~/.claude/prompts/`
- Global templates: `~/.claude/templates/`
- Global snippets: `~/.claude/snippets/`
- Global config: `~/.cc.yaml` (fallback if no local config)

## Review Comment System

Extracts review comments from code for context:
- Pattern configurable via `reviewPattern` (default: `//Review:`)
- Searches specified paths and extensions
- Excludes files matching `reviewSearchExcludes` patterns
- Comments included in `{review_comments}` placeholder

## Model Mapping

For Claude engine, specific prompts can use different models:
- Configure in `modelMappings` section of `.cc.yaml`
- Example: `plan: opus` uses Claude Opus for planning prompts
- Falls back to default model if not specified

## Code Patterns

- **Explicit Types**: Use interfaces over complex type algebra
- **Pure Functions**: Prefer functions over classes when possible
- **Error Handling**: Provide clear, actionable error messages
- **No Premature Abstraction**: Direct implementation until patterns emerge
- **Descriptive Names**: Functions and variables should be self-documenting