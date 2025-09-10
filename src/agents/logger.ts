/**
 * Logging utility for agent server
 * 
 * Provides structured logging to ~/.code-cli/agent.log with configurable
 * log levels and proper file rotation.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  data?: unknown;
}

class Logger {
  private logFilePath: string;
  private debugMode: boolean;
  private consoleAvailable: boolean;

  constructor(debugMode = false) {
    const codeCliDir = join(homedir(), '.code-cli');
    if (!existsSync(codeCliDir)) {
      mkdirSync(codeCliDir, { recursive: true });
    }
    
    this.logFilePath = join(codeCliDir, 'agent.log');
    this.debugMode = debugMode;
    this.consoleAvailable = this.checkConsoleAvailability();
  }

  private checkConsoleAvailability(): boolean {
    try {
      // Check if stdout is available by testing if we can get its file descriptor
      // In detached processes, stdout might not be available or might be broken
      const hasStdout = process.stdout && process.stdout.writable;
      const hasStderr = process.stderr && process.stderr.writable;
      
      // Also check if we're running in a detached process by checking if process.send exists
      // (child processes with IPC have process.send, detached processes don't)
      const isDetached = !process.send && process.ppid !== process.pid;
      
      return hasStdout && hasStderr && !isDetached;
    } catch {
      return false;
    }
  }

  private shouldLog(level: LogLevel): boolean {
    if (level === 'DEBUG' && !this.debugMode) {
      return false;
    }
    return true;
  }

  private formatLogEntry(entry: LogEntry): string {
    const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : '';
    return `${entry.timestamp} [${entry.level}] ${entry.component}: ${entry.message}${dataStr}\n`;
  }

  private writeLog(level: LogLevel, component: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      component,
      message,
      data
    };

    const logLine = this.formatLogEntry(entry);
    
    try {
      // Always try to write to file first
      appendFileSync(this.logFilePath, logLine);
    } catch (error) {
      // If file writing fails, try console as fallback (if available)
      this.safeConsoleError(`Failed to write to log file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    // Also log to console in debug mode, but only if console is available
    if (this.debugMode && this.consoleAvailable) {
      this.safeConsoleLog(`[${level}] ${component}: ${message}`, data || '');
    }
  }

  private safeConsoleLog(message: string, data?: unknown): void {
    try {
      console.log(message, data);
    } catch (error) {
      // Silently ignore EPIPE and other console errors in detached processes
      // The file logging should still work
      if (error instanceof Error && error.message.includes('EPIPE')) {
        // Mark console as unavailable for future calls
        this.consoleAvailable = false;
      }
    }
  }

  private safeConsoleError(message: string): void {
    try {
      console.error(message);
    } catch (error) {
      // Silently ignore EPIPE and other console errors in detached processes
      if (error instanceof Error && error.message.includes('EPIPE')) {
        // Mark console as unavailable for future calls
        this.consoleAvailable = false;
      }
    }
  }

  debug(component: string, message: string, data?: unknown): void {
    this.writeLog('DEBUG', component, message, data);
  }

  info(component: string, message: string, data?: unknown): void {
    this.writeLog('INFO', component, message, data);
  }

  warning(component: string, message: string, data?: unknown): void {
    this.writeLog('WARNING', component, message, data);
  }

  error(component: string, message: string, data?: unknown): void {
    this.writeLog('ERROR', component, message, data);
  }

  /**
   * Clear the log file (useful for testing)
   */
  clear(): void {
    try {
      writeFileSync(this.logFilePath, '');
    } catch (error) {
      this.safeConsoleError(`Failed to clear log file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the log file path
   */
  getLogFilePath(): string {
    return this.logFilePath;
  }
}

// Global logger instance
let globalLogger: Logger | null = null;

/**
 * Initialize the global logger
 */
export function initializeLogger(debugMode = false): void {
  globalLogger = new Logger(debugMode);
}

/**
 * Get the global logger instance
 */
export function getLogger(): Logger {
  if (!globalLogger) {
    globalLogger = new Logger();
  }
  return globalLogger;
}

/**
 * Convenience logging functions
 */
export function logDebug(component: string, message: string, data?: unknown): void {
  getLogger().debug(component, message, data);
}

export function logInfo(component: string, message: string, data?: unknown): void {
  getLogger().info(component, message, data);
}

export function logWarning(component: string, message: string, data?: unknown): void {
  getLogger().warning(component, message, data);
}

export function logError(component: string, message: string, data?: unknown): void {
  getLogger().error(component, message, data);
}