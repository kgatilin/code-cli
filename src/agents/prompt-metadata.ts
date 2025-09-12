/**
 * Prompt metadata parsing and frontmatter handling
 * 
 * Provides functions to extract YAML frontmatter metadata from prompt files
 * and strip frontmatter sections from content.
 */

import { load as yamlLoad } from 'js-yaml';
import type { PromptMetadata } from '../types.js';

/**
 * Result of parsing prompt metadata
 */
export interface ParsedPromptMetadata {
  /** Extracted metadata from frontmatter */
  metadata: PromptMetadata;
  /** Content without frontmatter */
  content: string;
}

/**
 * Parses YAML frontmatter from prompt content
 * @param content - Raw prompt content with optional frontmatter
 * @returns Object with extracted metadata and cleaned content
 */
export function parsePromptMetadata(content: string): ParsedPromptMetadata {
  const frontmatterRegex = /^---\n([\s\S]*?)---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    // No frontmatter found, return empty metadata
    return {
      metadata: {},
      content: content
    };
  }
  
  const [, frontmatter, remainingContent] = match;
  
  // Clean up the remaining content - remove leading empty line
  const cleanedContent = (remainingContent ?? '').replace(/^\n/, '');
  
  try {
    // Handle empty frontmatter
    if ((frontmatter ?? '').trim() === '') {
      return {
        metadata: {},
        content: cleanedContent
      };
    }
    
    // Parse YAML frontmatter
    const metadata = yamlLoad(frontmatter!) as PromptMetadata;
    
    // Ensure metadata is an object
    if (typeof metadata !== 'object' || metadata === null) {
      return {
        metadata: {},
        content: cleanedContent
      };
    }
    
    return {
      metadata,
      content: cleanedContent
    };
  } catch {
    // If YAML parsing fails, return empty metadata but preserve content
    return {
      metadata: {},
      content: cleanedContent
    };
  }
}

/**
 * Strips frontmatter from content, returning only the content portion
 * @param content - Raw content with optional frontmatter
 * @returns Content without frontmatter
 */
export function stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\n([\s\S]*?)---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    // No frontmatter found, return original content
    return content;
  }
  
  const [, frontmatter, remainingContent] = match;
  
  // Clean up the remaining content - remove leading empty line
  const cleanedContent = (remainingContent ?? '').replace(/^\n/, '');
  
  // Handle empty frontmatter - it's valid
  if (frontmatter?.trim() === '') {
    return cleanedContent;
  }
  
  // Validate that frontmatter can be parsed (basic check)
  try {
    yamlLoad(frontmatter!);
    return cleanedContent;
  } catch {
    // If frontmatter is malformed, return original content
    return content;
  }
}