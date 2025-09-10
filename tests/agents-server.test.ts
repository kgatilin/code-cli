import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'path';
import type { AgentConfig } from '../src/types.js';

// Mock the os module at the top level
const testHomeDir = join(process.cwd(), 'test-home-server');
vi.mock('os', () => ({
  homedir: () => testHomeDir
}));

// Import after mocking
import { createServer, isPortAvailable } from '../src/agents/server.js';

describe('agents/server', () => {
  const testConfig: AgentConfig = {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 8888, // Use non-standard port for testing
    DEBUG_MODE: false
  };

  describe('isPortAvailable', () => {
    it('should return true for available ports', async () => {
      const available = await isPortAvailable(8889); // Use uncommon port
      expect(available).toBe(true);
    });

    it('should detect when a port is in use', async () => {
      // First test that our test port is available
      const testPort = 8887;
      const available1 = await isPortAvailable(testPort);
      expect(available1).toBe(true);
      
      // Start a server on the port
      const testServer = await new Promise<any>((resolve) => {
        const server = require('http').createServer();
        server.listen(testPort, () => resolve(server));
      });
      
      // Now the port should not be available
      const available2 = await isPortAvailable(testPort);
      expect(available2).toBe(false);
      
      // Clean up
      await new Promise<void>((resolve) => {
        testServer.close(() => resolve());
      });
    });
  });

  describe('createServer', () => {
    let httpServer: any;

    afterEach(async () => {
      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer.close(() => resolve());
        });
        httpServer = null;
      }
    });

    it('should create a server that responds to health check', async () => {
      const app = createServer(testConfig);
      
      httpServer = await new Promise<any>((resolve) => {
        const server = app.listen(testConfig.PROXY_PORT, () => resolve(server));
      });

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
      
      httpServer = await new Promise<any>((resolve) => {
        const server = app.listen(testConfig.PROXY_PORT, () => resolve(server));
      });

      // Test CORS preflight
      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/health`, {
        method: 'OPTIONS'
      });
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('should return 404 for unknown endpoints', async () => {
      const app = createServer(testConfig);
      
      httpServer = await new Promise<any>((resolve) => {
        const server = app.listen(testConfig.PROXY_PORT, () => resolve(server));
      });

      const response = await fetch(`http://localhost:${testConfig.PROXY_PORT}/unknown`);
      expect(response.status).toBe(404);
    });

    it('should handle /v1/chat/completions endpoint (placeholder for Phase 3)', async () => {
      const app = createServer(testConfig);
      
      httpServer = await new Promise<any>((resolve) => {
        const server = app.listen(testConfig.PROXY_PORT, () => resolve(server));
      });

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
      
      httpServer = await new Promise<any>((resolve) => {
        const server = app.listen(testConfig.PROXY_PORT, () => resolve(server));
      });

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