import express from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import type { AgentConfig, OpenAIRequest } from '../types.js';
import { logDebug, logInfo, logWarning, logError } from './logger.js';
import { AgentOrchestrator } from './orchestrator.js';
import { ErrorHandler } from './error-handler.js';

export function createServer(config: AgentConfig) {
  const app = express();
  
  logInfo('Server', 'Creating Express server', { port: config.PROXY_PORT, debug: config.DEBUG_MODE });
  
  // Initialize orchestrator
  const orchestrator = new AgentOrchestrator(config);
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Comprehensive request logging when DEBUG is enabled
  app.use((req, res, next) => {
    const startTime = Date.now();
    
    // Log request details - use INFO level when debug mode is enabled so it's always visible
    if (config.DEBUG_MODE) {
      logInfo('Server', `→ ${req.method} ${req.path}`, { 
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        contentType: req.get('Content-Type') || 'none',
        contentLength: req.get('Content-Length') || 'unknown',
        queryParams: Object.keys(req.query).length > 0 ? req.query : undefined,
        headers: config.DEBUG_MODE ? {
          host: req.get('Host'),
          origin: req.get('Origin'),
          referer: req.get('Referer'),
          accept: req.get('Accept'),
          authorization: req.get('Authorization') ? '[REDACTED]' : undefined
        } : undefined,
        body: req.body && Object.keys(req.body).length > 0 ? 
          (typeof req.body === 'object' ? JSON.stringify(req.body).substring(0, 500) : String(req.body).substring(0, 500)) : 
          undefined
      });
    } else {
      // Basic logging for non-debug mode
      logDebug('Server', `${req.method} ${req.path}`, { 
        ip: req.ip, 
        userAgent: req.get('User-Agent') 
      });
    }
    
    // Add response logging
    const originalEnd = res.end;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.end = function(chunk?: any, encoding?: BufferEncoding | (() => void), callback?: () => void) {
      const responseTime = Date.now() - startTime;
      
      // Log response details when DEBUG is enabled
      if (config.DEBUG_MODE) {
        logInfo('Server', `← ${req.method} ${req.path} ${res.statusCode}`, {
          statusCode: res.statusCode,
          responseTime: `${responseTime}ms`,
          contentType: res.get('Content-Type'),
          contentLength: res.get('Content-Length')
        });
      }
      
      // Call original end method
      return originalEnd.call(this, chunk, encoding as BufferEncoding, callback);
    };
    
    next();
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    logDebug('Server', 'Health check requested');
    res.json({
      status: 'healthy',
      version: '1.0.0',
      config: {
        model: config.VERTEX_AI_MODEL,
        project: config.VERTEX_AI_PROJECT,
        location: config.VERTEX_AI_LOCATION
      }
    });
  });
  
  // Chat completions handler (shared between both endpoints)
  const handleChatCompletions = async (req: express.Request, res: express.Response) => {
    logInfo('Server', 'Chat completion request received (AI integration)', {
      stream: req.body?.stream || false
    });
    
    // Basic request validation
    if (!req.body || !req.body.messages || !Array.isArray(req.body.messages)) {
      logWarning('Server', 'Invalid chat completion request format', { body: req.body });
      return res.status(400).json({
        error: 'Invalid request format. Missing required field: messages'
      });
    }

    // Validate messages array is not empty
    if (req.body.messages.length === 0) {
      logWarning('Server', 'Empty messages array in request');
      return res.status(400).json({
        error: 'Invalid request format. Messages array cannot be empty'
      });
    }

    try {
      const openAIRequest: OpenAIRequest = {
        messages: req.body.messages,
        model: req.body.model || config.VERTEX_AI_MODEL,
        max_tokens: req.body.max_tokens,
        temperature: req.body.temperature,
        stream: req.body.stream || false,
        n: req.body.n,
        stop: req.body.stop
      };

      // Check if streaming is requested
      if (openAIRequest.stream) {
        logInfo('Server', 'Processing streaming request');
        
        // Set up Server-Sent Events headers
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Cache-Control'
        });
        
        // Helper function to send SSE data
        const sendChunk = (data: object) => {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        };

        try {
          // Process streaming request through orchestrator
          const streamingResponse = orchestrator.processStreamingRequest(openAIRequest);
          
          for await (const chunk of streamingResponse) {
            sendChunk(chunk);
          }
          
          // Send [DONE] marker
          res.write('data: [DONE]\n\n');
          res.end();
          
          logInfo('Server', 'Streaming response completed successfully');
        } catch (streamError) {
          logError('Server', 'Error in streaming response', { 
            error: streamError instanceof Error ? streamError.message : String(streamError),
            errorCode: ErrorHandler.extractErrorCode(streamError),
            isAuthError: ErrorHandler.isAuthenticationError(streamError)
          });
          
          // Parse the Google AI error and convert to OpenAI streaming error format
          const errorChunk = ErrorHandler.createStreamingErrorChunk(streamError);
          
          // Send the actual error details to the client
          sendChunk(errorChunk);
          res.end();
          
          logInfo('Server', 'Sent error chunk to client', { 
            errorType: errorChunk.error.type,
            errorMessage: errorChunk.error.message 
          });
        }
      } else {
        logInfo('Server', 'Processing non-streaming request');
        
        try {
          // Process non-streaming request through orchestrator
          const response = await orchestrator.processRequest(openAIRequest);
          res.status(200).json(response);
          
          logInfo('Server', 'Non-streaming response completed successfully');
        } catch (processError) {
          logError('Server', 'Error in non-streaming response', { 
            error: processError instanceof Error ? processError.message : String(processError),
            errorCode: ErrorHandler.extractErrorCode(processError),
            isAuthError: ErrorHandler.isAuthenticationError(processError)
          });
          
          // Parse the Google AI error and convert to OpenAI error format
          const openAIError = ErrorHandler.parseGoogleError(processError);
          
          // Determine appropriate HTTP status code based on error type
          const statusCode = getHttpStatusForErrorType(openAIError.error.type);
          
          res.status(statusCode).json(openAIError);
          
          logInfo('Server', 'Sent error response to client', { 
            statusCode,
            errorType: openAIError.error.type,
            errorMessage: openAIError.error.message 
          });
        }
      }
    } catch (error) {
      logError('Server', 'Error processing chat completion request', { 
        error: error instanceof Error ? error.message : String(error),
        errorCode: ErrorHandler.extractErrorCode(error),
        isAuthError: ErrorHandler.isAuthenticationError(error)
      });
      
      // Parse the error and send appropriate response
      const openAIError = ErrorHandler.parseGoogleError(error);
      const statusCode = getHttpStatusForErrorType(openAIError.error.type);
      
      res.status(statusCode).json(openAIError);
      
      logInfo('Server', 'Sent general error response to client', { 
        statusCode,
        errorType: openAIError.error.type,
        errorMessage: openAIError.error.message 
      });
    }
  };

  // OpenAI-compatible chat completions endpoints (both paths supported)
  app.post('/v1/chat/completions', handleChatCompletions);
  app.post('/chat/completions', handleChatCompletions);
  
  // 404 handler
  app.use((req, res) => {
    // Use INFO level in debug mode for better visibility, WARNING otherwise
    if (config.DEBUG_MODE) {
      logInfo('Server', 'Endpoint not found', { method: req.method, path: req.path, fullUrl: req.originalUrl });
    } else {
      logWarning('Server', 'Endpoint not found', { method: req.method, path: req.path });
    }
    res.status(404).json({
      error: `Endpoint not found: ${req.method} ${req.path}`
    });
  });
  
  // Error handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Always log as ERROR, but include more details in debug mode
    logError('Server', 'Internal server error', { 
      error: err.message || 'Unknown error',
      stack: config.DEBUG_MODE ? err.stack : undefined,
      path: req.path,
      method: req.method,
      headers: config.DEBUG_MODE ? req.headers : undefined,
      body: config.DEBUG_MODE && req.body ? JSON.stringify(req.body).substring(0, 500) : undefined
    });
    
    res.status(500).json({
      error: 'Internal server error'
    });
  });
  
  return app;
}

/**
 * Map OpenAI error types to appropriate HTTP status codes
 */
function getHttpStatusForErrorType(errorType: string): number {
  switch (errorType) {
    case 'invalid_request_error':
      return 400; // Bad Request
    case 'authentication_error':
      return 401; // Unauthorized
    case 'permission_error':
      return 403; // Forbidden
    case 'not_found_error':
      return 404; // Not Found
    case 'rate_limit_error':
      return 429; // Too Many Requests
    case 'api_error':
    case 'server_error':
    default:
      return 500; // Internal Server Error
  }
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createHttpServer();
    
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    
    server.listen(port);
  });
}