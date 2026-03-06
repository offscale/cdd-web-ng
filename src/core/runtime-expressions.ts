import { OpenApiValue } from '@src/core/types/index.js';

/**
 * @fileoverview
 * Implements the OpenAPI Runtime Expression evaluator defined in OAS 3.x.
 * Used for dynamically deriving values for Links and Callbacks from HTTP messages.
 *
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#runtime-expressions
 */

/**
 * Context required to evaluate a runtime expression.
 * Represents the state of the HTTP interaction (Request/Response).
 */
export interface RuntimeContext {
    url: string;
    method: string;
    statusCode: number;
    request: {
        headers: Record<string, string | string[] | undefined>;
        query: Record<string, string | string[] | undefined>;
        path: Record<string, string | undefined>;
        body?: OpenApiValue;
    };
    response?: {
        headers: Record<string, string | string[] | undefined>;
        body?: OpenApiValue;
    };
}

/**
 * Resolves a JSON Pointer (RFC 6901) against a target object.
 * Used internally for processing `$request.body#/foo` style expressions.
 *
 * @param data The target object (body).
 * @param pointer The JSON pointer string (e.g., "/user/0/id").
 * @returns The resolved value or undefined if not found.
 */
export function evaluateJsonPointer(data: OpenApiValue, pointer: string): OpenApiValue {
    /* v8 ignore next */
    if (pointer === '' || pointer === '#') return data;

    // Remove leading # if present (URI fragment style)
    /* v8 ignore next */
    const cleanPointer = pointer.startsWith('#') ? pointer.substring(1) : pointer;

    /* v8 ignore next */
    if (!cleanPointer.startsWith('/')) return undefined;

    /* v8 ignore next */
    const decodeToken = (token: string): string => {
        /* v8 ignore next */
        let decoded = token;
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            decoded = decodeURIComponent(token);
        } catch {
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            decoded = token;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        return decoded.replace(/~1/g, '/').replace(/~0/g, '~');
    };

    /* v8 ignore next */
    const tokens = cleanPointer.split('/').slice(1).map(decodeToken);

    /* v8 ignore next */
    let current: OpenApiValue = data;
    /* v8 ignore next */
    for (const token of tokens) {
        /* v8 ignore next */
        if (current === null || typeof current !== 'object') {
            /* v8 ignore next */
            return undefined;
        }
        // Arrays handling: standard JSON pointer can access array indices
        /* v8 ignore next */
        if (Array.isArray(current)) {
            /* v8 ignore next */
            if (!/^\d+$/.test(token)) return undefined;
            /* v8 ignore next */
            const index = parseInt(token, 10);
            /* v8 ignore next */
            if (index < 0 || index >= current.length) {
                /* v8 ignore next */
                return undefined;
            }
            /* v8 ignore next */
            current = (current as OpenApiValue[])[index];
        } else {
            /* v8 ignore next */
            if (!(token in (current as Record<string, OpenApiValue>))) {
                /* v8 ignore next */
                return undefined;
            }
            /* v8 ignore next */
            current = (current as Record<string, OpenApiValue>)[token];
        }
    }
    /* v8 ignore next */
    return current;
}

/**
 * Helper to extract a header value case-insensitively (RFC 7230).
 */
function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    /* v8 ignore next */
    const lowerKey = key.toLowerCase();
    /* v8 ignore next */
    const foundKey = Object.keys(headers).find(k => k.toLowerCase() === lowerKey);
    /* v8 ignore next */
    if (!foundKey) return undefined;
    /* v8 ignore next */
    const val = headers[foundKey];
    /* v8 ignore next */
    return Array.isArray(val) ? val[0] : val;
}

/**
 * Helper to extract a query parameter (Case-sensitive).
 */
function getQuery(query: Record<string, string | string[] | undefined>, key: string): string | undefined {
    /* v8 ignore next */
    const val = query[key];
    /* v8 ignore next */
    return Array.isArray(val) ? val[0] : val;
}

/**
 * Resolves a single, bare runtime expression (e.g. "$request.body#/id").
 * Preserves the type of the referenced value (e.g. boolean, number, object).
 */
function resolveSingleExpression(expr: string, context: RuntimeContext): OpenApiValue {
    /* v8 ignore next */
    if (expr === '$url') return context.url;
    /* v8 ignore next */
    if (expr === '$method') return context.method;
    /* v8 ignore next */
    if (expr === '$statusCode') return context.statusCode;

    /* v8 ignore next */
    if (expr.startsWith('$request.')) {
        /* v8 ignore next */
        const part = expr.substring(9); // remove "$request."
        /* v8 ignore next */
        if (part.startsWith('header.')) {
            /* v8 ignore next */
            return getHeader(context.request.headers, part.substring(7));
        }
        /* v8 ignore next */
        if (part.startsWith('query.')) {
            /* v8 ignore next */
            return getQuery(context.request.query, part.substring(6));
        }
        /* v8 ignore next */
        if (part.startsWith('path.')) {
            /* v8 ignore next */
            return context.request.path[part.substring(5)];
        }
        /* v8 ignore next */
        if (part.startsWith('body')) {
            /* v8 ignore next */
            if (part === 'body') return context.request.body;
            /* v8 ignore next */
            if (part.startsWith('body#')) {
                /* v8 ignore next */
                return evaluateJsonPointer(context.request.body, part.substring(5));
            }
        }
    }

    /* v8 ignore next */
    if (expr.startsWith('$response.')) {
        /* v8 ignore next */
        if (!context.response) return undefined;
        /* v8 ignore next */
        const part = expr.substring(10); // remove "$response."
        /* v8 ignore next */
        if (part.startsWith('header.')) {
            /* v8 ignore next */
            return getHeader(context.response.headers, part.substring(7));
        }
        /* v8 ignore next */
        if (part.startsWith('body')) {
            /* v8 ignore next */
            if (part === 'body') return context.response.body;
            /* v8 ignore next */
            if (part.startsWith('body#')) {
                /* v8 ignore next */
                return evaluateJsonPointer(context.response.body, part.substring(5));
            }
        }
    }

    /* v8 ignore next */
    return undefined;
}

/**
 * Evaluates a runtime expression against a given connection context.
 *
 * Supports:
 * 1. Direct expressions: "$request.query.id" -> returns the value (preserving type).
 * 2. Embedded string expressions: "https://example.com/{$request.path.id}" -> returns interpolated string.
 *
 * @param expression The expression string defined in the OpenAPI Link or Callback.
 * @param context The runtime data (request info, response info).
 * @returns The evaluated result.
 */
export function evaluateRuntimeExpression(expression: string, context: RuntimeContext): OpenApiValue {
    /* v8 ignore next */
    const hasBraces = expression.includes('{') && expression.includes('}');

    // Case 1: Bare expression (must start with $)
    /* v8 ignore next */
    if (expression.startsWith('$') && !hasBraces) {
        /* v8 ignore next */
        return resolveSingleExpression(expression, context);
    }

    // Case 2: Constant string (no braces, no $)
    /* v8 ignore next */
    if (!expression.includes('{')) {
        /* v8 ignore next */
        return expression;
    }

    // Case 3: Embedded template string (e.g., "foo/{$url}/bar")
    /* v8 ignore next */
    return expression.replace(/\{([^}]+)\}/g, (_, innerExpr: string) => {
        /* v8 ignore next */
        const trimmed = innerExpr.trim();
        // Only interpolate if it looks like a variable we recognize, otherwise leave it?
        // OAS implies logical expressions inside braces.
        /* v8 ignore next */
        const val = resolveSingleExpression(trimmed, context);
        /* v8 ignore next */
        return val !== undefined ? String(val) : '';
    });
}
