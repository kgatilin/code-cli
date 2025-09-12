/**
 * Prompt directive detection and message scanning
 * 
 * Provides functions to detect {{prompt:...}} directives in messages,
 * scan conversations for the latest directive, and clean user messages.
 */

import type { OpenAIMessage, PromptDirective } from '../types.js';

/**
 * Detects a prompt directive at the start of a message
 * @param message - The message content to check
 * @returns PromptDirective if found, null otherwise
 */
export function detectPromptDirective(message: string): PromptDirective | null {
  // Match directive at start of message: {{prompt:reference}} with optional whitespace after
  const regex = /^{{\s*prompt\s*:\s*([^}]+?)\s*}}\s*/;
  const match = message.match(regex);
  
  if (!match) {
    return null;
  }
  
  const reference = match[1]?.trim();
  
  // Reject empty references
  if (!reference) {
    return null;
  }
  
  // Remove the directive from the message
  const cleanedMessage = message.replace(regex, '');
  
  return {
    reference,
    cleanedMessage,
    messageIndex: 0 // Will be set correctly by findLatestDirective
  };
}

/**
 * Scans all messages to find the latest prompt directive
 * Only looks at user messages, ignoring system and assistant messages
 * @param messages - Array of conversation messages
 * @returns Latest directive found, or null if none found
 */
export function findLatestDirective(messages: OpenAIMessage[]): PromptDirective | null {
  // Scan messages in reverse order to find the latest directive
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    
    // Only check user messages
    if (!message || message.role !== 'user') {
      continue;
    }
    
    // Extract text content from message (handles both string and multimodal content)
    let textContent: string;
    
    if (typeof message.content === 'string') {
      textContent = message.content;
    } else if (Array.isArray(message.content)) {
      // Find first text part in multimodal content
      const textPart = message.content.find(part => part.type === 'text');
      if (!textPart?.text) {
        continue;
      }
      textContent = textPart.text;
    } else {
      continue;
    }
    
    // Check for directive in this message
    const directive = detectPromptDirective(textContent);
    if (directive) {
      // Update the message index to the actual position
      directive.messageIndex = i;
      return directive;
    }
  }
  
  return null;
}

/**
 * Removes the directive from a user message, preserving remaining content
 * @param message - Original message content
 * @param directive - The directive that was detected
 * @returns Cleaned message content
 */
export function cleanUserMessage(message: string, directive: PromptDirective): string {
  return directive.cleanedMessage;
}