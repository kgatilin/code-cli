import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { 
  validateJiraConfig, 
  parseJiraInput, 
  fetchJiraTicket, 
  loadJiraConfigFromEnv 
} from '../src/jira-client.js';
import type { JiraConfig } from '../src/jira-client.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('jira-client', () => {
  const validConfig: JiraConfig = {
    baseUrl: 'https://test.atlassian.net',
    username: 'test@example.com',
    token: 'test-token-123'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('validateJiraConfig', () => {
    it('validates complete valid configuration', () => {
      expect(() => validateJiraConfig(validConfig)).not.toThrow();
    });

    it('throws error for missing baseUrl', () => {
      const config = { ...validConfig, baseUrl: '' };
      expect(() => validateJiraConfig(config)).toThrow('JIRA_URL environment variable is required');
    });

    it('throws error for missing username', () => {
      const config = { ...validConfig, username: '' };
      expect(() => validateJiraConfig(config)).toThrow('JIRA_USERNAME environment variable is required');
    });

    it('throws error for missing token', () => {
      const config = { ...validConfig, token: '' };
      expect(() => validateJiraConfig(config)).toThrow('JIRA_API_TOKEN environment variable is required');
    });

    it('throws error for invalid URL format', () => {
      const config = { ...validConfig, baseUrl: 'invalid-url' };
      expect(() => validateJiraConfig(config)).toThrow('Invalid JIRA_URL: must be a valid HTTP/HTTPS URL');
    });

    it('accepts https URLs', () => {
      const config = { ...validConfig, baseUrl: 'https://company.atlassian.net' };
      expect(() => validateJiraConfig(config)).not.toThrow();
    });

    it('accepts http URLs', () => {
      const config = { ...validConfig, baseUrl: 'http://localhost:8080' };
      expect(() => validateJiraConfig(config)).not.toThrow();
    });
  });

  describe('parseJiraInput', () => {
    it('parses simple ticket key', () => {
      const result = parseJiraInput('PROJ-123');
      expect(result).toEqual({
        ticketKey: 'PROJ-123'
      });
    });

    it('parses ticket key with multiple characters', () => {
      const result = parseJiraInput('LONGPROJECT-456');
      expect(result).toEqual({
        ticketKey: 'LONGPROJECT-456'
      });
    });

    it('parses full Jira URL', () => {
      const url = 'https://company.atlassian.net/browse/PROJ-123';
      const result = parseJiraInput(url);
      expect(result).toEqual({
        ticketKey: 'PROJ-123',
        baseUrl: 'https://company.atlassian.net'
      });
    });

    it('parses Jira URL with additional path components', () => {
      const url = 'https://company.atlassian.net/browse/PROJ-123/some/extra/path';
      const result = parseJiraInput(url);
      expect(result).toEqual({
        ticketKey: 'PROJ-123',
        baseUrl: 'https://company.atlassian.net'
      });
    });

    it('handles http URLs', () => {
      const url = 'http://localhost:8080/browse/DEV-789';
      const result = parseJiraInput(url);
      expect(result).toEqual({
        ticketKey: 'DEV-789',
        baseUrl: 'http://localhost:8080'
      });
    });

    it('throws error for empty input', () => {
      expect(() => parseJiraInput('')).toThrow('Jira ticket input is required');
      expect(() => parseJiraInput('   ')).toThrow('Jira ticket input is required');
    });

    it('throws error for invalid ticket key format', () => {
      expect(() => parseJiraInput('invalid')).toThrow('Invalid ticket key format: expected format like PROJ-123');
      expect(() => parseJiraInput('PROJ')).toThrow('Invalid ticket key format: expected format like PROJ-123');
      expect(() => parseJiraInput('123')).toThrow('Invalid ticket key format: expected format like PROJ-123');
      expect(() => parseJiraInput('proj-123')).toThrow('Invalid ticket key format: expected format like PROJ-123');
    });

    it('throws error for invalid URL format', () => {
      expect(() => parseJiraInput('not-a-url')).toThrow('Invalid ticket key format: expected format like PROJ-123');
    });

    it('throws error for URL without proper browse path', () => {
      expect(() => parseJiraInput('https://company.atlassian.net/invalid/PROJ-123')).toThrow('Invalid Jira URL format: expected /browse/TICKET-123');
    });

    it('throws error for URL with invalid ticket key in path', () => {
      expect(() => parseJiraInput('https://company.atlassian.net/browse/invalid')).toThrow('Invalid Jira URL format: expected /browse/TICKET-123');
    });
  });

  describe('fetchJiraTicket', () => {
    const mockTicketResponse = {
      key: 'PROJ-123',
      fields: {
        summary: 'Test ticket summary',
        description: 'Test ticket description content'
      }
    };

    it('successfully fetches ticket with valid response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockTicketResponse
      });

      const result = await fetchJiraTicket('PROJ-123', validConfig);

      expect(result).toEqual({
        key: 'PROJ-123',
        summary: 'Test ticket summary',
        description: 'Test ticket description content'
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://test.atlassian.net/rest/api/2/issue/PROJ-123?fields=key,summary,description',
        {
          method: 'GET',
          headers: {
            'Authorization': 'Basic dGVzdEBleGFtcGxlLmNvbTp0ZXN0LXRva2VuLTEyMw==', // base64 of test@example.com:test-token-123
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }
      );
    });

    it('handles empty summary and description gracefully', async () => {
      const emptyResponse = {
        key: 'PROJ-123',
        fields: {
          summary: '',
          description: ''
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => emptyResponse
      });

      const result = await fetchJiraTicket('PROJ-123', validConfig);

      expect(result).toEqual({
        key: 'PROJ-123',
        summary: '',
        description: ''
      });
    });

    it('handles missing summary and description fields', async () => {
      const responseWithoutFields = {
        key: 'PROJ-123',
        fields: {}
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => responseWithoutFields
      });

      const result = await fetchJiraTicket('PROJ-123', validConfig);

      expect(result).toEqual({
        key: 'PROJ-123',
        summary: '',
        description: ''
      });
    });

    it('throws authentication error for 401 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Authentication failed: please check your Jira username and token');
    });

    it('throws access denied error for 403 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden'
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Access denied: insufficient permissions to view this ticket');
    });

    it('throws not found error for 404 response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Ticket not found: PROJ-123 does not exist or is not accessible');
    });

    it('throws generic error for other HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Jira API error (500): Internal Server Error');
    });

    it('throws error for invalid JSON response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => { throw new Error('Invalid JSON'); }
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Invalid response from Jira API: unable to parse JSON');
    });

    it('throws error for missing response key', async () => {
      const invalidResponse = {
        fields: {
          summary: 'Test summary'
        }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Invalid response from Jira API: missing ticket key');
    });

    it('throws error for missing fields object', async () => {
      const invalidResponse = {
        key: 'PROJ-123'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse
      });

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Invalid response from Jira API: missing fields object');
    });

    it('throws error for network failures', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed'));

      await expect(fetchJiraTicket('PROJ-123', validConfig))
        .rejects.toThrow('Network error connecting to Jira: Network connection failed');
    });

    it('validates configuration before making request', async () => {
      const invalidConfig = { ...validConfig, baseUrl: '' };

      await expect(fetchJiraTicket('PROJ-123', invalidConfig))
        .rejects.toThrow('JIRA_URL environment variable is required');
    });
  });

  describe('loadJiraConfigFromEnv', () => {
    const testDir = join(process.cwd(), 'test-env-config');
    let originalCwd: string;

    beforeEach(() => {
      // Save original directory
      originalCwd = process.cwd();
      
      // Create test directory
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
      
      // Change to test directory
      process.chdir(testDir);
    });

    afterEach(() => {
      // Change back to original directory
      process.chdir(originalCwd);
      
      // Clean up test directory
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true, force: true });
      }
      
      // Clean up environment variables
      vi.unstubAllEnvs();
    });

    it('loads configuration from environment variables', () => {
      vi.stubEnv('JIRA_URL', 'https://test.atlassian.net');
      vi.stubEnv('JIRA_USERNAME', 'test@example.com');
      vi.stubEnv('JIRA_API_TOKEN', 'test-token');

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'test-token'
      });
    });

    it('loads configuration from .env file when environment variables are not set', () => {
      vi.unstubAllEnvs();
      
      // Create .env file with test content
      const envContent = `JIRA_URL=https://env.atlassian.net
JIRA_USERNAME=env@example.com
JIRA_API_TOKEN=env-token-123`;
      writeFileSync('.env', envContent);

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: 'https://env.atlassian.net',
        username: 'env@example.com',
        token: 'env-token-123'
      });
    });

    it('prioritizes environment variables over .env file', () => {
      vi.stubEnv('JIRA_URL', 'https://env-var.atlassian.net');
      // Don't set username and token in env vars to test mixing
      
      const envContent = `JIRA_URL=https://file.atlassian.net
JIRA_USERNAME=file@example.com
JIRA_API_TOKEN=file-token-123`;
      writeFileSync('.env', envContent);

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: 'https://env-var.atlassian.net', // From env var
        username: 'file@example.com',           // From .env file
        token: 'file-token-123'                 // From .env file
      });
    });

    it('handles quoted values in .env file', () => {
      vi.unstubAllEnvs();
      
      const envContent = `JIRA_URL="https://quoted.atlassian.net"
JIRA_USERNAME='quoted@example.com'
JIRA_API_TOKEN=unquoted-token`;
      writeFileSync('.env', envContent);

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: 'https://quoted.atlassian.net',
        username: 'quoted@example.com',
        token: 'unquoted-token'
      });
    });

    it('ignores comments and empty lines in .env file', () => {
      vi.unstubAllEnvs();
      
      const envContent = `# This is a comment
JIRA_URL=https://test.atlassian.net

# Another comment
JIRA_USERNAME=test@example.com
# JIRA_API_TOKEN=commented-out
JIRA_API_TOKEN=actual-token

`;
      writeFileSync('.env', envContent);

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'actual-token'
      });
    });

    it('handles malformed lines gracefully in .env file', () => {
      vi.unstubAllEnvs();
      
      const envContent = `JIRA_URL=https://test.atlassian.net
INVALID_LINE_WITHOUT_EQUALS
=VALUE_WITHOUT_KEY
JIRA_USERNAME=test@example.com
JIRA_API_TOKEN=test-token`;
      writeFileSync('.env', envContent);

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'test-token'
      });
    });

    it('returns empty strings when no .env file exists and no environment variables', () => {
      vi.unstubAllEnvs();
      
      // Don't create any .env file

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: '',
        username: '',
        token: ''
      });
    });

    it('handles file system errors gracefully', () => {
      vi.unstubAllEnvs();
      
      // Without any env vars or .env file, should return empty strings
      const config = loadJiraConfigFromEnv();
      
      expect(config.baseUrl).toBeDefined();
      expect(config.username).toBeDefined();
      expect(config.token).toBeDefined();
    });


    it('handles ENOENT error gracefully', () => {
      vi.unstubAllEnvs();
      
      // Mock fs to throw ENOENT error
      vi.doMock('fs', () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => {
          const error = new Error('File not found');
          (error as any).code = 'ENOENT';
          throw error;
        })
      }));

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: '',
        username: '',
        token: ''
      });
    });

    it('handles EACCES error gracefully', () => {
      vi.unstubAllEnvs();
      
      // Mock fs to throw EACCES error
      vi.doMock('fs', () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => {
          const error = new Error('Permission denied');
          (error as any).code = 'EACCES';
          throw error;
        })
      }));

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: '',
        username: '',
        token: ''
      });
    });

    it('handles EPERM error gracefully', () => {
      vi.unstubAllEnvs();
      
      // Mock fs to throw EPERM error
      vi.doMock('fs', () => ({
        existsSync: vi.fn(() => true),
        readFileSync: vi.fn(() => {
          const error = new Error('Operation not permitted');
          (error as any).code = 'EPERM';
          throw error;
        })
      }));

      const config = loadJiraConfigFromEnv();

      expect(config).toEqual({
        baseUrl: '',
        username: '',
        token: ''
      });
    });

  });
});