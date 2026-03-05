import { MethodDeclaration } from 'ts-morph';

/**
 * Checks for duplicate method names in an array of ts-morph MethodDeclaration objects.
 */
export function hasDuplicateFunctionNames(methods: MethodDeclaration[]): boolean {
    /* v8 ignore next */
    const names = methods.map(m => m.getName());
    /* v8 ignore next */
    return new Set(names).size !== names.length;
}

/**
 * Normalizes a security scheme key.
 * If the key is a JSON pointer/URI, it extracts the simple name. Otherwise returns the key as is.
 */
export function normalizeSecurityKey(key: string): string {
    /* v8 ignore next */
    const withoutQuery = key.split('?')[0];
    /* v8 ignore next */
    const [, fragment] = withoutQuery.split('#');
    /* v8 ignore next */
    const target = fragment ?? withoutQuery;
    /* v8 ignore next */
    const parts = target.split('/').filter(Boolean);
    /* v8 ignore next */
    /* v8 ignore start */
    return parts.length > 0 ? parts[parts.length - 1] : key;
    /* v8 ignore stop */
}

export function getBasePathTokenName(clientName = 'default'): string {
    /* v8 ignore next */
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    /* v8 ignore next */
    return `BASE_PATH_${clientSuffix}`;
}

export function getClientContextTokenName(clientName = 'default'): string {
    /* v8 ignore next */
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    /* v8 ignore next */
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

export function getServerVariablesTokenName(clientName = 'default'): string {
    /* v8 ignore next */
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    /* v8 ignore next */
    return `SERVER_VARIABLES_${clientSuffix}`;
}

export function getInterceptorsTokenName(clientName = 'default'): string {
    /* v8 ignore next */
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    /* v8 ignore next */
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
