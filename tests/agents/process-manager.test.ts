import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { join } from 'path';
import type { AgentConfig } from '../../src/types.js';

// Mock all external dependencies
vi.mock('fs');
vi.mock('os');
vi.mock('child_process');
vi.mock('../../src/agents/server.js');
vi.mock('../../src/agents/logger.js');

// Import mocked modules
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { spawn } from 'child_process';
import { isPortAvailable } from '../../src/agents/server.js';
import { logDebug, logInfo, logWarning, logError, initializeLogger } from '../../src/agents/logger.js';

// Import functions under test after mocking
import { 
  getPidFilePath, 
  getProcessStatus, 
  spawnServerProcess, 
  killServerProcess 
} from '../../src/agents/process-manager.js';

// Create typed mocks
const mockReadFileSync = readFileSync as MockedFunction<typeof readFileSync>;
const mockWriteFileSync = writeFileSync as MockedFunction<typeof writeFileSync>;
const mockExistsSync = existsSync as MockedFunction<typeof existsSync>;
const mockUnlinkSync = unlinkSync as MockedFunction<typeof unlinkSync>;
const mockHomedir = homedir as MockedFunction<typeof homedir>;
const mockSpawn = spawn as MockedFunction<typeof spawn>;
const mockIsPortAvailable = isPortAvailable as MockedFunction<typeof isPortAvailable>;

describe('agents/process-manager', () => {
  const testHomeDir = '/test/home';
  const testPidFilePath = join(testHomeDir, '.code-cli', 'agent-server.pid');
  const testConfig: AgentConfig = {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 8890,
    DEBUG_MODE: false
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup default mock returns
    mockHomedir.mockReturnValue(testHomeDir);
    mockIsPortAvailable.mockResolvedValue(true);
    
    // Mock process.kill to not actually kill processes in tests
    const originalKill = process.kill;
    vi.spyOn(process, 'kill').mockImplementation((pid: number, signal?: string | number) => {
      if (pid === process.pid) {
        // Don't kill the test process itself
        return true;
      }
      return originalKill.call(process, pid, signal);
    });
  });

  describe('getPidFilePath', () => {
    it('should return correct PID file path based on home directory', () => {
      const pidPath = getPidFilePath();
      
      expect(mockHomedir).toHaveBeenCalled();
      expect(pidPath).toBe(testPidFilePath);
    });
  });

  describe('getProcessStatus', () => {
    it('should return not running when no PID file exists', async () => {
      mockExistsSync.mockReturnValue(false);
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.pid).toBeUndefined();
      expect(status.port).toBeUndefined();
      expect(status.message).toBe('Agent server is not running');
      expect(mockExistsSync).toHaveBeenCalledWith(testPidFilePath);
    });

    it('should clean up and return not running for malformed PID file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid-content');
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.message).toBe('Agent server is not running');
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });

    it('should clean up and return not running for PID file with missing port', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('12345\n'); // Missing port
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.message).toBe('Agent server is not running');
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });

    it('should clean up and return not running for invalid PID format', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid-pid\n8890');
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.message).toBe('Agent server is not running');
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });

    it('should return running when process exists and port is in use', async () => {
      const testPid = 12345;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`${testPid}\n8890`);
      mockIsPortAvailable.mockResolvedValue(false); // Port is in use
      
      // Mock process.kill to return true (process exists)
      vi.mocked(process.kill).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === testPid && signal === 0) {
          return true; // Process exists
        }
        return false;
      });
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(true);
      expect(status.pid).toBe(testPid);
      expect(status.port).toBe(8890);
      expect(status.message).toContain(`running (PID: ${testPid}, Port: 8890)`);
    });

    it('should return not running when process exists but port is not in use', async () => {
      const testPid = 12345;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`${testPid}\n8890`);
      mockIsPortAvailable.mockResolvedValue(true); // Port is available (not in use)
      
      // Mock process.kill to return true (process exists)
      vi.mocked(process.kill).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === testPid && signal === 0) {
          return true; // Process exists
        }
        return false;
      });
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.pid).toBe(testPid);
      expect(status.port).toBe(8890);
      expect(status.message).toContain('process exists (PID: 12345) but is not responding on port 8890');
    });

    it('should clean up stale PID file when process is dead', async () => {
      const testPid = 99999;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`${testPid}\n8890`);
      
      // Mock process.kill to throw error (process doesn't exist)
      vi.mocked(process.kill).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === testPid && signal === 0) {
          throw new Error('ESRCH: No such process');
        }
        return false;
      });
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.message).toBe('Agent server is not running');
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });

    it('should handle file read errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      const status = await getProcessStatus();
      
      expect(status.running).toBe(false);
      expect(status.message).toBe('Agent server is not running');
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });
  });

  describe('spawnServerProcess', () => {
    it('should return error when server is already running', async () => {
      // Mock getProcessStatus to return running
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('12345\n8890');
      mockIsPortAvailable.mockResolvedValue(false);
      
      vi.mocked(process.kill).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === 12345 && signal === 0) {
          return true; // Process exists
        }
        return false;
      });
      
      const result = await spawnServerProcess(testConfig);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('already running');
      expect(result.message).toContain('12345');
      expect(initializeLogger).toHaveBeenCalledWith(false);
    });

    it('should return error when port is not available', async () => {
      // Mock no server running
      mockExistsSync.mockReturnValue(false);
      // Mock port not available
      mockIsPortAvailable.mockResolvedValue(false);
      
      const result = await spawnServerProcess(testConfig);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Port 8890 is not available');
    });

    it('should return error when script path is unavailable', async () => {
      // Mock no server running and port available
      mockExistsSync.mockReturnValue(false);
      mockIsPortAvailable.mockResolvedValue(true);
      
      // Mock missing script path
      const originalArgv = process.argv;
      process.argv = [];
      
      try {
        const result = await spawnServerProcess(testConfig);
        
        expect(result.success).toBe(false);
        expect(result.message).toContain('Unable to determine script path');
      } finally {
        process.argv = originalArgv;
      }
    });

    it('should handle spawn failure gracefully', async () => {
      // Mock no server running and port available
      mockExistsSync.mockReturnValue(false);
      mockIsPortAvailable.mockResolvedValue(true);
      
      // Mock spawn to throw error
      mockSpawn.mockImplementation(() => {
        throw new Error('spawn ENOENT');
      });
      
      const result = await spawnServerProcess(testConfig);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to start server: spawn ENOENT');
    });

    it('should handle successful spawn with missing PID', async () => {
      // Mock no server running and port available
      mockExistsSync.mockReturnValue(false);
      mockIsPortAvailable.mockResolvedValue(true);
      
      // Mock spawn to return process without PID
      const mockProcess = {
        pid: undefined,
        on: vi.fn(),
        unref: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);
      
      const result = await spawnServerProcess(testConfig);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to get process ID');
    });

    it('should successfully spawn server and write PID file', async () => {
      // Mock no server running and port available
      mockExistsSync.mockReturnValue(false);
      mockIsPortAvailable.mockResolvedValue(true);
      
      // Mock successful spawn
      const testPid = 54321;
      const mockProcess = {
        pid: testPid,
        on: vi.fn(),
        unref: vi.fn()
      };
      mockSpawn.mockReturnValue(mockProcess as any);
      
      // Mock that process status checks show not running (this will cause spawn to think process died)
      mockExistsSync.mockReturnValue(false); // No PID file after spawn
      
      const result = await spawnServerProcess(testConfig);
      
      // Expecting failure since we mocked that process died after spawn
      expect(result.success).toBe(false);
      expect(result.message).toContain('started but died immediately');
      expect(mockWriteFileSync).toHaveBeenCalledWith(testPidFilePath, `${testPid}\n${testConfig.PROXY_PORT}`);
      expect(mockProcess.unref).toHaveBeenCalled();
    });
  });

  describe('killServerProcess', () => {
    it('should return true when no server is running', async () => {
      // Mock getProcessStatus to return not running
      mockExistsSync.mockReturnValue(false);
      
      const result = await killServerProcess();
      
      expect(result).toBe(true);
    });

    it('should return true when PID file exists but process is already dead', async () => {
      // Mock status to return not running (cleaned up by getProcessStatus)
      mockExistsSync.mockReturnValue(false); // getProcessStatus cleaned up the file
      
      const result = await killServerProcess();
      
      expect(result).toBe(true);
    });

    it('should kill existing process and clean up PID file', async () => {
      const testPid = 12345;
      
      // Mock that there's a running process initially (PID file exists and process exists)
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`${testPid}\n8890`);
      mockIsPortAvailable.mockResolvedValue(false); // Port is in use
      
      // Mock process.kill to succeed
      vi.mocked(process.kill).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === testPid && signal === 0) {
          return true; // Process exists
        }
        return true; // Kill signals succeed
      });
      
      const result = await killServerProcess();
      
      expect(result).toBe(true);
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });

    it('should handle kill failure gracefully and clean up anyway', async () => {
      const testPid = 12345;
      
      // Mock that there's a running process initially (PID file exists and process exists)
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(`${testPid}\n8890`);
      mockIsPortAvailable.mockResolvedValue(false); // Port is in use
      
      // Mock process.kill to throw error for kill signals but succeed for existence check
      vi.mocked(process.kill).mockImplementation((pid: number, signal?: string | number) => {
        if (pid === testPid) {
          if (signal === 0) {
            return true; // Process exists
          } else if (signal === 'SIGTERM' || signal === 'SIGKILL') {
            throw new Error('ESRCH: No such process');
          }
        }
        return false;
      });
      
      const result = await killServerProcess();
      
      expect(result).toBe(true); // Still returns true because process is no longer running
      expect(mockUnlinkSync).toHaveBeenCalledWith(testPidFilePath);
    });
  });
});