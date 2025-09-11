/**
 * Test fixtures for agent module testing
 * 
 * This module exports all test fixtures used across agent tests.
 * Fixtures provide consistent, reusable test data for:
 * - OpenAI request/response formats
 * - Google AI error formats
 * - Agent configurations
 * - Server responses
 * - Process management data
 */

// OpenAI fixtures
export {
  openAIRequests,
  openAIResponses,
  openAIStreamChunks,
  openAIErrors,
  openAIFixtureHelpers
} from './openai-fixtures.js';

// Google AI fixtures
export {
  googleAIErrors,
  googleAIRequests,
  googleAIResponses,
  googleAIStreamChunks,
  googleAIFixtureHelpers,
  googleToOpenAIErrorMapping
} from './google-ai-fixtures.js';

// Agent configuration fixtures
export {
  agentConfigs,
  envFileContents,
  mcpConfigs,
  healthResponses,
  processStatuses,
  pidFileContents,
  agentConfigHelpers
} from './agent-config-fixtures.js';