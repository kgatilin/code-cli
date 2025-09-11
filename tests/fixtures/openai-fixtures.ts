import type { OpenAIRequest, OpenAIResponse, OpenAIStreamChunk, OpenAIError } from '../../src/types.js';

/**
 * Common OpenAI request fixtures for testing
 */
export const openAIRequests = {
  simple: {
    messages: [
      { role: 'user', content: 'Hello' }
    ],
    model: 'gpt-3.5-turbo',
    stream: false
  } as OpenAIRequest,

  withSystemMessage: {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello' }
    ],
    model: 'gpt-4',
    stream: false
  } as OpenAIRequest,

  streaming: {
    messages: [
      { role: 'user', content: 'Write a short story' }
    ],
    model: 'gpt-3.5-turbo',
    stream: true
  } as OpenAIRequest,

  multiModal: {
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe this image' },
          { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,...' } }
        ]
      }
    ],
    model: 'gpt-4-vision-preview',
    stream: false
  } as OpenAIRequest,

  withParameters: {
    messages: [
      { role: 'user', content: 'Generate creative text' }
    ],
    model: 'gpt-4',
    stream: false,
    temperature: 0.8,
    max_tokens: 100,
    top_p: 0.9
  } as OpenAIRequest,

  conversation: {
    messages: [
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '2+2 equals 4.' },
      { role: 'user', content: 'What about 3+3?' }
    ],
    model: 'gpt-3.5-turbo',
    stream: false
  } as OpenAIRequest,

  empty: {
    messages: [],
    model: 'gpt-3.5-turbo',
    stream: false
  } as OpenAIRequest,

  missingMessages: {
    model: 'gpt-3.5-turbo',
    stream: false
  } as Partial<OpenAIRequest>
};

/**
 * Common OpenAI response fixtures for testing
 */
export const openAIResponses = {
  simple: {
    id: 'chatcmpl-123',
    object: 'chat.completion',
    created: 1677652288,
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'Hello! How can I help you today?' },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30
    }
  } as OpenAIResponse,

  withFunction: {
    id: 'chatcmpl-456',
    object: 'chat.completion',
    created: 1677652388,
    model: 'gpt-4',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: null,
        function_call: {
          name: 'get_weather',
          arguments: '{"location":"San Francisco"}'
        }
      },
      finish_reason: 'function_call'
    }],
    usage: {
      prompt_tokens: 15,
      completion_tokens: 10,
      total_tokens: 25
    }
  } as OpenAIResponse,

  longResponse: {
    id: 'chatcmpl-789',
    object: 'chat.completion',
    created: 1677652488,
    model: 'gpt-4',
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: 'This is a longer response that might be used for testing pagination or content handling. '.repeat(20)
      },
      finish_reason: 'stop'
    }],
    usage: {
      prompt_tokens: 25,
      completion_tokens: 200,
      total_tokens: 225
    }
  } as OpenAIResponse
};

/**
 * Common OpenAI streaming response fixtures for testing
 */
export const openAIStreamChunks = {
  roleChunk: {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      delta: { role: 'assistant' },
      finish_reason: null
    }]
  } as OpenAIStreamChunk,

  contentChunk: {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      delta: { content: 'Hello' },
      finish_reason: null
    }]
  } as OpenAIStreamChunk,

  finalChunk: {
    id: 'chatcmpl-123',
    object: 'chat.completion.chunk',
    created: 1677652288,
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop'
    }]
  } as OpenAIStreamChunk
};

/**
 * Common OpenAI error fixtures for testing
 */
export const openAIErrors = {
  authentication: {
    error: {
      message: 'invalid_grant: reauth related error (invalid_rapt) (See: https://support.google.com/a/answer/9368756)',
      type: 'authentication_error',
      code: 'invalid_grant',
      param: null
    }
  } as OpenAIError,

  permissionDenied: {
    error: {
      message: 'permission_denied: Access denied to resource',
      type: 'permission_error',
      code: 'permission_denied',
      param: null
    }
  } as OpenAIError,

  rateLimitExceeded: {
    error: {
      message: 'rate_limit_exceeded: Too many requests',
      type: 'rate_limit_error',
      code: 'rate_limit_exceeded',
      param: null
    }
  } as OpenAIError,

  invalidRequest: {
    error: {
      message: 'invalid_request: Invalid parameter',
      type: 'invalid_request_error',
      code: 'invalid_request',
      param: null
    }
  } as OpenAIError,

  serverError: {
    error: {
      message: 'Internal server error',
      type: 'server_error',
      code: null,
      param: null
    }
  } as OpenAIError
};

/**
 * Utility functions for creating test data
 */
export const openAIFixtureHelpers = {
  /**
   * Create a custom OpenAI request with overrides
   */
  createRequest: (overrides: Partial<OpenAIRequest>): OpenAIRequest => ({
    ...openAIRequests.simple,
    ...overrides
  }),

  /**
   * Create a custom OpenAI response with overrides
   */
  createResponse: (overrides: Partial<OpenAIResponse>): OpenAIResponse => ({
    ...openAIResponses.simple,
    ...overrides
  }),

  /**
   * Create a custom stream chunk with overrides
   */
  createStreamChunk: (overrides: Partial<OpenAIStreamChunk>): OpenAIStreamChunk => ({
    ...openAIStreamChunks.contentChunk,
    ...overrides
  }),

  /**
   * Generate a stream of chunks for testing
   */
  generateStream: (content: string, chunkSize: number = 5): OpenAIStreamChunk[] => {
    const chunks: OpenAIStreamChunk[] = [];
    const id = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);

    // Role chunk
    chunks.push({
      id,
      object: 'chat.completion.chunk',
      created,
      model: 'gpt-3.5-turbo',
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null
      }]
    });

    // Content chunks
    for (let i = 0; i < content.length; i += chunkSize) {
      const chunk = content.slice(i, i + chunkSize);
      chunks.push({
        id,
        object: 'chat.completion.chunk',
        created,
        model: 'gpt-3.5-turbo',
        choices: [{
          index: 0,
          delta: { content: chunk },
          finish_reason: null
        }]
      });
    }

    // Final chunk
    chunks.push({
      id,
      object: 'chat.completion.chunk',
      created,
      model: 'gpt-3.5-turbo',
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop'
      }]
    });

    return chunks;
  }
};