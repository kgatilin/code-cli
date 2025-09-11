import path from 'path';
import { logDebug } from './logger.js';

/**
 * Context information for path resolution errors
 */
export interface PathErrorContext {
  originalPath: string;
  resolvedPath: string;
  basePath: string;
  allowedDirectories: string[];
  isRelative: boolean;
  isAllowed: boolean;
}

/**
 * Helper class for filesystem tool operations
 * Addresses path resolution and validation issues with MCP filesystem servers
 */
export class FilesystemHelper {
  /**
   * Resolve relative paths to absolute paths using a base directory
   * Absolute paths are returned unchanged
   */
  resolvePath(inputPath: string, basePath: string): string {
    // If already absolute, return as-is
    if (path.isAbsolute(inputPath)) {
      return inputPath;
    }

    // Resolve relative path against base
    const resolved = path.resolve(basePath, inputPath);
    
    logDebug('FilesystemHelper', 'Path resolved', {
      original: inputPath,
      base: basePath,
      resolved
    });

    return resolved;
  }

  /**
   * Check if a path is allowed based on configured allowed directories
   * Path must be within one of the allowed directories
   */
  isPathAllowed(targetPath: string, allowedDirectories: string[]): boolean {
    const normalized = path.normalize(targetPath);
    
    const isAllowed = allowedDirectories.some(allowedDir => {
      const normalizedAllowed = path.normalize(allowedDir);
      // Check if path starts with allowed directory
      return normalized.startsWith(normalizedAllowed + path.sep) || 
             normalized === normalizedAllowed;
    });

    logDebug('FilesystemHelper', 'Path validation result', {
      path: targetPath,
      normalized,
      allowedDirectories,
      isAllowed
    });

    return isAllowed;
  }

  /**
   * Enhance filesystem tool arguments by resolving path-like arguments
   * Identifies common path argument names and resolves them
   */
  enhanceFilesystemArgs(args: Record<string, unknown>, basePath: string): Record<string, unknown> {
    const enhanced = { ...args };
    
    // Common path argument names in filesystem tools
    const pathArgNames = [
      'path', 'filePath', 'file_path',
      'sourcePath', 'source_path', 'source',
      'targetPath', 'target_path', 'target', 'destination',
      'directory', 'dir', 'folder',
      'oldPath', 'old_path', 'newPath', 'new_path'
    ];

    for (const argName of pathArgNames) {
      if (argName in enhanced && typeof enhanced[argName] === 'string') {
        const originalPath = enhanced[argName];
        enhanced[argName] = this.resolvePath(originalPath, basePath);
        
        if (originalPath !== enhanced[argName]) {
          logDebug('FilesystemHelper', 'Enhanced path argument', {
            argument: argName,
            original: originalPath,
            resolved: enhanced[argName]
          });
        }
      }
    }

    return enhanced;
  }

  /**
   * Generate detailed error context for path-related failures
   * Helps diagnose path resolution and permission issues
   */
  getPathErrorContext(
    originalPath: string, 
    basePath: string, 
    allowedDirectories: string[]
  ): PathErrorContext {
    const resolvedPath = this.resolvePath(originalPath, basePath);
    const isRelative = !path.isAbsolute(originalPath);
    const isAllowed = this.isPathAllowed(resolvedPath, allowedDirectories);

    const context: PathErrorContext = {
      originalPath,
      resolvedPath,
      basePath,
      allowedDirectories: [...allowedDirectories], // Copy to avoid mutation
      isRelative,
      isAllowed
    };

    logDebug('FilesystemHelper', 'Generated path error context', context);

    return context;
  }

  /**
   * Extract the primary path from tool arguments for error context
   * Returns the first path-like argument found
   */
  extractPrimaryPath(args: Record<string, unknown>): string | null {
    const pathArgNames = [
      'path', 'filePath', 'file_path',
      'sourcePath', 'source_path', 'source',
      'directory', 'dir', 'folder'
    ];

    for (const argName of pathArgNames) {
      if (argName in args && typeof args[argName] === 'string') {
        return args[argName];
      }
    }

    return null;
  }

  /**
   * Generate a helpful error message for path resolution failures
   * Provides actionable guidance based on the error context
   */
  generatePathErrorMessage(context: PathErrorContext, originalError?: string): string {
    const { originalPath, resolvedPath, basePath, allowedDirectories, isRelative, isAllowed } = context;

    let message = `Filesystem operation failed for path: ${originalPath}`;
    
    if (originalError) {
      message += `\nOriginal error: ${originalError}`;
    }

    message += `\n\nPath Resolution Details:`;
    message += `\n  Original path: ${originalPath}`;
    message += `\n  Resolved path: ${resolvedPath}`;
    message += `\n  Base directory: ${basePath}`;
    message += `\n  Is relative path: ${isRelative}`;
    message += `\n  Is path allowed: ${isAllowed}`;
    
    message += `\n\nAllowed directories:`;
    allowedDirectories.forEach(dir => {
      message += `\n  - ${dir}`;
    });

    if (!isAllowed) {
      message += `\n\nSUGGESTION: The resolved path '${resolvedPath}' is not within any allowed directory.`;
      message += `\nTry using an absolute path that starts with one of the allowed directories above.`;
    }

    if (isRelative) {
      message += `\n\nSUGGESTION: Relative path was resolved using base '${basePath}'.`;
      message += `\nIf this is incorrect, try using an absolute path instead.`;
    }

    return message;
  }
}