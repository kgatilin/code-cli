/**
 * Global resource directory management
 * 
 * Provides functions to manage user-wide global resource directory at ~/.claude
 * with support for prompts, templates, and snippets subdirectories.
 */

import { existsSync, mkdirSync, symlinkSync, unlinkSync, lstatSync, readlinkSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

/**
 * Gets the absolute path to the global resources directory
 * @returns Resolved path to ~/.claude directory
 */
export function getGlobalResourcePath(): string {
  return join(homedir(), '.claude');
}

/**
 * Checks if global resources are available (directory structure exists)
 * @returns true if all required subdirectories exist, false otherwise
 */
export function isGlobalResourcesAvailable(): boolean {
  const globalPath = getGlobalResourcePath();
  
  if (!existsSync(globalPath)) {
    return false;
  }
  
  const requiredSubdirectories = ['prompts', 'templates', 'snippets'];
  
  return requiredSubdirectories.every(subdir => 
    existsSync(join(globalPath, subdir))
  );
}

/**
 * Creates the global resource directory structure if it doesn't exist
 * Creates ~/.claude with prompts/, templates/, and snippets/ subdirectories
 * Safe to call multiple times (idempotent)
 */
export function ensureGlobalDirectory(): void {
  const globalPath = getGlobalResourcePath();
  
  // Create main global directory
  if (!existsSync(globalPath)) {
    mkdirSync(globalPath, { recursive: true });
  }
  
  // Create required subdirectories
  const requiredSubdirectories = ['prompts', 'templates', 'snippets'];
  
  for (const subdir of requiredSubdirectories) {
    const subdirPath = join(globalPath, subdir);
    if (!existsSync(subdirPath)) {
      mkdirSync(subdirPath, { recursive: true });
    }
  }
}

/**
 * Validates that a symlink exists and points to the expected target
 * @param linkPath - Path to the symlink to validate
 * @param targetPath - Expected target path
 * @returns true if symlink exists and points to correct target, false otherwise
 */
export function validateSymlink(linkPath: string, targetPath: string): boolean {
  try {
    // Check if link exists
    if (!existsSync(linkPath)) {
      return false;
    }
    
    // Check if it's actually a symlink
    const stats = lstatSync(linkPath);
    if (!stats.isSymbolicLink()) {
      return false;
    }
    
    // Check if it points to the correct target
    const actualTarget = readlinkSync(linkPath);
    const resolvedActual = resolve(linkPath, '..', actualTarget);
    const resolvedExpected = resolve(targetPath);
    
    return resolvedActual === resolvedExpected;
  } catch {
    return false;
  }
}

/**
 * Sets up project symlinks from local .claude directories to global resources
 * @param projectPath - Absolute path to the project root
 * @throws Error if global resources are not available
 */
export function setupProjectSymlinks(projectPath: string): void {
  if (!isGlobalResourcesAvailable()) {
    throw new Error('Global resources not available. Run `ensureGlobalDirectory()` first.');
  }
  
  const globalPath = getGlobalResourcePath();
  const projectClaudeDir = join(projectPath, '.claude');
  
  const resourceTypes = ['prompts', 'templates', 'snippets'];
  
  for (const resourceType of resourceTypes) {
    // Ensure local resource directory exists
    const localResourceDir = join(projectClaudeDir, resourceType);
    if (!existsSync(localResourceDir)) {
      mkdirSync(localResourceDir, { recursive: true });
    }
    
    // Create symlink from local/global to global resource directory
    const symlinkPath = join(localResourceDir, 'global');
    const targetPath = join(globalPath, resourceType);
    
    // Only create symlink if it doesn't already exist or is invalid
    if (!validateSymlink(symlinkPath, targetPath)) {
      // Remove existing file/symlink if it exists
      if (existsSync(symlinkPath)) {
        try {
          unlinkSync(symlinkPath);
        } catch {
          // Ignore errors when removing existing symlink
        }
      }
      
      // Create new symlink
      symlinkSync(targetPath, symlinkPath);
    }
  }
}

/**
 * Removes project symlinks to global resources
 * @param projectPath - Absolute path to the project root
 */
export function removeSymlinks(projectPath: string): void {
  const projectClaudeDir = join(projectPath, '.claude');
  const resourceTypes = ['prompts', 'templates', 'snippets'];
  
  for (const resourceType of resourceTypes) {
    const symlinkPath = join(projectClaudeDir, resourceType, 'global');
    
    try {
      // Only remove if it exists and is actually a symlink
      if (existsSync(symlinkPath)) {
        const stats = lstatSync(symlinkPath);
        if (stats.isSymbolicLink()) {
          unlinkSync(symlinkPath);
        }
      }
    } catch {
      // Ignore errors when removing symlinks
    }
  }
}