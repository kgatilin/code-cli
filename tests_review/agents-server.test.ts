import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import type { AgentConfig } from '../src/types.js';
import { 
  TestEnvironment, 
  registerCleanup, 
  executeAllCleanups,
  testPortAllocator 
} from './utils/index.js';

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
import { createServer, isPortAvailable } from '../src/agents/server.js';

describe('agents/server', () => {
  let testConfig: AgentConfig;

  beforeEach(() => {
    // Create safe test directory
    testHomeDir = testEnv.createSafeTestDir();
    
    // Allocate unique port for this test
    const testPort = testPortAllocator.allocatePort();
    
    testConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
      PROXY_PORT: testPort,
      DEBUG_MODE: false
    };

    // Register cleanup for this test
    registerCleanup(async () => {
      // Clean up test files safely
      testEnv.cleanupSafely(testHomeDir);
      
      // Release allocated port
      testPortAllocator.releasePort(testPort);
    });
  });

  afterEach(async () => {
    // Execute all registered cleanups
    await executeAllCleanups();
  });

  describe('isPortAvailable', () => {
    it('should return true for available ports', async () => {
      const testPort = testPortAllocator.allocatePort();
      const available = await isPortAvailable(testPort);
      expect(available).toBe(true);
      testPortAllocator.releasePort(testPort);
    });

    it('should detect when a port is in use', async () => {
      // Allocate a unique port for this test
      const testPort = testPortAllocator.allocatePort();
      const available1 = await isPortAvailable(testPort);
      expect(available1).toBe(true);
      
      // Start a server on the port
      const testServer = await new Promise<any>((resolve) => {
        const server = require('http').createServer();
        server.listen(testPort, () => resolve(server));
      });
      
      // Register cleanup for the test server
      registerCleanup(async () => {
        await new Promise<void>((resolve) => {
          testServer.close(() => resolve());
        });
        testPortAllocator.releasePort(testPort);
      });
      
      // Now the port should not be available
      const available2 = await isPortAvailable(testPort);
      expect(available2).toBe(false);
    });
  });

  describe('createServer', () => {
    let httpServer: any;

    const startTestServer = async (app: any, port: number) => {
      httpServer = await new Promise<any>((resolve) => {
        const server = app.listen(port, () => resolve(server));
      });
      
      // Register cleanup for this server
      registerCleanup(async () => {
        if (httpServer) {
          await new Promise<void>((resolve) => {
            httpServer.close(() => resolve());
          });
          httpServer = null;
        }
      });
      
      return httpServer;
    };

    it('should create a server that responds to health check', async () => {
      const app = createServer(testConfig);
      
      await startTestServer(app, testConfig.PROXY_PORT);

      // Test health endpoint
      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/health`);
      expect(response.ok).toBe(true);
      
      const body = await response.json();
      expect(body).toEqual({
        status: 'healthy',
        version: '1.0.0',
        config: {
          model: testConfig.VERTEX_AI_MODEL,
          project: testConfig.VERTEX_AI_PROJECT,
          location: testConfig.VERTEX_AI_LOCATION
        }
      });
    });

    it('should handle CORS for OPTIONS requests', async () => {
      const app = createServer(testConfig);
      
      await startTestServer(app, testConfig.PROXY_PORT);

      // Test CORS preflight
      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/health`, {
        method: 'OPTIONS'
      });
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should return 404 for unknown endpoints', async () => {
      const app = createServer(testConfig);
      
      await startTestServer(app, testConfig.PROXY_PORT);

      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/unknown`);
      expect(response.status).toBe(404);
    });

    it('should handle /v1/chat/completions endpoint (placeholder for Phase 3)', async () => {
      const app = createServer(testConfig);
      
      await startTestServer(app, testConfig.PROXY_PORT);

      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'gpt-3.5-turbo'
        })
      });

      // Phase 2: Should return placeholder response
      expect(response.status).toBe(501); // Not Implemented
      const body = await response.json();
      expect(body.error).toContain('Chat completions not yet implemented');
      expect(body.error).toContain('Phase 3');
    });

    it('should validate request format for /v1/chat/completions', async () => {
      const app = createServer(testConfig);
      
      await startTestServer(app, testConfig.PROXY_PORT);

      // Test with invalid request body
      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          // Missing required 'messages' field
          model: 'gpt-3.5-turbo'
        })
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain('Invalid request format');
      expect(body.error).toContain('messages');
    });
  });
});