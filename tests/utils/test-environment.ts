import { existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve, relative, sep } from 'path';
import { tmpdir } from 'os';

/**
 * Configuration options for TestEnvironment
 */
export interface TestEnvironmentOptions {
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Safe test directory management utility
 * 
 * This class provides safe directory operations for tests, preventing
 * the dangerous pattern of creating test directories in the project root
 * and using rmSync with recursive: true, force: true.
 * 
 * Key safety features:
 * - All test directories created in OS temp directory
 * - Path validation prevents deletion outside temp directory
 * - Required test prefix prevents accidental deletion of system directories
 * - Comprehensive validation of paths before any deletion
 */
export class TestEnvironment {
  private readonly options: TestEnvironmentOptions;
  private readonly tempDir: string;

  constructor(options: TestEnvironmentOptions = {}) {
    this.options = { debug: false, ...options };
    this.tempDir = tmpdir();
  }

  /**
   * Creates a safe test directory in the OS temp directory
   * 
   * @param prefix Custom prefix for the directory name (default: 'test-cc')
   * @returns Absolute path to the created test directory
   */
  createSafeTestDir(prefix: string = 'test-cc'): string {
    // Generate unique directory name with timestamp and random suffix
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const dirName = `${prefix}-${timestamp}-${randomSuffix}`;
    
    const testDir = join(this.tempDir, dirName);

    if (this.options.debug) {
      console.log(`TestEnvironment: Creating test directory ${testDir}`);
    }

    try {
      mkdirSync(testDir, { recursive: true });
      return testDir;
    } catch (error) {
      throw new Error(`Failed to create test directory ${testDir}: ${error}`);
    }
  }

  /**
   * Validates that a path is safe for test operations
   * 
   * Safety checks:
   * - Path must not be empty or just whitespace
   * - Path must not be root directory
   * - Path must not be current working directory
   * - Path must be within OS temp directory
   * - Path must have a test prefix (test-, custom-test-, etc.)
   * - Path must not contain traversal attempts
   * 
   * @param path Path to validate
   * @returns true if path is safe for test operations
   */
  validateTestPath(path: string): boolean {
    if (!path || typeof path !== 'string') {
      return false;
    }

    const trimmedPath = path.trim();

    // Empty or whitespace-only paths
    if (!trimmedPath) {
      return false;
    }

    // Resolve to absolute path to handle relative paths and symlinks
    let resolvedPath: string;
    try {
      resolvedPath = resolve(trimmedPath);
    } catch {
      return false;
    }

    // Never allow root directory
    if (resolvedPath === '/' || resolvedPath.match(/^[A-Z]:\\?$/)) {
      return false;
    }

    // Never allow current working directory
    if (resolvedPath === process.cwd()) {
      return false;
    }

    // Must be within temp directory
    const relativePath = relative(this.tempDir, resolvedPath);
    if (relativePath.startsWith('..') || resolve(this.tempDir, relativePath) !== resolvedPath) {
      return false;
    }

    // Check if the path is under a test directory
    // The root test directory (direct child of temp) must have test prefix
    // But subdirectories don't need the prefix
    const pathRelativeToTemp = relative(this.tempDir, resolvedPath);
    const pathParts = pathRelativeToTemp.split(sep);
    const topLevelDir = pathParts[0];

    // Must have a test prefix (test-, custom-test-, etc.)
    if (!topLevelDir) {
      return false;
    }
    
    const testPrefixPattern = /^[a-zA-Z]+-test-.*|^test-.*$/;
    if (!testPrefixPattern.test(topLevelDir)) {
      return false;
    }

    // Additional containment check - ensure no traversal attempts
    if (relativePath.includes('..')) {
      return false;
    }

    return true;
  }

  /**
   * Safely removes a test directory after validation
   * 
   * @param path Path to the directory to remove
   * @throws Error if path fails validation or cleanup fails
   */
  cleanupSafely(path: string): void {
    // Handle null/undefined inputs
    if (path === null || path === undefined) {
      throw new Error('Path must be a non-empty string');
    }

    // Handle empty string or non-string inputs by delegating to validateTestPath
    if (!this.validateTestPath(path)) {
      throw new Error(`Refusing to delete unsafe path: ${path}`);
    }

    if (this.options.debug) {
      console.log(`TestEnvironment: Cleaning up ${path}`);
    }

    // Only proceed if directory exists
    if (!existsSync(path)) {
      if (this.options.debug) {
        console.log(`TestEnvironment: Path ${path} does not exist, skipping cleanup`);
      }
      return;
    }

    try {
      rmSync(path, { recursive: true, force: true });
      
      if (this.options.debug) {
        console.log(`TestEnvironment: Successfully cleaned up ${path}`);
      }
    } catch (error) {
      throw new Error(`Failed to cleanup test directory ${path}: ${error}`);
    }
  }

  /**
   * Creates a test directory and returns a cleanup function
   * 
   * This is a convenience method for the common pattern of creating
   * a test directory and ensuring it gets cleaned up.
   * 
   * @param prefix Custom prefix for the directory name
   * @returns Object with path and cleanup function
   */
  createSafeTestDirWithCleanup(prefix?: string): { path: string; cleanup: () => void } {
    const path = this.createSafeTestDir(prefix);
    
    return {
      path,
      cleanup: () => this.cleanupSafely(path)
    };
  }

  /**
   * Get the OS temp directory path
   * 
   * @returns Absolute path to OS temp directory
   */
  getTempDir(): string {
    return this.tempDir;
  }
}