import { describe, expect, it } from 'vitest';
import { sanitizeComment } from '@src/core/utils/sanitizer.js';

describe('Core Utils: Sanitizer', () => {

    it('should return empty string for undefined input', () => {
        expect(sanitizeComment(undefined)).toBe('');
    });

    it('should remove <script> tags and content', () => {
        const input = 'Hello <script>alert("xss")</script> World';
        expect(sanitizeComment(input)).toBe('Hello  World');
    });

    it('should remove self-closing dangerous tags', () => {
        const input = 'Frame: <iframe src="bad"></iframe> Object: <object></object>';
        expect(sanitizeComment(input)).toBe('Frame:  Object:');
    });

    it('should remove onclick events', () => {
        const input = '<a href="#" onclick="steal()">Click me</a>';
        expect(sanitizeComment(input)).toBe('<a href="#">Click me</a>');
    });

    it('should remove javascript: hrefs', () => {
        const input = '<a href="javascript:payload()">Link</a>';
        expect(sanitizeComment(input)).toBe('<a >Link</a>');
    });

    it('should escape comment terminators to prevent breaks', () => {
        const input = 'Some comment with */ termination';
        expect(sanitizeComment(input)).toBe('Some comment with *\\/ termination');
    });

    it('should handle multiline scripts', () => {
        const input = ` 
            Start 
            <script> 
                const x = 1; 
                console.log(x); 
            </script> 
            End 
        `;
        const result = sanitizeComment(input);
        expect(result).toContain('Start');
        expect(result).toContain('End');
        expect(result).not.toContain('console.log');
    });

    it('should trim whitespace', () => {
        expect(sanitizeComment('  hello  ')).toBe('hello');
    });
});
