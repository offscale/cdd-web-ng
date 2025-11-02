/**
 * @fileoverview
 * This file contains core utility functions used throughout the OpenAPI Angular generator.
 * It includes functions for string manipulation (case conversion), TypeScript type resolution from
 * OpenAPI schemas, OpenAPI spec parsing helpers, and functions for generating unique DI token names.
 * These utilities are pure, dependency-free helpers that form the building blocks of the generation logic.
 */
import { MethodDeclaration } from 'ts-morph';
import { GeneratorConfig, Parameter, PathInfo, RequestBody, SwaggerDefinition, SwaggerResponse } from './types.js';
import { Path, Operation, Parameter as SwaggerOfficialParameter } from "swagger-schema-official";

// --- String Manipulation Utilities ---
export function singular(str: string): string { if (str.endsWith('ies')) { return str.slice(0, -3) + 'y'; } if (str.endsWith('s')) { return str.slice(0, -1); } return str; }
function normalizeString(str: string): string { if (!str) return ''; return str.replace(/[^a-zA-Z0-9\s_-]/g, ' ').replace(/^[_-]+|[-_]+$/g, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase(); }
export function camelCase(str: string): string { const normalized = normalizeString(str); if (!normalized) return ''; return normalized.replace(/\s(.)/g, (_, char) => char.toUpperCase()); }
export function pascalCase(str: string): string { const normalized = normalizeString(str); if (!normalized) return ''; return normalized.replace(/(^|\s)(.)/g, (_, __, char) => char.toUpperCase()); }
export function kebabCase(str: string): string { if (!str) return ''; return str.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1-$2').toLowerCase().replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, ''); }

// --- TypeScript Type Resolution ---
export function getTypeScriptType(schema: SwaggerDefinition | undefined, config: GeneratorConfig): string { if (!schema) return 'any'; if (schema.$ref) return pascalCase(schema.$ref.split('/').pop()!); if (schema.enum) return schema.enum.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(' | '); let type: string; switch (schema.type) { case 'string': type = (schema.format === 'date' || schema.format === 'date-time') && config.options.dateType === 'Date' ? 'Date' : 'string'; if (schema.format === 'binary') type = 'Blob'; break; case 'number': case 'integer': type = 'number'; break; case 'boolean': type = 'boolean'; break; case 'array': const itemType = schema.items ? getTypeScriptType(schema.items as SwaggerDefinition, config) : 'any'; type = `${itemType}[]`; break; case 'object': if (schema.properties) { const props = Object.entries(schema.properties).map(([key, propDef]) => { const optional = schema.required?.includes(key) ? '' : '?'; const propName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`; return `${propName}${optional}: ${getTypeScriptType(propDef, config)}`; }).join('; '); type = `{ ${props} }`; } else if (schema.additionalProperties) { const valueType = schema.additionalProperties === true ? 'any' : getTypeScriptType(schema.additionalProperties, config); type = `Record<string, ${valueType}>`; } else { type = 'Record<string, any>'; } break; default: type = 'any'; } return schema.nullable ? `${type} | null` : type; }
export function isDataTypeInterface(type: string): boolean { const primitiveOrBuiltIn = /^(any|File|Blob|string|number|boolean|object|unknown|null|undefined|Date|void)$/; const isArray = /\[\]$/; return !primitiveOrBuiltIn.test(type) && !isArray.test(type) && !type.startsWith('{') && !type.startsWith('Record'); }

// --- General & OpenAPI Helpers ---
export function isUrl(input: string): boolean { try { new URL(input); return true; } catch { return false; } }
export function hasDuplicateFunctionNames(methods: MethodDeclaration[]): boolean { const names = methods.map(m => m.getName()); return new Set(names).size !== names.length; }

export function extractPaths(swaggerPaths: { [p: string]: Path } = {}): PathInfo[] {
    const paths: PathInfo[] = [];
    const methods = ["get", "post", "put", "patch", "delete", "options", "head"];

    for (const [path, pathItem] of Object.entries(swaggerPaths)) {
        for (const method of methods) {
            const operation = pathItem[method as keyof Path] as Operation;
            if (operation) {
                const allParams = (operation.parameters as SwaggerOfficialParameter[] || []);

                const nonBodyParams = allParams.filter(p => p.in !== 'body');
                const bodyParam = allParams.find(p => p.in === 'body');

                const parameters = nonBodyParams.map((p): Parameter => ({
                    name: p.name,
                    in: p.in as "query" | "path" | "header" | "cookie",
                    required: p.required,
                    schema: (p as any).schema || p,
                    description: p.description
                }));

                const requestBody = (operation as any).requestBody || (bodyParam ? { content: { 'application/json': { schema: (bodyParam as any).schema } } } : undefined);

                paths.push({
                    path,
                    method: method.toUpperCase(),
                    operationId: operation.operationId,
                    summary: operation.summary,
                    description: operation.description,
                    tags: operation.tags || [],
                    parameters,
                    requestBody: requestBody as RequestBody | undefined,
                    responses: operation.responses as Record<string, SwaggerResponse> | undefined,
                });
            }
        }
    }
    return paths;
}

export function getRequestBodyType(requestBody: RequestBody | undefined, config: GeneratorConfig): string { const schema = requestBody?.content?.['application/json']?.schema; return getTypeScriptType(schema as SwaggerDefinition, config); }
export function getResponseType(response: SwaggerResponse | undefined, config: GeneratorConfig): string { const schema = response?.content?.['application/json']?.schema; return getTypeScriptType(schema as SwaggerDefinition, config); }

// --- DI Token Name Generators ---
export function getBasePathTokenName(clientName = "default"): string { const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_"); return `BASE_PATH_${clientSuffix}`; }
export function getClientContextTokenName(clientName = "default"): string { const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_"); return `CLIENT_CONTEXT_TOKEN_${clientSuffix}`; }
export function getInterceptorsTokenName(clientName = "default"): string { const clientSuffix = clientName.toUpperCase().replace(/[^A-Z0-9_]/g, "_"); return `HTTP_INTERCEPTORS_${clientSuffix}`; }
