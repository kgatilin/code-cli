import { describe, it, expect, vi } from 'vitest';
import { executeCursor, executeClaude, getModelForPrompt } from '../src/engine-executor.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('engine-executor', () => {
  describe('getModelForPrompt', () => {
    it('returns mapped model for prompt', () => {
      const modelMappings = {
        plan: 'opus',
        review: 'sonnet',
        implement: 'haiku'
      };

      expect(getModelForPrompt('plan', modelMappings)).toBe('opus');
      expect(getModelForPrompt('review', modelMappings)).toBe('sonnet');
      expect(getModelForPrompt('implement', modelMappings)).toBe('haiku');
    });

    it('returns undefined for unmapped prompt', () => {
      const modelMappings = {
        plan: 'opus'
      };

      expect(getModelForPrompt('unmapped', modelMappings)).toBeUndefined();
    });

    it('handles empty model mappings', () => {
      const modelMappings = {};

      expect(getModelForPrompt('any', modelMappings)).toBeUndefined();
    });

    it('is case-sensitive', () => {
      const modelMappings = {
        Plan: 'opus'
      };

      expect(getModelForPrompt('plan', modelMappings)).toBeUndefined();
      expect(getModelForPrompt('Plan', modelMappings)).toBe('opus');
    });
  });

  describe('executeCursor', () => {
    it('executes cursor-agent with prompt', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback('Cursor output');
            }
          })
        },
        stderr: {
          on: vi.fn()
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeCursor('test prompt');

      expect(spawn).toHaveBeenCalledWith('cursor-agent', [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Cursor output');
    });

    it('handles cursor execution failure', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn()
        },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback('Error message');
            }
          })
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(1);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeCursor('test prompt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Error message');
    });

    it('handles cursor command not found', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn()
        },
        stderr: {
          on: vi.fn()
        },
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            const error = new Error('spawn cursor-agent ENOENT');
            (error as any).code = 'ENOENT';
            callback(error);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeCursor('test prompt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('cursor-agent not found');
    });
  });

  describe('executeClaude', () => {
    it('executes claude CLI with prompt', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback('Claude output');
            }
          })
        },
        stderr: {
          on: vi.fn()
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeClaude('test prompt');

      expect(spawn).toHaveBeenCalledWith('claude', [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Claude output');
    });

    it('executes claude CLI with specific model', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback('Claude opus output');
            }
          })
        },
        stderr: {
          on: vi.fn()
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeClaude('test prompt', 'opus');

      expect(spawn).toHaveBeenCalledWith('claude', ['--model', 'opus'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Claude opus output');
    });

    it('handles claude execution failure', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn()
        },
        stderr: {
          on: vi.fn((event, callback) => {
            if (event === 'data') {
              callback('Claude error');
            }
          })
        },
        on: vi.fn((event, callback) => {
          if (event === 'close') {
            callback(1);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeClaude('test prompt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Claude error');
    });

    it('handles claude command not found', async () => {
      const { spawn } = await import('child_process');
      const mockProcess = {
        stdout: {
          on: vi.fn()
        },
        stderr: {
          on: vi.fn()
        },
        on: vi.fn((event, callback) => {
          if (event === 'error') {
            const error = new Error('spawn claude ENOENT');
            (error as any).code = 'ENOENT';
            callback(error);
          }
        })
      };

      vi.mocked(spawn).mockReturnValue(mockProcess as any);

      const result = await executeClaude('test prompt');

      expect(result.success).toBe(false);
      expect(result.error).toContain('claude CLI not found');
    });
  });
});