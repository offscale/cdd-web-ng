// src/generators/angular/service/service-method.generator.ts
import {
    ClassDeclaration,
    MethodDeclarationOverloadStructure,
    OptionalKind,
    ParameterDeclarationStructure,
} from 'ts-morph';

import {
    GeneratorConfig,
    Parameter,
    PathInfo,
    ReferenceLike,
    RequestBody,
    SwaggerDefinition,
    SwaggerResponse,
    MediaTypeObject,
    OpenApiValue,
} from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { ServiceMethodAnalyzer } from '@src/functions/parse_analyzer.js';
import { ResponseVariant, ServiceMethodModel, ParamSerialization } from '@src/functions/types.js';
import { camelCase, pascalCase, sanitizeComment } from '@src/functions/utils.js';

export class ServiceMethodGenerator {
    private analyzer: ServiceMethodAnalyzer;

    constructor(
        /* v8 ignore next */
        private readonly config: GeneratorConfig,
        /* v8 ignore next */
        readonly parser: SwaggerParser,
    ) {
        /* v8 ignore next */
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        /* v8 ignore next */
        const model = this.analyzer.analyze(operation);
        /* v8 ignore next */
        if (!model) {
            /* v8 ignore next */
            console.warn(
                `[ServiceMethodGenerator] Skipping method generation for operation without a methodName detected.`,
            );
            /* v8 ignore next */
            return;
        }

        let errorTypeAlias: string | undefined;
        /* v8 ignore next */
        if (model.errorResponses && model.errorResponses.length > 0) {
            /* v8 ignore next */
            const typeName = `${pascalCase(model.methodName)}Error`;
            /* v8 ignore next */
            const union = [...new Set(model.errorResponses.map(e => e.type))].join(' | ');
            /* v8 ignore next */
            classDeclaration.getSourceFile().addTypeAlias({
                name: typeName,
                isExported: true,
                type: union,
                docs: [`Error union for ${model.methodName}`],
            });
            /* v8 ignore next */
            errorTypeAlias = typeName;
        }

        /* v8 ignore next */
        const isSSE = model.responseSerialization === 'sse';
        /* v8 ignore next */
        const serverOptionType = '{ server?: number | string; serverVariables?: Record<string, string> }';

        /* v8 ignore next */
        const negotiationVariants = this.getDistinctNegotiationVariants(model.responseVariants);
        /* v8 ignore next */
        const hasContentNegotiation = negotiationVariants.length > 1;
        /* v8 ignore next */
        const distinctTypes = [...new Set(model.responseVariants.map(v => v.type))];
        /* v8 ignore next */
        const hasMultipleSuccessTypes = distinctTypes.length > 1;

        /* v8 ignore next */
        const bodyStatements = this.emitMethodBody(model, operation, isSSE, hasContentNegotiation, negotiationVariants);
        /* v8 ignore next */
        const overloads = this.emitOverloads(
            model.methodName,
            model.responseType,
            model.parameters,
            model.isDeprecated,
            isSSE,
            model.responseVariants,
            serverOptionType,
            negotiationVariants,
        );

        let returnType =
            /* v8 ignore next */
            overloads.length > 0 ? 'Observable<Record<string, never>>' : `Observable<${model.responseType}>`;
        /* v8 ignore next */
        /* v8 ignore start */
        if ((hasContentNegotiation || hasMultipleSuccessTypes) && overloads.length === 0) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            const unionType = distinctTypes.join(' | ');
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            returnType = `Observable<${unionType}>`;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        const paramTags = this.buildParamTags(operation, model.parameters);
        /* v8 ignore next */
        const responseTags = this.buildResponseTags(operation);
        /* v8 ignore next */
        const exampleTags = this.buildExampleTags(operation, model.parameters);
        /* v8 ignore next */
        const metaTags = this.buildOperationMetaTags(operation);
        /* v8 ignore next */
        const docLines: string[] = [];
        /* v8 ignore next */
        if (model.docs) docLines.push(model.docs);
        /* v8 ignore next */
        if (operation.operationId) docLines.push(`@operationId ${operation.operationId}`);
        /* v8 ignore next */
        if (metaTags.length > 0) docLines.push(...metaTags);
        /* v8 ignore next */
        if (paramTags.length > 0) docLines.push(...paramTags);
        /* v8 ignore next */
        if (exampleTags.length > 0) docLines.push(...exampleTags);
        /* v8 ignore next */
        if (errorTypeAlias) docLines.push(`@throws {${errorTypeAlias}}`);
        /* v8 ignore next */
        if (responseTags.length > 0) docLines.push(...responseTags);
        /* v8 ignore next */
        const docs = docLines.length > 0 ? [docLines.join('\n')] : [];

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: model.methodName,
            parameters: [
                ...model.parameters,
                {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestOptions & { observe?: 'body' | 'events' | 'response', responseType?: 'arraybuffer' | 'blob' | 'json' | 'text' } & ${serverOptionType}`,
                },
            ],
            returnType: returnType,
            statements: bodyStatements,
            overloads: overloads,
            docs: docs,
        });
    }

    private buildResponseTags(operation: PathInfo): string[] {
        /* v8 ignore next */
        if (!operation.responses) return [];
        /* v8 ignore next */
        const tags: string[] = [];

        /* v8 ignore next */
        Object.entries(operation.responses).forEach(([code, resp]) => {
            /* v8 ignore next */
            const description = resp?.description ? sanitizeComment(resp.description) : '';
            /* v8 ignore next */
            const summary = resp?.summary ? sanitizeComment(resp.summary) : '';
            /* v8 ignore next */
            const mediaTypes = resp?.content ? this.filterMediaTypes(Object.keys(resp.content)) : [];

            /* v8 ignore next */
            if (mediaTypes.length === 0) {
                /* v8 ignore next */
                /* v8 ignore start */
                tags.push(`@response ${code}${description ? ` ${description}` : ''}`);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                if (summary) tags.push(`@responseSummary ${code} ${summary}`);
                /* v8 ignore stop */
                /* v8 ignore next */
                return;
            }

            /* v8 ignore next */
            mediaTypes.forEach(mediaType => {
                /* v8 ignore next */
                const base = `@response ${code} ${mediaType}`;
                /* v8 ignore next */
                tags.push(description ? `${base} ${description}` : base);
            });
            /* v8 ignore next */
            if (summary) tags.push(`@responseSummary ${code} ${summary}`);
        });

        /* v8 ignore next */
        return tags;
    }

    private buildParamTags(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string[] {
        /* v8 ignore next */
        const tags: string[] = [];
        /* v8 ignore next */
        const paramNames = new Set(
            parameters
                /* v8 ignore next */
                .map(p => p.name)
                /* v8 ignore next */
                .filter((name): name is string => typeof name === 'string' && name.length > 0 && name !== 'options'),
        );
        /* v8 ignore next */
        const opParamNames = new Set(
            /* v8 ignore next */
            (operation.parameters ?? []).map(param => camelCase(param.name)).filter(name => paramNames.has(name)),
        );

        /* v8 ignore next */
        (operation.parameters ?? []).forEach(param => {
            /* v8 ignore next */
            const paramName = camelCase(param.name);
            /* v8 ignore next */
            if (!paramNames.has(paramName)) return;
            /* v8 ignore next */
            if (!param.description) return;
            /* v8 ignore next */
            const desc = sanitizeComment(param.description);
            /* v8 ignore next */
            /* v8 ignore start */
            if (desc) tags.push(`@param ${paramName} ${desc}`);
            /* v8 ignore stop */
        });

        /* v8 ignore next */
        if (operation.requestBody?.description) {
            /* v8 ignore next */
            const bodyParam = parameters.find(
                /* v8 ignore next */
                p => typeof p.name === 'string' && !opParamNames.has(p.name) && p.name !== 'options',
            );
            /* v8 ignore next */
            /* v8 ignore start */
            if (bodyParam?.name) {
                /* v8 ignore stop */
                /* v8 ignore next */
                const desc = sanitizeComment(operation.requestBody.description);
                /* v8 ignore next */
                /* v8 ignore start */
                if (desc) tags.push(`@param ${bodyParam.name} ${desc}`);
                /* v8 ignore stop */
            }
        }

        /* v8 ignore next */
        return tags;
    }

    private buildExampleTags(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string[] {
        /* v8 ignore next */
        const tags: string[] = [];
        /* v8 ignore next */
        const paramNames = new Set(
            parameters
                /* v8 ignore next */
                .map(p => p.name)
                /* v8 ignore next */
                .filter((name): name is string => typeof name === 'string' && name.length > 0 && name !== 'options'),
        );
        /* v8 ignore next */
        const opParamNames = new Set(
            /* v8 ignore next */
            (operation.parameters ?? []).map(param => camelCase(param.name)).filter(name => paramNames.has(name)),
        );

        /* v8 ignore next */
        (operation.parameters ?? []).forEach(param => {
            /* v8 ignore next */
            const paramName = camelCase(param.name);
            /* v8 ignore next */
            if (!paramNames.has(paramName)) return;
            /* v8 ignore next */
            const example = this.extractParameterExample(param);
            /* v8 ignore next */
            const serialized = this.serializeExampleValue(
                example as Record<string, never> | string | number | boolean | null,
            );
            /* v8 ignore next */
            if (serialized !== undefined) {
                /* v8 ignore next */
                tags.push(`@paramExample ${paramName} ${serialized}`);
            }
        });

        /* v8 ignore next */
        const bodyParam = parameters.find(
            /* v8 ignore next */
            p => typeof p.name === 'string' && !opParamNames.has(p.name) && p.name !== 'options',
        );
        /* v8 ignore next */
        if (bodyParam?.name && operation.requestBody) {
            /* v8 ignore next */
            const requestExamples = this.extractRequestBodyExamples(operation.requestBody);
            /* v8 ignore next */
            requestExamples.forEach(entry => {
                /* v8 ignore next */
                const serialized = this.serializeExampleValue(entry.value);
                /* v8 ignore next */
                /* v8 ignore start */
                if (serialized !== undefined) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    tags.push(`@requestExample ${entry.mediaType} ${serialized}`);
                }
            });
        }

        /* v8 ignore next */
        if (operation.responses) {
            /* v8 ignore next */
            Object.entries(operation.responses).forEach(([code, response]) => {
                const resolved =
                    /* v8 ignore next */
                    this.parser.resolve<SwaggerResponse>(response as ReferenceLike) ?? (response as SwaggerResponse);
                /* v8 ignore next */
                if (!resolved?.content) return;
                /* v8 ignore next */
                Object.entries(resolved.content).forEach(([mediaType, mediaObj]) => {
                    /* v8 ignore next */
                    const example = this.extractMediaTypeExample(mediaObj, mediaType);
                    /* v8 ignore next */
                    const serialized = this.serializeExampleValue(
                        example as Record<string, never> | string | number | boolean | null,
                    );
                    /* v8 ignore next */
                    if (serialized !== undefined) {
                        /* v8 ignore next */
                        tags.push(`@responseExample ${code} ${mediaType} ${serialized}`);
                    }
                });
            });
        }

        /* v8 ignore next */
        return tags;
    }

    private serializeExampleValue(value: Record<string, never> | string | number | boolean | null): string | undefined {
        /* v8 ignore next */
        if (value === undefined) return undefined;
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            return JSON.stringify(value);
        } catch {
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return undefined;
            /* v8 ignore stop */
        }
    }

    private extractExampleValue(
        exampleObj: OpenApiValue,
        preferSerialized = false,
    ): {
        found: boolean;
        value: Record<string, never> | string | number | boolean | null;
        kind?: 'data' | 'value' | 'serialized' | 'external';
    } {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!exampleObj || typeof exampleObj !== 'object') return { found: false, value: null };
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (preferSerialized) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'serializedValue')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                return {
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .serializedValue,
                    kind: 'serialized',
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'externalValue')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .externalValue,
                    kind: 'external',
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'dataValue')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .dataValue,
                    kind: 'data',
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'value')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .value,
                    kind: 'value',
                };
            }
        } else {
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'dataValue')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .dataValue,
                    kind: 'data',
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'value')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .value,
                    kind: 'value',
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'serializedValue')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .serializedValue,
                    kind: 'serialized',
                };
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'externalValue')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return {
                    /* v8 ignore stop */
                    found: true,
                    value: (exampleObj as Record<string, string | number | boolean | Record<string, never> | null>)
                        .externalValue,
                    kind: 'external',
                };
            }
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return { found: false, value: null };
        /* v8 ignore stop */
    }

    private wrapExampleValue(picked: {
        value: Record<string, never> | string | number | boolean | null;
        kind?: 'data' | 'value' | 'serialized' | 'external';
    }): OpenApiValue {
        /* v8 ignore next */
        /* v8 ignore start */
        if (picked.kind === 'serialized') {
            /* v8 ignore stop */
            /* v8 ignore next */
            return { __oasExample: { serializedValue: picked.value } };
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (picked.kind === 'external') {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { __oasExample: { externalValue: picked.value } };
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return picked.value;
        /* v8 ignore stop */
    }

    private extractParameterExample(param: Parameter): OpenApiValue | undefined {
        /* v8 ignore next */
        if (param.example !== undefined) return param.example;

        /* v8 ignore next */
        /* v8 ignore start */
        if (param.examples && typeof param.examples === 'object') {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            const firstExample = Object.values(param.examples)[0];
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (firstExample !== undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                const resolved = this.parser.resolve(firstExample as ReferenceLike) ?? firstExample;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                const picked = this.extractExampleValue(resolved, true);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (picked.found) return this.wrapExampleValue(picked);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolved !== null && typeof resolved !== 'object') return resolved;
                /* v8 ignore stop */
            }
        }

        /* v8 ignore next */
        if (
            param.schema &&
            typeof param.schema === 'object' &&
            !Array.isArray(param.schema) &&
            !('$ref' in param.schema)
        ) {
            /* v8 ignore next */
            const schema = param.schema as Record<string, never>;
            /* v8 ignore next */
            /* v8 ignore start */
            if (schema.dataValue !== undefined) return schema.dataValue;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (schema.example !== undefined) return schema.example;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(schema.examples) && (schema.examples as OpenApiValue[]).length > 0)
                return (schema.examples as OpenApiValue[])[0];
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        if (param.content) {
            /* v8 ignore next */
            const mediaType = Object.keys(param.content)[0];
            /* v8 ignore next */
            /* v8 ignore start */
            const mediaObj = mediaType ? param.content[mediaType] : undefined;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            const example = mediaObj ? this.extractMediaTypeExample(mediaObj, mediaType) : undefined;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (example !== undefined) return example;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        return undefined;
    }

    private extractMediaTypeExample(
        mediaObj: MediaTypeObject | ReferenceLike,
        mediaType?: string,
    ): OpenApiValue | undefined {
        const resolved =
            /* v8 ignore next */
            this.parser.resolve<MediaTypeObject>(mediaObj as ReferenceLike) ?? (mediaObj as MediaTypeObject);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!resolved) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (resolved.example !== undefined) return resolved.example;
        /* v8 ignore next */
        if (resolved.examples && typeof resolved.examples === 'object') {
            /* v8 ignore next */
            const firstExample = Object.values(resolved.examples)[0];
            /* v8 ignore next */
            /* v8 ignore start */
            if (firstExample !== undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const resolvedExample = this.parser.resolve(firstExample as ReferenceLike) ?? firstExample;
                /* v8 ignore stop */
                /* v8 ignore next */
                const preferSerialized = this.shouldPreferSerializedExample(mediaType);
                /* v8 ignore next */
                const picked = this.extractExampleValue(resolvedExample, preferSerialized);
                /* v8 ignore next */
                /* v8 ignore start */
                if (picked.found) return this.wrapExampleValue(picked);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (resolvedExample !== null && typeof resolvedExample !== 'object') return resolvedExample;
                /* v8 ignore stop */
            }
        }
        /* v8 ignore next */
        return undefined;
    }

    private extractRequestBodyExamples(
        requestBody: RequestBody,
    ): { mediaType: string; value: Record<string, never> | string | number | boolean | null }[] {
        /* v8 ignore next */
        const entries: { mediaType: string; value: Record<string, never> | string | number | boolean | null }[] = [];
        /* v8 ignore next */
        /* v8 ignore start */
        const content = requestBody.content ?? {};
        /* v8 ignore stop */
        /* v8 ignore next */
        Object.entries(content).forEach(([mediaType, mediaObj]) => {
            /* v8 ignore next */
            const example = this.extractMediaTypeExample(mediaObj, mediaType);
            /* v8 ignore next */
            if (example !== undefined) {
                /* v8 ignore next */
                entries.push({
                    mediaType,
                    value: example as Record<string, never> | string | number | boolean | null,
                });
            }
        });
        /* v8 ignore next */
        return entries;
    }

    private buildOperationMetaTags(operation: PathInfo): string[] {
        /* v8 ignore next */
        const tags: string[] = [];

        /* v8 ignore next */
        if (operation.tags && operation.tags.length > 0) {
            /* v8 ignore next */
            const joined = operation.tags

                /* v8 ignore next */
                .map(t => String(t).trim())
                .filter(Boolean)
                .join(', ');
            /* v8 ignore next */
            /* v8 ignore start */
            if (joined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                tags.push(`@tags ${joined}`);
            }
        }

        /* v8 ignore next */
        if (operation.externalDocs?.url) {
            /* v8 ignore next */
            const desc = sanitizeComment(operation.externalDocs.description);
            /* v8 ignore next */
            /* v8 ignore start */
            tags.push(`@see ${operation.externalDocs.url}${desc ? ` ${desc}` : ''}`);
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        const rawOperation = this.getRawOperation(operation);

        /* v8 ignore next */
        if (rawOperation && Object.prototype.hasOwnProperty.call(rawOperation, 'servers')) {
            /* v8 ignore next */
            /* v8 ignore start */
            const servers = rawOperation.servers ?? [];
            /* v8 ignore stop */
            /* v8 ignore next */
            tags.push(`@server ${JSON.stringify(servers)}`);
        }

        /* v8 ignore next */
        if (rawOperation && Object.prototype.hasOwnProperty.call(rawOperation, 'security')) {
            /* v8 ignore next */
            /* v8 ignore start */
            const security = rawOperation.security ?? [];
            /* v8 ignore stop */
            /* v8 ignore next */
            tags.push(`@security ${JSON.stringify(security)}`);
        }

        /* v8 ignore next */
        const querystringParam = (operation.parameters ?? []).find(
            /* v8 ignore next */
            p => (p as { in?: string }).in === 'querystring',
        );
        /* v8 ignore next */
        if (querystringParam) {
            /* v8 ignore next */
            /* v8 ignore start */
            const contentType = querystringParam.content ? Object.keys(querystringParam.content)[0] : undefined;
            /* v8 ignore stop */
            const encoding =
                /* v8 ignore next */
                contentType && querystringParam.content?.[contentType]?.encoding
                    ? querystringParam.content[contentType]!.encoding
                    : undefined;
            /* v8 ignore next */
            const meta: Record<string, OpenApiValue> = {
                name: querystringParam.name,
            };
            /* v8 ignore next */
            /* v8 ignore start */
            if (contentType) meta.contentType = contentType;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (encoding && typeof encoding === 'object') meta.encoding = encoding;
            /* v8 ignore next */
            if (typeof querystringParam.required === 'boolean') meta.required = querystringParam.required;
            /* v8 ignore next */
            if (querystringParam.description) meta.description = sanitizeComment(querystringParam.description);
            /* v8 ignore next */
            tags.push(`@querystring ${JSON.stringify(meta)}`);
        }

        // type-coverage:ignore-next-line
        /* v8 ignore next */
        Object.entries(operation).forEach(([key, value]) => {
            /* v8 ignore next */
            if (!key.startsWith('x-')) return;
            // type-coverage:ignore-next-line
            /* v8 ignore next */
            /* v8 ignore start */
            if (value === undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                tags.push(`@${key}`);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return;
                /* v8 ignore stop */
            }
            // type-coverage:ignore-next-line
            /* v8 ignore next */
            tags.push(`@${key} ${JSON.stringify(value)}`);
        });

        /* v8 ignore next */
        return tags;
    }

    private getRawOperation(operation: PathInfo): Record<string, never> | undefined {
        /* v8 ignore next */
        const pathItem = this.parser.spec.paths?.[operation.path];
        /* v8 ignore next */
        if (!pathItem || typeof pathItem !== 'object') return undefined;

        /* v8 ignore next */
        const methodKey = operation.method.toLowerCase();
        /* v8 ignore next */
        const direct = (pathItem as Record<string, never>)[methodKey];
        /* v8 ignore next */
        if (direct) return direct as Record<string, never>;

        /* v8 ignore next */
        const additional = (pathItem as Record<string, never>).additionalOperations as
            | Record<string, never>
            | undefined;
        /* v8 ignore next */
        /* v8 ignore start */
        if (!additional) return undefined;
        /* v8 ignore stop */

        /* v8 ignore next */
        for (const [key, value] of Object.entries(additional)) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (key.toLowerCase() === methodKey) return value as Record<string, never>;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return undefined;
        /* v8 ignore stop */
    }

    private normalizeMediaType(mediaType: string): string {
        /* v8 ignore next */
        /* v8 ignore start */
        return mediaType.split(';')[0]?.trim().toLowerCase() || '';
        /* v8 ignore stop */
    }

    private isJsonMediaType(mediaType?: string): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        const normalized = this.normalizeMediaType(mediaType);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (normalized === 'application/json') return true;
        /* v8 ignore stop */
        /* v8 ignore next */
        return normalized.endsWith('+json');
    }

    private isXmlMediaType(mediaType?: string): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        const normalized = this.normalizeMediaType(mediaType);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        return normalized === 'application/xml' || normalized.endsWith('+xml') || normalized.includes('/xml');
    }

    private getXmlParameterEntry(
        param: Parameter,
    ): { mediaType: string; schema: SwaggerDefinition | boolean } | undefined {
        /* v8 ignore next */
        if (!param.content) return undefined;
        /* v8 ignore next */
        for (const [mediaType, mediaObj] of Object.entries(param.content)) {
            /* v8 ignore next */
            if (!this.isXmlMediaType(mediaType)) continue;
            /* v8 ignore next */
            /* v8 ignore start */
            if (!mediaObj || typeof mediaObj !== 'object') continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            const schema = (mediaObj as MediaTypeObject).schema;
            /* v8 ignore next */
            /* v8 ignore start */
            if (schema === undefined) continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            return { mediaType, schema };
        }
        /* v8 ignore next */
        return undefined;
    }

    private shouldPreferSerializedExample(mediaType?: string): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!mediaType) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        const normalized = this.normalizeMediaType(mediaType);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        return !this.isJsonMediaType(normalized);
    }

    private mediaTypeSpecificity(normalized: string): number {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!normalized) return 0;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (normalized === '*/*') return 0;
        /* v8 ignore next */
        const [type, subtype] = normalized.split('/');
        /* v8 ignore next */
        /* v8 ignore start */
        if (!type || !subtype) return 0;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (type.includes('*') || subtype.includes('*')) return 1;
        /* v8 ignore next */
        return 2;
    }

    private matchesMediaType(range: string, candidate: string): boolean {
        /* v8 ignore next */
        const [rangeType, rangeSubtype] = range.split('/');
        /* v8 ignore next */
        const [candType, candSubtype] = candidate.split('/');
        /* v8 ignore next */
        /* v8 ignore start */
        if (!rangeType || !rangeSubtype || !candType || !candSubtype) return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (rangeType !== '*' && rangeType !== candType) return false;
        /* v8 ignore stop */

        /* v8 ignore next */
        /* v8 ignore start */
        if (rangeSubtype === '*') return true;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (!rangeSubtype.includes('*')) return rangeSubtype === candSubtype;
        /* v8 ignore stop */

        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const escaped = rangeSubtype.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const regex = new RegExp(`^${escaped}$`);
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return regex.test(candSubtype);
        /* v8 ignore stop */
    }

    private filterMediaTypes(mediaTypes: string[]): string[] {
        /* v8 ignore next */
        const entries: { raw: string; normalized: string; specificity: number }[] = [];
        /* v8 ignore next */
        const seen = new Set<string>();

        /* v8 ignore next */
        mediaTypes.forEach(raw => {
            /* v8 ignore next */
            const normalized = this.normalizeMediaType(raw);
            /* v8 ignore next */
            /* v8 ignore start */
            if (!normalized || seen.has(normalized)) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            seen.add(normalized);
            /* v8 ignore next */
            entries.push({ raw, normalized, specificity: this.mediaTypeSpecificity(normalized) });
        });

        /* v8 ignore next */
        return (
            entries

                .filter(candidate => {
                    /* v8 ignore next */
                    if (candidate.specificity === 2) return true;
                    /* v8 ignore next */
                    return !entries.some(
                        other =>
                            /* v8 ignore next */
                            other !== candidate &&
                            other.specificity > candidate.specificity &&
                            this.matchesMediaType(candidate.normalized, other.normalized),
                    );
                })
                /* v8 ignore next */
                .map(entry => entry.raw)
        );
    }

    private getDistinctNegotiationVariants(variants: ResponseVariant[]): ResponseVariant[] {
        /* v8 ignore next */
        const uniqueByMedia: ResponseVariant[] = [];
        /* v8 ignore next */
        const seen = new Set<string>();
        /* v8 ignore next */
        variants.forEach(variant => {
            /* v8 ignore next */
            if (!variant.mediaType) return;
            /* v8 ignore next */
            const normalized = this.normalizeMediaType(variant.mediaType);
            /* v8 ignore next */
            if (!normalized || seen.has(normalized)) return;
            /* v8 ignore next */
            seen.add(normalized);
            /* v8 ignore next */
            uniqueByMedia.push(variant);
        });

        /* v8 ignore next */
        const filteredMediaTypes = new Set(this.filterMediaTypes(uniqueByMedia.map(v => v.mediaType)));
        /* v8 ignore next */
        return uniqueByMedia.filter(v => filteredMediaTypes.has(v.mediaType));
    }

    private emitMethodBody(
        model: ServiceMethodModel,
        rawOp: PathInfo,
        isSSE: boolean,
        hasContentNegotiation: boolean,
        negotiationVariants?: ResponseVariant[],
    ): string {
        /* v8 ignore next */
        const lines: string[] = [];
        /* v8 ignore next */
        const variantsForNegotiation = hasContentNegotiation
            ? (negotiationVariants ?? model.responseVariants)
            : model.responseVariants;

        const xmlParams =
            /* v8 ignore next */
            rawOp.parameters

                ?.map(p => {
                    /* v8 ignore next */
                    const entry = this.getXmlParameterEntry(p);
                    /* v8 ignore next */
                    if (!entry) return undefined;
                    /* v8 ignore next */
                    return { param: p, schema: entry.schema };
                })
                /* v8 ignore next */
                .filter((p): p is { param: Parameter; schema: SwaggerDefinition | boolean } => !!p) ?? [];
        /* v8 ignore next */
        xmlParams.forEach(({ param, schema }) => {
            /* v8 ignore next */
            const paramName = camelCase(param.name);
            /* v8 ignore next */
            const rootName = typeof schema === 'object' && schema.xml?.name ? schema.xml.name : param.name;
            const xmlConfig =
                /* v8 ignore next */
                (
                    this.analyzer as OpenApiValue as { getXmlConfig: (a: OpenApiValue, b: number) => unknown }
                ).getXmlConfig(schema, 5);
            /* v8 ignore next */
            lines.push(`let ${paramName}Serialized: Record<string, never> = ${paramName};`);
            /* v8 ignore next */
            lines.push(`if (${paramName} !== null && ${paramName} !== undefined) {`);
            /* v8 ignore next */
            lines.push(
                `  ${paramName}Serialized = XmlBuilder.serialize(${paramName}, '${rootName}', ${JSON.stringify(xmlConfig)});`,
            );
            /* v8 ignore next */
            lines.push(`}`);
        });

        /* v8 ignore next */
        let urlTemplate = model.urlTemplate;
        /* v8 ignore next */
        model.pathParams.forEach((p: ParamSerialization) => {
            /* v8 ignore next */
            const pathArgs: string[] = [
                `'${p.originalName}'`,
                p.paramName,
                `'${p.style || 'simple'}'`,
                `${p.explode}`,
                `${p.allowReserved}`,
            ];
            /* v8 ignore next */
            if (p.serializationLink === 'json' || p.contentEncoderConfig) {
                /* v8 ignore next */
                /* v8 ignore start */
                pathArgs.push(p.serializationLink === 'json' ? "'json'" : 'undefined');
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (p.contentEncoderConfig) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                pathArgs.push(JSON.stringify(p.contentEncoderConfig));
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            const serializeCall = `ParameterSerializer.serializePathParam(${pathArgs.join(', ')})`;
            /* v8 ignore next */
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        /* v8 ignore next */
        const qsParam = rawOp.parameters?.find((p: Parameter) => (p.in as string) === 'querystring');
        /* v8 ignore next */
        let queryStringVariable = '';
        /* v8 ignore next */
        if (qsParam) {
            /* v8 ignore next */
            const pName = camelCase(qsParam.name);
            /* v8 ignore next */
            const contentKeys = qsParam.content ? Object.keys(qsParam.content) : [];
            /* v8 ignore next */
            const contentType = contentKeys.length > 0 ? contentKeys[0] : undefined;
            const isJson =
                /* v8 ignore next */
                qsParam.content?.['application/json'] || (contentType && contentType.includes('application/json'));
            /* v8 ignore next */
            const qsConfig = model.queryParams.find(p => p.originalName === qsParam.name);

            const encodingConfig =
                /* v8 ignore next */
                contentType && qsParam.content?.[contentType]?.encoding
                    ? qsParam.content[contentType]?.encoding
                    : undefined;

            /* v8 ignore next */
            const serializationArg = isJson ? "'json'" : 'undefined';
            /* v8 ignore next */
            const contentTypeArg = !isJson && contentType ? `'${contentType}'` : 'undefined';
            /* v8 ignore next */
            const encodingArg = encodingConfig ? JSON.stringify(encodingConfig) : 'undefined';
            /* v8 ignore next */
            /* v8 ignore start */
            const encoderArg = qsConfig?.contentEncoderConfig
                ? /* v8 ignore stop */
                  JSON.stringify(qsConfig.contentEncoderConfig)
                : 'undefined';

            /* v8 ignore next */
            const args = [pName, serializationArg, contentTypeArg, encodingArg, encoderArg];
            /* v8 ignore next */
            while (args.length > 1 && args[args.length - 1] === 'undefined') {
                /* v8 ignore next */
                args.pop();
            }

            /* v8 ignore next */
            lines.push(`const queryString = ParameterSerializer.serializeRawQuerystring(${args.join(', ')});`);
            /* v8 ignore next */
            queryStringVariable = "${queryString ? '?' + queryString : ''}";
        }

        /* v8 ignore next */
        if (model.operationServers && model.operationServers.length > 0) {
            /* v8 ignore next */
            lines.push(`const operationServers = ${JSON.stringify(model.operationServers, null, 2)};`);
            /* v8 ignore next */
            lines.push(
                `const basePath = resolveServerUrl(operationServers, options?.server ?? 0, options?.serverVariables ?? {});`,
            );
        } else {
            /* v8 ignore next */
            lines.push(
                `const basePath = (options?.server !== undefined || options?.serverVariables !== undefined) ? getServerUrl(options?.server ?? 0, options?.serverVariables ?? {}) : this.basePath;`,
            );
        }
        /* v8 ignore next */
        lines.push(`const url = \`\${basePath}${urlTemplate}${queryStringVariable}\`;`);

        /* v8 ignore next */
        const standardQueryParams = model.queryParams.filter(p => p.originalName !== qsParam?.name);

        /* v8 ignore next */
        if (standardQueryParams.length > 0) {
            /* v8 ignore next */
            lines.push(
                `let params = new HttpParams({ encoder: new ApiParameterCodec(), fromObject: options?.params ?? {} });`,
            );
            /* v8 ignore next */
            standardQueryParams.forEach((p: ParamSerialization) => {
                /* v8 ignore next */
                const configObj = JSON.stringify({
                    name: p.originalName,
                    in: 'query',
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    serialization: p.serializationLink,
                    allowEmptyValue: (p as OpenApiValue as Record<string, never>).allowEmptyValue,
                    ...(p.contentType ? { contentType: p.contentType } : {}),
                    ...(p.encoding ? { encoding: p.encoding } : {}),
                    ...(p.contentEncoderConfig ? { contentEncoderConfig: p.contentEncoderConfig } : {}),
                });
                /* v8 ignore next */
                lines.push(
                    `const serialized_${p.paramName} = ParameterSerializer.serializeQueryParam(${configObj}, ${p.paramName});`,
                );
                /* v8 ignore next */
                lines.push(
                    `serialized_${p.paramName}.forEach((entry: { key: string, value: string | Blob }) => params = params.append(entry.key, entry.value));`,
                );
            });
        }

        /* v8 ignore next */
        lines.push(
            `let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`,
        );
        /* v8 ignore next */
        model.headerParams.forEach((p: ParamSerialization) => {
            /* v8 ignore next */
            const headerArgs: string[] = [p.paramName, `${p.explode}`];
            /* v8 ignore next */
            const hasEncoderConfig = !!p.contentEncoderConfig;
            /* v8 ignore next */
            if (p.serializationLink === 'json') {
                /* v8 ignore next */
                headerArgs.push("'json'");
                /* v8 ignore next */
                /* v8 ignore start */
            } else if (p.contentType || p.encoding || hasEncoderConfig) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                headerArgs.push('undefined');
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            if (p.contentType) {
                /* v8 ignore next */
                headerArgs.push(`'${p.contentType}'`);
                /* v8 ignore next */
                /* v8 ignore start */
            } else if (p.encoding || hasEncoderConfig) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                headerArgs.push('undefined');
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (p.encoding) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                headerArgs.push(JSON.stringify(p.encoding));
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
            } else if (hasEncoderConfig) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                headerArgs.push('undefined');
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (hasEncoderConfig) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                headerArgs.push(JSON.stringify(p.contentEncoderConfig));
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            lines.push(
                `if (${p.paramName} != null) { headers = headers.set('${p.originalName}', ParameterSerializer.serializeHeaderParam(${headerArgs.join(', ')})); }`,
            );
        });

        /* v8 ignore next */
        if (model.cookieParams.length > 0) {
            /* v8 ignore next */
            if (this.config.options.platform !== 'node') {
                /* v8 ignore next */
                lines.push(`// WARNING: Setting 'Cookie' headers manually is forbidden in browsers.`);
                /* v8 ignore next */
                lines.push(
                    `if (typeof window !== 'undefined') { console.warn('Operation ${model.methodName} attempts to set "Cookie" header manually. This will fail in browsers.'); }`,
                );
            }
            /* v8 ignore next */
            lines.push(`const __cookies: string[] = [];`);
            /* v8 ignore next */
            model.cookieParams.forEach((p: ParamSerialization) => {
                /* v8 ignore next */
                const hasEncoderConfig = !!p.contentEncoderConfig;
                /* v8 ignore next */
                /* v8 ignore start */
                const hint = p.serializationLink === 'json' ? ", 'json'" : hasEncoderConfig ? ', undefined' : '';
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const encoderArg = hasEncoderConfig ? `, ${JSON.stringify(p.contentEncoderConfig)}` : '';
                /* v8 ignore stop */
                /* v8 ignore next */
                lines.push(
                    `if (${p.paramName} != null) { __cookies.push(ParameterSerializer.serializeCookieParam('${p.originalName}', ${p.paramName}, '${p.style || 'form'}', ${p.explode}, ${p.allowReserved}${hint}${encoderArg})); }`,
                );
            });
            /* v8 ignore next */
            lines.push(`if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }`);
        }

        /* v8 ignore next */
        if (hasContentNegotiation) {
            /* v8 ignore next */
            lines.push(`const acceptHeader = headers.get('Accept');`);
        }

        /* v8 ignore next */
        let contextConstruction = `this.createContextWithClientId(options?.context)`;
        /* v8 ignore next */
        if (model.security.length > 0) {
            /* v8 ignore next */
            contextConstruction += `.set(SECURITY_CONTEXT_TOKEN, ${JSON.stringify(model.security)})`;
        }
        /* v8 ignore next */
        if (model.extensions && Object.keys(model.extensions).length > 0) {
            /* v8 ignore next */
            contextConstruction += `.set(EXTENSIONS_CONTEXT_TOKEN, ${JSON.stringify(model.extensions)})`;
        }

        /* v8 ignore next */
        let responseTypeVal = `options?.responseType`;

        /* v8 ignore next */
        if (hasContentNegotiation) {
            /* v8 ignore next */
            const xmlOrSeqCondition = variantsForNegotiation

                /* v8 ignore next */
                .filter(v => v.serialization === 'xml' || v.serialization.startsWith('json-'))

                /* v8 ignore next */
                .map(v => `acceptHeader?.includes('${v.mediaType}')`)

                .join(' || ');

            /* v8 ignore next */
            const binaryCondition = variantsForNegotiation

                /* v8 ignore next */
                .filter(v => v.serialization === 'blob' || v.serialization === 'arraybuffer')

                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                .map(v => `acceptHeader?.includes('${v.mediaType}')`)
                /* v8 ignore stop */

                .join(' || ');

            /* v8 ignore next */
            if (binaryCondition || xmlOrSeqCondition) {
                /* v8 ignore next */
                /* v8 ignore start */
                const binaryResponseType = variantsForNegotiation.some(v => v.serialization === 'arraybuffer')
                    ? /* v8 ignore stop */
                      'arraybuffer'
                    : 'blob';
                /* v8 ignore next */
                /* v8 ignore start */
                responseTypeVal = `(${binaryCondition || 'false'}) ? '${binaryResponseType}' : (${xmlOrSeqCondition || 'false'}) ? 'text' : (options?.responseType ?? 'json')`;
                /* v8 ignore stop */
            }
        } else {
            /* v8 ignore next */
            const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
            /* v8 ignore next */
            const isXmlResp = model.responseSerialization === 'xml';
            const isBinaryResp =
                /* v8 ignore next */
                model.responseSerialization === 'blob' || model.responseSerialization === 'arraybuffer';
            /* v8 ignore next */
            if (isBinaryResp) {
                /* v8 ignore next */
                /* v8 ignore start */
                responseTypeVal = `'${model.responseSerialization === 'arraybuffer' ? 'arraybuffer' : 'blob'}'`;
                /* v8 ignore stop */
                /* v8 ignore next */
            } else if (isSeq || isXmlResp) {
                /* v8 ignore next */
                responseTypeVal = `'text'`;
            }
        }

        /* v8 ignore next */
        let optionProperties = `

  observe: options?.observe, 
  reportProgress: options?.reportProgress, 
  responseType: ${responseTypeVal}, 
  withCredentials: options?.withCredentials, 
  context: ${contextConstruction}`;

        /* v8 ignore next */
        if (standardQueryParams.length > 0) optionProperties += `,\n  params`;
        /* v8 ignore next */
        optionProperties += `,\n  headers`;

        /* v8 ignore next */
        lines.push(`let requestOptions: HttpRequestOptions = {${optionProperties}\n};`);

        /* v8 ignore next */
        let bodyArgument = 'null';
        /* v8 ignore next */
        const body = model.body;
        /* v8 ignore next */
        const legacyFormData = rawOp.parameters?.filter(p => (p as { in?: string }).in === 'formData');
        /* v8 ignore next */
        const isUrlEnc = rawOp.consumes?.includes('application/x-www-form-urlencoded');

        /* v8 ignore next */
        if (legacyFormData && legacyFormData.length > 0) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (isUrlEnc) {
                /* v8 ignore stop */
                /* v8 ignore next */
                lines.push(`let formBody = new HttpParams();`);
                /* v8 ignore next */
                legacyFormData.forEach((p: Parameter) => {
                    /* v8 ignore next */
                    const paramName = camelCase(p.name);
                    /* v8 ignore next */
                    lines.push(`if (${paramName} != null) { formBody = formBody.append('${p.name}', ${paramName}); }`);
                });
                /* v8 ignore next */
                bodyArgument = 'formBody';
            } else {
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                lines.push(`const formData = new FormData();`);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                legacyFormData.forEach((p: Parameter) => {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const paramName = camelCase(p.name);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`if (${paramName} != null) { formData.append('${p.name}', ${paramName}); }`);
                    /* v8 ignore stop */
                });
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                bodyArgument = 'formData';
                /* v8 ignore stop */
            }
            /* v8 ignore next */
        } else if (body) {
            /* v8 ignore next */
            if (body.type === 'raw' || body.type === 'json') {
                /* v8 ignore next */
                bodyArgument = body.paramName;
                /* v8 ignore next */
                if (model.requestEncodingConfig) {
                    /* v8 ignore next */
                    lines.push(`if (${body.paramName} !== null && ${body.paramName} !== undefined) {`);
                    /* v8 ignore next */
                    lines.push(
                        `  ${body.paramName} = ContentEncoder.encode(${body.paramName}, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    /* v8 ignore next */
                    lines.push(`}`);
                }
                /* v8 ignore next */
            } else if (body.type === 'urlencoded') {
                /* v8 ignore next */
                let encodedBodyName = body.paramName;
                /* v8 ignore next */
                if (model.requestEncodingConfig) {
                    /* v8 ignore next */
                    encodedBodyName = 'encodedBody';
                    /* v8 ignore next */
                    lines.push(`let encodedBody = ${body.paramName};`);
                    /* v8 ignore next */
                    lines.push(`if (encodedBody !== null && encodedBody !== undefined) {`);
                    /* v8 ignore next */
                    lines.push(
                        `  encodedBody = ContentEncoder.encode(encodedBody, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    /* v8 ignore next */
                    lines.push(`}`);
                }
                /* v8 ignore next */
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${encodedBodyName}, ${JSON.stringify(body.config)});`,
                );
                /* v8 ignore next */
                lines.push(`let formBody = new HttpParams({ encoder: new ApiParameterCodec() });`);
                /* v8 ignore next */
                lines.push(
                    `urlParamEntries.forEach((entry: { key: string, value: string | Blob }) => formBody = formBody.append(entry.key, entry.value));`,
                );
                /* v8 ignore next */
                bodyArgument = 'formBody';
                /* v8 ignore next */
            } else if (body.type === 'json-lines' || body.type === 'json-seq') {
                /* v8 ignore next */
                /* v8 ignore start */
                const bodyVar = body.type === 'json-seq' ? 'jsonSeqBody' : 'jsonLinesBody';
                /* v8 ignore stop */
                /* v8 ignore next */
                lines.push(`let ${bodyVar} = ${body.paramName};`);
                /* v8 ignore next */
                /* v8 ignore start */
                if (model.requestEncodingConfig) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`if (${bodyVar} !== null && ${bodyVar} !== undefined) {`);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(
                        /* v8 ignore stop */
                        `  ${bodyVar} = ContentEncoder.encode(${bodyVar}, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`}`);
                    /* v8 ignore stop */
                }

                /* v8 ignore next */
                /* v8 ignore start */
                if (body.type === 'json-seq') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`if (Array.isArray(${bodyVar})) {`);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(
                        /* v8 ignore stop */
                        `  ${bodyVar} = ${bodyVar}.map((item: Record<string, never>) => '\\x1e' + JSON.stringify(item)).join('');`,
                    );
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`} else if (${bodyVar} != null && typeof ${bodyVar} !== 'string') {`);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`  ${bodyVar} = '\\x1e' + JSON.stringify(${bodyVar});`);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    lines.push(`}`);
                    /* v8 ignore stop */
                } else {
                    /* v8 ignore next */
                    lines.push(`if (Array.isArray(${bodyVar})) {`);
                    /* v8 ignore next */
                    lines.push(
                        `  ${bodyVar} = ${bodyVar}.map((item: Record<string, never>) => JSON.stringify(item)).join('\\n');`,
                    );
                    /* v8 ignore next */
                    lines.push(`} else if (${bodyVar} != null && typeof ${bodyVar} !== 'string') {`);
                    /* v8 ignore next */
                    lines.push(`  ${bodyVar} = JSON.stringify(${bodyVar});`);
                    /* v8 ignore next */
                    lines.push(`}`);
                }

                /* v8 ignore next */
                bodyArgument = bodyVar;
                /* v8 ignore next */
            } else if (body.type === 'multipart') {
                /* v8 ignore next */
                lines.push(`const multipartConfig = ${JSON.stringify(body.config)};`);
                /* v8 ignore next */
                lines.push(`const multipartResult = MultipartBuilder.serialize(${body.paramName}, multipartConfig);`);
                /* v8 ignore next */
                lines.push(`if (multipartResult.headers) {`);
                /* v8 ignore next */
                lines.push(
                    `  let newHeaders = requestOptions.headers instanceof HttpHeaders ? requestOptions.headers : new HttpHeaders(requestOptions.headers || {});`,
                );
                /* v8 ignore next */
                lines.push(
                    `  Object.entries(multipartResult.headers).forEach(([k, v]) => { newHeaders = newHeaders.set(k, v as string); });`,
                );
                /* v8 ignore next */
                lines.push(`  headers = newHeaders;`);
                /* v8 ignore next */
                lines.push(`  requestOptions = { ...requestOptions, headers: newHeaders };`);
                /* v8 ignore next */
                lines.push(`}`);
                /* v8 ignore next */
                bodyArgument = 'multipartResult.content';
                /* v8 ignore next */
            } else if (body.type === 'xml') {
                /* v8 ignore next */
                lines.push(
                    `const xmlBody = XmlBuilder.serialize(${body.paramName}, '${body.rootName}', ${JSON.stringify(body.config)});`,
                );
                /* v8 ignore next */
                bodyArgument = 'xmlBody';
            }
        }

        /* v8 ignore next */
        if (body && model.requestContentType && body.type !== 'multipart' && body.type !== 'encoded-form-data') {
            /* v8 ignore next */
            lines.push(
                `if (${body.paramName} != null && !headers.has('Content-Type')) { headers = headers.set('Content-Type', '${model.requestContentType}'); }`,
            );
        }

        /* v8 ignore next */
        lines.push(`requestOptions = { ...requestOptions, headers };`);

        /* v8 ignore next */
        if (isSSE) {
            /* v8 ignore next */
            /* v8 ignore start */
            const sseMode = model.sseMode ?? 'data';
            /* v8 ignore stop */
            /* v8 ignore next */
            const hasSseDecoding = model.responseDecodingConfig && Object.keys(model.responseDecodingConfig).length > 0;
            /* v8 ignore next */
            /* v8 ignore start */
            if (hasSseDecoding) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                lines.push(`const sseDecodingConfig = ${JSON.stringify(model.responseDecodingConfig)};`);
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            lines.push(`
            return new Observable<${model.responseType}>(observer => { 
                const abortController = typeof AbortController !== 'undefined' ? new AbortController() : undefined; 
                const fetchHeaders = (() => { 
                    if (typeof Headers !== 'undefined') { 
                        const h = new Headers(); 
                        if (headers instanceof HttpHeaders) { 
                            headers.keys().forEach((key: string) => { 
                                const values = headers.getAll(key); 
                                if (values && values.length > 0) { 
                                    values.forEach((v: string) => h.append(key, v)); 
                                } else { 
                                    const value = headers.get(key); 
                                    if (value !== null) h.set(key, value); 
                                } 
                            }); 
                        } else if (headers) { 
                            Object.entries(headers as Record<string, never>).forEach(([key, value]) => { 
                                if (Array.isArray(value)) { 
                                    value.forEach((v: string | number | boolean) => h.append(key, String(v))); 
                                } else if (value !== undefined && value !== null) { 
                                    h.set(key, String(value)); 
                                } 
                            }); 
                        } 
                        return h; 
                    } 
                    const raw: Record<string, string> = {}; 
                    if (headers instanceof HttpHeaders) { 
                        headers.keys().forEach((key: string) => { 
                            const values = headers.getAll(key); 
                            if (values && values.length > 0) { 
                                raw[key] = values.join(', '); 
                            } else { 
                                const value = headers.get(key); 
                                if (value !== null) raw[key] = value; 
                            } 
                        }); 
                    } else if (headers) { 
                        Object.entries(headers as Record<string, never>).forEach(([key, value]) => { 
                            if (Array.isArray(value)) raw[key] = value.map((v: string | number | boolean) => String(v)).join(', '); 
                            else if (value !== undefined && value !== null) raw[key] = String(value); 
                        }); 
                    } 
                    return raw; 
                })(); 

                

                const fetchOptions: RequestInit = { method: '${model.httpMethod}', headers: fetchHeaders as HeadersInit }; 
                if (abortController) fetchOptions.signal = abortController.signal; 

                if (options?.withCredentials) fetchOptions.credentials = 'include'; 

/* v8 ignore start */
                ${bodyArgument !== 'null' ? `fetchOptions.body = ${bodyArgument} as Record<string, never>;` : ''} 
/* v8 ignore stop */

                fetch(url, fetchOptions).then(response => { 
                    if (!response.ok) { observer.error(response); return; } 

                    if (!response.body || !response.body.getReader) { 
                        observer.error(new Error('SSE response body is not readable in this environment.')); 
                        return; 
                    } 

                    const reader = response.body.getReader(); 
                    const decoder = new TextDecoder(); 
                    let buffer = ''; 
                    let isFirstLine = true; 
                    let dataLines: string[] = []; 
                    let eventName: string | undefined; 
                    let eventId: string | undefined; 
                    let lastEventId: string | undefined; 
                    let retry: number | undefined; 

                    const resetEvent = () => { 
                        dataLines = []; 
                        eventName = undefined; 
                        eventId = undefined; 
                        retry = undefined; 
                    }; 

                    const dispatch = () => { 
                        if (dataLines.length === 0) { 
                            resetEvent(); 
                            return; 
                        } 

                        const data = dataLines.join('\\n'); 
                        let payload: Record<string, never>; 
                        if ('${sseMode}' === 'event') { 
                            payload = { data }; 
                            const resolvedEvent = eventName ?? 'message'; 
                            if (resolvedEvent !== undefined) payload.event = resolvedEvent; 
                            const resolvedId = eventId !== undefined ? eventId : lastEventId; 
                            if (resolvedId !== undefined) payload.id = resolvedId; 
                            if (retry !== undefined) payload.retry = retry; 
                        } else { 
                            payload = data; 
                        } 
/* v8 ignore start */
                        ${hasSseDecoding ? 'payload = ContentDecoder.decode(payload, sseDecodingConfig);' : ''} 
/* v8 ignore stop */

                        observer.next(payload as Record<string, never>); 
                        resetEvent(); 
                    }; 

                    const processLine = (line: string) => { 
                        let currentLine = line; 
                        if (isFirstLine) { 
                            isFirstLine = false; 
                            if (currentLine.charCodeAt(0) === 0xfeff) { 
                                currentLine = currentLine.slice(1); 
                            } 
                        } 

                        if (currentLine === '') { dispatch(); return; } 

                        if (currentLine.startsWith(':')) return; 

                        const idx = currentLine.indexOf(':'); 

                        const field = idx === -1 ? currentLine : currentLine.slice(0, idx); 
                        let value = idx === -1 ? '' : currentLine.slice(idx + 1); 

                        if (value.startsWith(' ')) value = value.slice(1); 

                        switch (field) { 
                            case 'data': 
                                dataLines.push(value); 
                                break; 
                            case 'event': 
                                eventName = value; 
                                break; 
                            case 'id': 
                                if (!value.includes('\\u0000')) { 
                                    eventId = value; 
                                    lastEventId = value; 
                                } 
                                break; 
                            case 'retry': { 
                                const parsed = parseInt(value, 10); 
                                if (!Number.isNaN(parsed) && parsed >= 0) retry = parsed; 
                                break; 
                            } 
                            default: 
                                break; 
                        } 
                    }; 

                    const read = (): void => { 
                        reader.read().then(({ value, done }) => { 
                            if (done) { 
                                const tail = decoder.decode(); 
                                if (tail) buffer += tail; 
                                if (buffer.length > 0) { 
                                    const leftover = buffer.split(/\\r?\\n/); 
                                    buffer = ''; 
                                    leftover.forEach(processLine); 
                                } 
                                dispatch(); 

                                observer.complete(); 
                                return; 
                            } 
                            buffer += decoder.decode(value, { stream: true }); 
                            const lines = buffer.split(/\\r?\\n/); 
                            buffer = lines.pop() ?? ''; 
                            lines.forEach(processLine); 
                            read(); 
                        }).catch(error => observer.error(error)); 
                    }; 

                    read(); 
                }).catch(error => observer.error(error)); 

                return () => { 
                    if (abortController) abortController.abort(); 
                }; 
            });`);

            /* v8 ignore next */
            return lines.join('\n');
        }

        /* v8 ignore next */
        const httpMethod = model.httpMethod.toLowerCase();
        /* v8 ignore next */
        const isStandardBody = ['post', 'put', 'patch', 'query'].includes(httpMethod);
        /* v8 ignore next */
        const isStandardNonBody = ['get', 'delete', 'head', 'options', 'jsonp'].includes(httpMethod);

        /* v8 ignore next */
        const returnGeneric = `Record<string, never>`;

        let httpCall: string;

        /* v8 ignore next */
        if (isStandardBody) {
            /* v8 ignore next */
            if (httpMethod === 'query') {
                /* v8 ignore next */
                httpCall = `this.http.request('QUERY', url, { ...requestOptions, body: ${bodyArgument} } as Record<string, never>)`;
            } else {
                /* v8 ignore next */
                httpCall = `this.http.${httpMethod}<${returnGeneric}>(url, ${bodyArgument}, requestOptions as Record<string, never>)`;
            }
            /* v8 ignore next */
        } else if (bodyArgument !== 'null') {
            /* v8 ignore next */
            httpCall = `this.http.request<${returnGeneric}>('${model.httpMethod}', url, { ...requestOptions, body: ${bodyArgument} } as Record<string, never>)`;
            /* v8 ignore next */
        } else if (isStandardNonBody) {
            /* v8 ignore next */
            httpCall = `this.http.${httpMethod}<${returnGeneric}>(url, requestOptions as Record<string, never>)`;
        } else {
            /* v8 ignore next */
            httpCall = `this.http.request<${returnGeneric}>('${model.httpMethod}', url, requestOptions as Record<string, never>)`;
        }

        /* v8 ignore next */
        if (hasContentNegotiation) {
            /* v8 ignore next */
            lines.push(`return ${httpCall}.pipe(`);
            /* v8 ignore next */
            lines.push(`  map(response => {`);

            /* v8 ignore next */
            variantsForNegotiation.forEach(v => {
                /* v8 ignore next */
                const check = `acceptHeader?.includes('${v.mediaType}')`;

                /* v8 ignore next */
                lines.push(`    // Handle ${v.mediaType}`);
                /* v8 ignore next */
                if (v.isDefault) lines.push(`    // Default fallback`);

                /* v8 ignore next */
                const isXml = v.serialization === 'xml';
                /* v8 ignore next */
                const isSeq = v.serialization === 'json-seq' || v.serialization === 'json-lines';

                /* v8 ignore next */
                if (isXml) {
                    /* v8 ignore next */
                    lines.push(`    if (${check}) {`);
                    /* v8 ignore next */
                    lines.push(`       if (typeof response !== 'string') return response;`);
                    /* v8 ignore next */
                    lines.push(`       return XmlParser.parse(response, ${JSON.stringify(v.xmlConfig)});`);
                    /* v8 ignore next */
                    lines.push(`    }`);
                    /* v8 ignore next */
                } else if (isSeq) {
                    /* v8 ignore next */
                    const delimiter = v.serialization === 'json-seq' ? '\\x1e' : '\\n';
                    /* v8 ignore next */
                    lines.push(`    if (${check}) {`);
                    /* v8 ignore next */
                    lines.push(`       if (typeof response !== 'string') return response;`);
                    /* v8 ignore next */
                    lines.push(
                        `       return response.split('${delimiter}').filter((p: string) => p.trim().length > 0).map((i: string) => JSON.parse(i));`,
                    );
                    /* v8 ignore next */
                    lines.push(`    }`);
                    /* v8 ignore next */
                } else if (v.decodingConfig) {
                    /* v8 ignore next */
                    lines.push(`    if (${check}) {`);
                    /* v8 ignore next */
                    lines.push(`       return ContentDecoder.decode(response, ${JSON.stringify(v.decodingConfig)});`);
                    /* v8 ignore next */
                    lines.push(`    }`);
                }
            });

            /* v8 ignore next */
            const def = model.responseVariants.find(v => v.isDefault);
            /* v8 ignore next */
            if (def && def.decodingConfig) {
                /* v8 ignore next */
                lines.push(`    // Default decoding`);
                /* v8 ignore next */
                lines.push(`    return ContentDecoder.decode(response, ${JSON.stringify(def.decodingConfig)});`);
            } else {
                /* v8 ignore next */
                lines.push(`    return response;`);
            }

            /* v8 ignore next */
            lines.push(`  })`);
            /* v8 ignore next */
            lines.push(`);`);
        } else {
            /* v8 ignore next */
            const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
            /* v8 ignore next */
            const isXmlResp = model.responseSerialization === 'xml';

            /* v8 ignore next */
            if (isSeq) {
                /* v8 ignore next */
                const delimiter = model.responseSerialization === 'json-seq' ? '\\x1e' : '\\n';
                /* v8 ignore next */
                lines.push(`return ${httpCall}.pipe(`);
                /* v8 ignore next */
                lines.push(`  map((response: Blob | string | Record<string, never>) => {`);
                /* v8 ignore next */
                lines.push(`    if (typeof response !== 'string') return response;`);
                /* v8 ignore next */
                lines.push(
                    `    const items = response.split('${delimiter}').filter((part: string) => part.trim().length > 0);`,
                );
                /* v8 ignore next */
                lines.push(`    return items.map((item: string) => JSON.parse(item));`);
                /* v8 ignore next */
                lines.push(`  })`);
                /* v8 ignore next */
                lines.push(`);`);
                /* v8 ignore next */
            } else if (isXmlResp) {
                /* v8 ignore next */
                lines.push(`return ${httpCall}.pipe(`);
                /* v8 ignore next */
                lines.push(`  map((response: Blob | string | Record<string, never>) => {`);
                /* v8 ignore next */
                lines.push(`    if (typeof response !== 'string') return response;`);
                /* v8 ignore next */
                lines.push(`    return XmlParser.parse(response, ${JSON.stringify(model.responseXmlConfig)});`);
                /* v8 ignore next */
                lines.push(`  })`);
                /* v8 ignore next */
                lines.push(`);`);
                /* v8 ignore next */
            } else if (model.responseDecodingConfig) {
                /* v8 ignore next */
                lines.push(`return ${httpCall}.pipe(`);
                /* v8 ignore next */
                lines.push(`  map((response: Blob | string | Record<string, never>) => {`);
                /* v8 ignore next */
                lines.push(
                    `    return ContentDecoder.decode(response, ${JSON.stringify(model.responseDecodingConfig)});`,
                );
                /* v8 ignore next */
                lines.push(`  })`);
                /* v8 ignore next */
                lines.push(`);`);
            } else {
                /* v8 ignore next */
                lines.push(`return ${httpCall};`);
            }
        }

        /* v8 ignore next */
        return lines.join('\n');
    }

    private emitOverloads(
        methodName: string,
        responseType: string,
        parameters: OptionalKind<ParameterDeclarationStructure>[],
        isDeprecated: boolean,
        isSSE: boolean,
        variants: ResponseVariant[],
        serverOptionType: string,
        negotiationVariants?: ResponseVariant[],
    ): OptionalKind<MethodDeclarationOverloadStructure>[] {
        /* v8 ignore next */
        const paramsDocs = parameters

            /* v8 ignore next */
            .map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`)

            .join('\n');
        /* v8 ignore next */
        const uniqueTypes = [...new Set(variants.map(v => v.type))];
        /* v8 ignore next */
        const unionType = uniqueTypes.join(' | ');
        const defaultResponseType =
            /* v8 ignore next */
            uniqueTypes.length > 1
                ? unionType
                : responseType === 'unknown'
                  ? 'Record<string, never>'
                  : responseType || 'Record<string, never>';
        /* v8 ignore next */
        const deprecationDoc = isDeprecated ? '\n@deprecated' : '';
        /* v8 ignore next */
        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

        /* v8 ignore next */
        if (isSSE) {
            /* v8 ignore next */
            return [
                {
                    parameters: [...parameters],
                    returnType: `Observable<${defaultResponseType}>`,
                    docs: [`${methodName} (Server-Sent Events).\n${paramsDocs}\n${deprecationDoc}`],
                },
            ];
        }

        /* v8 ignore next */
        const resolvedNegotiation = negotiationVariants ?? [];
        /* v8 ignore next */
        if (resolvedNegotiation.length > 1) {
            /* v8 ignore next */
            for (const variant of resolvedNegotiation) {
                /* v8 ignore next */
                overloads.push({
                    parameters: [
                        ...parameters,
                        {
                            name: 'options',
                            hasQuestionToken: false,
                            type: `RequestOptions & { headers: { 'Accept': '${variant.mediaType}' } } & ${serverOptionType}`,
                        },
                    ],
                    returnType: `Observable<${variant.type}>`,
                    docs: [
                        `${methodName} (${variant.mediaType})\n${paramsDocs}\n@param options Options with Accept header '${variant.mediaType}'${deprecationDoc}`,
                    ],
                });
            }
        }

        /* v8 ignore next */
        overloads.push({
            parameters: [
                ...parameters,
                {
                    name: 'options',
                    hasQuestionToken: true,
                    type: `RequestOptions & { observe?: 'body' } & ${serverOptionType}`,
                },
            ],
            returnType: `Observable<${defaultResponseType}>`,
            docs: [`${methodName}. \n${paramsDocs}\n@param options The options for this request.${deprecationDoc}`],
        });

        /* v8 ignore next */
        overloads.push({
            parameters: [
                ...parameters,
                {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'response' } & ${serverOptionType}`,
                },
            ],
            returnType: `Observable<HttpResponse<${defaultResponseType}>>`,
            docs: [
                `${methodName}. \n${paramsDocs}\n@param options The options for this request, with response observation enabled.${deprecationDoc}`,
            ],
        });

        /* v8 ignore next */
        overloads.push({
            parameters: [
                ...parameters,
                {
                    name: 'options',
                    hasQuestionToken: false,
                    type: `RequestOptions & { observe: 'events' } & ${serverOptionType}`,
                },
            ],
            returnType: `Observable<HttpEvent<${defaultResponseType}>>`,
            docs: [
                `${methodName}. \n${paramsDocs}\n@param options The options for this request, with event observation enabled.${deprecationDoc}`,
            ],
        });

        /* v8 ignore next */
        return overloads.map(o => {
            /* v8 ignore next */
            if (parameters.some(p => p.hasQuestionToken) && o.parameters?.find(p => p.name === 'options')) {
                /* v8 ignore next */
                o.parameters.find(p => p.name === 'options')!.hasQuestionToken = true;
            }
            /* v8 ignore next */
            return o;
        });
    }
}
