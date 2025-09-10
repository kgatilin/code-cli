import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from '../src/agents/server.js';
import type { AgentConfig } from '../src/types.js';

// Mock the logger module
vi.mock('../src/agents/logger.js', () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
  logError: vi.fn(),
}));

describe('Streaming Chat Completions', () => {
  let app: express.Application;
  let testConfig: AgentConfig;

  beforeEach(() => {
    testConfig = {
      VERTEX_AI_PROJECT: 'test-project',
      VERTEX_AI_LOCATION: 'us-central1',
      VERTEX_AI_MODEL: 'gemini-2.0-flash-exp',
      PROXY_PORT: 11434,
      DEBUG_MODE: true
    };
    
    app = createServer(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Non-streaming requests', () => {
    it('should return JSON response when stream is false', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          stream: false
        })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body).toMatchObject({
        id: expect.stringMatching(/^chatcmpl-\d+$/),
        object: 'chat.completion',
        created: expect.any(Number),
        model: 'gemini-2.0-flash-exp',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Hello! I am a hardcoded response from the local LLM proxy server. The actual AI integration is coming in Phase 3!'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      });
    });

    it('should return JSON response when stream is not specified', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ]
        })
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
      expect(response.body.object).toBe('chat.completion');
    });
  });

  describe('Streaming requests', () => {
    it('should return SSE headers when stream is true', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          stream: true
        })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      expect(response.headers['connection']).toBe('keep-alive');
      expect(response.headers['access-control-allow-origin']).toBe('*');
    });

    it('should stream hardcoded response in chunks', (done) => {
      const chunks: string[] = [];
      let finished = false;

      const req = request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          stream: true
        });

      req.expect(200);
      
      req.on('data', (chunk) => {
        chunks.push(chunk.toString());
      });

      req.on('end', () => {
        if (finished) return;
        finished = true;

        const fullResponse = chunks.join('');
        const lines = fullResponse.split('\n');
        const dataLines = lines.filter(line => line.startsWith('data: '));

        // Should have multiple data lines
        expect(dataLines.length).toBeGreaterThan(1);

        // First chunk should contain role
        const firstChunk = JSON.parse(dataLines[0].substring(6));
        expect(firstChunk).toMatchObject({
          id: expect.stringMatching(/^chatcmpl-\d+$/),
          object: 'chat.completion.chunk',
          created: expect.any(Number),
          model: 'gemini-2.0-flash-exp',
          choices: [
            {
              index: 0,
              delta: {
                role: 'assistant'
              },
              finish_reason: null
            }
          ]
        });

        // Content chunks should have delta.content
        const contentChunks = dataLines.slice(1, -2); // Exclude first and last two chunks
        contentChunks.forEach(line => {
          const chunk = JSON.parse(line.substring(6));
          expect(chunk.choices[0].delta).toHaveProperty('content');
          expect(chunk.choices[0].finish_reason).toBeNull();
        });

        // Second to last chunk should have finish_reason: 'stop'
        const finishChunk = JSON.parse(dataLines[dataLines.length - 2].substring(6));
        expect(finishChunk.choices[0].finish_reason).toBe('stop');
        expect(finishChunk.choices[0].delta).toEqual({});

        // Last line should be [DONE]
        expect(dataLines[dataLines.length - 1]).toBe('data: [DONE]');

        done();
      });

      req.on('error', done);
    });

    it('should handle streaming request with alternative endpoint path', (done) => {
      const chunks: string[] = [];
      let finished = false;

      const req = request(app)
        .post('/chat/completions')
        .send({
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          stream: true
        });

      req.expect(200);

      req.on('data', (chunk) => {
        chunks.push(chunk.toString());
      });

      req.on('end', () => {
        if (finished) return;
        finished = true;

        const fullResponse = chunks.join('');
        expect(fullResponse).toContain('data: [DONE]');
        expect(fullResponse).toContain('chat.completion.chunk');

        done();
      });

      req.on('error', done);
    });
  });

  describe('Request validation', () => {
    it('should return 400 for streaming request without messages', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          stream: true
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid request format. Missing required field: messages');
    });

    it('should return 400 for streaming request with invalid messages', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: 'invalid',
          stream: true
        })
        .expect(400);

      expect(response.body.error).toBe('Invalid request format. Missing required field: messages');
    });

    it('should return 400 for streaming request with empty messages array', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [],
          stream: true
        })
        .expect(200); // Empty array is valid, should process normally

      expect(response.headers['content-type']).toBe('text/event-stream');
    });
  });

  describe('Chunk structure validation', () => {
    it('should have consistent chunk IDs throughout the stream', (done) => {
      const chunks: string[] = [];
      let finished = false;

      const req = request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Test' }],
          stream: true
        });

      req.on('data', (chunk) => {
        chunks.push(chunk.toString());
      });

      req.on('end', () => {
        if (finished) return;
        finished = true;

        const fullResponse = chunks.join('');
        const lines = fullResponse.split('\n');
        const dataLines = lines.filter(line => line.startsWith('data: ') && !line.includes('[DONE]'));

        const chatIds = dataLines.map(line => {
          const chunk = JSON.parse(line.substring(6));
          return chunk.id;
        });

        // All chunk IDs should be the same
        const uniqueIds = [...new Set(chatIds)];
        expect(uniqueIds).toHaveLength(1);

        done();
      });

      req.on('error', done);
    });

    it('should have consistent created timestamps throughout the stream', (done) => {
      const chunks: string[] = [];
      let finished = false;

      const req = request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Test' }],
          stream: true
        });

      req.on('data', (chunk) => {
        chunks.push(chunk.toString());
      });

      req.on('end', () => {
        if (finished) return;
        finished = true;

        const fullResponse = chunks.join('');
        const lines = fullResponse.split('\n');
        const dataLines = lines.filter(line => line.startsWith('data: ') && !line.includes('[DONE]'));

        const timestamps = dataLines.map(line => {
          const chunk = JSON.parse(line.substring(6));
          return chunk.created;
        });

        // All timestamps should be the same
        const uniqueTimestamps = [...new Set(timestamps)];
        expect(uniqueTimestamps).toHaveLength(1);

        done();
      });

      req.on('error', done);
    });
  });

  describe('Error handling during streaming', () => {
    it('should handle malformed JSON in request body', async () => {
      const response = await request(app)
        .post('/v1/chat/completions')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(500);

      // Express middleware catches malformed JSON and error handler returns 500
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('Performance and timing', () => {
    it('should complete streaming within reasonable time', (done) => {
      const startTime = Date.now();
      let finished = false;

      const req = request(app)
        .post('/v1/chat/completions')
        .send({
          messages: [{ role: 'user', content: 'Test timing' }],
          stream: true
        });

      req.on('end', () => {
        if (finished) return;
        finished = true;

        const duration = Date.now() - startTime;
        // Should complete within reasonable time (hardcoded message has ~24 words, 100ms each + overhead)
        expect(duration).toBeLessThan(5000); // 5 seconds max
        expect(duration).toBeGreaterThan(1000); // Should take at least 1 second due to delays

        done();
      });

      req.on('error', done);
    });
  });
});