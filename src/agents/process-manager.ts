import { spawn, type ChildProcess } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentConfig, ProcessStatus, ProcessResult } from '../types.js';
import { isPortAvailable } from './server.js';
import { logDebug, logInfo, logWarning, logError, initializeLogger } from './logger.js';

export function getPidFilePath(): string {
  const codeCliDir = join(homedir(), '.code-cli');
  return join(codeCliDir, 'agent-server.pid');
}

function isProcessRunning(pid: number): boolean {
  try {
    // Sending signal 0 checks if process exists without actually signaling it
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function getProcessStatus(): Promise<ProcessStatus> {
  const pidFilePath = getPidFilePath();
  
  logDebug('ProcessManager', 'Checking process status', { pidFilePath });
  
  if (!existsSync(pidFilePath)) {
    logDebug('ProcessManager', 'No PID file found, server is not running');
    return {
      running: false,
      message: 'Agent server is not running'
    };
  }
  
  try {
    const pidFileContent = readFileSync(pidFilePath, 'utf-8').trim();
    const [pidStr, portStr] = pidFileContent.split('\n');
    
    logDebug('ProcessManager', 'PID file content', { pidStr, portStr });
    
    if (!pidStr || !portStr) {
      // Malformed PID file, clean it up
      logWarning('ProcessManager', 'Malformed PID file, cleaning up');
      unlinkSync(pidFilePath);
      return {
        running: false,
        message: 'Agent server is not running'
      };
    }
    
    const pid = parseInt(pidStr);
    const port = parseInt(portStr);
    
    if (isNaN(pid) || isNaN(port)) {
      // Invalid PID or port, clean up
      logWarning('ProcessManager', 'Invalid PID or port in PID file', { pidStr, portStr });
      unlinkSync(pidFilePath);
      return {
        running: false,
        message: 'Agent server is not running'
      };
    }
    
    const processRunning = isProcessRunning(pid);
    logDebug('ProcessManager', 'Process running check', { pid, running: processRunning });
    
    if (processRunning) {
      // Also check if port is actually accessible
      const portAvailable = await isPortAvailable(port);
      if (portAvailable) {
        logWarning('ProcessManager', 'Process is running but port is not in use', { pid, port });
        // Process exists but port is available - something's wrong
        return {
          running: false,
          pid,
          port,
          message: `Agent server process exists (PID: ${pid}) but is not responding on port ${port}`
        };
      }
      
      logDebug('ProcessManager', 'Server is running and responsive', { pid, port });
      return {
        running: true,
        pid,
        port,
        message: `Agent server is running (PID: ${pid}, Port: ${port})`
      };
    } else {
      // Process is dead, clean up stale PID file
      logWarning('ProcessManager', 'Process is dead, cleaning up stale PID file', { pid });
      unlinkSync(pidFilePath);
      return {
        running: false,
        message: 'Agent server is not running'
      };
    }
  } catch (error) {
    // Error reading PID file, clean up
    logError('ProcessManager', 'Error reading PID file', { error: error instanceof Error ? error.message : 'Unknown error' });
    if (existsSync(pidFilePath)) {
      unlinkSync(pidFilePath);
    }
    return {
      running: false,
      message: 'Agent server is not running'
    };
  }
}

export async function spawnServerProcess(config: AgentConfig): Promise<ProcessResult> {
  // Initialize logger with debug mode from config
  initializeLogger(config.DEBUG_MODE);
  
  logInfo('ProcessManager', 'Attempting to start server process', { port: config.PROXY_PORT });
  
  // Check if server is already running
  const status = await getProcessStatus();
  if (status.running) {
    logWarning('ProcessManager', 'Server already running', { pid: status.pid, port: status.port });
    return {
      success: false,
      message: `Agent server is already running (PID: ${status.pid}, Port: ${status.port})`
    };
  }
  
  // Check if port is available
  const portAvailable = await isPortAvailable(config.PROXY_PORT);
  if (!portAvailable) {
    logError('ProcessManager', 'Port not available', { port: config.PROXY_PORT });
    return {
      success: false,
      message: `Port ${config.PROXY_PORT} is not available. Please choose a different port or stop the process using that port.`
    };
  }
  
  try {
    // Get the current script path for spawning
    const scriptPath = process.argv[1];
    if (!scriptPath) {
      throw new Error('Unable to determine script path for spawning server process');
    }
    
    logInfo('ProcessManager', 'Spawning server process', { scriptPath, port: config.PROXY_PORT });
    
    
    // Spawn server process in detached mode with fully detached stdio
    // The server process will handle its own logging to files via the logger
    const serverProcess: ChildProcess = spawn(process.execPath, [scriptPath, 'agents', '__run-server'], {
      detached: true,
      stdio: 'ignore', // Fully detach stdio - server handles its own file logging
      env: {
        ...process.env,
        VERTEX_AI_PROJECT: config.VERTEX_AI_PROJECT,
        VERTEX_AI_LOCATION: config.VERTEX_AI_LOCATION,
        VERTEX_AI_MODEL: config.VERTEX_AI_MODEL,
        PROXY_PORT: config.PROXY_PORT.toString(),
        DEBUG_MODE: config.DEBUG_MODE.toString()
      }
    });
    
    // Handle process exit
    serverProcess.on('exit', (code, signal) => {
      logWarning('ProcessManager', 'Server process exited', { code, signal, pid: serverProcess.pid });
      // Clean up PID file when process exits
      const pidFilePath = getPidFilePath();
      if (existsSync(pidFilePath)) {
        unlinkSync(pidFilePath);
      }
    });
    
    serverProcess.on('error', (error) => {
      logError('ProcessManager', 'Server process error', { error: error.message, pid: serverProcess.pid });
    });
    
    // Unref so parent process can exit
    serverProcess.unref();
    
    // Ensure PID exists before writing file
    if (!serverProcess.pid) {
      throw new Error('Failed to get process ID for spawned server');
    }
    
    // Write PID file
    const pidFilePath = getPidFilePath();
    const pidContent = `${serverProcess.pid}\n${config.PROXY_PORT}`;
    writeFileSync(pidFilePath, pidContent);
    
    logInfo('ProcessManager', 'Server process started successfully', { 
      pid: serverProcess.pid, 
      port: config.PROXY_PORT,
      pidFilePath 
    });
    
    // Wait a moment to see if the process starts successfully
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if the process is still running
    const newStatus = await getProcessStatus();
    if (!newStatus.running) {
      logError('ProcessManager', 'Server process died shortly after startup');
      return {
        success: false,
        message: 'Server process started but died immediately. Check ~/.code-cli/agent.log for details.'
      };
    }
    
    return {
      success: true,
      message: `Agent server started successfully (PID: ${serverProcess.pid}, Port: ${config.PROXY_PORT})`,
      pid: serverProcess.pid!
    };
  } catch (error) {
    logError('ProcessManager', 'Failed to spawn server process', { error: error instanceof Error ? error.message : 'Unknown error' });
    return {
      success: false,
      message: `Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function killServerProcess(): Promise<boolean> {
  logInfo('ProcessManager', 'Attempting to stop server process');
  
  const status = await getProcessStatus();
  
  if (!status.running || !status.pid) {
    // No server running or PID file already cleaned up
    logInfo('ProcessManager', 'No server process to stop');
    return true;
  }
  
  logInfo('ProcessManager', 'Stopping server process', { pid: status.pid });
  
  try {
    // Try to kill the process
    process.kill(status.pid, 'SIGTERM');
    logDebug('ProcessManager', 'Sent SIGTERM to process', { pid: status.pid });
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // If process is still running, force kill
    if (isProcessRunning(status.pid)) {
      logWarning('ProcessManager', 'Process still running, sending SIGKILL', { pid: status.pid });
      process.kill(status.pid, 'SIGKILL');
    }
    
    // Clean up PID file
    const pidFilePath = getPidFilePath();
    if (existsSync(pidFilePath)) {
      unlinkSync(pidFilePath);
      logDebug('ProcessManager', 'Cleaned up PID file', { pidFilePath });
    }
    
    logInfo('ProcessManager', 'Server process stopped successfully');
    return true;
  } catch (error) {
    // Process might already be dead, clean up PID file anyway
    logWarning('ProcessManager', 'Error stopping process, cleaning up anyway', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    const pidFilePath = getPidFilePath();
    if (existsSync(pidFilePath)) {
      unlinkSync(pidFilePath);
      logDebug('ProcessManager', 'Cleaned up PID file after error', { pidFilePath });
    }
    
    // Return true because process is not running anymore
    return true;
  }
}