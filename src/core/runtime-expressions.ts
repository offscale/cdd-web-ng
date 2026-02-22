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
        body?: unknown;
    };
    response?: {
        headers: Record<string, string | string[] | undefined>;
        body?: unknown;
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
export function evaluateJsonPointer(data: unknown, pointer: string): unknown {
    if (pointer === '' || pointer === '#') return data;

    // Remove leading # if present (URI fragment style)
    const cleanPointer = pointer.startsWith('#') ? pointer.substring(1) : pointer;

    if (!cleanPointer.startsWith('/')) return undefined;

    const decodeToken = (token: string): string => {
        let decoded = token;
        try {
            decoded = decodeURIComponent(token);
        } catch {
            decoded = token;
        }
        return decoded.replace(/~1/g, '/').replace(/~0/g, '~');
    };

    const tokens = cleanPointer.split('/').slice(1).map(decodeToken);

    let current: unknown = data;
    for (const token of tokens) {
        if (current === null || typeof current !== 'object') {
            return undefined;
        }
        // Arrays handling: standard JSON pointer can access array indices
        if (Array.isArray(current)) {
            if (!/^\d+$/.test(token)) return undefined;
            const index = parseInt(token, 10);
            if (index < 0 || index >= current.length) {
                return undefined;
            }
            current = (current as unknown[])[index];
        } else {
            if (!(token in (current as Record<string, unknown>))) {
                return undefined;
            }
            current = (current as Record<string, unknown>)[token];
        }
    }
    return current;
}

/**
 * Helper to extract a header value case-insensitively (RFC 7230).
 */
function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const lowerKey = key.toLowerCase();
    const foundKey = Object.keys(headers).find(k => k.toLowerCase() === lowerKey);
    if (!foundKey) return undefined;
    const val = headers[foundKey];
    return Array.isArray(val) ? val[0] : val;
}

/**
 * Helper to extract a query parameter (Case-sensitive).
 */
function getQuery(query: Record<string, string | string[] | undefined>, key: string): string | undefined {
    const val = query[key];
    return Array.isArray(val) ? val[0] : val;
}

/**
 * Resolves a single, bare runtime expression (e.g. "$request.body#/id").
 * Preserves the type of the referenced value (e.g. boolean, number, object).
 */
function resolveSingleExpression(expr: string, context: RuntimeContext): unknown {
    if (expr === '$url') return context.url;
    if (expr === '$method') return context.method;
    if (expr === '$statusCode') return context.statusCode;

    if (expr.startsWith('$request.')) {
        const part = expr.substring(9); // remove "$request."
        if (part.startsWith('header.')) {
            return getHeader(context.request.headers, part.substring(7));
        }
        if (part.startsWith('query.')) {
            return getQuery(context.request.query, part.substring(6));
        }
        if (part.startsWith('path.')) {
            return context.request.path[part.substring(5)];
        }
        if (part.startsWith('body')) {
            if (part === 'body') return context.request.body;
            if (part.startsWith('body#')) {
                return evaluateJsonPointer(context.request.body, part.substring(5));
            }
        }
    }

    if (expr.startsWith('$response.')) {
        if (!context.response) return undefined;
        const part = expr.substring(10); // remove "$response."
        if (part.startsWith('header.')) {
            return getHeader(context.response.headers, part.substring(7));
        }
        if (part.startsWith('body')) {
            if (part === 'body') return context.response.body;
            if (part.startsWith('body#')) {
                return evaluateJsonPointer(context.response.body, part.substring(5));
            }
        }
    }

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
export function evaluateRuntimeExpression(expression: string, context: RuntimeContext): unknown {
    const hasBraces = expression.includes('{') && expression.includes('}');

    // Case 1: Bare expression (must start with $)
    if (expression.startsWith('$') && !hasBraces) {
        return resolveSingleExpression(expression, context);
    }

    // Case 2: Constant string (no braces, no $)
    if (!expression.includes('{')) {
        return expression;
    }

    // Case 3: Embedded template string (e.g., "foo/{$url}/bar")
    return expression.replace(/\{([^}]+)\}/g, (_, innerExpr: string) => {
        const trimmed = innerExpr.trim();
        // Only interpolate if it looks like a variable we recognize, otherwise leave it?
        // OAS implies logical expressions inside braces.
        const val = resolveSingleExpression(trimmed, context);
        return val !== undefined ? String(val) : '';
    });
}
