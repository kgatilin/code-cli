import { GoogleGenAI, mcpToTool } from '@google/genai';
import type { CallableTool, GenerationConfig } from '@google/genai';
import type { 
  OpenAIRequest, 
  OpenAIResponse, 
  OpenAIStreamChunk, 
  OpenAIMessage, 
  OpenAIContentPart,
  AgentConfig 
} from '../types.js';
import { logDebug, logInfo, logError, logWarning } from './logger.js';
import { MCPClientManager } from './mcp-client-manager.js';
import { loadMCPConfig } from './mcp-config.js';

/**
 * Agent orchestrator for LLM interactions using Google Vertex AI
 * Handles OpenAI to Google AI format conversion and response processing
 */
export class AgentOrchestrator {
  private genai: GoogleGenAI;
  private model: string;
  private mcpClientManager?: MCPClientManager;
  private mcpInitializationPromise?: Promise<void>;

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

    // Initialize MCP client manager asynchronously
    this.mcpInitializationPromise = this.initializeMCPClients();
  }

  /**
   * Initialize MCP clients asynchronously
   */
  private async initializeMCPClients(): Promise<void> {
    try {
      logDebug('Orchestrator', 'Loading MCP configuration');
      const mcpConfig = await loadMCPConfig();
      
      if (Object.keys(mcpConfig.mcpServers).length === 0) {
        logDebug('Orchestrator', 'No MCP servers configured, skipping MCP initialization');
        return;
      }

      logInfo('Orchestrator', 'Initializing MCP client manager', {
        serverCount: Object.keys(mcpConfig.mcpServers).length
      });

      this.mcpClientManager = new MCPClientManager();
      const connectedClients = await this.mcpClientManager.createClients(mcpConfig);
      
      logInfo('Orchestrator', 'MCP client manager initialized', {
        totalServers: Object.keys(mcpConfig.mcpServers).length,
        connectedClients: connectedClients.length
      });
    } catch (error) {
      logWarning('Orchestrator', 'Failed to initialize MCP clients', {
        error: error instanceof Error ? error.message : String(error)
      });
      // Continue without MCP support
    }
  }

  /**
   * Build MCP tools from connected clients
   */
  private async buildMCPTools(): Promise<CallableTool[]> {
    try {
      // Wait for MCP initialization to complete
      if (this.mcpInitializationPromise) {
        await this.mcpInitializationPromise;
      }

      const clients = this.mcpClientManager?.getClients() || [];
      if (clients.length === 0) {
        return [];
      }

      logDebug('Orchestrator', 'Building MCP tools', { clientCount: clients.length });
      
      // FIX: Pass all clients at once to mcpToTool
      const tool = mcpToTool(...clients, {});
      
      // mcpToTool always returns a single CallableTool, wrap in array
      const tools = [tool];
      
      logDebug('Orchestrator', 'Built MCP tools successfully', { toolCount: tools.length });
      return tools;
    } catch (error) {
      logWarning('Orchestrator', 'Error building MCP tools', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
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

      // Build MCP tools if available
      const tools = await this.buildMCPTools();
      
      // Generate response using Google AI
      const config = {
        systemInstruction: systemInstructions,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.max_tokens ?? 4096,
        topK: 40,
        topP: 0.95,
      } as GenerationConfig & { systemInstruction?: string; tools?: CallableTool[] };

      // Add tools if available
      if (tools.length > 0) {
        config.tools = tools;
        logDebug('Orchestrator', 'Including MCP tools in request', { toolCount: tools.length });
      }

      const response = await this.genai.models.generateContent({
        model: this.model,
        contents,
        config,
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

      // Build MCP tools if available
      const tools = await this.buildMCPTools();
      
      // Generate streaming response using Google AI
      const config = {
        systemInstruction: systemInstructions,
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.max_tokens ?? 4096,
        topK: 40,
        topP: 0.95,
      } as GenerationConfig & { systemInstruction?: string; tools?: CallableTool[] };

      // Add tools if available
      if (tools.length > 0) {
        config.tools = tools;
        logDebug('Orchestrator', 'Including MCP tools in streaming request', { toolCount: tools.length });
      }

      const stream = await this.genai.models.generateContentStream({
        model: this.model,
        contents,
        config,
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

  /**
   * Shutdown the orchestrator and clean up MCP resources
   */
  async shutdown(): Promise<void> {
    try {
      if (this.mcpClientManager && !this.mcpClientManager.isManagerShutdown()) {
        logInfo('Orchestrator', 'Shutting down MCP client manager');
        await this.mcpClientManager.shutdown();
      }
    } catch (error) {
      logError('Orchestrator', 'Error during shutdown', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}