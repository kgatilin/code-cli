import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';

export interface TestConfig {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  port?: number;
  timeout?: number;
}

export interface TestProcess {
  id: string;
  process: ChildProcess;
  config: TestConfig;
  port?: number;
  startTime: number;
}

export class TestProcessManager extends EventEmitter {
  private static instance: TestProcessManager;
  private processes = new Map<string, TestProcess>();
  private portAllocator = new PortAllocator();
  private exitHandlersInstalled = false;

  constructor() {
    super();
    this.installExitHandlers();
  }

  static getInstance(): TestProcessManager {
    if (!TestProcessManager.instance) {
      TestProcessManager.instance = new TestProcessManager();
    }
    return TestProcessManager.instance;
  }

  async spawn(config: TestConfig): Promise<TestProcess> {
    const id = this.generateProcessId();
    const port = config.port || await this.portAllocator.allocate();
    
    const processConfig = {
      ...config,
      env: {
        ...process.env,
        ...config.env,
        PORT: port.toString(),
      },
    };

    const childProcess = spawn(processConfig.command, processConfig.args, {
      cwd: processConfig.cwd,
      env: processConfig.env,
      detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const testProcess: TestProcess = {
      id,
      process: childProcess,
      config: processConfig,
      port,
      startTime: Date.now(),
    };

    this.registerForCleanup(testProcess);

    // Wait for process to start or fail
    await this.waitForProcessStart(testProcess);

    return testProcess;
  }

  registerForCleanup(testProcess: TestProcess): void {
    this.processes.set(testProcess.id, testProcess);
    
    testProcess.process.on('exit', () => {
      this.processes.delete(testProcess.id);
      if (testProcess.port) {
        this.portAllocator.release(testProcess.port);
      }
    });
  }

  async killAll(): Promise<void> {
    const killPromises: Promise<void>[] = [];

    for (const testProcess of this.processes.values()) {
      killPromises.push(this.killProcess(testProcess));
    }

    await Promise.allSettled(killPromises);
    this.processes.clear();
  }

  async killProcess(testProcess: TestProcess, timeout = 5000): Promise<void> {
    return new Promise((resolve) => {
      if (!testProcess.process.pid || testProcess.process.killed) {
        resolve();
        return;
      }

      const cleanup = () => {
        this.processes.delete(testProcess.id);
        if (testProcess.port) {
          this.portAllocator.release(testProcess.port);
        }
        resolve();
      };

      testProcess.process.on('exit', cleanup);

      // Try graceful shutdown first
      testProcess.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (!testProcess.process.killed && testProcess.process.pid) {
          testProcess.process.kill('SIGKILL');
        }
        setTimeout(cleanup, 100); // Give a moment for cleanup
      }, timeout);
    });
  }

  getRunningProcesses(): TestProcess[] {
    return Array.from(this.processes.values());
  }

  async healthCheck(): Promise<{ healthy: TestProcess[]; unhealthy: TestProcess[] }> {
    const healthy: TestProcess[] = [];
    const unhealthy: TestProcess[] = [];

    for (const testProcess of this.processes.values()) {
      if (this.isProcessHealthy(testProcess)) {
        healthy.push(testProcess);
      } else {
        unhealthy.push(testProcess);
      }
    }

    return { healthy, unhealthy };
  }

  /**
   * Kill any MCP server processes that might be running
   * This is a safety net in case tests spawn real MCP processes
   */
  async killMCPProcesses(): Promise<void> {
    // Get list of all running processes using ps command
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    try {
      // Look for MCP server processes
      const { stdout } = await execAsync('ps aux | grep -E "(mcp-server|@modelcontextprotocol)" | grep -v grep');
      
      if (stdout.trim()) {
        const lines = stdout.trim().split('\n');
        const killPromises: Promise<void>[] = [];

        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid = parseInt(parts[1]);
          
          if (pid && !isNaN(pid)) {
            console.log(`Killing MCP process: PID ${pid}`);
            killPromises.push(this.killProcessByPID(pid));
          }
        }

        await Promise.allSettled(killPromises);
      }
    } catch (error) {
      // Silently continue if ps command fails or no processes found
      console.log('No MCP processes found or cleanup failed:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Kill a process by PID with graceful shutdown
   */
  private async killProcessByPID(pid: number, timeout = 5000): Promise<void> {
    return new Promise((resolve) => {
      try {
        // Try graceful shutdown first
        process.kill(pid, 'SIGTERM');
        
        // Force kill after timeout
        setTimeout(() => {
          try {
            process.kill(pid, 'SIGKILL');
          } catch (error) {
            // Process might already be dead
          }
          resolve();
        }, timeout);
      } catch (error) {
        // Process might already be dead or we don't have permission
        resolve();
      }
    });
  }

  /**
   * Enhanced killAll that also cleans up MCP processes
   */
  async killAllIncludingMCP(): Promise<void> {
    // Kill tracked processes
    await this.killAll();
    
    // Kill any MCP processes that might have been spawned
    await this.killMCPProcesses();
  }

  private async waitForProcessStart(testProcess: TestProcess, timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Process ${testProcess.id} failed to start within ${timeout}ms`));
      }, timeout);

      testProcess.process.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      testProcess.process.on('spawn', () => {
        clearTimeout(timer);
        resolve();
      });

      // If process exits immediately, that's usually an error
      testProcess.process.on('exit', (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Process ${testProcess.id} exited with code ${code}`));
        }
      });
    });
  }

  private isProcessHealthy(testProcess: TestProcess): boolean {
    const process = testProcess.process;
    return !process.killed && process.pid !== undefined && process.exitCode === null;
  }

  private generateProcessId(): string {
    return `test-process-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private installExitHandlers(): void {
    if (this.exitHandlersInstalled) return;

    const cleanup = async () => {
      await this.killAll();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', cleanup);
    process.on('unhandledRejection', cleanup);

    this.exitHandlersInstalled = true;
  }
}

class PortAllocator {
  private allocatedPorts = new Set<number>();
  private basePort = 10000;
  private maxPort = 65535;

  async allocate(): Promise<number> {
    for (let port = this.basePort; port <= this.maxPort; port++) {
      if (!this.allocatedPorts.has(port) && await this.isPortAvailable(port)) {
        this.allocatedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports');
  }

  release(port: number): void {
    this.allocatedPorts.delete(port);
  }

  private async isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = require('net').createServer();
      
      server.listen(port, () => {
        server.close(() => resolve(true));
      });

      server.on('error', () => resolve(false));
    });
  }
}

// Singleton instance for global access
export const testProcessManager = TestProcessManager.getInstance();