import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { createServer } from '../../src/agents/server.js';
import type { AgentConfig } from '../../src/types.js';
import { AgentOrchestrator } from '../../src/agents/orchestrator.js';

// Mock the orchestrator to simulate Google AI errors
vi.mock('../../src/agents/orchestrator.js');
const MockedOrchestrator = vi.mocked(AgentOrchestrator);

// Mock logger to prevent console output during tests
vi.mock('../../src/agents/logger.js', () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn()
}));

describe('Server Error Handling', () => {
  const mockConfig: AgentConfig = {
    VERTEX_AI_PROJECT: 'test-project',
    VERTEX_AI_LOCATION: 'us-central1',
    VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
    PROXY_PORT: 11434,
    DEBUG_MODE: false
  };

  let app: ReturnType<typeof createServer>;
  let mockOrchestrator: InstanceType<typeof AgentOrchestrator>;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create mock orchestrator instance
    mockOrchestrator = {
      processRequest: vi.fn(),
      processStreamingRequest: vi.fn()
    } as any;

    MockedOrchestrator.mockImplementation(() => mockOrchestrator);
    
    app = createServer(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Non-streaming error handling', () => {
    test('should handle Google authentication error with proper status code', async () => {
      // Mock Google authentication error
      const googleAuthError = new Error(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'reauth related error (invalid_rapt)',
        error_uri: 'https://support.google.com/a/answer/9368756',
        error_subtype: 'invalid_rapt'
      }));

      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(googleAuthError);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: {
          message: 'invalid_grant: reauth related error (invalid_rapt) (See: https://support.google.com/a/answer/9368756)',
          type: 'authentication_error',
          code: 'invalid_grant',
          param: null
        }
      });
    });

    test('should handle Google permission error with proper status code', async () => {
      const googlePermissionError = new Error(JSON.stringify({
        error: 'permission_denied',
        error_description: 'Access denied to resource'
      }));

      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(googlePermissionError);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(403);
      expect(response.body).toMatchObject({
        error: {
          message: 'permission_denied: Access denied to resource',
          type: 'permission_error',
          code: 'permission_denied',
          param: null
        }
      });
    });

    test('should handle Google rate limit error with proper status code', async () => {
      const googleRateLimitError = new Error(JSON.stringify({
        error: 'rate_limit_exceeded',
        error_description: 'Too many requests'
      }));

      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(googleRateLimitError);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        error: {
          message: 'rate_limit_exceeded: Too many requests',
          type: 'rate_limit_error',
          code: 'rate_limit_exceeded',
          param: null
        }
      });
    });

    test('should handle generic errors with server error status', async () => {
      const genericError = new Error('Generic server error');
      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(genericError);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        error: {
          message: 'Generic server error',
          type: 'server_error',
          code: null,
          param: null
        }
      });
    });

    test('should handle invalid request format errors', async () => {
      const googleInvalidError = new Error(JSON.stringify({
        error: 'invalid_request',
        error_description: 'Invalid parameter format'
      }));

      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(googleInvalidError);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: {
          message: 'invalid_request: Invalid parameter format',
          type: 'invalid_request_error',
          code: 'invalid_request',
          param: null
        }
      });
    });
  });

  describe('Streaming error handling', () => {
    test('should send Google authentication error in streaming format', async () => {
      // Mock Google authentication error in streaming
      const googleAuthError = new Error(JSON.stringify({
        error: 'invalid_grant',
        error_description: 'reauth related error (invalid_rapt)',
        error_uri: 'https://support.google.com/a/answer/9368756'
      }));

      mockOrchestrator.processStreamingRequest = vi.fn().mockImplementation(async function* () {
        throw googleAuthError;
      });

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');

      // Parse the SSE response
      const lines = response.text.split('\n').filter(line => line.startsWith('data: '));
      expect(lines).toHaveLength(1);

      const errorChunk = JSON.parse(lines[0].replace('data: ', ''));
      expect(errorChunk).toMatchObject({
        id: expect.stringMatching(/^error-\d+-\d+$/),
        object: 'error',
        created: expect.any(Number),
        error: {
          message: 'invalid_grant: reauth related error (invalid_rapt) (See: https://support.google.com/a/answer/9368756)',
          type: 'authentication_error',
          code: 'invalid_grant',
          param: null
        }
      });
    });

    test('should send Google permission error in streaming format', async () => {
      const googlePermissionError = new Error(JSON.stringify({
        error: 'permission_denied',
        error_description: 'Access denied'
      }));

      mockOrchestrator.processStreamingRequest = vi.fn().mockImplementation(async function* () {
        throw googlePermissionError;
      });

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');

      const lines = response.text.split('\n').filter(line => line.startsWith('data: '));
      expect(lines).toHaveLength(1);

      const errorChunk = JSON.parse(lines[0].replace('data: ', ''));
      expect(errorChunk.error.type).toBe('permission_error');
      expect(errorChunk.error.code).toBe('permission_denied');
    });

    test('should handle generic errors in streaming format', async () => {
      const genericError = new Error('Network error');
      mockOrchestrator.processStreamingRequest = vi.fn().mockImplementation(async function* () {
        throw genericError;
      });

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');

      const lines = response.text.split('\n').filter(line => line.startsWith('data: '));
      expect(lines).toHaveLength(1);

      const errorChunk = JSON.parse(lines[0].replace('data: ', ''));
      expect(errorChunk.error.message).toBe('Network error');
      expect(errorChunk.error.type).toBe('server_error');
    });

    test('should handle successful streaming followed by error', async () => {
      // Mock streaming that yields some chunks then throws an error
      mockOrchestrator.processStreamingRequest = vi.fn().mockImplementation(async function* () {
        yield {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-2.0-flash-exp',
          choices: [{
            index: 0,
            delta: { role: 'assistant' },
            finish_reason: null
          }]
        };

        yield {
          id: 'chatcmpl-123',
          object: 'chat.completion.chunk',
          created: Math.floor(Date.now() / 1000),
          model: 'gemini-2.0-flash-exp',
          choices: [{
            index: 0,
            delta: { content: 'Hello' },
            finish_reason: null
          }]
        };

        // Then throw an error
        throw new Error(JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Authentication failed'
        }));
      });

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }],
          stream: true
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');

      const lines = response.text.split('\n').filter(line => line.startsWith('data: '));
      expect(lines.length).toBeGreaterThanOrEqual(3); // 2 successful chunks + 1 error chunk

      // Check that we got the successful chunks first
      const firstChunk = JSON.parse(lines[0].replace('data: ', ''));
      expect(firstChunk.choices[0].delta.role).toBe('assistant');

      const secondChunk = JSON.parse(lines[1].replace('data: ', ''));
      expect(secondChunk.choices[0].delta.content).toBe('Hello');

      // Check that the last chunk is an error
      const lastChunk = JSON.parse(lines[lines.length - 1].replace('data: ', ''));
      expect(lastChunk.object).toBe('error');
      expect(lastChunk.error.type).toBe('authentication_error');
    });
  });

  describe('Error handling edge cases', () => {
    test('should handle malformed Google error JSON', async () => {
      const malformedError = new Error('{"error": malformed json');
      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(malformedError);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('{"error": malformed json');
      expect(response.body.error.type).toBe('server_error');
    });

    test('should handle null/undefined errors', async () => {
      mockOrchestrator.processRequest = vi.fn().mockRejectedValue(undefined);

      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Hello' }]
        });

      expect(response.status).toBe(500);
      expect(response.body.error.message).toBe('Unknown error occurred');
      expect(response.body.error.type).toBe('server_error');
    });

    test('should handle errors thrown during request validation', async () => {
      // This error should be caught by the outer try-catch in the handler
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          // Invalid request - missing messages
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required field: messages');
    });
  });
});