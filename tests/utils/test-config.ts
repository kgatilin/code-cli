import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import type { AgentConfig } from '../../src/types';

export interface TestConfigProvider {
  getTestConfig(overrides?: Partial<AgentConfig>): AgentConfig;
  createTestEnvFile(dir: string): string;
  getTestEnvTemplate(): string;
}

export class DefaultTestConfigProvider implements TestConfigProvider {
  private static instance: DefaultTestConfigProvider;
  private portOffset = 0;

  static getInstance(): DefaultTestConfigProvider {
    if (!DefaultTestConfigProvider.instance) {
      DefaultTestConfigProvider.instance = new DefaultTestConfigProvider();
    }
    return DefaultTestConfigProvider.instance;
  }

  getTestConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
    const basePort = 12000 + this.portOffset++;
    
    const defaultTestConfig: AgentConfig = {
      VERTEX_AI_PROJECT: 'test-project-id',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
      PROXY_PORT: basePort,
      DEBUG_MODE: true,
    };

    return {
      ...defaultTestConfig,
      ...overrides,
    };
  }

  createTestEnvFile(dir: string): string {
    const config = this.getTestConfig();
    const envContent = this.generateEnvContent(config);
    const envPath = join(dir, '.env.test');
    
    // Ensure directory exists
    mkdirSync(dirname(envPath), { recursive: true });
    
    // Write the file
    writeFileSync(envPath, envContent, 'utf8');
    
    return envPath;
  }

  getTestEnvTemplate(): string {
    const config = this.getTestConfig();
    return this.generateEnvContent(config);
  }

  private generateEnvContent(config: AgentConfig): string {
    return [
      '# Test Environment Configuration',
      '# This file is auto-generated for test isolation',
      '# Do not commit this file to version control',
      '',
      `VERTEX_AI_PROJECT=${config.VERTEX_AI_PROJECT}`,
      `VERTEX_AI_LOCATION=${config.VERTEX_AI_LOCATION}`,
      `VERTEX_AI_MODEL=${config.VERTEX_AI_MODEL}`,
      `PROXY_PORT=${config.PROXY_PORT}`,
      `DEBUG_MODE=${config.DEBUG_MODE}`,
      '',
      '# Test-specific settings',
      '# These values are safe for testing and will not affect production',
      '',
    ].join('\n');
  }
}

// Environment mocking utilities for test isolation
export class TestEnvironmentMocker {
  private originalEnv: Record<string, string | undefined> = {};
  private mockedVars = new Set<string>();

  mockEnvVar(key: string, value: string): void {
    if (!this.mockedVars.has(key)) {
      this.originalEnv[key] = process.env[key];
      this.mockedVars.add(key);
    }
    process.env[key] = value;
  }

  mockConfigEnv(config: AgentConfig): void {
    this.mockEnvVar('VERTEX_AI_PROJECT', config.VERTEX_AI_PROJECT);
    this.mockEnvVar('VERTEX_AI_LOCATION', config.VERTEX_AI_LOCATION);
    this.mockEnvVar('VERTEX_AI_MODEL', config.VERTEX_AI_MODEL);
    this.mockEnvVar('PROXY_PORT', config.PROXY_PORT.toString());
    this.mockEnvVar('DEBUG_MODE', config.DEBUG_MODE.toString());
  }

  restoreEnv(): void {
    for (const key of this.mockedVars) {
      const originalValue = this.originalEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
    
    this.originalEnv = {};
    this.mockedVars.clear();
  }

  restoreEnvVar(key: string): void {
    if (this.mockedVars.has(key)) {
      const originalValue = this.originalEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
      
      delete this.originalEnv[key];
      this.mockedVars.delete(key);
    }
  }
}

// Port allocation for test processes
export class TestPortAllocator {
  private static instance: TestPortAllocator;
  private allocatedPorts = new Set<number>();
  private basePort = 13000;
  private maxPort = 65535;

  static getInstance(): TestPortAllocator {
    if (!TestPortAllocator.instance) {
      TestPortAllocator.instance = new TestPortAllocator();
    }
    return TestPortAllocator.instance;
  }

  async allocatePort(): Promise<number> {
    for (let port = this.basePort; port <= this.maxPort; port++) {
      if (!this.allocatedPorts.has(port) && await this.isPortAvailable(port)) {
        this.allocatedPorts.add(port);
        return port;
      }
    }
    throw new Error('No available ports for testing');
  }

  releasePort(port: number): void {
    this.allocatedPorts.delete(port);
  }

  releaseAllPorts(): void {
    this.allocatedPorts.clear();
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

// Factory functions for easy test usage
export function createTestConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return DefaultTestConfigProvider.getInstance().getTestConfig(overrides);
}

export function createTestEnvFile(dir: string, overrides?: Partial<AgentConfig>): string {
  const provider = DefaultTestConfigProvider.getInstance();
  if (overrides) {
    const config = provider.getTestConfig(overrides);
    const envContent = provider.generateEnvContent(config);
    const envPath = join(dir, '.env.test');
    mkdirSync(dirname(envPath), { recursive: true });
    writeFileSync(envPath, envContent, 'utf8');
    return envPath;
  }
  return provider.createTestEnvFile(dir);
}

export function getTestEnvTemplate(): string {
  return DefaultTestConfigProvider.getInstance().getTestEnvTemplate();
}

// Singleton instances for global access
export const testConfigProvider = DefaultTestConfigProvider.getInstance();
export const testEnvironmentMocker = new TestEnvironmentMocker();
export const testPortAllocator = TestPortAllocator.getInstance();