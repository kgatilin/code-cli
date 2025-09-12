import { describe, it, expect } from 'vitest';
import type { OpenAIMessage } from '../../src/types.js';

// Import the functions we're testing (will implement after tests)
import { 
  findLatestDirective, 
  detectPromptDirective, 
  cleanUserMessage 
} from '../../src/agents/prompt-directive.js';

describe('agents/prompt-directive', () => {
  describe('detectPromptDirective', () => {
    it('detects directive at start of message', () => {
      const message = '{{prompt:analyzer}} Please analyze this code';
      const result = detectPromptDirective(message);
      
      expect(result).toEqual({
        reference: 'analyzer',
        cleanedMessage: 'Please analyze this code',
        messageIndex: 0
      });
    });

    it('detects nested prompt reference', () => {
      const message = '{{prompt:agents/researcher}} Find information about React';
      const result = detectPromptDirective(message);
      
      expect(result).toEqual({
        reference: 'agents/researcher',
        cleanedMessage: 'Find information about React',
        messageIndex: 0
      });
    });

    it('handles directive with extra whitespace', () => {
      const message = '{{prompt:code-reviewer}}   Please review this function';
      const result = detectPromptDirective(message);
      
      expect(result).toEqual({
        reference: 'code-reviewer',
        cleanedMessage: 'Please review this function',
        messageIndex: 0
      });
    });

    it('returns null when no directive present', () => {
      const message = 'Just a regular message';
      const result = detectPromptDirective(message);
      
      expect(result).toBeNull();
    });

    it('returns null when directive is not at start', () => {
      const message = 'Please {{prompt:analyzer}} this code';
      const result = detectPromptDirective(message);
      
      expect(result).toBeNull();
    });

    it('handles directive with only prompt reference (no user message)', () => {
      const message = '{{prompt:writer}}';
      const result = detectPromptDirective(message);
      
      expect(result).toEqual({
        reference: 'writer',
        cleanedMessage: '',
        messageIndex: 0
      });
    });

    it('handles malformed directive syntax', () => {
      const message = '{{prompt:incomplete';
      const result = detectPromptDirective(message);
      
      expect(result).toBeNull();
    });

    it('handles empty prompt reference', () => {
      const message = '{{prompt:}} Please help';
      const result = detectPromptDirective(message);
      
      expect(result).toBeNull();
    });
  });

  describe('findLatestDirective', () => {
    it('finds directive in single message', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: '{{prompt:analyzer}} Please analyze this'
        }
      ];

      const result = findLatestDirective(messages);
      
      expect(result).toEqual({
        reference: 'analyzer',
        cleanedMessage: 'Please analyze this',
        messageIndex: 0
      });
    });

    it('finds latest directive across multiple messages', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'user', 
          content: '{{prompt:writer}} Write something'
        },
        {
          role: 'assistant',
          content: 'Here is the writing'
        },
        {
          role: 'user',
          content: '{{prompt:reviewer}} Please review the above'
        }
      ];

      const result = findLatestDirective(messages);
      
      expect(result).toEqual({
        reference: 'reviewer',
        cleanedMessage: 'Please review the above',
        messageIndex: 2
      });
    });

    it('ignores directives in system and assistant messages', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'system',
          content: '{{prompt:system-prompt}} System directive'
        },
        {
          role: 'user',
          content: '{{prompt:user-prompt}} User directive'
        },
        {
          role: 'assistant',
          content: '{{prompt:assistant-prompt}} Assistant directive'
        }
      ];

      const result = findLatestDirective(messages);
      
      expect(result).toEqual({
        reference: 'user-prompt',
        cleanedMessage: 'User directive',
        messageIndex: 1
      });
    });

    it('returns null when no directives found', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: 'Just a regular message'
        },
        {
          role: 'assistant', 
          content: 'A regular response'
        }
      ];

      const result = findLatestDirective(messages);
      
      expect(result).toBeNull();
    });

    it('returns null for empty message array', () => {
      const messages: OpenAIMessage[] = [];
      const result = findLatestDirective(messages);
      
      expect(result).toBeNull();
    });

    it('handles messages with multimodal content', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '{{prompt:image-analyzer}} Analyze this image'
            },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,abc123' }
            }
          ]
        }
      ];

      const result = findLatestDirective(messages);
      
      expect(result).toEqual({
        reference: 'image-analyzer',
        cleanedMessage: 'Analyze this image',
        messageIndex: 0
      });
    });

    it('handles multimodal content without directive', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Regular text without directive'
            }
          ]
        }
      ];

      const result = findLatestDirective(messages);
      
      expect(result).toBeNull();
    });
  });

  describe('cleanUserMessage', () => {
    it('removes directive from start of string message', () => {
      const message = '{{prompt:analyzer}} Please analyze this code';
      const directive = {
        reference: 'analyzer',
        cleanedMessage: 'Please analyze this code',
        messageIndex: 0
      };

      const result = cleanUserMessage(message, directive);
      
      expect(result).toBe('Please analyze this code');
    });

    it('handles message with only directive', () => {
      const message = '{{prompt:writer}}';
      const directive = {
        reference: 'writer',
        cleanedMessage: '',
        messageIndex: 0
      };

      const result = cleanUserMessage(message, directive);
      
      expect(result).toBe('');
    });

    it('preserves whitespace correctly', () => {
      const message = '{{prompt:reviewer}}   Lots of spaces after';
      const directive = {
        reference: 'reviewer', 
        cleanedMessage: '  Lots of spaces after',
        messageIndex: 0
      };

      const result = cleanUserMessage(message, directive);
      
      expect(result).toBe('  Lots of spaces after');
    });
  });
});