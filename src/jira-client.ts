/**
 * Jira API client for fetching ticket information
 * 
 * Provides functionality to authenticate with Jira and fetch ticket details
 * including summary and description fields. Supports both ticket IDs and full URLs.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/** Configuration for connecting to Jira */
export interface JiraConfig {
  /** Base URL of the Jira instance (e.g., https://company.atlassian.net) */
  baseUrl: string;
  /** Username or email for authentication */
  username: string;
  /** API token for authentication */
  token: string;
}

/** Jira ticket information returned from API */
export interface JiraTicket {
  /** Ticket key (e.g., PROJ-123) */
  key: string;
  /** Summary/title of the ticket */
  summary: string;
  /** Description content of the ticket */
  description: string;
}

/** Result of parsing Jira input */
interface JiraInputParsed {
  /** Extracted ticket key */
  ticketKey: string;
  /** Base URL if provided in input, undefined if only ticket key provided */
  baseUrl?: string;
}

/**
 * Validates Jira configuration
 * @param config - Jira configuration to validate
 * @throws Error if configuration is invalid
 */
export function validateJiraConfig(config: JiraConfig): void {
  if (!config.baseUrl) {
    throw new Error('JIRA_URL environment variable is required');
  }
  
  if (!config.username) {
    throw new Error('JIRA_USERNAME environment variable is required');
  }
  
  if (!config.token) {
    throw new Error('JIRA_API_TOKEN environment variable is required');
  }
  
  // Validate URL format
  try {
    const url = new URL(config.baseUrl);
    if (!url.protocol.startsWith('http')) {
      throw new Error('Invalid JIRA_URL: must be a valid HTTP/HTTPS URL');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('JIRA_URL')) {
      throw error;
    }
    throw new Error('Invalid JIRA_URL: must be a valid HTTP/HTTPS URL');
  }
}

/**
 * Parses Jira input to extract ticket key and optional base URL
 * Supports both ticket IDs (PROJ-123) and full URLs
 * @param input - Ticket ID or full Jira URL
 * @returns Parsed ticket key and optional base URL
 * @throws Error if input format is invalid
 */
export function parseJiraInput(input: string): JiraInputParsed {
  if (!input.trim()) {
    throw new Error('Jira ticket input is required');
  }
  
  const trimmedInput = input.trim();
  
  // Check if input is a URL
  if (trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://')) {
    try {
      const url = new URL(trimmedInput);
      
      // Extract ticket key from URL path
      // Expected format: /browse/TICKET-123 or /browse/TICKET-123/...
      const pathMatch = url.pathname.match(/\/browse\/([A-Z]+-\d+)/);
      if (!pathMatch || !pathMatch[1]) {
        throw new Error('Invalid Jira URL format: expected /browse/TICKET-123');
      }
      
      const ticketKey = pathMatch[1];
      const baseUrl = `${url.protocol}//${url.host}`;
      
      return { ticketKey, baseUrl };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Invalid Jira URL')) {
        throw error;
      }
      throw new Error('Invalid Jira URL format: must be a valid URL');
    }
  } else {
    // Assume input is a ticket key - validate format
    const ticketKeyPattern = /^[A-Z]+-\d+$/;
    if (!ticketKeyPattern.test(trimmedInput)) {
      throw new Error('Invalid ticket key format: expected format like PROJ-123');
    }
    
    return { ticketKey: trimmedInput };
  }
}

/**
 * Creates Basic authentication header for Jira API
 * @param username - Jira username
 * @param token - Jira API token
 * @returns Base64 encoded Basic auth header value
 */
function createAuthHeader(username: string, token: string): string {
  const credentials = `${username}:${token}`;
  return Buffer.from(credentials).toString('base64');
}

/**
 * Fetches ticket information from Jira API
 * @param ticketKey - Jira ticket key (e.g., PROJ-123)
 * @param config - Jira configuration
 * @returns Promise resolving to ticket information
 * @throws Error if API request fails or ticket not found
 */
export async function fetchJiraTicket(ticketKey: string, config: JiraConfig): Promise<JiraTicket> {
  // Validate configuration first
  validateJiraConfig(config);
  
  // Construct API URL
  const apiUrl = `${config.baseUrl}/rest/api/2/issue/${ticketKey}?fields=key,summary,description`;
  
  // Prepare authentication
  const authHeader = createAuthHeader(config.username, config.token);
  
  try {
    // Make API request using Node.js built-in fetch
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    // Handle non-2xx responses
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Authentication failed: please check your Jira username and token');
      } else if (response.status === 403) {
        throw new Error('Access denied: insufficient permissions to view this ticket');
      } else if (response.status === 404) {
        throw new Error(`Ticket not found: ${ticketKey} does not exist or is not accessible`);
      } else {
        const statusText = response.statusText || 'Unknown error';
        throw new Error(`Jira API error (${response.status}): ${statusText}`);
      }
    }
    
    // Parse JSON response
    let responseData: any;
    try {
      responseData = await response.json();
    } catch (parseError) {
      throw new Error('Invalid response from Jira API: unable to parse JSON');
    }
    
    // Validate response structure
    if (!responseData || typeof responseData !== 'object') {
      throw new Error('Invalid response from Jira API: expected object response');
    }
    
    if (!responseData.key) {
      throw new Error('Invalid response from Jira API: missing ticket key');
    }
    
    if (!responseData.fields) {
      throw new Error('Invalid response from Jira API: missing fields object');
    }
    
    // Extract fields with fallbacks
    const summary = responseData.fields.summary || '';
    const description = responseData.fields.description || '';
    
    return {
      key: responseData.key,
      summary,
      description
    };
    
  } catch (error) {
    // Re-throw known errors
    if (error instanceof Error && (
      error.message.includes('Authentication failed') ||
      error.message.includes('Access denied') ||
      error.message.includes('Ticket not found') ||
      error.message.includes('Jira API error') ||
      error.message.includes('Invalid response')
    )) {
      throw error;
    }
    
    // Handle network errors
    if (error instanceof Error && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('connection') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNREFUSED')
    )) {
      throw new Error(`Network error connecting to Jira: ${error.message}`);
    }
    
    // Handle unknown errors
    throw new Error(`Unexpected error fetching Jira ticket: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parses environment variables from a .env file content
 * @param content - Content of the .env file
 * @returns Object with parsed environment variables
 */
function parseEnvFile(content: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  const lines = content.split('\n');
  
  for (const line of lines) {
    // Skip empty lines and comments
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }
    
    // Parse KEY=VALUE format
    const equalIndex = trimmedLine.indexOf('=');
    if (equalIndex === -1) {
      continue;
    }
    
    const key = trimmedLine.substring(0, equalIndex).trim();
    let value = trimmedLine.substring(equalIndex + 1).trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    if (key) {
      envVars[key] = value;
    }
  }
  
  return envVars;
}

/**
 * Loads environment variables from .env file in current working directory
 * @returns Object with parsed environment variables, empty object if file doesn't exist or cannot be read
 */
function loadEnvFromWorkingDirectory(): Record<string, string> {
  try {
    // Look for .env file in current working directory
    const envPath = join(process.cwd(), '.env');
    
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, 'utf-8');
      return parseEnvFile(content);
    }
  } catch (error) {
    // Handle specific expected errors gracefully
    if (error instanceof Error) {
      const errorCode = (error as any).code;
      
      // Handle expected file system errors that should not crash the application
      if (errorCode === 'ENOENT' || errorCode === 'EACCES' || errorCode === 'EPERM') {
        // File doesn't exist, permission denied, or operation not permitted
        // These are acceptable failures - return empty config and let validation handle it
        return {};
      }
    }
    
    // For any other errors, return empty config and let validation handle missing values
    // This maintains backward compatibility while keeping error handling simple
    return {};
  }
  
  return {};
}

/**
 * Loads Jira configuration from environment variables
 * Checks both system environment and .env file in current working directory
 * System environment variables take precedence over .env file values
 * @returns Jira configuration object
 * @throws Error if required environment variables are missing
 */
export function loadJiraConfigFromEnv(): JiraConfig {
  // Load from .env file in current working directory
  const envFromFile = loadEnvFromWorkingDirectory();
  
  // Merge with process.env, giving precedence to process.env
  const config = {
    baseUrl: process.env.JIRA_URL || envFromFile.JIRA_URL || '',
    username: process.env.JIRA_USERNAME || envFromFile.JIRA_USERNAME || '',
    token: process.env.JIRA_API_TOKEN || envFromFile.JIRA_API_TOKEN || ''
  };
  
  // Validation will be done when config is used
  return config;
}