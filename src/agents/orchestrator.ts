import { GoogleGenAI, mcpToTool } from '@google/genai';
import type { CallableTool, GenerationConfig, FunctionCall } from '@google/genai';
import type { 
  OpenAIRequest, 
  OpenAIResponse, 
  OpenAIStreamChunk, 
  OpenAIMessage, 
  OpenAIContentPart,
  AgentConfig,
  ProcessedRequest 
} from '../types.js';
import { logDebug, logInfo, logError, logWarning } from './logger.js';
import { MCPClientManager } from './mcp-client-manager.js';
import { loadMCPConfig } from './mcp-config.js';
import { FilesystemHelper } from './filesystem-helper.js';
import { preprocessRequest } from './request-preprocessor.js';

/**
 * Agent orchestrator for LLM interactions using Google Vertex AI
 * Handles OpenAI to Google AI format conversion and response processing
 */
export class AgentOrchestrator {
  private genai: GoogleGenAI;
  private model: string;
  private mcpClientManager?: MCPClientManager;
  private mcpInitializationPromise?: Promise<void>;
  private filesystemHelper: FilesystemHelper;
  private requestCounter: number = 0;
  private promptConfig: AgentConfig | undefined;

  constructor(private config: AgentConfig) {
    // Initialize Google Generative AI client
    this.genai = new GoogleGenAI({
      vertexai: true,
      project: config.VERTEX_AI_PROJECT,
      location: config.VERTEX_AI_LOCATION,
    });
    this.model = config.VERTEX_AI_MODEL;
    
    // Initialize filesystem helper for enhanced error messaging
    this.filesystemHelper = new FilesystemHelper();
    
    // Check if prompt configuration is available in the unified config
    if (config.PROMPTS_BASE_PATH && config.SYSTEM_PROMPT_PATH) {
      this.promptConfig = config;
      logInfo('Orchestrator', 'Prompt configuration available', {
        basePath: config.PROMPTS_BASE_PATH,
        systemPromptPath: config.SYSTEM_PROMPT_PATH
      });
    } else {
      logDebug('Orchestrator', 'No prompt configuration available, dynamic prompts disabled');
      this.promptConfig = undefined;
    }
    
    logInfo('Orchestrator', 'Initialized with Google AI client', {
      project: config.VERTEX_AI_PROJECT,
      location: config.VERTEX_AI_LOCATION,
      model: config.VERTEX_AI_MODEL,
      promptsEnabled: !!this.promptConfig
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
   * Wraps CallableTool with logging, timeout detection, and enhanced error messaging
   */
  private wrapToolForLogging = (tool: CallableTool): CallableTool => {
    return {
      async tool() {
        const toolDef = await tool.tool();
        logDebug('MCP Tool', 'Tool definition requested', { tool: toolDef });
        return toolDef;
      },
      callTool: async (functionCalls: FunctionCall[]) => {
        const startTime = Date.now();
        const timeoutMs = 30000; // 30 second timeout
        
        logDebug('MCP Tool', 'Tool call initiated', { calls: functionCalls });
        
        try {
          // Race between tool call and timeout
          const result = await Promise.race([
            tool.callTool(functionCalls),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('Tool call timeout')), timeoutMs)
            )
          ]);
          
          const duration = Date.now() - startTime;
          logDebug('MCP Tool', 'Tool call completed', { result, duration });
          
          // Log if call took longer than expected but didn't timeout
          if (duration > timeoutMs * 0.8) {
            logWarning('MCP Tool', 'Tool call slow performance detected', {
              duration,
              threshold: timeoutMs * 0.8,
              toolName: this.extractToolName(functionCalls)
            });
          }
          
          return result;
        } catch (error) {
          const duration = Date.now() - startTime;
          
          // Enhanced error context generation
          const enhancedContext = this.generateEnhancedErrorContext(error, functionCalls, duration, timeoutMs);
          
          // Log timeout separately
          if (error instanceof Error && error.message === 'Tool call timeout') {
            logWarning('MCP Tool', 'Tool call exceeded timeout, continuing without result', {
              toolName: this.extractToolName(functionCalls),
              timeoutDuration: timeoutMs,
              actualDuration: duration
            });
            
            // For timeout, we could return empty result or rethrow based on strategy
            throw error;
          }
          
          logError('MCP Tool', 'Tool call failed', { 
            error, 
            calls: functionCalls,
            duration,
            enhancedContext
          });
          throw error;
        }
      }
    };
  };

  /**
   * Extract tool name from function calls for logging
   */
  private extractToolName(functionCalls: FunctionCall[]): string {
    const firstCall = functionCalls[0] as { name?: string } | undefined;
    if (firstCall?.name) {
      return firstCall.name;
    }
    return 'unknown_tool';
  }

  /**
   * Generate enhanced error context for better debugging
   */
  private generateEnhancedErrorContext(
    error: unknown, 
    functionCalls: FunctionCall[], 
    duration: number, 
    timeoutMs: number
  ): Record<string, unknown> {
    const context: Record<string, unknown> = {
      duration,
      timeoutThreshold: timeoutMs
    };
    
    const toolName = this.extractToolName(functionCalls);
    context.toolName = toolName;
    
    if (error instanceof Error) {
      // Detect filesystem tool errors
      if (toolName.includes('filesystem') || toolName.includes('file') || toolName.includes('directory')) {
        context.toolType = 'filesystem';
        
        // Extract path from function calls for filesystem error context
        const primaryPath = this.extractPathFromArgs(functionCalls);
        if (primaryPath) {
          // Generate path error context (assuming common base paths)
          const basePath = process.cwd(); // Default to current working directory
          const allowedDirs = [basePath]; // In real scenarios, this would come from MCP config
          context.pathErrorContext = this.filesystemHelper.getPathErrorContext(primaryPath, basePath, allowedDirs);
        }
      }
      
      // Detect edit_file specific errors
      if (toolName === 'edit_file' && error.message.toLowerCase().includes('text not found')) {
        context.suggestion = 'Ensure exact text match including whitespace and line endings. Consider reading the file first to verify content.';
      }
      
      // Timeout-specific context
      if (duration >= timeoutMs * 0.9) {
        context.timeoutRelated = true;
        context.suggestion = 'Tool call may be hanging or processing large amounts of data. Consider breaking down the operation.';
      }
    }
    
    return context;
  }

  /**
   * Extract path argument from function calls
   */
  private extractPathFromArgs(functionCalls: FunctionCall[]): string | null {
    if (functionCalls.length === 0) return null;
    
    const firstCall = functionCalls[0] as { arguments?: Record<string, unknown>; args?: Record<string, unknown> } | undefined;
    const args = firstCall?.arguments || firstCall?.args || {};
    
    return this.filesystemHelper.extractPrimaryPath(args);
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
      
      // Wrap tool with logging for diagnostic purposes
      const wrappedTool = this.wrapToolForLogging(tool);
      
      // mcpToTool always returns a single CallableTool, wrap in array
      const tools = [wrappedTool];
      
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
    // Generate unique request ID for tracing
    const requestId = `req-${Date.now()}-${++this.requestCounter}`;
    
    logDebug('Orchestrator', 'Starting request', {
      requestId,
      messageCount: request.messages?.length || 0,
      hasTools: false // Will be updated when tools are built
    });

    try {
      // Preprocess request for dynamic prompt composition if enabled
      let processedRequest: ProcessedRequest;
      if (this.promptConfig) {
        try {
          processedRequest = preprocessRequest(request, this.promptConfig);
          logDebug('Orchestrator', 'Request preprocessed with prompt integration', {
            requestId,
            hasPromptMetadata: !!processedRequest.promptMetadata,
            systemPromptLength: processedRequest.systemPrompt.length
          });
        } catch (error) {
          logWarning('Orchestrator', 'Prompt preprocessing failed, using original request', {
            requestId,
            error: error instanceof Error ? error.message : String(error)
          });
          // Fallback to original request processing
          processedRequest = {
            request,
            systemPrompt: this.buildSystemInstructions(request)
          };
        }
      } else {
        // No prompt config available, use original request processing
        processedRequest = {
          request,
          systemPrompt: this.buildSystemInstructions(request)
        };
      }

      // Convert OpenAI messages to Google AI format using processed request
      const contents = this.buildContents(processedRequest.request.messages);
      const systemInstructions = processedRequest.systemPrompt;

      logDebug('Orchestrator', 'Converted messages to Google AI format', {
        requestId,
        contents: contents,
        systemInstructions: systemInstructions
      });

      // Build MCP tools if available
      const tools = await this.buildMCPTools();
      
      // Update hasTools flag for logging
      logDebug('Orchestrator', 'Starting request', {
        requestId,
        messageCount: processedRequest.request.messages?.length || 0,
        hasTools: tools.length > 0
      });
      
      // Generate response using Google AI with metadata-enhanced config
      const config = this.buildGenerationConfig(processedRequest, request);

      // Add tools if available
      if (tools.length > 0) {
        config.tools = tools;
        logDebug('Orchestrator', 'Including MCP tools in request', { 
          requestId,
          toolCount: tools.length 
        });
      }

      const response = await this.genai.models.generateContent({
        model: this.model,
        contents,
        config,
      });

      logDebug('Orchestrator', 'Request completed', { requestId, response });

      // Convert response back to OpenAI format
      const openAIResponse = this.formatResponse(response, request);
      
      logInfo('Orchestrator', 'Non-streaming request completed', {
        requestId,
        responseId: openAIResponse.id,
        contentLength: openAIResponse.choices[0]?.message?.content?.length || 0
      });

      return openAIResponse;
    } catch (error) {
      logError('Orchestrator', 'Request failed', { 
        requestId,
        error,
        request: { 
          messages: request.messages, 
          tools: (await this.buildMCPTools()).length 
        }
      });
      throw error;
    }
  }

  /**
   * Build generation configuration with metadata from processed request
   */
  private buildGenerationConfig(processedRequest: ProcessedRequest, originalRequest: OpenAIRequest): GenerationConfig & { systemInstruction?: string; tools?: CallableTool[] } {
    const config = {
      systemInstruction: processedRequest.systemPrompt,
      // Apply metadata from prompts, with original request taking precedence
      temperature: originalRequest.temperature ?? processedRequest.promptMetadata?.temperature ?? 0.7,
      maxOutputTokens: originalRequest.max_tokens ?? processedRequest.promptMetadata?.maxTokens ?? 4096,
      topK: processedRequest.promptMetadata?.topK ?? 40,
      topP: processedRequest.promptMetadata?.topP ?? 0.95,
    } as GenerationConfig & { systemInstruction?: string; tools?: CallableTool[] };

    logDebug('Orchestrator', 'Built generation config with metadata', {
      hasMetadata: !!processedRequest.promptMetadata,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      topK: config.topK,
      topP: config.topP,
      systemPromptLength: processedRequest.systemPrompt.length
    });

    return config;
  }

  /**
   * Process OpenAI streaming request and return streaming chunks
   */
  async* processStreamingRequest(request: OpenAIRequest): AsyncIterable<OpenAIStreamChunk> {
    // Generate unique request ID for tracing
    const requestId = `req-${Date.now()}-${++this.requestCounter}`;
    
    logDebug('Orchestrator', 'Starting request', {
      requestId,
      messageCount: request.messages?.length || 0,
      hasTools: false // Will be updated when tools are built
    });

    try {
      // Preprocess request for dynamic prompt composition if enabled
      let processedRequest: ProcessedRequest;
      if (this.promptConfig) {
        try {
          processedRequest = preprocessRequest(request, this.promptConfig);
          logDebug('Orchestrator', 'Streaming request preprocessed with prompt integration', {
            requestId,
            hasPromptMetadata: !!processedRequest.promptMetadata,
            systemPromptLength: processedRequest.systemPrompt.length
          });
        } catch (error) {
          logWarning('Orchestrator', 'Prompt preprocessing failed for streaming request, using original request', {
            requestId,
            error: error instanceof Error ? error.message : String(error)
          });
          // Fallback to original request processing
          processedRequest = {
            request,
            systemPrompt: this.buildSystemInstructions(request)
          };
        }
      } else {
        // No prompt config available, use original request processing
        processedRequest = {
          request,
          systemPrompt: this.buildSystemInstructions(request)
        };
      }

      // Convert OpenAI messages to Google AI format using processed request
      const contents = this.buildContents(processedRequest.request.messages);
      const systemInstructions = processedRequest.systemPrompt;

      logDebug('Orchestrator', 'Converted messages to Google AI format', {
        requestId,
        contents: contents,
        systemInstructions: systemInstructions
      });

      // Build MCP tools if available
      const tools = await this.buildMCPTools();
      
      // Update hasTools flag for logging
      logDebug('Orchestrator', 'Starting request', {
        requestId,
        messageCount: processedRequest.request.messages?.length || 0,
        hasTools: tools.length > 0
      });
      
      // Generate streaming response using Google AI with metadata-enhanced config
      const config = {
        ...this.buildGenerationConfig(processedRequest, request),
        thinkingConfig: {
          thinkingBudget: 1024,
          includeThoughts: true,
        }
      };

      // Add tools if available
      if (tools.length > 0) {
        config.tools = tools;
        logDebug('Orchestrator', 'Including MCP tools in streaming request', { 
          requestId,
          toolCount: tools.length 
        });
      }

      const stream = await this.genai.models.generateContentStream({
        model: this.model,
        contents,
        config,
      });

      const chatId = `chatcmpl-${Date.now()}`;
      const created = Math.floor(Date.now() / 1000);
      let isFirstChunk = true;
      let isInThoughtMode = false;

      logDebug('Orchestrator', 'Streaming response initiated', { requestId, chatId });

      // Yield streaming chunks in OpenAI format
      for await (const chunk of stream) {
        const candidates = chunk.candidates || [];
        const candidate = candidates[0];
        
        logDebug('Orchestrator', 'Received streaming chunk', { requestId, chunk });
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.text) {
              const isThoughtPart = part.thought === true;
              let contentToYield = '';

              // Handle thought mode transitions
              if (isThoughtPart && !isInThoughtMode) {
                // Entering thought mode
                contentToYield += '<think>\n';
                isInThoughtMode = true;
              } else if (!isThoughtPart && isInThoughtMode) {
                // Exiting thought mode
                contentToYield += '\n</think>';
                isInThoughtMode = false;
              }

              // Add the part text
              contentToYield += part.text;

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
                  delta: { content: contentToYield },
                  finish_reason: null
                }]
              };
            }
          }
        }
      }

      // Close any open thought tags before finishing
      if (isInThoughtMode) {
        yield {
          id: chatId,
          object: 'chat.completion.chunk',
          created,
          model: this.model,
          choices: [{
            index: 0,
            delta: { content: '\n</think>' },
            finish_reason: null
          }]
        };
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

      logInfo('Orchestrator', 'Streaming request completed', { requestId, responseId: chatId });
    } catch (error) {
      logError('Orchestrator', 'Request failed', { 
        requestId,
        error,
        request: { 
          messages: request.messages, 
          tools: (await this.buildMCPTools()).length 
        }
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
  private formatResponse(response: { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> }, request: OpenAIRequest): OpenAIResponse {
    const chatId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    
    // Extract content from Google AI response with thought detection
    const candidates = response.candidates || [];
    const candidate = candidates[0];
    const parts = candidate?.content?.parts || [];
    
    // Process parts with thought detection and wrapping
    let content = '';
    let isInThoughtMode = false;
    
    for (const part of parts) {
      if (part.text) {
        const isThoughtPart = part.thought === true;
        
        // Handle thought mode transitions
        if (isThoughtPart && !isInThoughtMode) {
          // Entering thought mode
          content += '<think>\n';
          isInThoughtMode = true;
        } else if (!isThoughtPart && isInThoughtMode) {
          // Exiting thought mode
          content += '\n</think>';
          isInThoughtMode = false;
        }
        
        // Add the part text
        content += part.text;
      }
    }
    
    // Close any open thought tags
    if (isInThoughtMode) {
      content += '\n</think>';
    }

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