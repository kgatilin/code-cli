import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups 
} from '../utils/index.js';

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
import { loadAgentConfig, getAgentConfigPath } from '../../src/agents/config.js';

describe('agents/config', () => {
  let testCodeCliDir: string;
  let testEnvFile: string;

  beforeEach(() => {
    // Create safe test directory
    testHomeDir = testEnv.createSafeTestDir();
    testCodeCliDir = join(testHomeDir, '.code-cli');
    testEnvFile = join(testCodeCliDir, '.env');
    
    // Create test directory structure
    if (!existsSync(testCodeCliDir)) {
      mkdirSync(testCodeCliDir, { recursive: true });
    }

    // Register cleanup for this test
    registerCleanup(async () => {
      testEnv.cleanupSafely(testHomeDir);
    });
  });

  afterEach(async () => {
    await executeAllCleanups();
  });

  describe('getAgentConfigPath', () => {
    it('returns the correct config file path', () => {
      const expectedPath = join(testHomeDir, '.code-cli', '.env');
      expect(getAgentConfigPath()).toBe(expectedPath);
    });
  });

  describe('loadAgentConfig', () => {
    it('loads valid configuration with all required fields', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROXY_PORT=8080',
        'DEBUG_MODE=true'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.VERTEX_AI_PROJECT).toBe('test-project');
      expect(config.VERTEX_AI_LOCATION).toBe('us-central1');
      expect(config.VERTEX_AI_MODEL).toBe('gemini-2.0-flash-exp');
      expect(config.PROXY_PORT).toBe(8080);
      expect(config.DEBUG_MODE).toBe(true);
    });

    it('applies default values for optional fields', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.PROXY_PORT).toBe(11434); // default
      expect(config.DEBUG_MODE).toBe(false); // default
    });

    it('handles quoted values correctly', () => {
      const envContent = [
        'VERTEX_AI_PROJECT="test-project"',
        "VERTEX_AI_LOCATION='us-central1'",
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.VERTEX_AI_PROJECT).toBe('test-project');
      expect(config.VERTEX_AI_LOCATION).toBe('us-central1');
    });

    it('ignores comments and empty lines', () => {
      const envContent = [
        '# This is a comment',
        '',
        'VERTEX_AI_PROJECT=test-project',
        '# Another comment',
        'VERTEX_AI_LOCATION=us-central1',
        '',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      const config = loadAgentConfig();
      
      expect(config.VERTEX_AI_PROJECT).toBe('test-project');
      expect(config.VERTEX_AI_LOCATION).toBe('us-central1');
      expect(config.VERTEX_AI_MODEL).toBe('gemini-2.0-flash-exp');
    });

    it('throws error when config file does not exist', () => {
      expect(() => loadAgentConfig()).toThrow(/Configuration file not found/);
    });

    it('throws error when required variables are missing', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project'
        // Missing VERTEX_AI_LOCATION and VERTEX_AI_MODEL
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Missing required environment variables/);
    });

    it('throws error when required variables are empty', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Missing required environment variables/);
    });

    it('validates port number is numeric', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROXY_PORT=invalid'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Invalid PROXY_PORT/);
    });

    it('validates port number is within valid range', () => {
      const envContent = [
        'VERTEX_AI_PROJECT=test-project',
        'VERTEX_AI_LOCATION=us-central1',
        'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
        'PROXY_PORT=70000'
      ].join('\n');
      
      writeFileSync(testEnvFile, envContent);
      
      expect(() => loadAgentConfig()).toThrow(/Invalid PROXY_PORT/);
    });

    it('parses boolean values correctly', () => {
      const testCases = [
        { value: 'true', expected: true },
        { value: 'True', expected: true },
        { value: 'TRUE', expected: true },
        { value: 'false', expected: false },
        { value: 'False', expected: false },
        { value: 'FALSE', expected: false },
        { value: 'anything-else', expected: false }
      ];

      testCases.forEach(({ value, expected }) => {
        // Ensure directory exists for each test case
        if (!existsSync(testCodeCliDir)) {
          mkdirSync(testCodeCliDir, { recursive: true });
        }
        
        const envContent = [
          'VERTEX_AI_PROJECT=test-project',
          'VERTEX_AI_LOCATION=us-central1',
          'VERTEX_AI_MODEL=gemini-2.0-flash-exp',
          `DEBUG_MODE=${value}`
        ].join('\n');
        
        writeFileSync(testEnvFile, envContent);
        
        const config = loadAgentConfig();
        expect(config.DEBUG_MODE).toBe(expected);
      });
    });
  });
});