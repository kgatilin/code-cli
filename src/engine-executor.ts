/**
 * Engine execution for cursor-agent and claude CLI
 * 
 * Executes prompts through different AI engines with proper error handling
 * and real-time output streaming.
 */

import { spawn, type ChildProcess } from 'child_process';
import type { ExecutionResult } from './types.js';

/**
 * Gets the model mapping for a specific prompt name
 * @param promptName - Name of the prompt
 * @param modelMappings - Mapping of prompt names to models
 * @returns Model name if mapped, undefined otherwise
 */
export function getModelForPrompt(promptName: string, modelMappings: Record<string, string>): string | undefined {
  return modelMappings[promptName];
}

/**
 * Executes a prompt through cursor-agent
 * @param prompt - The prompt content to execute
 * @param background - Whether to run in background without real-time output
 * @param interactive - Whether to launch in interactive mode
 * @returns Promise resolving to execution result
 */
export function executeCursor(prompt: string, background: boolean = false, interactive: boolean = false): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const args: string[] = [];
    
    // For interactive mode, pass prompt as argument
    if (interactive) {
      args.push(prompt);
    }

    let child: ChildProcess;
    
    // For interactive mode, use inherit stdio to pass control to the user
    if (interactive) {
      child = spawn('cursor-agent', args, {
        stdio: 'inherit'
      });
    } else {
      child = spawn('cursor-agent', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    // Interactive mode - just wait for the process to complete
    if (interactive) {
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: 'Interactive session completed' });
        } else {
          resolve({ success: false, error: `Interactive session exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ 
            success: false, 
            error: 'cursor-agent not found. Please ensure cursor-agent is installed and available in PATH.' 
          });
        } else {
          resolve({ success: false, error: err.message });
        }
      });
      
      return;
    }

    // Non-interactive mode (existing behavior)
    let output = '';
    let error = '';

    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      // Stream output in real-time (write to stdout) unless running in background
      if (!background) {
        process.stdout.write(chunk);
      }
    });

    child.stderr?.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error });
      }
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({ 
          success: false, 
          error: 'cursor-agent not found. Please ensure cursor-agent is installed and available in PATH.' 
        });
      } else {
        resolve({ success: false, error: err.message });
      }
    });

    // Send prompt to stdin
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}

/**
 * Executes a prompt through claude CLI
 * @param prompt - The prompt content to execute
 * @param model - Optional model to use (e.g., 'opus', 'sonnet', 'haiku')
 * @param background - Whether to run in background without real-time output
 * @param interactive - Whether to launch in interactive mode
 * @returns Promise resolving to execution result
 */
export function executeClaude(prompt: string, model?: string, background: boolean = false, interactive: boolean = false): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const args: string[] = [];
    if (model) {
      args.push('--model', model);
    }

    // For interactive mode, pass prompt as argument
    if (interactive) {
      args.push(prompt);
    }

    let child: ChildProcess;
    
    // For interactive mode, use inherit stdio to pass control to the user
    if (interactive) {
      child = spawn('claude', args, {
        stdio: 'inherit'
      });
    } else {
      child = spawn('claude', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }

    // Interactive mode - just wait for the process to complete
    if (interactive) {
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, output: 'Interactive session completed' });
        } else {
          resolve({ success: false, error: `Interactive session exited with code ${code}` });
        }
      });

      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          resolve({ 
            success: false, 
            error: 'claude CLI not found. Please ensure claude CLI is installed and available in PATH.' 
          });
        } else {
          resolve({ success: false, error: err.message });
        }
      });
      
      return;
    }

    // Non-interactive mode (existing behavior)
    let output = '';
    let error = '';

    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      // Stream output in real-time (write to stdout)
      if (!background) {
        process.stdout.write(chunk);
      }
    });

    child.stderr?.on('data', (data) => {
      error += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true, output });
      } else {
        resolve({ success: false, error });
      }
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        resolve({ 
          success: false, 
          error: 'claude CLI not found. Please ensure claude CLI is installed and available in PATH.' 
        });
      } else {
        resolve({ success: false, error: err.message });
      }
    });

    // Send prompt to stdin
    if (child.stdin) {
      child.stdin.write(prompt);
      child.stdin.end();
    }
  });
}