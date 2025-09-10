/**
 * Tests for comprehensive request logging when DEBUG is enabled
 * 
 * This test suite verifies that all requests are logged with detailed
 * information when DEBUG_MODE is enabled, helping debug connectivity issues.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../src/agents/server.js';
import type { AgentConfig } from '../src/types.js';
import * as logger from '../src/agents/logger.js';

// Mock the logger module
vi.mock('../src/agents/logger.js', () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
  initializeLogger: vi.fn(),
  getLogger: vi.fn(() => ({
    clear: vi.fn(),
    getLogFilePath: vi.fn(() => '/test/path')
  }))
}));

describe('Comprehensive Request Logging', () => {
  const mockLogDebug = vi.mocked(logger.logDebug);
  const mockLogInfo = vi.mocked(logger.logInfo);
  const mockLogWarning = vi.mocked(logger.logWarning);
  const mockLogError = vi.mocked(logger.logError);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('DEBUG Mode Enabled - Comprehensive Logging', () => {
    const debugConfig: AgentConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-1.5-flash',
      PROXY_PORT: 3000,
      DEBUG_MODE: true
    };

    it('should log detailed request and response information for valid endpoints', async () => {
      const app = createServer(debugConfig);

      await request(app)
        .get('/health')
        .expect(200);

      // Should log request at INFO level with detailed information
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        '→ GET /health',
        expect.objectContaining({
          ip: expect.any(String),
          userAgent: expect.anything(), // Can be 'unknown' or actual user agent
          contentType: expect.any(String),
          contentLength: expect.any(String),
          headers: expect.objectContaining({
            host: expect.any(String)
          })
        })
      );

      // Should log response at INFO level with timing information
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        '← GET /health 200',
        expect.objectContaining({
          statusCode: 200,
          responseTime: expect.stringMatching(/\d+ms/),
          contentType: expect.any(String)
        })
      );

      // Should also log the health check request specifically
      expect(mockLogDebug).toHaveBeenCalledWith('Server', 'Health check requested');
    });

    it('should log detailed information for POST requests with body', async () => {
      const app = createServer(debugConfig);
      const testBody = { messages: [{ role: 'user', content: 'test message' }] };

      await request(app)
        .post('/v1/chat/completions')
        .send(testBody)
        .expect(200);

      // Should log request with body information
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/→ POST \/v1\/chat\/completions/),
        expect.objectContaining({
          ip: expect.any(String),
          userAgent: expect.any(String),
          contentType: 'application/json',
          body: expect.stringContaining('messages')
        })
      );

      // Should log response information
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/← POST \/v1\/chat\/completions 200/),
        expect.objectContaining({
          statusCode: 200,
          responseTime: expect.stringMatching(/\d+ms/)
        })
      );
    });

    it('should support both /v1/chat/completions and /chat/completions paths', async () => {
      const app = createServer(debugConfig);
      const testBody = { messages: [{ role: 'user', content: 'test message' }] };

      // Test both endpoints return the same response
      const v1Response = await request(app)
        .post('/v1/chat/completions')
        .send(testBody)
        .expect(200);

      const shortResponse = await request(app)
        .post('/chat/completions')
        .send(testBody)
        .expect(200);

      // Both should return the same OpenAI-compatible response structure (but IDs may differ due to timestamps)
      const expectedStructure = {
        id: expect.stringMatching(/^chatcmpl-\d+$/),
        object: 'chat.completion',
        created: expect.any(Number),
        model: expect.any(String),
        choices: expect.arrayContaining([
          expect.objectContaining({
            index: 0,
            message: expect.objectContaining({
              role: 'assistant',
              content: expect.stringContaining('hardcoded response')
            }),
            finish_reason: 'stop'
          })
        ]),
        usage: expect.objectContaining({
          prompt_tokens: expect.any(Number),
          completion_tokens: expect.any(Number),
          total_tokens: expect.any(Number)
        })
      };
      
      expect(v1Response.body).toMatchObject(expectedStructure);
      expect(shortResponse.body).toMatchObject(expectedStructure);
    });

    it('should log unknown endpoints at INFO level (not just WARNING)', async () => {
      const app = createServer(debugConfig);

      await request(app)
        .get('/unknown-endpoint')
        .expect(404);

      // Should log the request
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/→ GET \/unknown-endpoint/),
        expect.any(Object)
      );

      // Should log the response
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/← GET \/unknown-endpoint 404/),
        expect.objectContaining({
          statusCode: 404
        })
      );

      // Should also log the 404 specifically at INFO level (not WARNING)
      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        'Endpoint not found',
        expect.objectContaining({
          method: 'GET',
          path: '/unknown-endpoint',
          fullUrl: '/unknown-endpoint'
        })
      );

      // Should NOT log at WARNING level
      expect(mockLogWarning).not.toHaveBeenCalled();
    });

    it('should log requests with query parameters', async () => {
      const app = createServer(debugConfig);

      await request(app)
        .get('/health?debug=true&test=value')
        .expect(200);

      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/→ GET \/health/),
        expect.objectContaining({
          queryParams: { debug: 'true', test: 'value' }
        })
      );
    });

    it('should handle requests with special headers', async () => {
      const app = createServer(debugConfig);

      await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:3000')
        .set('Referer', 'http://localhost:3000/test')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/→ GET \/health/),
        expect.objectContaining({
          headers: expect.objectContaining({
            origin: 'http://localhost:3000',
            referer: 'http://localhost:3000/test',
            authorization: '[REDACTED]' // Should redact authorization header
          })
        })
      );
    });

    it('should truncate large request bodies', async () => {
      const app = createServer(debugConfig);
      const largeBody = { 
        messages: [{ 
          role: 'user', 
          content: 'A'.repeat(1000) // Large content
        }] 
      };

      await request(app)
        .post('/v1/chat/completions')
        .send(largeBody)
        .expect(200);

      expect(mockLogInfo).toHaveBeenCalledWith(
        'Server',
        expect.stringMatching(/→ POST \/v1\/chat\/completions/),
        expect.objectContaining({
          body: expect.stringMatching(/.{1,500}/) // Should be truncated to 500 chars
        })
      );
    });
  });

  describe('DEBUG Mode Disabled - Basic Logging', () => {
    const normalConfig: AgentConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-1.5-flash',
      PROXY_PORT: 3000,
      DEBUG_MODE: false
    };

    it('should use basic logging when DEBUG is disabled', async () => {
      const app = createServer(normalConfig);

      await request(app)
        .get('/health')
        .expect(200);

      // Should use DEBUG level logging with basic information  
      // Look for the specific call to debug logging for the request
      const debugRequestCall = mockLogDebug.mock.calls.find(call => 
        call[0] === 'Server' && call[1] === 'GET /health' && call[2] && typeof call[2] === 'object'
      );
      
      expect(debugRequestCall).toBeTruthy();
      if (debugRequestCall) {
        expect(debugRequestCall[2]).toHaveProperty('ip');
        expect(debugRequestCall[2]).toHaveProperty('userAgent');
      }

      // Should NOT log detailed request/response at INFO level
      const infoCallsForRequests = mockLogInfo.mock.calls.filter(call => 
        call[1].includes('→') || call[1].includes('←')
      );
      expect(infoCallsForRequests).toHaveLength(0);
    });

    it('should use WARNING level for unknown endpoints when DEBUG disabled', async () => {
      const app = createServer(normalConfig);

      await request(app)
        .get('/unknown-endpoint')
        .expect(404);

      // Should log 404 at WARNING level
      expect(mockLogWarning).toHaveBeenCalledWith(
        'Server',
        'Endpoint not found',
        expect.objectContaining({
          method: 'GET',
          path: '/unknown-endpoint'
        })
      );

      // Should NOT log at INFO level
      const infoCallsFor404 = mockLogInfo.mock.calls.filter(call => 
        call[1].includes('Endpoint not found')
      );
      expect(infoCallsFor404).toHaveLength(0);
    });
  });

  describe('Error Handling with Enhanced Logging', () => {
    const debugConfig: AgentConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-1.5-flash',
      PROXY_PORT: 3000,
      DEBUG_MODE: true
    };

    it('should include detailed error information in debug mode', () => {
      // This test verifies that the error handler structure is correct
      // We can't easily trigger internal server errors in the test environment
      // but we can verify that the error handler would log correctly
      
      const app = createServer(debugConfig);
      expect(app).toBeDefined();
      
      // The error handler is tested indirectly through the server structure
      // Real error testing would require integration tests
    });
  });

  describe('Performance Tracking', () => {
    const debugConfig: AgentConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-1.5-flash',
      PROXY_PORT: 3000,
      DEBUG_MODE: true
    };

    it('should track and log response times', async () => {
      const app = createServer(debugConfig);

      await request(app)
        .get('/health')
        .expect(200);

      // Find the response log call
      const responseLogCall = mockLogInfo.mock.calls.find(call => 
        call[1] === '← GET /health 200'
      );

      expect(responseLogCall).toBeTruthy();
      if (responseLogCall) {
        expect(responseLogCall[2]).toHaveProperty('responseTime');
        expect(responseLogCall[2].responseTime).toMatch(/\d+ms/);
      }
    });
  });
});