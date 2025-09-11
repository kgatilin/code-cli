import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FilesystemHelper } from '../../src/agents/filesystem-helper.js';

describe('FilesystemHelper', () => {
  let helper: FilesystemHelper;

  beforeEach(() => {
    helper = new FilesystemHelper();
  });

  describe('Path Resolution', () => {
    it('should resolve relative paths to absolute paths using base directory', () => {
      const basePath = '/Users/test/Documents';
      const relativePath = './file.txt';
      const expected = '/Users/test/Documents/file.txt';
      
      const result = helper.resolvePath(relativePath, basePath);
      expect(result).toBe(expected);
    });

    it('should handle complex relative paths with parent directory references', () => {
      const basePath = '/Users/test/Documents/projects';
      const relativePath = '../shared/config.yaml';
      const expected = '/Users/test/Documents/shared/config.yaml';
      
      const result = helper.resolvePath(relativePath, basePath);
      expect(result).toBe(expected);
    });

    it('should return absolute paths unchanged', () => {
      const absolutePath = '/Users/test/file.txt';
      
      const result = helper.resolvePath(absolutePath, '/some/base');
      expect(result).toBe(absolutePath);
    });

    it('should normalize paths consistently', () => {
      const basePath = '/Users/test/Documents';
      const relativePath = './subdirectory/../file.txt';
      const expected = '/Users/test/Documents/file.txt';
      
      const result = helper.resolvePath(relativePath, basePath);
      expect(result).toBe(expected);
    });
  });

  describe('Path Validation', () => {
    it('should validate paths against allowed directories', () => {
      const allowedDirs = ['/Users/test/Documents', '/Users/test/Projects'];
      const validPath = '/Users/test/Documents/file.txt';
      
      const isValid = helper.isPathAllowed(validPath, allowedDirs);
      expect(isValid).toBe(true);
    });

    it('should reject paths outside allowed directories', () => {
      const allowedDirs = ['/Users/test/Documents'];
      const invalidPath = '/Users/test/Desktop/file.txt';
      
      const isValid = helper.isPathAllowed(invalidPath, allowedDirs);
      expect(isValid).toBe(false);
    });

    it('should handle nested allowed directories correctly', () => {
      const allowedDirs = ['/Users/test/Documents/projects'];
      const nestedPath = '/Users/test/Documents/projects/subfolder/file.txt';
      
      const isValid = helper.isPathAllowed(nestedPath, allowedDirs);
      expect(isValid).toBe(true);
    });

    it('should reject parent directory access attempts', () => {
      const allowedDirs = ['/Users/test/Documents/projects'];
      const parentPath = '/Users/test/Documents/secrets.txt';
      
      const isValid = helper.isPathAllowed(parentPath, allowedDirs);
      expect(isValid).toBe(false);
    });
  });

  describe('Tool Argument Enhancement', () => {
    it('should enhance filesystem tool arguments with resolved paths', () => {
      const basePath = '/Users/test/Documents';
      const toolArgs = {
        path: './file.txt',
        content: 'test content'
      };
      
      const enhanced = helper.enhanceFilesystemArgs(toolArgs, basePath);
      expect(enhanced).toEqual({
        path: '/Users/test/Documents/file.txt',
        content: 'test content'
      });
    });

    it('should handle multiple path arguments', () => {
      const basePath = '/Users/test/Documents';
      const toolArgs = {
        sourcePath: './source.txt',
        targetPath: './target.txt',
        options: { recursive: true }
      };
      
      const enhanced = helper.enhanceFilesystemArgs(toolArgs, basePath);
      expect(enhanced).toEqual({
        sourcePath: '/Users/test/Documents/source.txt',
        targetPath: '/Users/test/Documents/target.txt',
        options: { recursive: true }
      });
    });

    it('should leave non-path arguments unchanged', () => {
      const basePath = '/Users/test/Documents';
      const toolArgs = {
        content: 'test content',
        encoding: 'utf8',
        mode: 0o644
      };
      
      const enhanced = helper.enhanceFilesystemArgs(toolArgs, basePath);
      expect(enhanced).toEqual(toolArgs);
    });
  });

  describe('Error Context Enhancement', () => {
    it('should provide detailed error context for path resolution failures', () => {
      const relativePath = './nonexistent/file.txt';
      const basePath = '/Users/test/Documents';
      const allowedDirs = ['/Users/test/Documents'];
      
      const context = helper.getPathErrorContext(relativePath, basePath, allowedDirs);
      
      expect(context).toEqual({
        originalPath: relativePath,
        resolvedPath: '/Users/test/Documents/nonexistent/file.txt',
        basePath,
        allowedDirectories: allowedDirs,
        isRelative: true,
        isAllowed: true
      });
    });

    it('should identify disallowed path attempts', () => {
      const absolutePath = '/Users/test/Desktop/file.txt';
      const basePath = '/Users/test/Documents';
      const allowedDirs = ['/Users/test/Documents'];
      
      const context = helper.getPathErrorContext(absolutePath, basePath, allowedDirs);
      
      expect(context).toEqual({
        originalPath: absolutePath,
        resolvedPath: absolutePath,
        basePath,
        allowedDirectories: allowedDirs,
        isRelative: false,
        isAllowed: false
      });
    });
  });
});