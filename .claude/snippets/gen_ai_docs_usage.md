## Google Gen AI Documentation Guide

**Location:** `./docs/js-gen-ai/` - TypeDoc-generated API documentation for @google/genai library

### When to Reference:
- Implementing Google Gemini/Gen AI features
- Working with Vertex AI models
- Setting up chat sessions, file uploads, or streaming responses
- Configuring model parameters or safety settings

### Key Modules:
- `client/` - GoogleGenAI client initialization and options
- `chats/` - Chat session management and conversation flow
- `models/` - Model listing and configuration
- `types/` - All TypeScript interfaces (Content, GenerateConfig, SafetySettings, etc.)
- `live/` - Real-time streaming sessions
- `files/` - File upload and management
- `caches/` - Content caching for repeated prompts

### How to Search:
1. For types/interfaces: Check `./docs/js-gen-ai/interfaces/types.*.html`
2. For main client: See `./docs/js-gen-ai/classes/client.GoogleGenAI.html`
3. For chat operations: Browse `./docs/js-gen-ai/classes/chats.Chat.html`
4. For error handling: Reference `./docs/js-gen-ai/modules/errors.html`

### Common Patterns:
- Initialize client with `GoogleGenAI` class from client module
- Reference `types` module for request/response interfaces
- Check `errors` module for proper error handling