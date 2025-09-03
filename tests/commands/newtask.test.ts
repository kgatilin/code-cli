import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol } from 'memfs';
import { executeNewtask } from '../../src/commands/newtask.js';
import type { Config } from '../../src/types.js';
import { execSync } from 'child_process';
import { fetchJiraTicket, validateJiraConfig, parseJiraInput, loadJiraConfigFromEnv } from '../../src/jira-client.js';
import { processIncludes } from '../../src/prompt-loader.js';

// Mock the file system
vi.mock('fs', async () => {
  const memfs = await vi.importActual('memfs');
  return memfs.fs;
});

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn()
}));

// Mock jira-client
vi.mock('../../src/jira-client.js', () => ({
  fetchJiraTicket: vi.fn(),
  validateJiraConfig: vi.fn(),
  parseJiraInput: vi.fn(),
  loadJiraConfigFromEnv: vi.fn()
}));

// Mock prompt-loader
vi.mock('../../src/prompt-loader.js', () => ({
  processIncludes: vi.fn()
}));

describe('newtask command', () => {
  const testConfig: Config = {
    promptsPath: './.claude/prompts',
    logsPath: '.agent/log',
    taskPath: '.agent/task',
    templatesPath: './.claude/templates',
    snippetsPath: './.claude/snippets',
    reviewPattern: '//Review:',
    reviewSearchPaths: ['src'],
    reviewSearchExtensions: ['.ts'],
    reviewSearchExcludes: [],
    modelMappings: {},
    includePaths: {
      prompts: './.claude/prompts',
      templates: './.claude/templates',
      snippets: './.claude/snippets'
    },
    globalPaths: {
      prompts: '~/.claude/prompts',
      templates: '~/.claude/templates',
      snippets: '~/.claude/snippets'
    }
  };

  beforeEach(() => {
    vol.reset();
    vi.clearAllMocks();
    
    // Setup default mocks
    vi.mocked(processIncludes).mockReturnValue('stage: planning\nround: 1\nupdated: "{{timestamp}}"\nbranch: "{{branch_name}}"');
    vi.mocked(execSync).mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('traditional mode', () => {
    it('creates task successfully with valid branch and description', async () => {
      // Mock git branch doesn't exist
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error('Branch not found'); }) // git rev-parse fails
        .mockImplementationOnce(() => {}); // git checkout succeeds

      const result = await executeNewtask(['test-branch', 'Test task description'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Task created successfully!');
      expect(result.message).toContain('Branch: test-branch');
      
      // Verify git commands were called
      expect(vi.mocked(execSync)).toHaveBeenCalledWith('git rev-parse --verify test-branch', { stdio: 'ignore' });
      expect(vi.mocked(execSync)).toHaveBeenCalledWith('git checkout -b test-branch', { stdio: 'inherit' });
      
      // Verify files were created
      expect(vol.existsSync('.agent/task/test-branch/task.md')).toBe(true);
      expect(vol.existsSync('.agent/task/test-branch/stage.yaml')).toBe(true);
      
      // Verify task.md content
      const taskContent = vol.readFileSync('.agent/task/test-branch/task.md', 'utf8');
      expect(taskContent).toBe('# test-branch\n\nTest task description\n');
    });

    it('fails when branch already exists', async () => {
      // Mock git branch exists
      vi.mocked(execSync).mockImplementationOnce(() => {}); // git rev-parse succeeds

      const result = await executeNewtask(['existing-branch', 'Test description'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Branch 'existing-branch' already exists");
    });

    it('fails with missing arguments', async () => {
      const result = await executeNewtask(['only-branch'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Branch name and task description are required');
    });

    it('fails with empty arguments', async () => {
      const result = await executeNewtask([], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Arguments are required');
    });

    it('fails when git command fails', async () => {
      // Mock git branch doesn't exist
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error('Branch not found'); }) // git rev-parse fails
        .mockImplementationOnce(() => { throw new Error('Git error'); }); // git checkout fails

      const result = await executeNewtask(['test-branch', 'Test description'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create git branch: Git error');
    });
  });

  describe('jira mode', () => {
    const mockJiraConfig = {
      baseUrl: 'https://test.atlassian.net',
      username: 'test@example.com',
      token: 'test-token'
    };

    const mockJiraTicket = {
      key: 'PROJ-123',
      summary: 'Test ticket summary',
      description: 'Test ticket description'
    };

    beforeEach(() => {
      vi.mocked(loadJiraConfigFromEnv).mockReturnValue(mockJiraConfig);
      vi.mocked(validateJiraConfig).mockImplementation(() => {});
      vi.mocked(parseJiraInput).mockReturnValue({ ticketKey: 'PROJ-123' });
      vi.mocked(fetchJiraTicket).mockResolvedValue(mockJiraTicket);
      
      // Mock git branch doesn't exist
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error('Branch not found'); }) // git rev-parse fails
        .mockImplementationOnce(() => {}); // git checkout succeeds
    });

    it('creates task with Jira ticket ID and auto-generated branch', async () => {
      const result = await executeNewtask(['--jira', 'PROJ-123'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Task created successfully!');
      expect(result.message).toContain('Branch: proj-123-test-ticket-summary');
      expect(result.message).toContain('Jira Ticket: PROJ-123');
      expect(result.message).toContain('Summary: Test ticket summary');

      // Verify Jira functions were called correctly
      expect(vi.mocked(loadJiraConfigFromEnv)).toHaveBeenCalled();
      expect(vi.mocked(validateJiraConfig)).toHaveBeenCalledWith(mockJiraConfig);
      expect(vi.mocked(parseJiraInput)).toHaveBeenCalledWith('PROJ-123');
      expect(vi.mocked(fetchJiraTicket)).toHaveBeenCalledWith('PROJ-123', mockJiraConfig);

      // Verify task.md contains Jira information
      const taskContent = vol.readFileSync('.agent/task/proj-123-test-ticket-summary/task.md', 'utf8');
      expect(taskContent).toContain('# proj-123-test-ticket-summary');
      expect(taskContent).toContain('**Jira Ticket**: PROJ-123');
      expect(taskContent).toContain('**Summary**: Test ticket summary');
      expect(taskContent).toContain('## Description');
      expect(taskContent).toContain('Test ticket description');
    });

    it('creates task with Jira URL and custom branch name', async () => {
      const jiraUrl = 'https://company.atlassian.net/browse/PROJ-123';
      vi.mocked(parseJiraInput).mockReturnValue({ 
        ticketKey: 'PROJ-123', 
        baseUrl: 'https://company.atlassian.net' 
      });

      const result = await executeNewtask(['--jira', jiraUrl, 'custom-branch'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: custom-branch');

      // Verify effective config was used (URL from input overrides env config)
      expect(vi.mocked(fetchJiraTicket)).toHaveBeenCalledWith('PROJ-123', {
        ...mockJiraConfig,
        baseUrl: 'https://company.atlassian.net'
      });

      // Verify task file was created with custom branch name
      expect(vol.existsSync('.agent/task/custom-branch/task.md')).toBe(true);
    });

    it('generates clean branch names from ticket summaries', async () => {
      const complexTicket = {
        key: 'PROJ-456',
        summary: 'Fix bug in user authentication & authorization system!!',
        description: 'Complex description'
      };
      vi.mocked(fetchJiraTicket).mockResolvedValue(complexTicket);

      const result = await executeNewtask(['--jira', 'PROJ-456'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: proj-456-fix-bug-in-user-authentication');

      // Verify clean branch name was generated (special characters removed, spaces converted to hyphens)
      expect(vol.existsSync('.agent/task/proj-456-fix-bug-in-user-authentication/task.md')).toBe(true);
    });

    it('handles empty ticket summary gracefully', async () => {
      const emptyTicket = {
        key: 'PROJ-789',
        summary: '',
        description: 'Some description'
      };
      vi.mocked(fetchJiraTicket).mockResolvedValue(emptyTicket);

      const result = await executeNewtask(['--jira', 'PROJ-789'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: proj-789');

      // Verify fallback branch name
      expect(vol.existsSync('.agent/task/proj-789/task.md')).toBe(true);
    });

    it('fails when Jira ticket ID is missing', async () => {
      const result = await executeNewtask(['--jira'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Jira ticket ID or URL is required after --jira flag');
    });

    it('fails when Jira configuration is invalid', async () => {
      vi.mocked(validateJiraConfig).mockImplementation(() => {
        throw new Error('JIRA_BASE_URL environment variable is required');
      });

      const result = await executeNewtask(['--jira', 'PROJ-123'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch Jira ticket: JIRA_BASE_URL environment variable is required');
    });

    it('fails when Jira API request fails', async () => {
      vi.mocked(fetchJiraTicket).mockRejectedValue(new Error('Network error connecting to Jira'));

      const result = await executeNewtask(['--jira', 'PROJ-123'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch Jira ticket: Network error connecting to Jira');
    });

    it('fails when ticket parsing fails', async () => {
      vi.mocked(parseJiraInput).mockImplementation(() => {
        throw new Error('Invalid ticket key format');
      });

      const result = await executeNewtask(['--jira', 'invalid'], testConfig);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to fetch Jira ticket: Invalid ticket key format');
    });
  });

  describe('branch name generation', () => {
    beforeEach(() => {
      vi.mocked(loadJiraConfigFromEnv).mockReturnValue({
        baseUrl: 'https://test.atlassian.net',
        username: 'test@example.com',
        token: 'test-token'
      });
      vi.mocked(validateJiraConfig).mockImplementation(() => {});
      vi.mocked(parseJiraInput).mockReturnValue({ ticketKey: 'TEST-123' });
      
      // Mock git branch doesn't exist
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error('Branch not found'); })
        .mockImplementationOnce(() => {});
    });

    it('generates branch name from ticket key and summary', async () => {
      vi.mocked(fetchJiraTicket).mockResolvedValue({
        key: 'TEST-123',
        summary: 'Add user login functionality',
        description: 'Description'
      });

      const result = await executeNewtask(['--jira', 'TEST-123'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: test-123-add-user-login-functionality');
    });

    it('sanitizes special characters in branch names', async () => {
      vi.mocked(fetchJiraTicket).mockResolvedValue({
        key: 'TEST-456',
        summary: 'Fix bug: authentication & authorization (urgent!)',
        description: 'Description'
      });

      const result = await executeNewtask(['--jira', 'TEST-456'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: test-456-fix-bug-authentication-au');
    });

    it('handles very long summaries by truncating', async () => {
      const longSummary = 'This is a very long summary that should be truncated to avoid creating branch names that are too long for git to handle properly';
      vi.mocked(fetchJiraTicket).mockResolvedValue({
        key: 'TEST-789',
        summary: longSummary,
        description: 'Description'
      });

      const result = await executeNewtask(['--jira', 'TEST-789'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: test-789-this-is-a-very-long-summa');
    });

    it('falls back to ticket key only for empty summary', async () => {
      vi.mocked(fetchJiraTicket).mockResolvedValue({
        key: 'TEST-000',
        summary: '',
        description: 'Description'
      });

      const result = await executeNewtask(['--jira', 'TEST-000'], testConfig);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Branch: test-000');
    });
  });

  describe('file generation', () => {
    beforeEach(() => {
      // Mock git operations
      vi.mocked(execSync)
        .mockImplementationOnce(() => { throw new Error('Branch not found'); })
        .mockImplementationOnce(() => {});
    });

    it('creates task directory structure', async () => {
      const result = await executeNewtask(['test-branch', 'Test description'], testConfig);

      expect(result.success).toBe(true);
      expect(vol.existsSync('.agent/task/test-branch')).toBe(true);
      expect(vol.existsSync('.agent/task/test-branch/task.md')).toBe(true);
      expect(vol.existsSync('.agent/task/test-branch/stage.yaml')).toBe(true);
    });

    it('includes template processing placeholders', async () => {
      await executeNewtask(['test-branch', 'Test description'], testConfig);

      expect(vi.mocked(processIncludes)).toHaveBeenCalledWith(
        '{{include: templates/stage}}',
        testConfig,
        expect.any(Set),
        undefined,
        expect.objectContaining({
          timestamp: expect.any(String),
          branch_name: 'test-branch'
        })
      );
    });

  });
});