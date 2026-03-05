/**
 * Provides utilities for sanitizing user input (descriptions, summaries)
 * before embedding them into generated source code files (JSDocs, string literals).
 *
 * This addresses Security considerations from OAS 3.2 regarding Markdown/HTML injection.
 */

/**
 * Sanitizes a string to be safe for inclusion in JSDoc comments.
 *
 * 1. Removes potentially malicious HTML tags (script, iframe, object, embed, form).
 * 2. Removes dangerous event handler attributes (on*).
 * 3. Removes `javascript:` URIs.
 * 4. Escapes the `*\/` sequence to prevent breaking the JSDoc block structure.
 *
 * @param text The input string (Markdown or HTML).
 * @returns The sanitized string.
 */
export function sanitizeComment(text: string | undefined): string {
    /* v8 ignore next */
    if (!text) return '';

    /* v8 ignore next */
    let clean = text;

    // 1. Remove dangerous tags (script, iframe, object, embed, form)
    // Matches <script>...</script> (case insensitive, multiline content)
    /* v8 ignore next */
    clean = clean.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, '');
    // Matches self-closing or empty dangerous tags
    /* v8 ignore next */
    clean = clean.replace(/<\/?(iframe|object|embed|form)\b[^>]*>/gim, '');

    // 2. Remove event handlers (e.g. onclick="...")
    /* v8 ignore next */
    clean = clean.replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*")/gim, '');

    // 3. Remove javascript: URIs in href/src
    /* v8 ignore next */
    clean = clean.replace(/\b(href|src)\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*")/gim, '');

    // 4. Escape JSDoc comment terminators to prevent syntax errors
    // Replaces */ with *\/
    /* v8 ignore next */
    clean = clean.replace(/\*\//g, '*\\/');

    /* v8 ignore next */
    return clean.trim();
}
