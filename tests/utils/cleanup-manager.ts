import { EventEmitter } from 'events';

export interface CleanupFunction {
  (): Promise<void>;
}

export interface CleanupTask {
  id: string;
  name: string;
  cleanup: CleanupFunction;
  registeredAt: number;
  timeout?: number;
}

export interface CleanupOptions {
  name?: string;
  timeout?: number;
}

export interface CleanupResult {
  id: string;
  name: string;
  success: boolean;
  duration: number;
  error?: Error;
}

export class CleanupManager extends EventEmitter {
  private static instance: CleanupManager;
  private cleanupTasks: CleanupTask[] = [];
  private executing = false;
  private handlersInstalled = false;
  private logger?: (message: string) => void;

  constructor() {
    super();
    this.setupGlobalHandlers();
  }

  static getInstance(): CleanupManager {
    if (!CleanupManager.instance) {
      CleanupManager.instance = new CleanupManager();
    }
    return CleanupManager.instance;
  }

  setLogger(logger: (message: string) => void): void {
    this.logger = logger;
  }

  register(cleanup: CleanupFunction, options: CleanupOptions = {}): string {
    const id = this.generateTaskId();
    const task: CleanupTask = {
      id,
      name: options.name || `cleanup-${id}`,
      cleanup,
      registeredAt: Date.now(),
      timeout: options.timeout || 10000, // 10 second default timeout
    };

    this.cleanupTasks.push(task);
    this.log(`Registered cleanup task: ${task.name} (${id})`);
    this.emit('taskRegistered', task);

    return id;
  }

  unregister(id: string): boolean {
    const index = this.cleanupTasks.findIndex(task => task.id === id);
    if (index >= 0) {
      const task = this.cleanupTasks.splice(index, 1)[0];
      this.log(`Unregistered cleanup task: ${task.name} (${id})`);
      this.emit('taskUnregistered', task);
      return true;
    }
    return false;
  }

  async executeAll(forceTimeout?: number): Promise<CleanupResult[]> {
    if (this.executing) {
      this.log('Cleanup already executing, waiting for completion...');
      await this.waitForCompletion();
      return [];
    }

    this.executing = true;
    this.log(`Starting cleanup of ${this.cleanupTasks.length} tasks`);
    this.emit('cleanupStarted', this.cleanupTasks.length);

    const results: CleanupResult[] = [];
    
    // Execute cleanup tasks in reverse order (LIFO)
    const tasksToExecute = [...this.cleanupTasks].reverse();
    
    for (const task of tasksToExecute) {
      const result = await this.executeTask(task, forceTimeout);
      results.push(result);
    }

    // Clear all tasks after execution
    this.cleanupTasks = [];
    this.executing = false;

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    
    this.log(`Cleanup completed: ${successCount} succeeded, ${failureCount} failed`);
    this.emit('cleanupCompleted', { results, successCount, failureCount });

    return results;
  }

  async executeTask(task: CleanupTask, forceTimeout?: number): Promise<CleanupResult> {
    const startTime = Date.now();
    const timeout = forceTimeout || task.timeout || 10000;
    
    this.log(`Executing cleanup task: ${task.name} (timeout: ${timeout}ms)`);
    this.emit('taskStarted', task);

    try {
      await this.withTimeout(task.cleanup(), timeout, `Cleanup task '${task.name}' timed out`);
      
      const duration = Date.now() - startTime;
      const result: CleanupResult = {
        id: task.id,
        name: task.name,
        success: true,
        duration,
      };

      this.log(`Cleanup task completed: ${task.name} (${duration}ms)`);
      this.emit('taskCompleted', result);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      const result: CleanupResult = {
        id: task.id,
        name: task.name,
        success: false,
        duration,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.log(`Cleanup task failed: ${task.name} (${duration}ms) - ${result.error?.message}`);
      this.emit('taskFailed', result);
      return result;
    }
  }

  getRegisteredTasks(): CleanupTask[] {
    return [...this.cleanupTasks];
  }

  isExecuting(): boolean {
    return this.executing;
  }

  setupGlobalHandlers(): void {
    if (this.handlersInstalled) return;

    const gracefulShutdown = async (signal: string) => {
      this.log(`Received ${signal}, executing cleanup...`);
      try {
        await this.executeAll(5000); // 5 second timeout for shutdown
        process.exit(0);
      } catch (error) {
        this.log(`Cleanup failed during shutdown: ${error}`);
        process.exit(1);
      }
    };

    const emergencyShutdown = async () => {
      this.log('Emergency shutdown - executing critical cleanup only');
      try {
        await this.executeAll(1000); // 1 second timeout for emergency
      } catch (error) {
        this.log(`Emergency cleanup failed: ${error}`);
      }
      process.exit(1);
    };

    // Graceful shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Emergency handlers
    process.on('uncaughtException', emergencyShutdown);
    process.on('unhandledRejection', emergencyShutdown);

    // Prevent multiple installations
    this.handlersInstalled = true;
    this.log('Global cleanup handlers installed');
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutMessage));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.executing) {
        resolve();
        return;
      }

      const checkComplete = () => {
        if (!this.executing) {
          resolve();
        } else {
          setTimeout(checkComplete, 100);
        }
      };

      checkComplete();
    });
  }

  private generateTaskId(): string {
    return `cleanup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] CleanupManager: ${message}`;
    
    if (this.logger) {
      this.logger(logMessage);
    } else if (process.env.NODE_ENV === 'test' || process.env.DEBUG_MODE === 'true') {
      console.log(logMessage);
    }
  }
}

/**
 * Register cleanup that includes MCP process cleanup
 * This is a safety net for any MCP processes that might leak
 */
export function registerMCPCleanup(): string {
  return registerCleanup(async () => {
    // Import here to avoid circular dependencies
    const { testProcessManager } = await import('./test-process-manager.js');
    await testProcessManager.killAllIncludingMCP();
  }, { 
    name: 'mcp-process-cleanup',
    timeout: 15000 // Give more time for MCP cleanup
  });
}

// Convenience functions for test usage
export function registerCleanup(
  cleanup: CleanupFunction,
  options?: CleanupOptions
): string {
  return CleanupManager.getInstance().register(cleanup, options);
}

export function unregisterCleanup(id: string): boolean {
  return CleanupManager.getInstance().unregister(id);
}

export async function executeAllCleanups(): Promise<CleanupResult[]> {
  return CleanupManager.getInstance().executeAll();
}

/**
 * Enhanced cleanup that includes MCP process cleanup
 */
export async function executeAllCleanupsIncludingMCP(): Promise<CleanupResult[]> {
  // Register MCP cleanup if not already registered
  registerMCPCleanup();
  
  // Execute all cleanups
  return CleanupManager.getInstance().executeAll();
}

export function setupGlobalCleanupHandlers(): void {
  CleanupManager.getInstance().setupGlobalHandlers();
}

// Singleton instance for global access
export const cleanupManager = CleanupManager.getInstance();