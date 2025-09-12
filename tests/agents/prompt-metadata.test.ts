import { describe, it, expect } from 'vitest';

// Import the functions we're testing (will implement after tests)
import { 
  parsePromptMetadata,
  stripFrontmatter 
} from '../../src/agents/prompt-metadata.js';

describe('agents/prompt-metadata', () => {
  describe('parsePromptMetadata', () => {
    it('parses valid YAML frontmatter', () => {
      const content = `---
model: claude-3-opus
tools: [web_search, code_interpreter]
temperature: 0.7
maxTokens: 4000
topP: 0.9
---

Prompt content here`;

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({
        model: 'claude-3-opus',
        tools: ['web_search', 'code_interpreter'],
        temperature: 0.7,
        maxTokens: 4000,
        topP: 0.9
      });
      expect(result.content).toBe('Prompt content here');
    });

    it('handles partial metadata', () => {
      const content = `---
model: gemini-2.0-flash-exp
temperature: 0.5
---

Just model and temperature specified`;

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({
        model: 'gemini-2.0-flash-exp',
        temperature: 0.5
      });
      expect(result.content).toBe('Just model and temperature specified');
    });

    it('handles empty frontmatter', () => {
      const content = `---
---

Content with empty frontmatter`;

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({});
      expect(result.content).toBe('Content with empty frontmatter');
    });

    it('handles content without frontmatter', () => {
      const content = 'Just plain prompt content without any metadata';

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({});
      expect(result.content).toBe('Just plain prompt content without any metadata');
    });

    it('handles malformed YAML gracefully', () => {
      const content = `---
model: claude-3-opus
invalid-yaml: [unclosed array
temperature: 0.7
---

Content after malformed YAML`;

      const result = parsePromptMetadata(content);
      
      // Should return empty metadata for malformed YAML but preserve content
      expect(result.metadata).toEqual({});
      expect(result.content).toBe('Content after malformed YAML');
    });

    it('handles frontmatter with extra metadata fields', () => {
      const content = `---
model: claude-3-opus
temperature: 0.8
customField: customValue
nestedField:
  subField: value
---

Content with custom metadata`;

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({
        model: 'claude-3-opus',
        temperature: 0.8,
        customField: 'customValue',
        nestedField: {
          subField: 'value'
        }
      });
      expect(result.content).toBe('Content with custom metadata');
    });

    it('handles frontmatter with different number formats', () => {
      const content = `---
temperature: 0.7
maxTokens: 4000
topP: 1.0
topK: 40
---

Numeric format variations`;

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({
        temperature: 0.7,
        maxTokens: 4000,
        topP: 1.0,
        topK: 40
      });
    });

    it('preserves whitespace in content after frontmatter', () => {
      const content = `---
model: claude-3-opus
---

  Indented content
    More indented
Regular content`;

      const result = parsePromptMetadata(content);
      
      expect(result.content).toBe(`  Indented content
    More indented
Regular content`);
    });

    it('handles frontmatter without closing delimiter', () => {
      const content = `---
model: claude-3-opus
temperature: 0.7

Content without proper frontmatter closing`;

      const result = parsePromptMetadata(content);
      
      // Should treat as content without frontmatter
      expect(result.metadata).toEqual({});
      expect(result.content).toBe(content);
    });

    it('handles multiple frontmatter sections (only first one)', () => {
      const content = `---
model: claude-3-opus
---

Some content

---
model: gemini-2.0-flash-exp
---

More content`;

      const result = parsePromptMetadata(content);
      
      expect(result.metadata).toEqual({
        model: 'claude-3-opus'
      });
      expect(result.content).toBe(`Some content

---
model: gemini-2.0-flash-exp
---

More content`);
    });
  });

  describe('stripFrontmatter', () => {
    it('removes frontmatter section', () => {
      const content = `---
model: claude-3-opus
temperature: 0.7
---

Prompt content remains`;

      const result = stripFrontmatter(content);
      
      expect(result).toBe('Prompt content remains');
    });

    it('returns original content when no frontmatter present', () => {
      const content = 'Just regular content';

      const result = stripFrontmatter(content);
      
      expect(result).toBe('Just regular content');
    });

    it('handles empty frontmatter', () => {
      const content = `---
---

Content after empty frontmatter`;

      const result = stripFrontmatter(content);
      
      expect(result).toBe('Content after empty frontmatter');
    });

    it('preserves content structure after stripping', () => {
      const content = `---
model: claude-3-opus
---

Line 1
  Indented line 2
Line 3

New paragraph`;

      const result = stripFrontmatter(content);
      
      expect(result).toBe(`Line 1
  Indented line 2
Line 3

New paragraph`);
    });

    it('handles malformed frontmatter by preserving original', () => {
      const content = `---
malformed yaml: [
temperature: 0.7

Content after malformed frontmatter`;

      const result = stripFrontmatter(content);
      
      // Should return original content for malformed frontmatter
      expect(result).toBe(content);
    });
  });
});