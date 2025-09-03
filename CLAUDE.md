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

### Command System
- **commands/index.ts**: Router for utility commands
- **commands/init.ts**: Initializes new projects with `.cc.yaml` and prompt structure
- **commands/list.ts**: Lists available prompts, templates, and snippets
- **commands/newtask.ts**: Creates new task branches with directory structure

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

## Testing Strategy

- **Test Framework**: Vitest with Node environment
- **Test Location**: `tests/` directory mirrors `src/` structure
- **Mock Strategy**: Use `memfs` for file system operations, minimal mocking elsewhere
- **Coverage**: All core modules have comprehensive test suites
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