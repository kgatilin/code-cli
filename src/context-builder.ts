/**
 * Context building functionality for aggregating git and file system context
 * 
 * This module provides functions to gather context information from:
 * - Git repository (current branch)
 * - Agent log files and task files
 * - Code review comments in source files
 */

import fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { type ContextData, type ContextConfig } from './types.js';

/**
 * Get the current git branch name
 * 
 * @returns Current branch name, or empty string if not in a git repository or on error
 */
export function getCurrentBranch(): string {
  try {
    const result = execSync('git branch --show-current', {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    return result.toString().trim();
  } catch {
    // Not a git repository or git command failed
    return '';
  }
}

/**
 * Find agent-related files for the current branch
 * 
 * Searches both logs and task directories for files specific to the given branch.
 * Uses the configured paths from ContextConfig.
 * 
 * @param branch - The git branch name to search for
 * @param config - Context configuration with paths
 * @returns Array of file paths found for the branch
 */
export function findAgentFiles(branch: string, config: ContextConfig): string[] {
  const files: string[] = [];
  
  // Search in logs directory
  const logsBranchPath = path.join(config.logsPath, branch);
  try {
    if (fs.existsSync(logsBranchPath) && fs.statSync(logsBranchPath).isDirectory()) {
      const logFiles = fs.readdirSync(logsBranchPath, { withFileTypes: true })
        .filter(dirent => dirent.isFile())
        .map(dirent => path.join(logsBranchPath, dirent.name));
      files.push(...logFiles);
    }
  } catch {
    // Ignore errors reading logs directory
  }
  
  // Search in task directory
  const taskBranchPath = path.join(config.taskPath, branch);
  try {
    if (fs.existsSync(taskBranchPath) && fs.statSync(taskBranchPath).isDirectory()) {
      const taskFiles = fs.readdirSync(taskBranchPath, { withFileTypes: true })
        .filter(dirent => dirent.isFile())
        .map(dirent => path.join(taskBranchPath, dirent.name));
      files.push(...taskFiles);
    }
  } catch {
    // Ignore errors reading task directory
  }
  
  return files.sort(); // Return sorted for consistent ordering
}

/**
 * Extract review comments from source code files
 * 
 * Searches through specified directories and file extensions for review comments.
 * Output format: file:line:comment
 * 
 * @param pattern - The pattern to search for
 * @param searchPaths - Directories to search for review comments (defaults to ['src', 'test'])
 * @param extensions - File extensions to search (defaults to ['.ts'])
 * @param excludes - File patterns to exclude from search (defaults to [])
 * @returns Array of review comment entries in format 'file:line:comment'
 */
export function findReviewComments(
  pattern: string, 
  searchPaths: string[] = ['src', 'test'],
  extensions: string[] = ['.ts'],
  excludes: string[] = []
): string[] {
  const comments: string[] = [];
  
  // Helper function to check if a file should be excluded
  function isExcluded(filePath: string): boolean {
    if (excludes.length === 0) return false;
    
    return excludes.some(pattern => {
      // Simple pattern matching - supports basic glob patterns
      if (pattern.includes('*')) {
        // Convert glob pattern to regex
        const regexPattern = pattern
          .replace(/\./g, '\\.')  // Escape dots
          .replace(/\*/g, '.*');  // Convert * to .*
        const regex = new RegExp(regexPattern);
        return regex.test(filePath) || regex.test(path.basename(filePath));
      } else {
        // Exact match or substring match
        return filePath.includes(pattern) || path.basename(filePath) === pattern;
      }
    });
  }
  
  function searchDirectory(dirPath: string): void {
    try {
      if (!fs.existsSync(dirPath)) return;
      
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item.name);
        
        if (item.isDirectory()) {
          // Recursively search subdirectories
          searchDirectory(fullPath);
        } else if (item.isFile()) {
          // Check if file should be excluded
          if (isExcluded(fullPath)) continue;
          
          // Check if file has one of the target extensions
          const hasTargetExtension = extensions.some(ext => item.name.endsWith(ext));
          if (!hasTargetExtension) continue;
          
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const lines = content.split('\n');
            
            lines.forEach((line, index) => {
              const trimmedLine = line.trim();
              if (trimmedLine.includes(pattern)) {
                const patternIndex = trimmedLine.indexOf(pattern);
                const commentText = trimmedLine.substring(patternIndex + pattern.length).trim();
                
                // Only include non-empty comments
                if (commentText && commentText.length > 0) {
                  comments.push(`${fullPath}:${index + 1}:${commentText}`);
                }
              }
            });
          } catch {
            // Skip files that can't be read
            continue;
          }
        }
      }
    } catch {
      // Skip directories that can't be read
      return;
    }
  }
  
  // Search each specified directory
  for (const searchPath of searchPaths) {
    searchDirectory(searchPath);
  }
  
  return comments.sort(); // Return sorted for consistent ordering
}

/**
 * Build complete context data from all available sources
 * 
 * Aggregates information from git, agent files, and review comments
 * into a single ContextData object for use in prompt processing.
 * 
 * @param config - Context configuration specifying paths and patterns
 * @returns Complete context data object
 */
export function buildContext(config: ContextConfig): ContextData {
  const currentBranch = getCurrentBranch();
  const relevantFiles = currentBranch ? findAgentFiles(currentBranch, config).map(file => `@${file}`) : [];
  const reviewComments = findReviewComments(config.reviewPattern, config.reviewSearchPaths, config.reviewSearchExtensions, config.reviewSearchExcludes);
  
  return {
    currentBranch,
    relevantFiles,
    reviewComments,
  };
}