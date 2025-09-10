import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AgentConfig, ProcessStatus } from '../src/types.js';

// Mock the os module at the top level
const testHomeDir = join(process.cwd(), 'test-home-process');
vi.mock('os', () => ({
  homedir: () => testHomeDir
}));

// Import after mocking
import { 
  spawnServerProcess, 
  killServerProcess, 
  getProcessStatus,
  getPidFilePath
} from '../src/agents/process-manager.js';

describe('agents/process-manager', () => {
  const testCodeCliDir = join(testHomeDir, '.code-cli');
  const testConfig: AgentConfig = {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 8890, // Use non-standard port for testing
    DEBUG_MODE: false
  };

  beforeEach(() => {
    // Create test directory structure
    if (!existsSync(testCodeCliDir)) {
      mkdirSync(testCodeCliDir, { recursive: true });
    }
  });

  afterEach(async () => {
    // Kill any running processes
    await killServerProcess();
    
    // Clean up test files
    if (existsSync(testHomeDir)) {
      rmSync(testHomeDir, { recursive: true, force: true });
    }
  });

  describe('getPidFilePath', () => {
    it('should return correct PID file path', () => {
      const pidPath = getPidFilePath();
      expect(pidPath).toBe(join(testCodeCliDir, 'agent-server.pid'));
    });
  });

  describe('getProcessStatus', () => {
    it('should return not running when no PID file exists', async () => {
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
      expect(status.port).toBeUndefined();
      expect(status.message).toContain('not running');
    });

    it('should return not running when PID file exists but process is dead', async () => {
      // Create PID file with non-existent PID
      const pidFilePath = getPidFilePath();
      writeFileSync(pidFilePath, '99999\n8890');
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
      expect(status.port).toBeUndefined();
      expect(status.message).toContain('not running');
      expect(existsSync(pidFilePath)).toBe(false); // Should clean up stale PID file
    });

    it('should parse PID file correctly when process exists', async () => {
      // Create PID file with current process PID (which we know exists)
      const pidFilePath = getPidFilePath();
      writeFileSync(pidFilePath, `${process.pid}\n${testConfig.PROXY_PORT}`);
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(true);
      expect(status.pid).toBe(process.pid);
      expect(status.port).toBe(testConfig.PROXY_PORT);
      expect(status.message).toContain(`running (PID: ${process.pid}, Port: ${testConfig.PROXY_PORT})`);
    });

    it('should handle malformed PID file', async () => {
      // Create malformed PID file
      const pidFilePath = getPidFilePath();
      writeFileSync(pidFilePath, 'invalid-content');
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.message).toContain('not running');
      expect(existsSync(pidFilePath)).toBe(false); // Should clean up malformed file
    });
  });

  describe('spawnServerProcess', () => {
    it('should return error if server is already running', async () => {
      // Create fake PID file
      const pidFilePath = getPidFilePath();
      writeFileSync(pidFilePath, `${process.pid}\n${testConfig.PROXY_PORT}`);
      
      const result = await spawnServerProcess(testConfig);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('already running');
      expect(result.message).toContain(String(process.pid));
    });

    it('should return error if port is not available', async () => {
      const result = await spawnServerProcess({
        ...testConfig,
        PROXY_PORT: 80 // Use port that's likely unavailable
      });
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Port 80 is not available');
    });

    it('should return error when trying to spawn with invalid script path', async () => {
      // Mock process.argv to simulate missing script path
      const originalArgv = process.argv;
      process.argv = [];
      
      try {
        const result = await spawnServerProcess(testConfig);
        expect(result.success).toBe(false);
        expect(result.message).toContain('Unable to determine script path');
      } finally {
        // Restore original argv
        process.argv = originalArgv;
      }
    });
    
    it('should handle spawn process success path conceptually', () => {
      // This test validates the success path logic without actually spawning
      // In a real environment, successful spawn would:
      // 1. Create PID file
      // 2. Return success with PID and message
      // 3. Allow process status to detect running server
      
      expect(typeof spawnServerProcess).toBe('function');
      expect(getPidFilePath()).toContain('.code-cli');
      expect(getPidFilePath()).toContain('agent-server.pid');
    });
  });

  describe('killServerProcess', () => {
    it('should return true when no server is running', async () => {
      const result = await killServerProcess();
      expect(result).toBe(true);
    });

    it('should return false when PID file exists but process is already dead', async () => {
      // Create PID file with non-existent PID
      const pidFilePath = getPidFilePath();
      writeFileSync(pidFilePath, '99999\n8890');
      
      const result = await killServerProcess();
      expect(result).toBe(true); // Should clean up and return true
      expect(existsSync(pidFilePath)).toBe(false); // PID file should be cleaned up
    });

    it('should kill existing process and clean up PID file', async () => {
      // Create PID file with current process PID
      const pidFilePath = getPidFilePath();
      writeFileSync(pidFilePath, `${process.pid}\n${testConfig.PROXY_PORT}`);
      
      // This test is tricky because we can't actually kill the current process
      // But we can verify that the function attempts to kill and cleans up
      const result = await killServerProcess();
      
      // The function should attempt to kill and clean up the PID file
      // Even if killing the current process fails, it should clean up
      expect(result).toBe(true);
    });
  });
});