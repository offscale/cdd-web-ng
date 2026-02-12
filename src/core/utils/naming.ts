import { MethodDeclaration } from 'ts-morph';

/**
 * Checks for duplicate method names in an array of ts-morph MethodDeclaration objects.
 */
export function hasDuplicateFunctionNames(methods: MethodDeclaration[]): boolean {
    const names = methods.map(m => m.getName());
    return new Set(names).size !== names.length;
}

/**
 * Normalizes a security scheme key.
 * If the key is a JSON pointer/URI, it extracts the simple name. Otherwise returns the key as is.
 */
export function normalizeSecurityKey(key: string): string {
    const withoutQuery = key.split('?')[0];
    const [, fragment] = withoutQuery.split('#');
    const target = fragment ?? withoutQuery;
    const parts = target.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : key;
}

export function getBasePathTokenName(clientName = 'default'): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    return `BASE_PATH_${clientSuffix}`;
}

export function getClientContextTokenName(clientName = 'default'): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`;
}

export function getServerVariablesTokenName(clientName = 'default'): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    return `SERVER_VARIABLES_${clientSuffix}`;
}

export function getInterceptorsTokenName(clientName = 'default'): string {
    const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    return `HTTP_INTERCEPTORS_${clientSuffix}`;
}
