import { describe, it, expect, vi } from 'vitest';
import { parseArguments, printUsage } from '../src/cli.js';
import type { CliOptions } from '../src/types.js';

describe('cli', () => {
  describe('parseArguments', () => {
    it('parses basic prompt execution command', () => {
      const argv = ['node', 'cli.js', 'implement', 'add user authentication'];
      
      const result = parseArguments(argv);

      expect(result).toEqual({
        engine: 'claude',
        promptName: 'implement',
        userText: 'add user authentication',
        dryRun: false,
        background: false,
        interactive: false,
        configPath: undefined
      });
    });

    it('handles prompt name only', () => {
      const argv = ['node', 'cli.js', 'plan'];
      
      const result = parseArguments(argv);

      expect(result).toEqual({
        engine: 'claude',
        promptName: 'plan',
        userText: undefined,
        dryRun: false,
        background: false,
        interactive: false,
        configPath: undefined
      });
    });

    it('parses --engine flag', () => {
      const argv = ['node', 'cli.js', '--engine', 'claude', 'review'];
      
      const result = parseArguments(argv);

      expect(result.engine).toBe('claude');
      expect(result.promptName).toBe('review');
    });

    it('parses --dry-run flag', () => {
      const argv = ['node', 'cli.js', '--dry-run', 'implement', 'test feature'];
      
      const result = parseArguments(argv);

      expect(result.dryRun).toBe(true);
      expect(result.promptName).toBe('implement');
      expect(result.userText).toBe('test feature');
    });

    it('parses --config flag', () => {
      const argv = ['node', 'cli.js', '--config', './custom.yaml', 'plan'];
      
      const result = parseArguments(argv);

      expect(result.configPath).toBe('./custom.yaml');
      expect(result.promptName).toBe('plan');
    });

    it('handles multiple flags', () => {
      const argv = ['node', 'cli.js', '--engine', 'claude', '--dry-run', '--config', './test.yaml', 'review', 'check code quality'];
      
      const result = parseArguments(argv);

      expect(result).toEqual({
        engine: 'claude',
        promptName: 'review',
        userText: 'check code quality',
        dryRun: true,
        background: false,
        interactive: false,
        configPath: './test.yaml'
      });
    });

    it('handles flags in different positions', () => {
      const argv = ['node', 'cli.js', 'implement', '--engine', 'claude', 'new feature', '--dry-run'];
      
      const result = parseArguments(argv);

      expect(result).toEqual({
        engine: 'claude',
        promptName: 'implement',
        userText: 'new feature',
        dryRun: true,
        background: false,
        interactive: false,
        configPath: undefined
      });
    });

    it('throws error for missing prompt name', () => {
      const argv = ['node', 'cli.js'];
      
      expect(() => parseArguments(argv)).toThrow('Prompt name is required');
    });

    it('throws error for invalid engine', () => {
      const argv = ['node', 'cli.js', '--engine', 'invalid', 'test'];
      
      expect(() => parseArguments(argv)).toThrow('Invalid engine: invalid. Must be "cursor" or "claude"');
    });

    it('throws error for --config without value', () => {
      const argv = ['node', 'cli.js', '--config'];
      
      expect(() => parseArguments(argv)).toThrow('--config requires a value');
    });

    it('throws error for --engine without value', () => {
      const argv = ['node', 'cli.js', '--engine'];
      
      expect(() => parseArguments(argv)).toThrow('--engine requires a value');
    });

    it('joins multiple user text arguments', () => {
      const argv = ['node', 'cli.js', 'implement', 'add', 'user', 'authentication', 'system'];
      
      const result = parseArguments(argv);

      expect(result.userText).toBe('add user authentication system');
    });

    it('handles empty user text gracefully', () => {
      const argv = ['node', 'cli.js', 'plan', ''];
      
      const result = parseArguments(argv);

      expect(result.userText).toBe('');
    });

    it('preserves user text with special characters', () => {
      const argv = ['node', 'cli.js', 'implement', 'fix bug with @user.email validation & error handling'];
      
      const result = parseArguments(argv);

      expect(result.userText).toBe('fix bug with @user.email validation & error handling');
    });

    it('parses --background flag', () => {
      const argv = ['node', 'cli.js', '--background', 'implement', 'test feature'];
      
      const result = parseArguments(argv);

      expect(result.background).toBe(true);
      expect(result.promptName).toBe('implement');
      expect(result.userText).toBe('test feature');
    });

    it('parses -n flag as alias for --dry-run', () => {
      const argv = ['node', 'cli.js', '-n', 'implement', 'test feature'];
      
      const result = parseArguments(argv);

      expect(result.dryRun).toBe(true);
      expect(result.promptName).toBe('implement');
      expect(result.userText).toBe('test feature');
    });

    it('handles multiple flags including background', () => {
      const argv = ['node', 'cli.js', '--engine', 'cursor', '--background', '-n', 'review', 'check code'];
      
      const result = parseArguments(argv);

      expect(result).toEqual({
        engine: 'cursor',
        promptName: 'review',
        userText: 'check code',
        dryRun: true,
        background: true,
        interactive: false,
        configPath: undefined
      });
    });

    it('parses --interactive flag', () => {
      const argv = ['node', 'cli.js', '--interactive', 'implement', 'test feature'];
      
      const result = parseArguments(argv);

      expect(result.interactive).toBe(true);
      expect(result.promptName).toBe('implement');
      expect(result.userText).toBe('test feature');
    });

    it('parses -i flag as alias for --interactive', () => {
      const argv = ['node', 'cli.js', '-i', 'implement', 'test feature'];
      
      const result = parseArguments(argv);

      expect(result.interactive).toBe(true);
      expect(result.promptName).toBe('implement');
      expect(result.userText).toBe('test feature');
    });

    it('handles interactive with other flags', () => {
      const argv = ['node', 'cli.js', '--engine', 'claude', '-i', 'review', 'check code'];
      
      const result = parseArguments(argv);

      expect(result).toEqual({
        engine: 'claude',
        promptName: 'review',
        userText: 'check code',
        dryRun: false,
        background: false,
        interactive: true,
        configPath: undefined
      });
    });
  });

  describe('printUsage', () => {
    it('prints usage information', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      printUsage();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Usage:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('code-cli [options] <prompt_name> [user_text]'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Options:'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--engine'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--dry-run'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('--config'));

      consoleSpy.mockRestore();
    });
  });
});