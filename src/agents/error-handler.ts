import type { OpenAIError, OpenAIStreamErrorChunk } from '../types.js';
import { logDebug } from './logger.js';

/**
 * Google AI error structure (based on observed error format)
 * Handles both simple string errors and complex nested error objects
 */
interface GoogleAIError {
  error?: string | {
    message?: string;
    code?: number | string;
    status?: string;
    details?: unknown[];
  };
  error_description?: string;
  error_uri?: string;
  error_subtype?: string;
}

/**
 * Utility class for handling errors from Google AI and converting them to OpenAI-compatible format
 */
export class ErrorHandler {
  /**
   * Parse error from Google AI and convert to OpenAI-compatible error response
   */
  static parseGoogleError(error: unknown): OpenAIError {
    logDebug('ErrorHandler', 'Parsing Google AI error', { 
      errorType: typeof error,
      errorConstructor: error?.constructor?.name 
    });

    let googleError: GoogleAIError | null = null;
    let originalMessage = 'Unknown error occurred';

    // Try to extract Google AI error details
    if (error instanceof Error) {
      originalMessage = error.message;
      
      // Check if the error message contains JSON (Google AI errors are often stringified JSON)
      try {
        const parsedError = JSON.parse(error.message);
        if (typeof parsedError === 'object' && parsedError !== null) {
          googleError = parsedError as GoogleAIError;
          logDebug('ErrorHandler', 'Parsed JSON from error message', { googleError });
        }
      } catch {
        // Not JSON, use the message as-is
        logDebug('ErrorHandler', 'Error message is not JSON', { message: error.message });
      }
    } else if (typeof error === 'string') {
      originalMessage = error;
      
      // Try to parse as JSON
      try {
        const parsedError = JSON.parse(error);
        if (typeof parsedError === 'object' && parsedError !== null) {
          googleError = parsedError as GoogleAIError;
          logDebug('ErrorHandler', 'Parsed JSON from string error', { googleError });
        }
      } catch {
        // Not JSON, use the string as-is
        logDebug('ErrorHandler', 'String error is not JSON', { error });
      }
    }

    // Convert to OpenAI format
    const openAIError: OpenAIError = {
      error: {
        message: this.formatErrorMessage(googleError, originalMessage),
        type: this.mapErrorType(googleError),
        code: this.extractErrorCodeFromParsed(googleError),
        param: null
      }
    };

    logDebug('ErrorHandler', 'Converted to OpenAI error format', { openAIError });
    return openAIError;
  }

  /**
   * Create OpenAI-compatible streaming error chunk
   */
  static createStreamingErrorChunk(error: unknown): OpenAIStreamErrorChunk {
    const parsedError = this.parseGoogleError(error);
    
    return {
      id: `error-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      object: 'error',
      created: Math.floor(Date.now() / 1000),
      error: parsedError.error
    };
  }

  /**
   * Format error message with Google AI details when available
   */
  private static formatErrorMessage(googleError: GoogleAIError | null, fallbackMessage: string): string {
    if (!googleError) {
      return fallbackMessage;
    }

    let message = '';
    
    // Handle both string and object error formats
    if (googleError.error) {
      if (typeof googleError.error === 'string') {
        message += googleError.error;
      } else if (typeof googleError.error === 'object') {
        // For nested objects, use message or combine available fields
        if (googleError.error.message) {
          message += googleError.error.message;
        } else {
          // Combine status and code if message not available
          const parts = [
            googleError.error.status,
            googleError.error.code?.toString()
          ].filter(Boolean);
          if (parts.length > 0) {
            message += parts.join(' - ');
          }
        }
      }
    }
    
    if (googleError.error_description) {
      message += message ? `: ${googleError.error_description}` : googleError.error_description;
    }
    
    if (googleError.error_uri) {
      message += ` (See: ${googleError.error_uri})`;
    }

    return message || fallbackMessage;
  }

  /**
   * Extract error code from parsed Google AI error, handling both string and object formats
   */
  private static extractErrorCodeFromParsed(googleError: GoogleAIError | null): string | null {
    if (!googleError?.error) {
      return null;
    }

    if (typeof googleError.error === 'string') {
      return googleError.error;
    } else if (typeof googleError.error === 'object') {
      // For nested objects, prefer status over code, then code
      return googleError.error.status || googleError.error.code?.toString() || null;
    }

    return null;
  }


  /**
   * Map Google AI error types to OpenAI error types
   */
  private static mapErrorType(googleError: GoogleAIError | null): OpenAIError['error']['type'] {
    if (!googleError?.error) {
      return 'server_error';
    }

    // Extract the error string for analysis - handle both string and object formats
    let errorString = '';
    if (typeof googleError.error === 'string') {
      errorString = googleError.error;
    } else if (typeof googleError.error === 'object') {
      // For nested error objects, use message, status, or convert code to string
      errorString = [
        googleError.error.message,
        googleError.error.status,
        googleError.error.code?.toString()
      ].filter(Boolean).join(' ');
    }
    
    const errorCode = errorString.toLowerCase();

    // Authentication and authorization errors
    if (errorCode.includes('invalid_grant') || 
        errorCode.includes('unauthorized') || 
        errorCode.includes('auth') ||
        errorCode.includes('invalid_rapt')) {
      return 'authentication_error';
    }

    // Permission errors
    if (errorCode.includes('permission') || 
        errorCode.includes('forbidden') ||
        errorCode.includes('access_denied')) {
      return 'permission_error';
    }

    // Rate limiting
    if (errorCode.includes('rate_limit') || 
        errorCode.includes('quota') ||
        errorCode.includes('too_many_requests')) {
      return 'rate_limit_error';
    }

    // Invalid request - include API argument errors
    if (errorCode.includes('invalid_request') || 
        errorCode.includes('bad_request') ||
        errorCode.includes('invalid_parameter') ||
        errorCode.includes('invalid_argument') ||
        errorCode.includes('invalid json payload')) {
      return 'invalid_request_error';
    }

    // Not found
    if (errorCode.includes('not_found') || 
        errorCode.includes('resource_not_found')) {
      return 'not_found_error';
    }

    // Default to server error for other Google AI errors
    return 'api_error';
  }

  /**
   * Check if an error looks like a Google AI authentication error
   */
  static isAuthenticationError(error: unknown): boolean {
    try {
      const parsedError = this.parseGoogleError(error);
      return parsedError.error.type === 'authentication_error';
    } catch {
      return false;
    }
  }

  /**
   * Extract error code from Google AI error for logging/debugging
   */
  static extractErrorCode(error: unknown): string | null {
    try {
      const parsedError = this.parseGoogleError(error);
      return parsedError.error.code ?? null;
    } catch {
      return null;
    }
  }
}