import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { loadConfig, getDefaultConfig, mergeConfigs, validateConfig } from '../src/config-loader.js';
import type { Config } from '../src/types.js';

describe('config-loader', () => {
  const testDir = join(process.cwd(), 'test-config');
  const testConfigPath = join(testDir, '.cc.yaml');

  beforeEach(() => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    // Change to test directory
    process.chdir(testDir);
  });

  afterEach(() => {
    // Change back to original directory
    process.chdir(join(testDir, '..'));
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getDefaultConfig', () => {
    it('returns default configuration values', () => {
      const config = getDefaultConfig();
      
      expect(config).toEqual({
        promptsPath: './.claude/prompts',
        logsPath: '.agent/log',
        taskPath: '.agent/task',
        templatesPath: './.claude/templates',
        snippetsPath: './.claude/snippets',
        reviewPattern: '//Review:',
        reviewSearchPaths: ['src', 'test'],
        reviewSearchExtensions: ['.ts'],
        reviewSearchExcludes: [],
        modelMappings: {},
        includePaths: {
          prompts: './.claude/prompts',
          templates: './.claude/templates',
          snippets: './.claude/snippets'
        },
        globalPaths: {
          prompts: expect.stringContaining('/.claude/prompts'),
          templates: expect.stringContaining('/.claude/templates'),
          snippets: expect.stringContaining('/.claude/snippets')
        }
      });
    });
  });

  describe('validateConfig', () => {
    it('accepts valid configuration object', () => {
      const validConfig = {
        promptsPath: './custom/prompts',
        logsPath: '.agent/log',
        taskPath: '.agent/task',
        reviewPattern: '#Review:',
        reviewSearchPaths: ['src', 'lib', 'test'],
        reviewSearchExtensions: ['.ts', '.js', '.py'],
        modelMappings: { plan: 'opus' }
      };

      expect(() => validateConfig(validConfig)).not.toThrow();
      expect(validateConfig(validConfig)).toEqual(validConfig);
    });

    it('accepts partial configuration object', () => {
      const partialConfig = {
        reviewPattern: '#Review:',
        modelMappings: { plan: 'opus' }
      };

      expect(() => validateConfig(partialConfig)).not.toThrow();
      expect(validateConfig(partialConfig)).toEqual(partialConfig);
    });

    it('throws error for invalid configuration', () => {
      const invalidConfig = {
        promptsPath: 123, // should be string
        modelMappings: 'invalid' // should be object
      };

      expect(() => validateConfig(invalidConfig)).toThrow('Invalid configuration');
    });

    it('throws error for non-object input', () => {
      expect(() => validateConfig('not an object')).toThrow('Configuration must be an object');
    });

    it('throws error for invalid reviewSearchPaths type', () => {
      const invalidConfig = {
        reviewSearchPaths: 'should be array'
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchPaths must be an array');
    });

    it('throws error for non-string items in reviewSearchPaths', () => {
      const invalidConfig = {
        reviewSearchPaths: ['src', 123, 'test'] // number should be string
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchPaths must contain only strings');
    });

    it('throws error for invalid reviewSearchExtensions type', () => {
      const invalidConfig = {
        reviewSearchExtensions: 'should be array'
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchExtensions must be an array');
    });

    it('throws error for non-string items in reviewSearchExtensions', () => {
      const invalidConfig = {
        reviewSearchExtensions: ['.ts', 123, '.js'] // number should be string
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchExtensions must contain only strings');
    });

    it('throws error for extensions not starting with dot', () => {
      const invalidConfig = {
        reviewSearchExtensions: ['.ts', 'js'] // should be '.js'
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchExtensions must start with a dot');
    });

    it('throws error for invalid reviewSearchExcludes type', () => {
      const invalidConfig = {
        reviewSearchExcludes: 'should be array'
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchExcludes must be an array');
    });

    it('throws error for non-string items in reviewSearchExcludes', () => {
      const invalidConfig = {
        reviewSearchExcludes: ['*.test.ts', 123, 'excluded.ts'] // number should be string
      };
      expect(() => validateConfig(invalidConfig)).toThrow('reviewSearchExcludes must contain only strings');
    });

    it('accepts valid reviewSearchExcludes', () => {
      const validConfig = {
        reviewSearchExcludes: ['*.test.ts', '*.spec.ts', 'excluded.ts']
      };
      expect(() => validateConfig(validConfig)).not.toThrow();
    });
  });

  describe('mergeConfigs', () => {
    it('merges base and override configurations', () => {
      const base: Config = {
        promptsPath: './.claude/prompts',
        logsPath: '.agent/log',
        taskPath: '.agent/task',
        templatesPath: './.claude/templates',
        snippetsPath: './.claude/snippets',
        reviewPattern: '//Review:',
        reviewSearchPaths: ['src', 'test'],
        reviewSearchExtensions: ['.ts'],
        reviewSearchExcludes: [],
        modelMappings: {},
        includePaths: {
          prompts: './.claude/prompts',
          templates: './.claude/templates',
          snippets: './.claude/snippets'
        },
        globalPaths: {
          prompts: '/test/global/prompts',
          templates: '/test/global/templates',
          snippets: '/test/global/snippets'
        }
      };

      const override = {
        reviewPattern: '#Review:',
        modelMappings: { plan: 'opus' }
      };

      const merged = mergeConfigs(base, override);

      expect(merged).toEqual({
        promptsPath: './.claude/prompts',
        logsPath: '.agent/log',
        taskPath: '.agent/task',
        templatesPath: './.claude/templates',
        snippetsPath: './.claude/snippets',
        reviewPattern: '#Review:',
        reviewSearchPaths: ['src', 'test'],
        reviewSearchExtensions: ['.ts'],
        reviewSearchExcludes: [],
        modelMappings: { plan: 'opus' },
        includePaths: {
          prompts: './.claude/prompts',
          templates: './.claude/templates',
          snippets: './.claude/snippets'
        },
        globalPaths: {
          prompts: '/test/global/prompts',
          templates: '/test/global/templates',
          snippets: '/test/global/snippets'
        }
      });
    });

    it('preserves base values when override is empty', () => {
      const base: Config = getDefaultConfig();
      const override = {};

      const merged = mergeConfigs(base, override);

      expect(merged).toEqual(base);
    });

    it('deeply merges modelMappings', () => {
      const base: Config = {
        ...getDefaultConfig(),
        modelMappings: { plan: 'opus', review: 'sonnet' }
      };

      const override = {
        modelMappings: { plan: 'haiku', implement: 'sonnet' }
      };

      const merged = mergeConfigs(base, override);

      expect(merged.modelMappings).toEqual({
        plan: 'haiku',
        review: 'sonnet',
        implement: 'sonnet'
      });
    });
  });

  describe('loadConfig', () => {
    it('returns default config when no config file exists', () => {
      const config = loadConfig();
      
      expect(config).toEqual(getDefaultConfig());
    });

    it('loads and merges .cc.yaml config file', () => {
      const yamlContent = `
reviewPattern: "#Review:"
modelMappings:
  plan: opus
  review: sonnet
`;
      writeFileSync(testConfigPath, yamlContent);

      const config = loadConfig();

      expect(config.reviewPattern).toBe('#Review:');
      expect(config.modelMappings).toEqual({
        plan: 'opus',
        review: 'sonnet'
      });
      expect(config.promptsPath).toBe('./.claude/prompts'); // default value preserved
    });

    it('loads .cc.yml as fallback', () => {
      const ymlPath = join(testDir, '.cc.yml');
      const yamlContent = `
reviewPattern: "#Review:"
`;
      writeFileSync(ymlPath, yamlContent);

      const config = loadConfig();

      expect(config.reviewPattern).toBe('#Review:');
    });

    it('loads config from specified path', () => {
      const customPath = join(testDir, 'custom-config.yaml');
      const yamlContent = `
promptsPath: ./custom/prompts
`;
      writeFileSync(customPath, yamlContent);

      const config = loadConfig(customPath);

      expect(config.promptsPath).toBe('./custom/prompts');
    });

    it('throws error for invalid YAML syntax', () => {
      const invalidYaml = `
promptsPath: ./prompts
  invalid: yaml: syntax
`;
      writeFileSync(testConfigPath, invalidYaml);

      expect(() => loadConfig()).toThrow('Failed to parse configuration file');
    });

    it('throws error for invalid configuration values', () => {
      const invalidConfig = `
promptsPath: 123
modelMappings: "not an object"
`;
      writeFileSync(testConfigPath, invalidConfig);

      expect(() => loadConfig()).toThrow('Invalid configuration');
    });

    it('throws error when specified config file does not exist', () => {
      expect(() => loadConfig('./nonexistent.yaml')).toThrow('Configuration file not found');
    });
  });
});