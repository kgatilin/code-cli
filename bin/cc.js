#!/usr/bin/env node

/**
 * Executable wrapper for Claude Code CLI
 * 
 * This wrapper imports the compiled TypeScript CLI and executes it.
 * It serves as the entry point when the package is installed globally.
 */

import { main } from '../dist/cli.js';

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});