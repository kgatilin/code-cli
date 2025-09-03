# Claude Code CLI

A powerful command-line interface for executing AI-powered prompts through Claude or Cursor engines. Streamline your development workflow with template-based prompts, context gathering, and intelligent code assistance.

## Features

- 🤖 **Multi-Engine Support**: Execute prompts through Claude API or Cursor IDE
- 📝 **Template System**: Reusable prompt templates with includes and placeholders
- 🔍 **Context Awareness**: Automatically gathers git info, previous logs, and code review comments
- 🎯 **Task Management**: Create and organize development tasks with branches and structured files
- 🌍 **Global Resources**: Share prompts and templates across projects
- ⚙️ **Flexible Configuration**: Customize paths, patterns, and model mappings via YAML

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/claude-code-cli.git
cd claude-code-cli

# Install dependencies
npm install

# Build the project
npm run build

# Link globally (optional)
npm link
```

## Quick Start

### Basic Usage

```bash
# Execute a prompt
code-cli implement "add dark mode toggle to settings"

# Use a different engine
code-cli -e cursor plan "refactor authentication system"

# Dry run to see what would be executed
code-cli -d implement "add user profile feature"
```

### Initialize a New Project

```bash
# Set up prompt templates and configuration
code-cli init

# This creates:
# - .cc.yaml (configuration file)
# - .claude/prompts/ (prompt templates)
# - .claude/templates/ (reusable fragments)
# - .claude/snippets/ (small snippets)
```

### Create a New Task

```bash
# Create a task branch with organized structure
code-cli newtask "implement-oauth" "Add OAuth2 authentication"

# Creates:
# - New git branch: task/implement-oauth
# - .agent/task/implement-oauth/task.md
# - .agent/task/implement-oauth/stage.yaml
```

### List Available Resources

```bash
# List all available prompts
code-cli list

# List specific resource type
code-cli list prompts
code-cli list templates
code-cli list snippets
```

## Configuration

Create a `.cc.yaml` file in your project root:

```yaml
# Paths (all optional with sensible defaults)
promptsPath: ./.claude/prompts
logsPath: .agent/log
taskPath: .agent/task
templatesPath: ./.claude/templates
snippetsPath: ./.claude/snippets

# Review comment detection
reviewPattern: "//Review:"  # For JS/TS projects
reviewSearchPaths:
  - src
  - test
reviewSearchExtensions:
  - .ts
  - .tsx
  - .js
  - .jsx

# Model mappings for Claude engine
modelMappings:
  plan: opus          # Use Opus for planning
  implement: sonnet   # Use Sonnet for implementation
  review: opus        # Use Opus for code review
```

## Prompt Templates

Create powerful prompt templates with dynamic content:

```markdown
<!-- .claude/prompts/implement.md -->
# Implementation Task

{include: templates/context}

## User Request
{user_request}

## Relevant Files
{relevant_files}

## Review Comments
{review_comments}

{include: templates/guidelines}

Please implement the requested feature following our coding standards.
```

### Supported Placeholders

- `{user_request}` - The user's input text
- `{relevant_files}` - Files found in agent logs and task directories
- `{review_comments}` - Comments extracted from code (e.g., `//Review: fix this`)

### Include System

- `{include: templates/base}` - Include from local templates
- `{include: global:prompts/common}` - Include from global resources
- Supports nested includes with cycle detection

## Global Resources

Share resources across projects by placing them in `~/.claude/`:

```
~/.claude/
├── prompts/      # Global prompt templates
├── templates/    # Global template fragments
├── snippets/     # Global code snippets
└── .cc.yaml      # Global configuration (fallback)
```

## Development

### Prerequisites

- Node.js 18+ 
- TypeScript 5+
- Git

### Commands

```bash
# Development
npm run dev       # Run TypeScript directly with tsx
npm run build     # Compile to JavaScript
npm run lint      # Check code style
npm test          # Run tests with watch
npm run test:run  # Run tests once
```

### Project Structure

```
claude-code-cli/
├── src/
│   ├── cli.ts              # Entry point
│   ├── config-loader.ts    # Configuration management
│   ├── prompt-loader.ts    # Template processing
│   ├── context-builder.ts  # Context gathering
│   ├── engine-executor.ts  # Engine integration
│   ├── global-resources.ts # Global resource management
│   ├── types.ts            # TypeScript definitions
│   └── commands/           # Utility commands
│       ├── init.ts
│       ├── list.ts
│       └── newtask.ts
├── tests/                  # Test suites
├── .claude/               # Local prompts and templates
├── .agent/                # Task and log files
└── .cc.yaml              # Configuration
```

## Examples

### Complex Implementation Task

```bash
# Create a new feature with planning
code-cli plan "add real-time notifications"

# Review the plan in .agent/log/[branch]/plan.md
# Then implement
code-cli implement "build the WebSocket connection handler"
```

### Code Review Workflow

```bash
# Add review comments in your code
// src/auth.ts
function authenticate(user) {
  //Review: add input validation
  //Review: implement rate limiting
  return validateCredentials(user);
}

# Run review-focused prompt
code-cli review "check security concerns"
```

### Multi-Stage Development

```bash
# Stage 1: Planning
code-cli -e claude plan "design REST API"

# Stage 2: Implementation  
code-cli -e cursor implement "create endpoint handlers"

# Stage 3: Testing
code-cli test "write unit tests"

# Stage 4: Documentation
code-cli docs "update API documentation"
```

## Engine Requirements

### Claude Engine
- Requires `claude` CLI tool installed
- Set up API credentials for Claude

### Cursor Engine  
- Requires `cursor-agent` command available
- Cursor IDE must be installed

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

### Development Guidelines

1. Write tests for new features
2. Follow existing code patterns
3. Update documentation as needed
4. Run `npm run lint` and `npm test` before submitting

## License

This project is licensed under the ISC License - see the LICENSE file for details.

## Acknowledgments

Built to enhance AI-assisted development workflows with Claude and Cursor.

## Support

For issues, questions, or suggestions, please open an issue on GitHub.