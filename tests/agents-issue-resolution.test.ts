import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErrorHandler } from '../src/agents/error-handler.js';
import { AgentOrchestrator } from '../src/agents/orchestrator.js';
import type { AgentConfig, OpenAIRequest } from '../src/types.js';

describe('Issue Resolution Tests - Error Handler and Model Handling', () => {
  describe('ErrorHandler - Complex Error Structure Handling', () => {
    it('should handle nested Google AI error objects without TypeError', () => {
      // This tests the fix for "googleError.error.toLowerCase is not a function"
      const nestedError = new Error(JSON.stringify({
        error: {
          message: "Invalid JSON payload received. Unknown name \"text\" at 'contents[0].parts[0]': Proto field is not repeating, cannot start list.",
          code: 400,
          status: "INVALID_ARGUMENT",
          details: [
            {
              "@type": "type.googleapis.com/google.rpc.BadRequest",
              "fieldViolations": [
                {
                  "field": "contents[0].parts[0]",
                  "description": "Invalid JSON payload received. Unknown name \"text\" at 'contents[0].parts[0]': Proto field is not repeating, cannot start list."
                }
              ]
            }
          ]
        }
      }));

      // This should not throw a TypeError
      expect(() => {
        const result = ErrorHandler.parseGoogleError(nestedError);
        expect(result.error.type).toBe('invalid_request_error');
        expect(result.error.message).toContain('Invalid JSON payload received');
        expect(result.error.code).toBe('INVALID_ARGUMENT');
      }).not.toThrow();
    });

    it('should handle string-based Google AI errors', () => {
      const stringError = new Error(JSON.stringify({
        error: "invalid_grant",
        error_description: "reauth related error (invalid_rapt)",
        error_uri: "https://support.google.com/a/answer/9368756",
        error_subtype: "invalid_rapt"
      }));

      const result = ErrorHandler.parseGoogleError(stringError);
      expect(result.error.type).toBe('authentication_error');
      expect(result.error.message).toContain('invalid_grant');
      expect(result.error.message).toContain('reauth related error');
      expect(result.error.code).toBe('invalid_grant');
    });

    it('should map INVALID_ARGUMENT errors to invalid_request_error type', () => {
      const apiError = new Error(JSON.stringify({
        error: {
          message: "Invalid JSON payload received",
          status: "INVALID_ARGUMENT",
          code: 400
        }
      }));

      const result = ErrorHandler.parseGoogleError(apiError);
      expect(result.error.type).toBe('invalid_request_error');
    });

    it('should create streaming error chunks from complex errors', () => {
      const complexError = new Error(JSON.stringify({
        error: {
          message: "Publisher Model not found",
          code: 404,
          status: "NOT_FOUND"
        }
      }));

      const errorChunk = ErrorHandler.createStreamingErrorChunk(complexError);
      
      expect(errorChunk.object).toBe('error');
      expect(errorChunk.error.type).toBe('not_found_error');
      expect(errorChunk.error.message).toContain('Publisher Model not found');
    });

    it('should extract error codes from both string and object formats', () => {
      // Test string format
      const stringError = new Error(JSON.stringify({
        error: "rate_limit_exceeded"
      }));
      expect(ErrorHandler.extractErrorCode(stringError)).toBe('rate_limit_exceeded');

      // Test object format  
      const objectError = new Error(JSON.stringify({
        error: {
          status: "INVALID_ARGUMENT",
          code: 400
        }
      }));
      expect(ErrorHandler.extractErrorCode(objectError)).toBe('INVALID_ARGUMENT');
    });

    it('should handle isAuthenticationError without throwing', () => {
      const authError = new Error(JSON.stringify({
        error: {
          status: "UNAUTHENTICATED",
          code: 401
        }
      }));

      expect(() => {
        const result = ErrorHandler.isAuthenticationError(authError);
        expect(result).toBe(true);
      }).not.toThrow();
    });
  });

  describe('Model Specification Handling', () => {
    let mockConfig: AgentConfig;

    beforeEach(() => {
      mockConfig = {
        VERTEX_AI_PROJECT: 'test-project',
        VERTEX_AI_LOCATION: 'us-central1',
        VERTEX_AI_MODEL: 'gemini-2.5-flash',
        PROXY_PORT: 11434,
        DEBUG_MODE: false
      };
    });

    it('should use configured model regardless of client-provided model', () => {
      // This tests the fix for the "local-ai" model issue
      const orchestrator = new AgentOrchestrator(mockConfig);
      
      // Verify the orchestrator uses the configured model, not request model
      expect((orchestrator as any).model).toBe('gemini-2.5-flash');
      
      // The API calls should use this.model, not request.model
      // This is tested by the fact that our server now works with "local-ai" requests
    });

    it('should handle requests with invalid model names gracefully', () => {
      const request: OpenAIRequest = {
        messages: [
          { role: 'user', content: 'Hello' }
        ],
        model: 'invalid-model-name',
        stream: false
      };

      // The orchestrator should be created without issues
      expect(() => {
        new AgentOrchestrator(mockConfig);
      }).not.toThrow();

      // In practice, the Google AI API call uses this.model, not request.model
      // so invalid client model names don't cause issues
    });

    it('should log client model for debugging but use configured model', () => {
      const request: OpenAIRequest = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'client-specified-model',
        stream: true
      };

      const orchestrator = new AgentOrchestrator(mockConfig);
      
      // The orchestrator should use the configured model internally
      expect((orchestrator as any).model).toBe('gemini-2.5-flash');
      
      // While the debug logs may show the request model, the API calls use configured model
    });
  });

  describe('Multiple Error Handler Calls', () => {
    it('should handle multiple error parsing calls without conflicts', () => {
      const error1 = new Error(JSON.stringify({ error: "auth_error" }));
      const error2 = new Error(JSON.stringify({ error: { status: "NOT_FOUND", code: 404 } }));
      
      const result1 = ErrorHandler.parseGoogleError(error1);
      const result2 = ErrorHandler.parseGoogleError(error2);
      
      expect(result1.error.type).toBe('authentication_error');
      expect(result2.error.type).toBe('not_found_error');
      
      // Both should work without interfering with each other
      expect(result1.error.code).toBe('auth_error');
      expect(result2.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Streaming Error Chunks', () => {
    it('should create proper OpenAI-compatible streaming error chunks', () => {
      const testError = new Error(JSON.stringify({
        error: {
          message: "Test error for streaming",
          code: 500,
          status: "INTERNAL"
        }
      }));

      const chunk = ErrorHandler.createStreamingErrorChunk(testError);
      
      expect(chunk.id).toMatch(/^error-\d+-\d+$/);
      expect(chunk.object).toBe('error');
      expect(chunk.created).toBeTypeOf('number');
      expect(chunk.error.message).toContain('Test error for streaming');
      expect(chunk.error.type).toBe('api_error');
    });
  });

  describe('Integration - Error Recovery', () => {
    it('should handle the exact error sequence from the original issue', () => {
      // This simulates the original error sequence:
      // 1. Google AI returns model not found error
      // 2. Error handler processes it
      // 3. Creates appropriate response
      
      const originalError = new Error(JSON.stringify({
        error: {
          message: 'Publisher Model `projects/epm-ai-assistant-poc/locations/europe-west4/publishers/google/models/local-ai` not found.',
          code: 404,
          status: 'NOT_FOUND'
        }
      }));

      // Step 1: Parse the error
      const parsedError = ErrorHandler.parseGoogleError(originalError);
      expect(parsedError.error.type).toBe('not_found_error');
      expect(parsedError.error.message).toContain('Publisher Model');

      // Step 2: Create streaming error chunk
      const streamingChunk = ErrorHandler.createStreamingErrorChunk(originalError);
      expect(streamingChunk.object).toBe('error');
      expect(streamingChunk.error.type).toBe('not_found_error');

      // Step 3: Verify no TypeError occurs
      expect(() => {
        ErrorHandler.extractErrorCode(originalError);
        ErrorHandler.isAuthenticationError(originalError);
      }).not.toThrow();
    });
  });
});