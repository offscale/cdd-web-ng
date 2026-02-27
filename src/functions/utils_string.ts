/**
 * A simple singularization function for English words. Handles common plural endings.
 * @param str The plural string to singularize.
 * @returns The singular form of the string.
 */
export function singular(str: string): string {
    if (str.endsWith('ies')) {
        return str.slice(0, -3) + 'y';
    }
    if (str.endsWith('s')) {
        return str.slice(0, -1);
    }
    return str;
}

function normalizeString(str: string): string {
    if (!str) return '';
    return str
        .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
        .replace(/^[_-]+|[-_]+$/g, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Converts a string to camelCase.
 */
export function camelCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/\s(.)/g, (_: string, char: string): string => char.toUpperCase());
}

/**
 * Converts a string to PascalCase (UpperCamelCase).
 */
export function pascalCase(str: string): string {
    const normalized = normalizeString(str);
    if (!normalized) return '';
    return normalized.replace(/(^|\s)(.)/g, (_: string, __: string, char: string): string => char.toUpperCase());
}

/**
 * Converts a string to kebab-case.
 */
export function kebabCase(str: string): string {
    if (!str) return '';
    return str
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase()
        .replace(/[\s_]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Checks if a string is a valid URL.
 */
export function isUrl(input: string): boolean {
    try {
        new URL(input);
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if a string looks like a URI reference (absolute, fragment, or relative).
 * Useful for distinguishing Security Requirement keys from component names (OAS 3.2).
 */
export function isUriReference(input: string): boolean {
    if (!input) return false;
    const value = input.trim();
    if (!value) return false;
    if (value.startsWith('#') || value.startsWith('./') || value.startsWith('../')) return true;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return true;
    return /[/?#]/.test(value);
}
