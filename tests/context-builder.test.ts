/**
 * Tests for context-builder module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import {
  getCurrentBranch,
  findAgentFiles,
  findReviewComments,
  buildContext,
} from '../src/context-builder';
import type { ContextConfig } from '../src/types';

// Mock child_process only
vi.mock('child_process');

const mockExecSync = vi.mocked(execSync);

describe('context-builder', () => {
  const testDir = join(process.cwd(), 'test-context');
  const originalCwd = process.cwd();

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Create test directory and change to it
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    process.chdir(testDir);
  });

  afterEach(() => {
    // Return to original directory and clean up test directory
    process.chdir(originalCwd);
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getCurrentBranch', () => {
    it('returns current branch name from git command', () => {
      mockExecSync.mockReturnValue(Buffer.from('main\n'));
      
      const result = getCurrentBranch();
      
      expect(result).toBe('main');
      expect(mockExecSync).toHaveBeenCalledWith('git branch --show-current', {
        encoding: 'utf8',
        cwd: process.cwd(),
      });
    });

    it('trims whitespace from branch name', () => {
      mockExecSync.mockReturnValue(Buffer.from('  feature/auth-system  \n'));
      
      const result = getCurrentBranch();
      
      expect(result).toBe('feature/auth-system');
    });

    it('returns empty string when git command fails', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      
      const result = getCurrentBranch();
      
      expect(result).toBe('');
    });

    it('returns empty string when no branch exists', () => {
      mockExecSync.mockReturnValue(Buffer.from(''));
      
      const result = getCurrentBranch();
      
      expect(result).toBe('');
    });
  });

  describe('findAgentFiles', () => {
    const mockConfig: ContextConfig = {
      logsPath: '.agent/log',
      taskPath: '.agent/task',
      reviewPattern: '//Review:',
      reviewSearchPaths: ['src', 'test'],
      reviewSearchExcludes: [],
      reviewSearchExtensions: ['.ts', '.js']
    };

    it('finds agent log files for current branch', () => {
      const branch = 'feature-branch';
      
      // Create file system structure
      mkdirSync(join('.agent', 'log', 'feature-branch'), { recursive: true });
      mkdirSync(join('.agent', 'log', 'other-branch'), { recursive: true });
      mkdirSync(join('.agent', 'task', 'feature-branch'), { recursive: true });
      
      writeFileSync(join('.agent', 'log', 'feature-branch', '01_planning.md'), 'planning content');
      writeFileSync(join('.agent', 'log', 'feature-branch', '02_implementation.md'), 'implementation content');
      writeFileSync(join('.agent', 'log', 'other-branch', '01_planning.md'), 'other content');
      writeFileSync(join('.agent', 'task', 'feature-branch', 'task1.md'), 'task content');
      writeFileSync(join('.agent', 'task', 'feature-branch', 'task2.md'), 'task content 2');

      const result = findAgentFiles(branch, mockConfig);

      expect(result).toHaveLength(4);
      expect(result).toContain('.agent/log/feature-branch/01_planning.md');
      expect(result).toContain('.agent/log/feature-branch/02_implementation.md');
      expect(result).toContain('.agent/task/feature-branch/task1.md');
      expect(result).toContain('.agent/task/feature-branch/task2.md');
      expect(result).not.toContain('.agent/log/other-branch/01_planning.md');
    });

    it('returns empty array when directories do not exist', () => {
      const branch = 'nonexistent-branch';
      
      const result = findAgentFiles(branch, mockConfig);
      
      expect(result).toEqual([]);
    });

    it('returns empty array when branch directories are empty', () => {
      const branch = 'empty-branch';
      
      // Create empty directories
      mkdirSync(join('.agent', 'log', 'empty-branch'), { recursive: true });
      mkdirSync(join('.agent', 'task', 'empty-branch'), { recursive: true });

      const result = findAgentFiles(branch, mockConfig);
      
      expect(result).toEqual([]);
    });

    it('handles missing task directory gracefully', () => {
      const branch = 'logs-only-branch';
      
      // Create only logs directory
      mkdirSync(join('.agent', 'log', 'logs-only-branch'), { recursive: true });
      writeFileSync(join('.agent', 'log', 'logs-only-branch', '01_planning.md'), 'planning content');

      const result = findAgentFiles(branch, mockConfig);
      
      expect(result).toEqual(['.agent/log/logs-only-branch/01_planning.md']);
    });

    it('handles missing logs directory gracefully', () => {
      const branch = 'tasks-only-branch';
      
      // Create only task directory
      mkdirSync(join('.agent', 'task', 'tasks-only-branch'), { recursive: true });
      writeFileSync(join('.agent', 'task', 'tasks-only-branch', 'task1.md'), 'task content');

      const result = findAgentFiles(branch, mockConfig);
      
      expect(result).toEqual(['.agent/task/tasks-only-branch/task1.md']);
    });

    it('uses custom paths from config', () => {
      const branch = 'custom-paths-branch';
      const customConfig: ContextConfig = {
        logsPath: 'custom/logs',
        taskPath: 'custom/tasks', 
        reviewPattern: '//Review:',
        reviewSearchPaths: ['src', 'test'],
        reviewSearchExcludes: [],
        reviewSearchExtensions: ['.ts', '.js']
      };
      
      // Create custom directory structure
      mkdirSync(join('custom', 'logs', 'custom-paths-branch'), { recursive: true });
      mkdirSync(join('custom', 'tasks', 'custom-paths-branch'), { recursive: true });
      
      writeFileSync(join('custom', 'logs', 'custom-paths-branch', 'planning.md'), 'planning content');
      writeFileSync(join('custom', 'tasks', 'custom-paths-branch', 'task.md'), 'task content');

      const result = findAgentFiles(branch, customConfig);
      
      expect(result).toHaveLength(2);
      expect(result).toContain('custom/logs/custom-paths-branch/planning.md');
      expect(result).toContain('custom/tasks/custom-paths-branch/task.md');
    });
  });

  describe('findReviewComments', () => {
    it('finds review comments with file:line:comment format', () => {
      // Create source files with review comments
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'file1.ts'), `function test() {
  //Review: This needs optimization
  return 'hello';
}`);
      
      writeFileSync(join('src', 'file2.ts'), `class TestClass {
  //Review: Add proper error handling
  process() {}
}`);
      
      writeFileSync(join('src', 'file3.ts'), 'no review comments here');

      const result = findReviewComments('//Review:', ['src'], ['.ts']);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatch(/src\/file1\.ts:\d+:This needs optimization/);
      expect(result[1]).toMatch(/src\/file2\.ts:\d+:Add proper error handling/);
    });

    it('finds review comments with custom pattern and extensions', () => {
      // Create Python files with review comments
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'file1.py'), `def test():
    #Review: Python style comment
    return "hello"`);
    
      writeFileSync(join('src', 'file2.py'), `class TestClass:
    #Review: Add docstring
    def process(self):
        pass`);

      const result = findReviewComments('#Review:', ['src'], ['.py']);
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatch(/src\/file1\.py:\d+:Python style comment/);
      expect(result[1]).toMatch(/src\/file2\.py:\d+:Add docstring/);
    });

    it('returns empty array when no review comments found', () => {
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'file1.ts'), 'function test() { return "hello"; }');
      writeFileSync(join('src', 'file2.ts'), 'class TestClass { process() {} }');

      const result = findReviewComments('//Review:', ['src'], ['.ts']);
      
      expect(result).toEqual([]);
    });

    it('only searches specified file extensions', () => {
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'file1.ts'), '//Review: Valid TS comment');
      writeFileSync(join('src', 'file2.py'), '#Review: Python comment should be ignored');  
      writeFileSync(join('src', 'file3.js'), '//Review: JS comment should be ignored');

      // Only search .ts files
      const result = findReviewComments('//Review:', ['src'], ['.ts']);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/src\/file1\.ts:\d+:Valid TS comment/);
    });

    it('searches multiple file extensions', () => {
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'app.ts'), '//Review: TS comment');
      writeFileSync(join('src', 'app.js'), '//Review: JS comment');
      writeFileSync(join('src', 'app.py'), '#Review: Python comment');

      const result = findReviewComments('//Review:', ['src'], ['.ts', '.js']);
      
      expect(result).toHaveLength(2);
      expect(result.some(comment => comment.includes('TS comment'))).toBe(true);
      expect(result.some(comment => comment.includes('JS comment'))).toBe(true);
      expect(result.some(comment => comment.includes('Python comment'))).toBe(false);
    });

    it('searches only in specified directories', () => {
      mkdirSync('src', { recursive: true });
      mkdirSync('test', { recursive: true });
      mkdirSync('lib', { recursive: true });
      
      writeFileSync(join('src', 'app.ts'), '//Review: App comment');
      writeFileSync(join('test', 'app.test.ts'), '//Review: Test comment');
      writeFileSync(join('lib', 'utils.ts'), '//Review: Lib comment');

      // Only search src and test, not lib
      const result = findReviewComments('//Review:', ['src', 'test'], ['.ts']);
      
      expect(result).toHaveLength(2);
      expect(result.some(comment => comment.includes('App comment'))).toBe(true);
      expect(result.some(comment => comment.includes('Test comment'))).toBe(true);
      expect(result.some(comment => comment.includes('Lib comment'))).toBe(false);
    });

    it('handles missing search directories gracefully', () => {
      // Don't create any directories
      const result = findReviewComments('//Review:', ['nonexistent', 'also-missing'], ['.ts']);
      
      expect(result).toEqual([]);
    });

    it('excludes files matching exclude patterns', () => {
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'file1.ts'), '//Review: Should be included');
      writeFileSync(join('src', 'excluded.ts'), '//Review: Should be excluded');
      writeFileSync(join('src', 'test.spec.ts'), '//Review: Should be excluded');

      const result = findReviewComments('//Review:', ['src'], ['.ts'], ['excluded.ts', '*.spec.ts']);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/src\/file1\.ts:\d+:Should be included/);
      expect(result.some(comment => comment.includes('excluded'))).toBe(false);
      expect(result.some(comment => comment.includes('spec'))).toBe(false);
    });

    it('supports glob patterns in excludes', () => {
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'component.ts'), '//Review: Component comment');
      writeFileSync(join('src', 'component.test.ts'), '//Review: Test comment');
      writeFileSync(join('src', 'component.spec.ts'), '//Review: Spec comment');

      const result = findReviewComments('//Review:', ['src'], ['.ts'], ['*.test.ts', '*.spec.ts']);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatch(/src\/component\.ts:\d+:Component comment/);
    });

    it('works with no excludes (empty array)', () => {
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('src', 'file1.ts'), '//Review: Comment 1');
      writeFileSync(join('src', 'file2.ts'), '//Review: Comment 2');

      const result = findReviewComments('//Review:', ['src'], ['.ts'], []);
      
      expect(result).toHaveLength(2);
    });
  });

  describe('buildContext', () => {
    const mockConfig: ContextConfig = {
      logsPath: '.agent/log',
      taskPath: '.agent/task',
      reviewPattern: '//Review:',
      reviewSearchPaths: ['src', 'test'],
      reviewSearchExtensions: ['.ts'],
      reviewSearchExcludes: [],
    };

    beforeEach(() => {
      // Mock getCurrentBranch to return consistent value
      mockExecSync.mockReturnValue(Buffer.from('test-branch\n'));
    });

    it('builds complete context with all data sources', () => {
      // Create file system structure
      mkdirSync(join('.agent', 'log', 'test-branch'), { recursive: true });
      mkdirSync(join('.agent', 'task', 'test-branch'), { recursive: true });
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('.agent', 'log', 'test-branch', '01_planning.md'), 'planning content');
      writeFileSync(join('.agent', 'task', 'test-branch', 'task1.md'), 'task content');
      writeFileSync(join('src', 'file1.ts'), '//Review: Needs optimization');
      writeFileSync(join('src', 'file2.ts'), '//Review: Add error handling');

      const result = buildContext(mockConfig);
      
      expect(result.currentBranch).toBe('test-branch');
      expect(result.relevantFiles).toHaveLength(2);
      expect(result.relevantFiles).toContain('@.agent/log/test-branch/01_planning.md');
      expect(result.relevantFiles).toContain('@.agent/task/test-branch/task1.md');
      expect(result.reviewComments).toHaveLength(2);
      expect(result.reviewComments[0]).toContain('Needs optimization');
      expect(result.reviewComments[1]).toContain('Add error handling');
    });

    it('handles missing git repository gracefully', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('Not a git repository');
      });
      
      mkdirSync('src', { recursive: true });
      writeFileSync(join('src', 'file1.ts'), '//Review: Some comment');

      const result = buildContext(mockConfig);
      
      expect(result.currentBranch).toBe('');
      expect(result.relevantFiles).toEqual([]);
      expect(result.reviewComments).toHaveLength(1);
    });

    it('returns empty context when no data is found', () => {
      mockExecSync.mockReturnValue(Buffer.from('empty-branch\n'));
      
      // No file system setup - empty

      const result = buildContext(mockConfig);
      
      expect(result.currentBranch).toBe('empty-branch');
      expect(result.relevantFiles).toEqual([]);
      expect(result.reviewComments).toEqual([]);
    });

    it('uses custom config paths and pattern', () => {
      const customConfig: ContextConfig = {
        logsPath: 'custom/logs',
        taskPath: 'custom/tasks',
        reviewPattern: '#TODO:',
        reviewSearchPaths: ['src'],
        reviewSearchExtensions: ['.py'],
        reviewSearchExcludes: [],
      };
      
      // Create custom directory structure  
      mkdirSync(join('custom', 'logs', 'test-branch'), { recursive: true });
      mkdirSync(join('custom', 'tasks', 'test-branch'), { recursive: true });
      mkdirSync('src', { recursive: true });
      
      writeFileSync(join('custom', 'logs', 'test-branch', 'plan.md'), 'custom planning');
      writeFileSync(join('custom', 'tasks', 'test-branch', 'todo.md'), 'custom task');
      writeFileSync(join('src', 'file1.py'), '#TODO: Fix this function');

      const result = buildContext(customConfig);
      
      expect(result.currentBranch).toBe('test-branch');
      expect(result.relevantFiles).toHaveLength(2);
      expect(result.relevantFiles).toContain('@custom/logs/test-branch/plan.md');
      expect(result.relevantFiles).toContain('@custom/tasks/test-branch/todo.md');
      expect(result.reviewComments).toHaveLength(1);
      expect(result.reviewComments[0]).toContain('Fix this function');
    });
  });
});