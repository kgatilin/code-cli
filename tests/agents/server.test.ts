import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { AgentConfig } from '../../src/types.js';

// Mock all external dependencies
vi.mock('../../src/agents/orchestrator.js');
vi.mock('../../src/agents/logger.js');
vi.mock('http');

// Import mocked modules
import { createServer as createHttpServer } from 'http';
import { AgentOrchestrator } from '../../src/agents/orchestrator.js';
import { logDebug, logInfo, logWarning, logError } from '../../src/agents/logger.js';
import { createServer, isPortAvailable } from '../../src/agents/server.js';

// Create typed mocks
const mockCreateHttpServer = createHttpServer as MockedFunction<typeof createHttpServer>;

describe('agents/server', () => {
  const testConfig: AgentConfig = {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 8890,
    DEBUG_MODE: false
  };

  let app: Express;
  let mockOrchestrator: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock orchestrator
    mockOrchestrator = {
      processRequest: vi.fn(),
      processStreamingRequest: vi.fn()
    };
    vi.mocked(AgentOrchestrator).mockImplementation(() => mockOrchestrator);
    
    // Create server instance for testing
    app = createServer(testConfig);
  });

  describe('createServer', () => {
    it('should create Express app with health endpoint', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        version: '1.0.0',
        config: {
          model: testConfig.VERTEX_AI_MODEL,
          project: testConfig.VERTEX_AI_PROJECT,
          location: testConfig.VERTEX_AI_LOCATION
        }
      });
    });

    it('should handle CORS for all requests', async () => {
      const response = await request(app)
        .options('/health')
        .expect(204); // OPTIONS requests typically return 204 No Content

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/unknown-endpoint')
        .expect(404);

      expect(response.body).toEqual({
        error: 'Endpoint not found: GET /unknown-endpoint'
      });
    });

    it('should validate required messages field in chat completions', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-3.5-turbo'
          // Missing messages field
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid request format');
      expect(response.body.error).toContain('messages');
    });

    it('should validate messages array is not empty', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-3.5-turbo',
          messages: [] // Empty array
        })
        .expect(400);

      expect(response.body.error).toContain('Messages array cannot be empty');
    });

    it('should validate messages field is an array', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          model: 'gpt-3.5-turbo',
          messages: 'not-an-array'
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid request format');
      expect(response.body.error).toContain('messages');
    });

    it('should process valid non-streaming chat completion request', async () => {
      const mockResponse = {
        id: 'chatcmpl-test',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gemini-2.0-flash-exp',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Test response' },
          finish_reason: 'stop'
        }]
      };

      mockOrchestrator.processRequest.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          model: 'gpt-3.5-turbo',
          stream: false
        })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockOrchestrator.processRequest).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-3.5-turbo',
        stream: false,
        max_tokens: undefined,
        temperature: undefined,
        n: undefined,
        stop: undefined
      });
    });

    it('should use default model from config when not specified', async () => {
      const mockResponse = { id: 'test', choices: [] };
      mockOrchestrator.processRequest.mockResolvedValue(mockResponse);

      await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
          // No model specified
        })
        .expect(200);

      expect(mockOrchestrator.processRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          model: testConfig.VERTEX_AI_MODEL
        })
      );
    });

    it('should handle streaming chat completion request', async () => {
      const mockChunks = [
        { id: 'chatcmpl-test', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] },
        { id: 'chatcmpl-test', choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }] },
        { id: 'chatcmpl-test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
      ];

      // Mock async generator
      mockOrchestrator.processStreamingRequest.mockImplementation(async function* () {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      });

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['access-control-allow-origin']).toBe('*');
      
      // Verify response contains streamed chunks and DONE marker
      const responseText = response.text;
      expect(responseText).toContain('data: {"id":"chatcmpl-test"');
      expect(responseText).toContain('data: [DONE]');
      
      expect(mockOrchestrator.processStreamingRequest).toHaveBeenCalledWith({
        messages: [{ role: 'user', content: 'Hello' }],
        model: testConfig.VERTEX_AI_MODEL,
        stream: true,
        max_tokens: undefined,
        temperature: undefined,
        n: undefined,
        stop: undefined
      });
    });

    it('should support alternative chat completions endpoint', async () => {
      const mockResponse = { id: 'test', choices: [] };
      mockOrchestrator.processRequest.mockResolvedValue(mockResponse);

      await request(app)
        .post('/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        })
        .expect(200);

      expect(mockOrchestrator.processRequest).toHaveBeenCalled();
    });

    it('should handle orchestrator errors in non-streaming mode', async () => {
      const mockError = new Error('Test error');
      mockOrchestrator.processRequest.mockRejectedValue(mockError);
      
      // Mock ErrorHandler
      vi.doMock('../../src/agents/error-handler.js', () => ({
        ErrorHandler: {
          parseGoogleError: vi.fn().mockReturnValue({
            error: {
              message: 'Test error',
              type: 'api_error',
              code: 'internal_error',
              param: null
            }
          }),
          extractErrorCode: vi.fn().mockReturnValue('internal_error'),
          isAuthenticationError: vi.fn().mockReturnValue(false)
        }
      }));

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });

    it('should handle orchestrator errors in streaming mode', async () => {
      const mockError = new Error('Stream error');
      mockOrchestrator.processStreamingRequest.mockImplementation(async function* () {
        throw mockError;
      });

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      // The response should contain an error data chunk
      expect(response.text).toContain('data: {');
      expect(response.text).toContain('"error"');
      expect(response.text).toContain('Stream error');
    });
  });

  describe('isPortAvailable', () => {
    it('should return true when port is available', async () => {
      const mockServer = {
        once: vi.fn(),
        listen: vi.fn(),
        close: vi.fn()
      };

      mockCreateHttpServer.mockReturnValue(mockServer as any);

      // Mock successful port binding
      mockServer.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'listening') {
          setTimeout(() => callback(), 0);
        }
      });

      mockServer.close.mockImplementation((callback: Function) => {
        setTimeout(() => callback(), 0);
      });

      const result = await isPortAvailable(8890);

      expect(result).toBe(true);
      expect(mockServer.listen).toHaveBeenCalledWith(8890);
      expect(mockServer.close).toHaveBeenCalled();
    });

    it('should return false when port is in use', async () => {
      const mockServer = {
        once: vi.fn(),
        listen: vi.fn(),
        close: vi.fn()
      };

      mockCreateHttpServer.mockReturnValue(mockServer as any);

      // Mock EADDRINUSE error
      mockServer.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          const error = { code: 'EADDRINUSE' } as NodeJS.ErrnoException;
          setTimeout(() => callback(error), 0);
        }
      });

      const result = await isPortAvailable(80);

      expect(result).toBe(false);
      expect(mockServer.listen).toHaveBeenCalledWith(80);
    });

    it('should return false for other port binding errors', async () => {
      const mockServer = {
        once: vi.fn(),
        listen: vi.fn(),
        close: vi.fn()
      };

      mockCreateHttpServer.mockReturnValue(mockServer as any);

      // Mock different error
      mockServer.once.mockImplementation((event: string, callback: Function) => {
        if (event === 'error') {
          const error = { code: 'EACCES' } as NodeJS.ErrnoException;
          setTimeout(() => callback(error), 0);
        }
      });

      const result = await isPortAvailable(80);

      expect(result).toBe(false);
    });
  });
});