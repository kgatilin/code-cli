import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups 
} from './utils/index.js';

// Create safe test environment
const testEnv = new TestEnvironment({ debug: false });
let testHomeDir: string;

// Mock the os module to use safe test directory
vi.mock('os', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    homedir: () => testHomeDir
  };
});

// Import after mocking
import { 
  getGlobalResourcePath, 
  ensureGlobalDirectory, 
  isGlobalResourcesAvailable,
  setupProjectSymlinks,
  validateSymlink,
  removeSymlinks
} from '../src/global-resources.js';

describe('global-resources', () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    // Create safe test directory
    testHomeDir = testEnv.createSafeTestDir();
    
    // Mock home directory for testing
    process.env.HOME = testHomeDir;
    
    // Register cleanup for this test
    registerCleanup(async () => {
      // Restore original home directory
      if (originalHome) {
        process.env.HOME = originalHome;
      } else {
        delete process.env.HOME;
      }
      
      // Clean up test files safely
      testEnv.cleanupSafely(testHomeDir);
    });
  });

  afterEach(async () => {
    // Execute all registered cleanups
    await executeAllCleanups();
  });

  describe('getGlobalResourcePath', () => {
    it('returns path to ~/.claude directory', () => {
      const path = getGlobalResourcePath();
      
      expect(path).toBe(join(testHomeDir, '.claude'));
    });

    it('resolves ~ to actual home directory', () => {
      const path = getGlobalResourcePath();
      
      expect(path).not.toContain('~');
      expect(path).toContain(testHomeDir);
    });
  });

  describe('isGlobalResourcesAvailable', () => {
    it('returns false when global directory does not exist', () => {
      expect(isGlobalResourcesAvailable()).toBe(false);
    });

    it('returns false when global directory exists but is empty', () => {
      const globalPath = getGlobalResourcePath();
      mkdirSync(globalPath, { recursive: true });
      
      expect(isGlobalResourcesAvailable()).toBe(false);
    });

    it('returns false when some but not all subdirectories exist', () => {
      const globalPath = getGlobalResourcePath();
      mkdirSync(join(globalPath, 'prompts'), { recursive: true });
      
      expect(isGlobalResourcesAvailable()).toBe(false);
    });

    it('returns true when all required subdirectories exist', () => {
      const globalPath = getGlobalResourcePath();
      mkdirSync(join(globalPath, 'prompts'), { recursive: true });
      mkdirSync(join(globalPath, 'templates'), { recursive: true });
      mkdirSync(join(globalPath, 'snippets'), { recursive: true });
      
      expect(isGlobalResourcesAvailable()).toBe(true);
    });
  });

  describe('ensureGlobalDirectory', () => {
    it('creates global directory structure when it does not exist', () => {
      const globalPath = getGlobalResourcePath();
      
      expect(existsSync(globalPath)).toBe(false);
      
      ensureGlobalDirectory();
      
      expect(existsSync(globalPath)).toBe(true);
      expect(existsSync(join(globalPath, 'prompts'))).toBe(true);
      expect(existsSync(join(globalPath, 'templates'))).toBe(true);
      expect(existsSync(join(globalPath, 'snippets'))).toBe(true);
    });

    it('does not fail when directories already exist', () => {
      const globalPath = getGlobalResourcePath();
      mkdirSync(join(globalPath, 'prompts'), { recursive: true });
      
      expect(() => ensureGlobalDirectory()).not.toThrow();
      
      expect(existsSync(join(globalPath, 'prompts'))).toBe(true);
      expect(existsSync(join(globalPath, 'templates'))).toBe(true);
      expect(existsSync(join(globalPath, 'snippets'))).toBe(true);
    });

    it('creates nested directories correctly', () => {
      ensureGlobalDirectory();
      
      const globalPath = getGlobalResourcePath();
      
      // Test that we can create nested directories in the structure
      mkdirSync(join(globalPath, 'prompts', 'typescript'), { recursive: true });
      mkdirSync(join(globalPath, 'templates', 'task'), { recursive: true });
      mkdirSync(join(globalPath, 'snippets', 'error-handling'), { recursive: true });
      
      expect(existsSync(join(globalPath, 'prompts', 'typescript'))).toBe(true);
      expect(existsSync(join(globalPath, 'templates', 'task'))).toBe(true);
      expect(existsSync(join(globalPath, 'snippets', 'error-handling'))).toBe(true);
    });

    it('makes ensureGlobalDirectory idempotent', () => {
      ensureGlobalDirectory();
      ensureGlobalDirectory();
      ensureGlobalDirectory();
      
      const globalPath = getGlobalResourcePath();
      expect(existsSync(globalPath)).toBe(true);
      expect(existsSync(join(globalPath, 'prompts'))).toBe(true);
      expect(existsSync(join(globalPath, 'templates'))).toBe(true);
      expect(existsSync(join(globalPath, 'snippets'))).toBe(true);
    });
  });

  describe('validateSymlink', () => {
    it('returns true for valid symlink', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      ensureGlobalDirectory();
      const globalPath = getGlobalResourcePath();
      const localPromptsDir = join(testProjectDir, '.claude', 'prompts');
      mkdirSync(localPromptsDir, { recursive: true });
      
      const symlinkPath = join(localPromptsDir, 'global');
      const targetPath = join(globalPath, 'prompts');
      
      // Create symlink manually for testing
      symlinkSync(targetPath, symlinkPath);
      
      expect(validateSymlink(symlinkPath, targetPath)).toBe(true);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });

    it('returns false for non-existent symlink', () => {
      const symlinkPath = join(testHomeDir, 'nonexistent');
      const targetPath = join(testHomeDir, 'target');
      
      expect(validateSymlink(symlinkPath, targetPath)).toBe(false);
    });

    it('returns false for symlink pointing to wrong target', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      const symlinkPath = join(testProjectDir, 'link');
      const wrongTarget = join(testProjectDir, 'wrong');
      const expectedTarget = join(testProjectDir, 'expected');
      
      mkdirSync(wrongTarget, { recursive: true });
      mkdirSync(expectedTarget, { recursive: true });
      
      symlinkSync(wrongTarget, symlinkPath);
      
      expect(validateSymlink(symlinkPath, expectedTarget)).toBe(false);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });
  });

  describe('setupProjectSymlinks', () => {
    it('creates symlinks for all resource types', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      // Setup global resources
      ensureGlobalDirectory();
      const globalPath = getGlobalResourcePath();
      
      // Create project .claude directory structure
      const claudeDir = join(testProjectDir, '.claude');
      mkdirSync(join(claudeDir, 'prompts'), { recursive: true });
      mkdirSync(join(claudeDir, 'templates'), { recursive: true });
      mkdirSync(join(claudeDir, 'snippets'), { recursive: true });
      
      setupProjectSymlinks(testProjectDir);
      
      // Verify symlinks exist
      expect(existsSync(join(claudeDir, 'prompts', 'global'))).toBe(true);
      expect(existsSync(join(claudeDir, 'templates', 'global'))).toBe(true);
      expect(existsSync(join(claudeDir, 'snippets', 'global'))).toBe(true);
      
      // Verify they point to correct targets
      expect(validateSymlink(
        join(claudeDir, 'prompts', 'global'), 
        join(globalPath, 'prompts')
      )).toBe(true);
      expect(validateSymlink(
        join(claudeDir, 'templates', 'global'), 
        join(globalPath, 'templates')
      )).toBe(true);
      expect(validateSymlink(
        join(claudeDir, 'snippets', 'global'), 
        join(globalPath, 'snippets')
      )).toBe(true);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });

    it('creates parent directories if they do not exist', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      ensureGlobalDirectory();
      
      setupProjectSymlinks(testProjectDir);
      
      // Verify directories were created
      expect(existsSync(join(testProjectDir, '.claude', 'prompts'))).toBe(true);
      expect(existsSync(join(testProjectDir, '.claude', 'templates'))).toBe(true);
      expect(existsSync(join(testProjectDir, '.claude', 'snippets'))).toBe(true);
      
      // Verify symlinks exist
      expect(existsSync(join(testProjectDir, '.claude', 'prompts', 'global'))).toBe(true);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });

    it('does not fail if symlinks already exist', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      ensureGlobalDirectory();
      
      setupProjectSymlinks(testProjectDir);
      expect(() => setupProjectSymlinks(testProjectDir)).not.toThrow();
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });

    it('throws error when global resources do not exist', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      expect(() => setupProjectSymlinks(testProjectDir)).toThrow('Global resources not available');
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });
  });

  describe('removeSymlinks', () => {
    it('removes all symlinks for project', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      ensureGlobalDirectory();
      setupProjectSymlinks(testProjectDir);
      
      // Verify symlinks exist first
      const claudeDir = join(testProjectDir, '.claude');
      expect(existsSync(join(claudeDir, 'prompts', 'global'))).toBe(true);
      expect(existsSync(join(claudeDir, 'templates', 'global'))).toBe(true);
      expect(existsSync(join(claudeDir, 'snippets', 'global'))).toBe(true);
      
      removeSymlinks(testProjectDir);
      
      // Verify symlinks are removed
      expect(existsSync(join(claudeDir, 'prompts', 'global'))).toBe(false);
      expect(existsSync(join(claudeDir, 'templates', 'global'))).toBe(false);
      expect(existsSync(join(claudeDir, 'snippets', 'global'))).toBe(false);
      
      // But parent directories should still exist
      expect(existsSync(join(claudeDir, 'prompts'))).toBe(true);
      expect(existsSync(join(claudeDir, 'templates'))).toBe(true);
      expect(existsSync(join(claudeDir, 'snippets'))).toBe(true);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });

    it('does not fail if symlinks do not exist', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      expect(() => removeSymlinks(testProjectDir)).not.toThrow();
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });

    it('does not remove non-symlink files', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      const claudeDir = join(testProjectDir, '.claude');
      mkdirSync(join(claudeDir, 'prompts'), { recursive: true });
      
      // Create a regular file named 'global'
      const globalFile = join(claudeDir, 'prompts', 'global');
      writeFileSync(globalFile, 'test content');
      
      removeSymlinks(testProjectDir);
      
      // Regular file should still exist
      expect(existsSync(globalFile)).toBe(true);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });
  });

  describe('integration', () => {
    it('provides complete global resource setup workflow', () => {
      // Initially no global resources
      expect(isGlobalResourcesAvailable()).toBe(false);
      
      // Get the path (should be consistent)
      const path1 = getGlobalResourcePath();
      const path2 = getGlobalResourcePath();
      expect(path1).toBe(path2);
      
      // Ensure directory structure
      ensureGlobalDirectory();
      
      // Now resources should be available
      expect(isGlobalResourcesAvailable()).toBe(true);
    });

    it('provides complete project symlink workflow', () => {
      const testProjectDir = testEnv.createSafeTestDir();
      mkdirSync(testProjectDir, { recursive: true });
      
      // Setup global resources
      ensureGlobalDirectory();
      
      // Setup project symlinks
      setupProjectSymlinks(testProjectDir);
      
      // Verify everything is linked correctly
      const globalPath = getGlobalResourcePath();
      const claudeDir = join(testProjectDir, '.claude');
      
      expect(validateSymlink(
        join(claudeDir, 'prompts', 'global'), 
        join(globalPath, 'prompts')
      )).toBe(true);
      
      // Remove symlinks
      removeSymlinks(testProjectDir);
      
      // Verify symlinks are gone
      expect(existsSync(join(claudeDir, 'prompts', 'global'))).toBe(false);
      
      // Cleanup
      testEnv.cleanupSafely(testProjectDir);
    });
  });
});