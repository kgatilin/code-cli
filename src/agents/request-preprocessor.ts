/**
 * Request preprocessing for dynamic prompt composition
 * 
 * Scans messages for prompt directives, expands prompts, and combines
 * base system prompts with dynamic prompts.
 */

import type { 
  OpenAIRequest, 
  ProcessedRequest, 
  AgentConfig,
  PromptDirective,
  OpenAIMessage,
  OpenAIContentPart
} from '../types.js';
import { findLatestDirective, cleanUserMessage } from './prompt-directive.js';
import { loadBaseSystemPrompt } from './config.js';
import { resolvePromptReference } from './prompt-resolver.js';

/**
 * Preprocesses an OpenAI request by scanning for prompt directives,
 * expanding dynamic prompts, and combining with base system prompt.
 * 
 * @param request - The incoming OpenAI request
 * @param agentConfig - Unified agent configuration with prompt paths
 * @returns Processed request with expanded prompts and metadata
 */
export function preprocessRequest(
  request: OpenAIRequest,
  agentConfig: AgentConfig
): ProcessedRequest {
  // Always load base system prompt (required)
  const baseSystemPrompt = loadBaseSystemPrompt(agentConfig);
  
  // Scan all messages for the latest prompt directive
  const directive = findLatestDirective(request.messages);
  
  // If no directive found, return with base system prompt only
  if (!directive) {
    return {
      request,
      systemPrompt: baseSystemPrompt
    };
  }
  
  // Expand the dynamic prompt and extract metadata
  const resolvedPrompt = resolvePromptReference(directive.reference, agentConfig.PROMPTS_BASE_PATH!);
  
  // Clean the message that contains the directive
  const cleanedMessages = cleanMessagesWithDirective(request.messages, directive);
  
  // Create modified request with cleaned messages
  const modifiedRequest: OpenAIRequest = {
    ...request,
    messages: cleanedMessages
  };
  
  // Combine base and dynamic system prompts
  const combinedSystemPrompt = combineSystemPrompts(baseSystemPrompt, resolvedPrompt.content);
  
  return {
    request: modifiedRequest,
    promptMetadata: resolvedPrompt.metadata,
    systemPrompt: combinedSystemPrompt
  };
}

/**
 * Cleans messages by removing the directive from the message that contains it.
 * 
 * @param messages - Array of messages to clean
 * @param directive - The directive information including message index
 * @returns Array of cleaned messages
 */
function cleanMessagesWithDirective(
  messages: OpenAIMessage[],
  directive: PromptDirective
): OpenAIMessage[] {
  return messages.map((message, index) => {
    if (index !== directive.messageIndex) {
      return message;
    }
    
    // Handle multimodal content
    if (Array.isArray(message.content)) {
      return {
        ...message,
        content: message.content.map((part: OpenAIContentPart) => {
          if (part.type === 'text' && part.text) {
            return {
              ...part,
              text: cleanUserMessage(part.text, directive)
            };
          }
          return part;
        })
      };
    }
    
    // Handle simple string content
    if (typeof message.content === 'string') {
      return {
        ...message,
        content: cleanUserMessage(message.content, directive)
      };
    }
    
    return message;
  });
}

/**
 * Combines base system prompt with dynamic prompt content.
 * 
 * @param basePrompt - The base system prompt (always included)
 * @param dynamicPrompt - The dynamic prompt content from directive
 * @returns Combined system prompt
 */
function combineSystemPrompts(basePrompt: string, dynamicPrompt: string): string {
  // If base prompt is empty, use only dynamic prompt
  if (!basePrompt.trim()) {
    return dynamicPrompt;
  }
  
  // If dynamic prompt is empty, use only base prompt
  if (!dynamicPrompt.trim()) {
    return basePrompt;
  }
  
  // Combine both prompts with double newline separator
  return `${basePrompt}\n\n${dynamicPrompt}`;
}