import { GoogleGenAI } from '@google/genai';
import type { 
  OpenAIRequest, 
  OpenAIResponse, 
  OpenAIStreamChunk, 
  OpenAIMessage, 
  OpenAIContentPart,
  AgentConfig 
} from '../types.js';
import { logDebug, logInfo, logError } from './logger.js';

/**
 * Agent orchestrator for LLM interactions using Google Vertex AI
 * Handles OpenAI to Google AI format conversion and response processing
 */
export class AgentOrchestrator {
  private genai: GoogleGenAI;
  private model: string;

  constructor(private config: AgentConfig) {
    // Initialize Google Generative AI client
    this.genai = new GoogleGenAI({
      vertexai: true,
      project: config.VERTEX_AI_PROJECT,
      location: config.VERTEX_AI_LOCATION,
    });
    this.model = config.VERTEX_AI_MODEL;
    
    logInfo('Orchestrator', 'Initialized with Google AI client', {
      project: config.VERTEX_AI_PROJECT,
      location: config.VERTEX_AI_LOCATION,
      model: config.VERTEX_AI_MODEL
    });
  }

  /**
   * Process OpenAI request and return OpenAI-compatible response
   */
  async processRequest(request: OpenAIRequest): Promise<OpenAIResponse> {
    logDebug('Orchestrator', 'Processing non-streaming request', {
      messageCount: request.messages?.length || 0,
      model: request.model || this.model
    });

    try {
      // Convert OpenAI messages to Google AI format
      const contents = this.buildContents(request.messages);
      const systemInstructions = this.buildSystemInstructions(request);

      logDebug('Orchestrator', 'Converted messages to Google AI format', {
        contents: contents,
        systemInstructions: systemInstructions
      });

      // Generate response using Google AI
      const response = await this.genai.models.generateContent({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemInstructions,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.max_tokens ?? 4096,
          topK: 40,
          topP: 0.95,
        },
      });

      // Convert response back to OpenAI format
      const openAIResponse = this.formatResponse(response, request);
      
      logInfo('Orchestrator', 'Non-streaming request completed', {
        responseId: openAIResponse.id,
        contentLength: openAIResponse.choices[0]?.message?.content?.length || 0
      });

      return openAIResponse;
    } catch (error) {
      logError('Orchestrator', 'Error processing request', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Process OpenAI streaming request and return streaming chunks
   */
  async* processStreamingRequest(request: OpenAIRequest): AsyncIterable<OpenAIStreamChunk> {
    logDebug('Orchestrator', 'Processing streaming request', {
      messageCount: request.messages?.length || 0,
      model: request.model || this.model
    });

    try {
      // Convert OpenAI messages to Google AI format
      const contents = this.buildContents(request.messages);
      const systemInstructions = this.buildSystemInstructions(request);

      logDebug('Orchestrator', 'Converted messages to Google AI format', {
        contents: contents,
        systemInstructions: systemInstructions
      });

      // Generate streaming response using Google AI
      const stream = await this.genai.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: systemInstructions,
          temperature: request.temperature ?? 0.7,
          maxOutputTokens: request.max_tokens ?? 4096,
          topK: 40,
          topP: 0.95,
        },
      });

      const chatId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let isFirstChunk = true;

      // Yield streaming chunks in OpenAI format
      for await (const chunk of stream) {
        const candidates = chunk.candidates || [];
        const candidate = candidates[0];
        
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              // First chunk includes role
              if (isFirstChunk) {
                yield {
                  id: chatId,
                  object: 'chat.completion.chunk',
                  created,
                  model: this.model,
                  choices: [{
                    index: 0,
                    delta: { role: 'assistant' },
                    finish_reason: null
                  }]
                };
                isFirstChunk = false;
              }

              // Content chunk
              yield {
                id: chatId,
                object: 'chat.completion.chunk',
                created,
                model: this.model,
                choices: [{
                  index: 0,
                  delta: { content: part.text },
                  finish_reason: null
                }]
              };
            }
          }
        }
      }

      // Final chunk with finish_reason
      yield {
        id: chatId,
        object: 'chat.completion.chunk',
        created,
        model: this.model,
        choices: [{
          index: 0,
          delta: {},
          finish_reason: 'stop'
        }]
      };

      logInfo('Orchestrator', 'Streaming request completed', { responseId: chatId });
    } catch (error) {
      logError('Orchestrator', 'Error processing streaming request', { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    }
  }

  /**
   * Extract text content from OpenAI message content (handles both string and multi-modal formats)
   */
  private extractTextContent(content: string | OpenAIContentPart[]): string {
    if (typeof content === 'string') {
      // Simple string format
      return content;
    }
    
    // Multi-modal format - extract text from all text parts
    return content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text!)
      .join('');
  }

  /**
   * Convert OpenAI messages to Google AI Content format
   */
  private buildContents(messages: OpenAIMessage[]) {
    logDebug('Orchestrator', 'Building contents from messages', { messageCount: messages.length });
    
    // Filter out system messages - they go in systemInstructions
    const conversationMessages = messages.filter(msg => msg.role !== 'system');
    
    return conversationMessages.map(message => {
      const textContent = this.extractTextContent(message.content);
      return {
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: textContent }]
      };
    });
  }

  /**
   * Build system instructions from OpenAI request
   */
  private buildSystemInstructions(request: OpenAIRequest): string {
    // Extract system messages
    const systemMessages = request.messages.filter(msg => msg.role === 'system');
    
    if (systemMessages.length > 0) {
      const systemInstructions = systemMessages
        .map(msg => this.extractTextContent(msg.content))
        .join('\n\n');
      logDebug('Orchestrator', 'Built system instructions from messages', {
        systemMessageCount: systemMessages.length,
        instructionsLength: systemInstructions.length
      });
      return systemInstructions;
    }

    // Default system instructions
    const defaultInstructions = 'You are a helpful AI assistant. Provide accurate, helpful, and concise responses.';
    logDebug('Orchestrator', 'Using default system instructions');
    return defaultInstructions;
  }

  /**
   * Format Google AI response to OpenAI-compatible format
   */
  private formatResponse(response: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }, request: OpenAIRequest): OpenAIResponse {
    const chatId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    
    // Extract content from Google AI response
    const candidates = response.candidates || [];
    const candidate = candidates[0];
    const parts = candidate?.content?.parts || [];
    const content = parts.map((part) => part.text || '').join('');

    // Estimate token usage (rough approximation)
    const promptTokens = this.estimateTokens(
      request.messages.map(m => this.extractTextContent(m.content)).join(' ')
    );
    const completionTokens = this.estimateTokens(content);

    return {
      id: chatId,
      object: 'chat.completion',
      created,
      model: this.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens
      }
    };
  }

  /**
   * Rough token estimation (approximately 4 characters per token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}