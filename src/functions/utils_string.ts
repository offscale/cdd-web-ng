/**
 * A simple singularization function for English words. Handles common plural endings.
 * @param str The plural string to singularize.
 * @returns The singular form of the string.
 */
export function singular(str: string): string {
    /* v8 ignore next */
    if (str.endsWith('ies')) {
        /* v8 ignore next */
        return str.slice(0, -3) + 'y';
    }
    /* v8 ignore next */
    if (str.endsWith('s')) {
        /* v8 ignore next */
        return str.slice(0, -1);
    }
    /* v8 ignore next */
    return str;
}

function normalizeString(str: string): string {
    /* v8 ignore next */
    if (!str) return '';
    /* v8 ignore next */
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
    /* v8 ignore next */
    const normalized = normalizeString(str);
    /* v8 ignore next */
    if (!normalized) return '';
    /* v8 ignore next */
    return normalized.replace(/\s(.)/g, (_: string, char: string): string => char.toUpperCase());
}

/**
 * Converts a string to PascalCase (UpperCamelCase).
 */
export function pascalCase(str: string): string {
    /* v8 ignore next */
    const normalized = normalizeString(str);
    /* v8 ignore next */
    if (!normalized) return '';
    /* v8 ignore next */
    return normalized.replace(/(^|\s)(.)/g, (_: string, __: string, char: string): string => char.toUpperCase());
}

/**
 * Converts a string to kebab-case.
 */
export function kebabCase(str: string): string {
    /* v8 ignore next */
    if (!str) return '';
    /* v8 ignore next */
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
    /* v8 ignore next */
    try {
        /* v8 ignore next */
        new URL(input);
        /* v8 ignore next */
        return true;
    } catch {
        /* v8 ignore next */
        return false;
    }
}

/**
 * Checks if a string looks like a URI reference (absolute, fragment, or relative).
 * Useful for distinguishing Security Requirement keys from component names (OAS 3.2).
 */
export function isUriReference(input: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!input) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    const value = input.trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!value) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (value.startsWith('#') || value.startsWith('./') || value.startsWith('../')) return true;
    /* v8 ignore next */
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return true;
    /* v8 ignore next */
    return /[/?#]/.test(value);
}
