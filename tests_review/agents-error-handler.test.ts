import { describe, test, expect } from 'vitest';
import { ErrorHandler } from '../src/agents/error-handler.js';
import type { OpenAIError, OpenAIStreamErrorChunk } from '../src/types.js';

describe('ErrorHandler', () => {
  describe('parseGoogleError', () => {
    test('should parse Google authentication error from Error object', () => {
      const googleErrorJson = JSON.stringify({
        error: 'invalid_grant',
        error_description: 'reauth related error (invalid_rapt)',
        error_uri: 'https://support.google.com/a/answer/9368756',
        error_subtype: 'invalid_rapt'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.parseGoogleError(error);

      expect(result).toMatchObject({
        error: {
          message: 'invalid_grant: reauth related error (invalid_rapt) (See: https://support.google.com/a/answer/9368756)',
          type: 'authentication_error',
          code: 'invalid_grant',
          param: null
        }
      } as OpenAIError);
    });

    test('should parse Google permission error', () => {
      const googleErrorJson = JSON.stringify({
        error: 'permission_denied',
        error_description: 'Access denied to resource'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.parseGoogleError(error);

      expect(result.error.type).toBe('permission_error');
      expect(result.error.message).toBe('permission_denied: Access denied to resource');
      expect(result.error.code).toBe('permission_denied');
    });

    test('should parse Google rate limit error', () => {
      const googleErrorJson = JSON.stringify({
        error: 'rate_limit_exceeded',
        error_description: 'Too many requests'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.parseGoogleError(error);

      expect(result.error.type).toBe('rate_limit_error');
      expect(result.error.message).toBe('rate_limit_exceeded: Too many requests');
      expect(result.error.code).toBe('rate_limit_exceeded');
    });

    test('should handle non-JSON error messages', () => {
      const error = new Error('Generic error message');
      const result = ErrorHandler.parseGoogleError(error);

      expect(result).toMatchObject({
        error: {
          message: 'Generic error message',
          type: 'server_error',
          code: null,
          param: null
        }
      } as OpenAIError);
    });

    test('should handle string errors with JSON content', () => {
      const googleErrorJson = JSON.stringify({
        error: 'invalid_request',
        error_description: 'Invalid parameter'
      });
      
      const result = ErrorHandler.parseGoogleError(googleErrorJson);

      expect(result.error.type).toBe('invalid_request_error');
      expect(result.error.message).toBe('invalid_request: Invalid parameter');
      expect(result.error.code).toBe('invalid_request');
    });

    test('should handle string errors without JSON', () => {
      const result = ErrorHandler.parseGoogleError('Simple error string');

      expect(result).toMatchObject({
        error: {
          message: 'Simple error string',
          type: 'server_error',
          code: null,
          param: null
        }
      } as OpenAIError);
    });

    test('should handle undefined/null errors', () => {
      const result = ErrorHandler.parseGoogleError(undefined);

      expect(result).toMatchObject({
        error: {
          message: 'Unknown error occurred',
          type: 'server_error',
          code: null,
          param: null
        }
      } as OpenAIError);
    });

    test('should handle errors with only error field', () => {
      const googleErrorJson = JSON.stringify({
        error: 'not_found'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.parseGoogleError(error);

      expect(result.error.type).toBe('not_found_error');
      expect(result.error.message).toBe('not_found');
      expect(result.error.code).toBe('not_found');
    });

    test('should handle errors with only error_description field', () => {
      const googleErrorJson = JSON.stringify({
        error_description: 'Something went wrong'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.parseGoogleError(error);

      expect(result.error.message).toBe('Something went wrong');
      expect(result.error.type).toBe('server_error');
      expect(result.error.code).toBe(null);
    });
  });

  describe('createStreamingErrorChunk', () => {
    test('should create streaming error chunk from Google error', () => {
      const googleErrorJson = JSON.stringify({
        error: 'invalid_grant',
        error_description: 'reauth related error (invalid_rapt)',
        error_uri: 'https://support.google.com/a/answer/9368756'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.createStreamingErrorChunk(error);

      expect(result).toMatchObject({
        id: expect.stringMatching(/^error-\d+-\d+$/),
        object: 'error',
        created: expect.any(Number),
        error: {
          message: 'invalid_grant: reauth related error (invalid_rapt) (See: https://support.google.com/a/answer/9368756)',
          type: 'authentication_error',
          code: 'invalid_grant',
          param: null
        }
      } as OpenAIStreamErrorChunk);

      // Verify timestamp is reasonable (within last few seconds)
      const now = Math.floor(Date.now() / 1000);
      expect(result.created).toBeGreaterThan(now - 5);
      expect(result.created).toBeLessThanOrEqual(now);
    });

    test('should create streaming error chunk with unique IDs', () => {
      const error = new Error('Test error');
      
      const chunk1 = ErrorHandler.createStreamingErrorChunk(error);
      const chunk2 = ErrorHandler.createStreamingErrorChunk(error);

      expect(chunk1.id).not.toBe(chunk2.id);
      expect(chunk1.id).toMatch(/^error-\d+-\d+$/);
      expect(chunk2.id).toMatch(/^error-\d+-\d+$/);
    });
  });

  describe('isAuthenticationError', () => {
    test('should identify authentication errors', () => {
      const authErrors = [
        JSON.stringify({ error: 'invalid_grant' }),
        JSON.stringify({ error: 'unauthorized' }),
        JSON.stringify({ error: 'invalid_rapt' }),
        JSON.stringify({ error: 'auth_failed' })
      ];

      authErrors.forEach(errorJson => {
        const error = new Error(errorJson);
        expect(ErrorHandler.isAuthenticationError(error)).toBe(true);
      });
    });

    test('should not identify non-authentication errors', () => {
      const nonAuthErrors = [
        JSON.stringify({ error: 'rate_limit_exceeded' }),
        JSON.stringify({ error: 'permission_denied' }),
        JSON.stringify({ error: 'not_found' }),
        'Simple error string'
      ];

      nonAuthErrors.forEach(errorJson => {
        const error = new Error(errorJson);
        expect(ErrorHandler.isAuthenticationError(error)).toBe(false);
      });
    });

    test('should handle malformed errors gracefully', () => {
      expect(ErrorHandler.isAuthenticationError(undefined)).toBe(false);
      expect(ErrorHandler.isAuthenticationError(null)).toBe(false);
      expect(ErrorHandler.isAuthenticationError({})).toBe(false);
    });
  });

  describe('extractErrorCode', () => {
    test('should extract error code from Google error', () => {
      const googleErrorJson = JSON.stringify({
        error: 'invalid_grant',
        error_description: 'reauth related error'
      });
      
      const error = new Error(googleErrorJson);
      const result = ErrorHandler.extractErrorCode(error);

      expect(result).toBe('invalid_grant');
    });

    test('should return null for errors without error code', () => {
      const error = new Error('Simple error message');
      const result = ErrorHandler.extractErrorCode(error);

      expect(result).toBe(null);
    });

    test('should handle malformed errors gracefully', () => {
      expect(ErrorHandler.extractErrorCode(undefined)).toBe(null);
      expect(ErrorHandler.extractErrorCode(null)).toBe(null);
      expect(ErrorHandler.extractErrorCode({})).toBe(null);
    });
  });

  describe('error type mapping', () => {
    const errorTypeMappings = [
      { input: 'invalid_grant', expected: 'authentication_error' },
      { input: 'unauthorized', expected: 'authentication_error' },
      { input: 'invalid_rapt', expected: 'authentication_error' },
      { input: 'permission_denied', expected: 'permission_error' },
      { input: 'forbidden', expected: 'permission_error' },
      { input: 'access_denied', expected: 'permission_error' },
      { input: 'rate_limit_exceeded', expected: 'rate_limit_error' },
      { input: 'quota_exceeded', expected: 'rate_limit_error' },
      { input: 'too_many_requests', expected: 'rate_limit_error' },
      { input: 'invalid_request', expected: 'invalid_request_error' },
      { input: 'bad_request', expected: 'invalid_request_error' },
      { input: 'invalid_parameter', expected: 'invalid_request_error' },
      { input: 'not_found', expected: 'not_found_error' },
      { input: 'resource_not_found', expected: 'not_found_error' },
      { input: 'unknown_error', expected: 'api_error' },
      { input: 'server_error', expected: 'api_error' }
    ];

    errorTypeMappings.forEach(({ input, expected }) => {
      test(`should map '${input}' to '${expected}'`, () => {
        const googleErrorJson = JSON.stringify({ error: input });
        const error = new Error(googleErrorJson);
        const result = ErrorHandler.parseGoogleError(error);

        expect(result.error.type).toBe(expected);
      });
    });
  });
});