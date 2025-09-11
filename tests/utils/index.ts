/**
 * Test utilities for safe and reliable testing
 * 
 * These utilities prevent dangerous test patterns that could cause
 * data loss or system instability. They are part of test infrastructure.
 */

// Phase 1: Safe Test Environment
export { TestEnvironment } from './test-environment';
export type { TestEnvironmentOptions } from './test-environment';

// Phase 2: Process Management
export { 
  TestProcessManager,
  testProcessManager
} from './test-process-manager';
export type { 
  TestConfig,
  TestProcess
} from './test-process-manager';

// Phase 2: Configuration Management
export {
  DefaultTestConfigProvider,
  TestEnvironmentMocker,
  TestPortAllocator,
  testConfigProvider,
  testEnvironmentMocker,
  testPortAllocator,
  createTestConfig,
  createTestEnvFile,
  getTestEnvTemplate
} from './test-config';
export type {
  TestConfigProvider
} from './test-config';

// Phase 2: Cleanup Management
export {
  CleanupManager,
  cleanupManager,
  registerCleanup,
  unregisterCleanup,
  executeAllCleanups,
  setupGlobalCleanupHandlers
} from './cleanup-manager';
export type {
  CleanupFunction,
  CleanupTask,
  CleanupOptions,
  CleanupResult
} from './cleanup-manager';

// Phase 4: Agent-Specific Test Infrastructure
export {
  mockHelpers,
  testDataGenerators,
  testAssertions,
  testEnvironmentHelpers,
  requestResponseHelpers
} from './agent-test-helpers';

export {
  createMockMCPClient,
  createMockMCPClientManager,
  createMockGoogleGenAI,
  createMockOrchestrator,
  createMockFileSystem,
  createMockChildProcess,
  createMockHttpServer,
  createMockExpressApp,
  createMockLogger,
  createMockProcessKill,
  createMockPortChecker,
  createMockError,
  mockSets
} from './mock-factories';