/**
 * Common Google AI request/response fixtures for testing
 */

/**
 * Google AI error formats that come from the Vertex AI service
 */
export const googleAIErrors = {
  invalidGrant: {
    error: 'invalid_grant',
    error_description: 'reauth related error (invalid_rapt)',
    error_uri: 'https://support.google.com/a/answer/9368756',
    error_subtype: 'invalid_rapt'
  },

  permissionDenied: {
    error: 'permission_denied',
    error_description: 'Access denied to resource'
  },

  rateLimitExceeded: {
    error: 'rate_limit_exceeded',
    error_description: 'Too many requests'
  },

  invalidRequest: {
    error: 'invalid_request',
    error_description: 'Invalid parameter'
  },

  notFound: {
    error: 'not_found',
    error_description: 'Resource not found'
  },

  serverError: {
    error: 'server_error',
    error_description: 'Internal server error'
  },

  quotaExceeded: {
    error: 'quota_exceeded',
    error_description: 'Quota limit exceeded'
  },

  resourceExhausted: {
    error: 'resource_exhausted',
    error_description: 'Too many requests'
  },

  cancelled: {
    error: 'cancelled',
    error_description: 'Request was cancelled'
  },

  deadlineExceeded: {
    error: 'deadline_exceeded',
    error_description: 'Request deadline exceeded'
  },

  alreadyExists: {
    error: 'already_exists',
    error_description: 'Resource already exists'
  },

  outOfRange: {
    error: 'out_of_range',
    error_description: 'Value out of range'
  },

  unimplemented: {
    error: 'unimplemented',
    error_description: 'Operation not implemented'
  },

  unavailable: {
    error: 'unavailable',
    error_description: 'Service unavailable'
  },

  dataLoss: {
    error: 'data_loss',
    error_description: 'Unrecoverable data loss'
  },

  unauthenticated: {
    error: 'unauthenticated',
    error_description: 'Request not authenticated'
  },

  malformed: {
    error: 'malformed_request',
    error_description: 'Request format is invalid'
  }
};

/**
 * Google AI request formats (converted from OpenAI format by orchestrator)
 */
export const googleAIRequests = {
  simple: {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Hello' }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024
    }
  },

  withSystemInstruction: {
    contents: [
      {
        role: 'user', 
        parts: [{ text: 'Hello' }]
      }
    ],
    systemInstruction: 'You are a helpful assistant.',
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024
    }
  },

  multiModal: {
    contents: [
      {
        role: 'user',
        parts: [
          { text: 'Describe this image' },
          { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024
    }
  },

  conversation: {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'What is 2+2?' }]
      },
      {
        role: 'model',
        parts: [{ text: '2+2 equals 4.' }]
      },
      {
        role: 'user',
        parts: [{ text: 'What about 3+3?' }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024
    }
  },

  withTools: {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Get the weather for San Francisco' }]
      }
    ],
    tools: [{
      type: 'function',
      name: 'get_weather',
      description: 'Get weather information for a location'
    }],
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024
    }
  }
};

/**
 * Google AI response formats
 */
export const googleAIResponses = {
  simple: {
    candidates: [{
      content: {
        parts: [{ text: 'Hello! How can I help you today?' }],
        role: 'model'
      },
      finishReason: 'STOP',
      index: 0
    }],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30
    }
  },

  withFunctionCall: {
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'get_weather',
            args: { location: 'San Francisco' }
          }
        }],
        role: 'model'
      },
      finishReason: 'FUNCTION_CALL',
      index: 0
    }],
    usageMetadata: {
      promptTokenCount: 15,
      candidatesTokenCount: 10,
      totalTokenCount: 25
    }
  },

  blocked: {
    candidates: [{
      content: {
        parts: [],
        role: 'model'
      },
      finishReason: 'SAFETY',
      index: 0,
      safetyRatings: [{
        category: 'HARM_CATEGORY_HARASSMENT',
        probability: 'HIGH',
        blocked: true
      }]
    }],
    usageMetadata: {
      promptTokenCount: 20,
      candidatesTokenCount: 0,
      totalTokenCount: 20
    }
  }
};

/**
 * Google AI streaming response formats
 */
export const googleAIStreamChunks = {
  content: {
    candidates: [{
      content: {
        parts: [{ text: 'Hello' }],
        role: 'model'
      },
      index: 0
    }]
  },

  final: {
    candidates: [{
      content: {
        parts: [{ text: '' }],
        role: 'model'
      },
      finishReason: 'STOP',
      index: 0
    }],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 20,
      totalTokenCount: 30
    }
  }
};

/**
 * Utility functions for creating Google AI test data
 */
export const googleAIFixtureHelpers = {
  /**
   * Create a JSON error string (as Google AI returns errors)
   */
  createErrorString: (error: typeof googleAIErrors[keyof typeof googleAIErrors]): string => {
    return JSON.stringify(error);
  },

  /**
   * Create a Google AI error wrapped in an Error object
   */
  createError: (error: typeof googleAIErrors[keyof typeof googleAIErrors]): Error => {
    return new Error(JSON.stringify(error));
  },

  /**
   * Create a custom Google AI request
   */
  createRequest: (overrides: Record<string, unknown>): unknown => ({
    ...googleAIRequests.simple,
    ...overrides
  }),

  /**
   * Create a custom Google AI response
   */
  createResponse: (overrides: Record<string, unknown>): unknown => ({
    ...googleAIResponses.simple,
    ...overrides
  }),

  /**
   * Generate streaming chunks for text content
   */
  generateStreamChunks: (content: string, chunkSize: number = 5): unknown[] => {
    const chunks: unknown[] = [];

    // Content chunks
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      chunks.push({
        candidates: [{
          content: {
            parts: [{ text: chunk }],
            role: 'model'
          },
          index: 0
        }]
      });
    }

    // Final chunk with usage metadata
    chunks.push({
      candidates: [{
        content: {
          parts: [{ text: '' }],
          role: 'model'
        },
        finishReason: 'STOP',
        index: 0
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: content.length,
        totalTokenCount: 10 + content.length
      }
    });

    return chunks;
  }
};

/**
 * Error type mapping reference (for validation in tests)
 */
export const googleToOpenAIErrorMapping = {
  'invalid_grant': 'authentication_error',
  'permission_denied': 'permission_error',
  'rate_limit_exceeded': 'rate_limit_error',
  'invalid_request': 'invalid_request_error',
  'not_found': 'not_found_error',
  'server_error': 'api_error',
  'quota_exceeded': 'rate_limit_error',
  'resource_exhausted': 'rate_limit_error',
  'cancelled': 'api_error',
  'deadline_exceeded': 'timeout_error',
  'already_exists': 'invalid_request_error',
  'out_of_range': 'invalid_request_error',
  'unimplemented': 'api_error',
  'unavailable': 'api_error',
  'data_loss': 'api_error',
  'unauthenticated': 'authentication_error',
  'malformed_request': 'invalid_request_error'
} as const;