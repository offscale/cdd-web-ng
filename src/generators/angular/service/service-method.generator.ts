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
} from '@src/core/types/index.js';
import { SwaggerParser } from '@src/core/parser.js';
import { ServiceMethodAnalyzer } from '@src/analysis/service-method-analyzer.js';
import { ResponseVariant, ServiceMethodModel, ParamSerialization } from '@src/analysis/service-method-types.js';
import { camelCase, pascalCase, sanitizeComment } from '@src/core/utils/index.js';

export class ServiceMethodGenerator {
    private analyzer: ServiceMethodAnalyzer;

    constructor(
        private readonly config: GeneratorConfig,
        readonly parser: SwaggerParser,
    ) {
        this.analyzer = new ServiceMethodAnalyzer(config, parser);
    }

    public addServiceMethod(classDeclaration: ClassDeclaration, operation: PathInfo): void {
        const model = this.analyzer.analyze(operation);
        if (!model) {
            console.warn(
                `[ServiceMethodGenerator] Skipping method generation for operation without a methodName detected.`,
            );
            return;
        }

        let errorTypeAlias: string | undefined;
        if (model.errorResponses && model.errorResponses.length > 0) {
            const typeName = `${pascalCase(model.methodName)}Error`;
            const union = [...new Set(model.errorResponses.map(e => e.type))].join(' | ');
            classDeclaration.getSourceFile().addTypeAlias({
                name: typeName,
                isExported: true,
                type: union,
                docs: [`Error union for ${model.methodName}`],
            });
            errorTypeAlias = typeName;
        }

        const isSSE = model.responseSerialization === 'sse';
        const serverOptionType = '{ server?: number | string; serverVariables?: Record<string, string> }';

        const negotiationVariants = this.getDistinctNegotiationVariants(model.responseVariants);
        const hasContentNegotiation = negotiationVariants.length > 1;
        const distinctTypes = [...new Set(model.responseVariants.map(v => v.type))];
        const hasMultipleSuccessTypes = distinctTypes.length > 1;

        const bodyStatements = this.emitMethodBody(model, operation, isSSE, hasContentNegotiation, negotiationVariants);
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

        let returnType = `Observable<${model.responseType}>`;
        if (hasContentNegotiation || hasMultipleSuccessTypes) {
            const unionType = distinctTypes.join(' | ');
            returnType = `Observable<${unionType}>`;
        }

        const paramTags = this.buildParamTags(operation, model.parameters);
        const responseTags = this.buildResponseTags(operation);
        const exampleTags = this.buildExampleTags(operation, model.parameters);
        const metaTags = this.buildOperationMetaTags(operation);
        const docLines: string[] = [];
        if (model.docs) docLines.push(model.docs);
        if (operation.operationId) docLines.push(`@operationId ${operation.operationId}`);
        if (metaTags.length > 0) docLines.push(...metaTags);
        if (paramTags.length > 0) docLines.push(...paramTags);
        if (exampleTags.length > 0) docLines.push(...exampleTags);
        if (errorTypeAlias) docLines.push(`@throws {${errorTypeAlias}}`);
        if (responseTags.length > 0) docLines.push(...responseTags);
        const docs = docLines.length > 0 ? [docLines.join('\n')] : [];

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
        if (!operation.responses) return [];
        const tags: string[] = [];

        Object.entries(operation.responses).forEach(([code, resp]) => {
            const description = resp?.description ? sanitizeComment(resp.description) : '';
            const summary = resp?.summary ? sanitizeComment(resp.summary) : '';
            const mediaTypes = resp?.content ? this.filterMediaTypes(Object.keys(resp.content)) : [];

            if (mediaTypes.length === 0) {
                tags.push(`@response ${code}${description ? ` ${description}` : ''}`);
                if (summary) tags.push(`@responseSummary ${code} ${summary}`);
                return;
            }

            mediaTypes.forEach(mediaType => {
                const base = `@response ${code} ${mediaType}`;
                tags.push(description ? `${base} ${description}` : base);
            });
            if (summary) tags.push(`@responseSummary ${code} ${summary}`);
        });

        return tags;
    }

    private buildParamTags(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string[] {
        const tags: string[] = [];
        const paramNames = new Set(
            parameters
                .map(p => p.name)
                .filter((name): name is string => typeof name === 'string' && name.length > 0 && name !== 'options'),
        );
        const opParamNames = new Set(
            (operation.parameters ?? []).map(param => camelCase(param.name)).filter(name => paramNames.has(name)),
        );

        (operation.parameters ?? []).forEach(param => {
            const paramName = camelCase(param.name);
            if (!paramNames.has(paramName)) return;
            if (!param.description) return;
            const desc = sanitizeComment(param.description);
            if (desc) tags.push(`@param ${paramName} ${desc}`);
        });

        if (operation.requestBody?.description) {
            const bodyParam = parameters.find(
                p => typeof p.name === 'string' && !opParamNames.has(p.name) && p.name !== 'options',
            );
            if (bodyParam?.name) {
                const desc = sanitizeComment(operation.requestBody.description);
                if (desc) tags.push(`@param ${bodyParam.name} ${desc}`);
            }
        }

        return tags;
    }

    private buildExampleTags(operation: PathInfo, parameters: OptionalKind<ParameterDeclarationStructure>[]): string[] {
        const tags: string[] = [];
        const paramNames = new Set(
            parameters
                .map(p => p.name)
                .filter((name): name is string => typeof name === 'string' && name.length > 0 && name !== 'options'),
        );
        const opParamNames = new Set(
            (operation.parameters ?? []).map(param => camelCase(param.name)).filter(name => paramNames.has(name)),
        );

        (operation.parameters ?? []).forEach(param => {
            const paramName = camelCase(param.name);
            if (!paramNames.has(paramName)) return;
            const example = this.extractParameterExample(param);
            const serialized = this.serializeExampleValue(example);
            if (serialized !== undefined) {
                tags.push(`@paramExample ${paramName} ${serialized}`);
            }
        });

        const bodyParam = parameters.find(
            p => typeof p.name === 'string' && !opParamNames.has(p.name) && p.name !== 'options',
        );
        if (bodyParam?.name && operation.requestBody) {
            const requestExamples = this.extractRequestBodyExamples(operation.requestBody);
            requestExamples.forEach(entry => {
                const serialized = this.serializeExampleValue(entry.value);
                if (serialized !== undefined) {
                    tags.push(`@requestExample ${entry.mediaType} ${serialized}`);
                }
            });
        }

        if (operation.responses) {
            Object.entries(operation.responses).forEach(([code, response]) => {
                const resolved =
                    this.parser.resolve<SwaggerResponse>(response as ReferenceLike) ?? (response as SwaggerResponse);
                if (!resolved?.content) return;
                Object.entries(resolved.content).forEach(([mediaType, mediaObj]) => {
                    const example = this.extractMediaTypeExample(mediaObj, mediaType);
                    const serialized = this.serializeExampleValue(example);
                    if (serialized !== undefined) {
                        tags.push(`@responseExample ${code} ${mediaType} ${serialized}`);
                    }
                });
            });
        }

        return tags;
    }

    private serializeExampleValue(value: unknown): string | undefined {
        if (value === undefined) return undefined;
        try {
            return JSON.stringify(value);
        } catch {
            return undefined;
        }
    }

    private extractExampleValue(
        exampleObj: unknown,
        preferSerialized = false,
    ): { found: boolean; value: unknown; kind?: 'data' | 'value' | 'serialized' | 'external' } {
        if (!exampleObj || typeof exampleObj !== 'object') return { found: false, value: undefined };
        if (preferSerialized) {
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'serializedValue')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).serializedValue,
                    kind: 'serialized',
                };
            }
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'externalValue')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).externalValue,
                    kind: 'external',
                };
            }
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'dataValue')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).dataValue,
                    kind: 'data',
                };
            }
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'value')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).value,
                    kind: 'value',
                };
            }
        } else {
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'dataValue')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).dataValue,
                    kind: 'data',
                };
            }
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'value')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).value,
                    kind: 'value',
                };
            }
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'serializedValue')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).serializedValue,
                    kind: 'serialized',
                };
            }
            if (Object.prototype.hasOwnProperty.call(exampleObj, 'externalValue')) {
                return {
                    found: true,
                    value: (exampleObj as Record<string, unknown>).externalValue,
                    kind: 'external',
                };
            }
        }
        return { found: false, value: undefined };
    }

    private wrapExampleValue(picked: { value: unknown; kind?: 'data' | 'value' | 'serialized' | 'external' }): unknown {
        if (picked.kind === 'serialized') {
            return { __oasExample: { serializedValue: picked.value } };
        }
        if (picked.kind === 'external') {
            return { __oasExample: { externalValue: picked.value } };
        }
        return picked.value;
    }

    private extractParameterExample(param: Parameter): unknown | undefined {
        if (param.example !== undefined) return param.example;

        if (param.examples && typeof param.examples === 'object') {
            const firstExample = Object.values(param.examples)[0];
            if (firstExample !== undefined) {
                const resolved = this.parser.resolve(firstExample as ReferenceLike) ?? firstExample;
                const picked = this.extractExampleValue(resolved, true);
                if (picked.found) return this.wrapExampleValue(picked);
                if (resolved !== null && typeof resolved !== 'object') return resolved;
            }
        }

        if (
            param.schema &&
            typeof param.schema === 'object' &&
            !Array.isArray(param.schema) &&
            !('$ref' in param.schema)
        ) {
            const schema = param.schema as Record<string, unknown>;
            if (schema.dataValue !== undefined) return schema.dataValue;
            if (schema.example !== undefined) return schema.example;
            if (Array.isArray(schema.examples) && schema.examples.length > 0) return schema.examples[0];
        }

        if (param.content) {
            const mediaType = Object.keys(param.content)[0];
            const mediaObj = mediaType ? param.content[mediaType] : undefined;
            const example = mediaObj ? this.extractMediaTypeExample(mediaObj, mediaType) : undefined;
            if (example !== undefined) return example;
        }

        return undefined;
    }

    private extractMediaTypeExample(
        mediaObj: MediaTypeObject | ReferenceLike,
        mediaType?: string,
    ): unknown | undefined {
        const resolved =
            this.parser.resolve<MediaTypeObject>(mediaObj as ReferenceLike) ?? (mediaObj as MediaTypeObject);
        if (!resolved) return undefined;
        if (resolved.example !== undefined) return resolved.example;
        if (resolved.examples && typeof resolved.examples === 'object') {
            const firstExample = Object.values(resolved.examples)[0];
            if (firstExample !== undefined) {
                const resolvedExample = this.parser.resolve(firstExample as ReferenceLike) ?? firstExample;
                const preferSerialized = this.shouldPreferSerializedExample(mediaType);
                const picked = this.extractExampleValue(resolvedExample, preferSerialized);
                if (picked.found) return this.wrapExampleValue(picked);
                if (resolvedExample !== null && typeof resolvedExample !== 'object') return resolvedExample;
            }
        }
        return undefined;
    }

    private extractRequestBodyExamples(requestBody: RequestBody): { mediaType: string; value: unknown }[] {
        const entries: { mediaType: string; value: unknown }[] = [];
        const content = requestBody.content ?? {};
        Object.entries(content).forEach(([mediaType, mediaObj]) => {
            const example = this.extractMediaTypeExample(mediaObj, mediaType);
            if (example !== undefined) {
                entries.push({ mediaType, value: example });
            }
        });
        return entries;
    }

    private buildOperationMetaTags(operation: PathInfo): string[] {
        const tags: string[] = [];

        if (operation.tags && operation.tags.length > 0) {
            const joined = operation.tags

                .map(t => String(t).trim())
                .filter(Boolean)
                .join(', ');
            if (joined) {
                tags.push(`@tags ${joined}`);
            }
        }

        if (operation.externalDocs?.url) {
            const desc = sanitizeComment(operation.externalDocs.description);
            tags.push(`@see ${operation.externalDocs.url}${desc ? ` ${desc}` : ''}`);
        }

        const rawOperation = this.getRawOperation(operation);

        if (rawOperation && Object.prototype.hasOwnProperty.call(rawOperation, 'servers')) {
            const servers = rawOperation.servers ?? [];
            tags.push(`@server ${JSON.stringify(servers)}`);
        }

        if (rawOperation && Object.prototype.hasOwnProperty.call(rawOperation, 'security')) {
            const security = rawOperation.security ?? [];
            tags.push(`@security ${JSON.stringify(security)}`);
        }

        const querystringParam = (operation.parameters ?? []).find(
            p => (p as Record<string, unknown>).in === 'querystring',
        );
        if (querystringParam) {
            const contentType = querystringParam.content ? Object.keys(querystringParam.content)[0] : undefined;
            const encoding =
                contentType && querystringParam.content?.[contentType]?.encoding
                    ? querystringParam.content[contentType]!.encoding
                    : undefined;
            const meta: Record<string, unknown> = {
                name: querystringParam.name,
            };
            if (contentType) meta.contentType = contentType;
            if (encoding && typeof encoding === 'object') meta.encoding = encoding;
            if (typeof querystringParam.required === 'boolean') meta.required = querystringParam.required;
            if (querystringParam.description) meta.description = sanitizeComment(querystringParam.description);
            tags.push(`@querystring ${JSON.stringify(meta)}`);
        }

        Object.entries(operation).forEach(([key, value]) => {
            if (!key.startsWith('x-')) return;
            if (value === undefined) {
                tags.push(`@${key}`);
                return;
            }
            tags.push(`@${key} ${JSON.stringify(value)}`);
        });

        return tags;
    }

    private getRawOperation(operation: PathInfo): Record<string, unknown> | undefined {
        const pathItem = this.parser.spec.paths?.[operation.path];
        if (!pathItem || typeof pathItem !== 'object') return undefined;

        const methodKey = operation.method.toLowerCase();
        const direct = (pathItem as Record<string, unknown>)[methodKey];
        if (direct) return direct as Record<string, unknown>;

        const additional = (pathItem as Record<string, unknown>).additionalOperations as
            | Record<string, unknown>
            | undefined;
        if (!additional) return undefined;

        for (const [key, value] of Object.entries(additional)) {
            if (key.toLowerCase() === methodKey) return value as Record<string, unknown>;
        }

        return undefined;
    }

    private normalizeMediaType(mediaType: string): string {
        return mediaType.split(';')[0]?.trim().toLowerCase() || '';
    }

    private isJsonMediaType(mediaType?: string): boolean {
        if (!mediaType) return false;
        const normalized = this.normalizeMediaType(mediaType);
        if (!normalized) return false;
        if (normalized === 'application/json') return true;
        return normalized.endsWith('+json');
    }

    private isXmlMediaType(mediaType?: string): boolean {
        if (!mediaType) return false;
        const normalized = this.normalizeMediaType(mediaType);
        if (!normalized) return false;
        return normalized === 'application/xml' || normalized.endsWith('+xml') || normalized.includes('/xml');
    }

    private getXmlParameterEntry(
        param: Parameter,
    ): { mediaType: string; schema: SwaggerDefinition | boolean } | undefined {
        if (!param.content) return undefined;
        for (const [mediaType, mediaObj] of Object.entries(param.content)) {
            if (!this.isXmlMediaType(mediaType)) continue;
            if (!mediaObj || typeof mediaObj !== 'object') continue;
            const schema = (mediaObj as MediaTypeObject).schema;
            if (schema === undefined) continue;
            return { mediaType, schema };
        }
        return undefined;
    }

    private shouldPreferSerializedExample(mediaType?: string): boolean {
        if (!mediaType) return false;
        const normalized = this.normalizeMediaType(mediaType);
        if (!normalized) return false;
        return !this.isJsonMediaType(normalized);
    }

    private mediaTypeSpecificity(normalized: string): number {
        if (!normalized) return 0;
        if (normalized === '*/*') return 0;
        const [type, subtype] = normalized.split('/');
        if (!type || !subtype) return 0;
        if (type.includes('*') || subtype.includes('*')) return 1;
        return 2;
    }

    private matchesMediaType(range: string, candidate: string): boolean {
        const [rangeType, rangeSubtype] = range.split('/');
        const [candType, candSubtype] = candidate.split('/');
        if (!rangeType || !rangeSubtype || !candType || !candSubtype) return false;
        if (rangeType !== '*' && rangeType !== candType) return false;

        if (rangeSubtype === '*') return true;
        if (!rangeSubtype.includes('*')) return rangeSubtype === candSubtype;

        const escaped = rangeSubtype.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
        const regex = new RegExp(`^${escaped}$`);
        return regex.test(candSubtype);
    }

    private filterMediaTypes(mediaTypes: string[]): string[] {
        const entries: { raw: string; normalized: string; specificity: number }[] = [];
        const seen = new Set<string>();

        mediaTypes.forEach(raw => {
            const normalized = this.normalizeMediaType(raw);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            entries.push({ raw, normalized, specificity: this.mediaTypeSpecificity(normalized) });
        });

        return entries

            .filter(candidate => {
                if (candidate.specificity === 2) return true;
                return !entries.some(
                    other =>
                        other !== candidate &&
                        other.specificity > candidate.specificity &&
                        this.matchesMediaType(candidate.normalized, other.normalized),
                );
            })
            .map(entry => entry.raw);
    }

    private getDistinctNegotiationVariants(variants: ResponseVariant[]): ResponseVariant[] {
        const uniqueByMedia: ResponseVariant[] = [];
        const seen = new Set<string>();
        variants.forEach(variant => {
            if (!variant.mediaType) return;
            const normalized = this.normalizeMediaType(variant.mediaType);
            if (!normalized || seen.has(normalized)) return;
            seen.add(normalized);
            uniqueByMedia.push(variant);
        });

        const filteredMediaTypes = new Set(this.filterMediaTypes(uniqueByMedia.map(v => v.mediaType)));
        return uniqueByMedia.filter(v => filteredMediaTypes.has(v.mediaType));
    }

    private emitMethodBody(
        model: ServiceMethodModel,
        rawOp: PathInfo,
        isSSE: boolean,
        hasContentNegotiation: boolean,
        negotiationVariants?: ResponseVariant[],
    ): string {
        const lines: string[] = [];
        const variantsForNegotiation = hasContentNegotiation
            ? (negotiationVariants ?? model.responseVariants)
            : model.responseVariants;

        const xmlParams =
            rawOp.parameters

                ?.map(p => {
                    const entry = this.getXmlParameterEntry(p);
                    if (!entry) return undefined;
                    return { param: p, schema: entry.schema };
                })
                .filter((p): p is { param: Parameter; schema: SwaggerDefinition | boolean } => !!p) ?? [];
        xmlParams.forEach(({ param, schema }) => {
            const paramName = camelCase(param.name);
            const rootName = typeof schema === 'object' && schema.xml?.name ? schema.xml.name : param.name;
            const xmlConfig = (
                this.analyzer as unknown as { getXmlConfig: (a: unknown, b: number) => unknown }
            ).getXmlConfig(schema, 5);
            lines.push(`let ${paramName}Serialized: any = ${paramName};`);
            lines.push(`if (${paramName} !== null && ${paramName} !== undefined) {`);
            lines.push(
                `  ${paramName}Serialized = XmlBuilder.serialize(${paramName}, '${rootName}', ${JSON.stringify(xmlConfig)});`,
            );
            lines.push(`}`);
        });

        let urlTemplate = model.urlTemplate;
        model.pathParams.forEach((p: ParamSerialization) => {
            const pathArgs: string[] = [
                `'${p.originalName}'`,
                p.paramName,
                `'${p.style || 'simple'}'`,
                `${p.explode}`,
                `${p.allowReserved}`,
            ];
            if (p.serializationLink === 'json' || p.contentEncoderConfig) {
                pathArgs.push(p.serializationLink === 'json' ? "'json'" : 'undefined');
            }
            if (p.contentEncoderConfig) {
                pathArgs.push(JSON.stringify(p.contentEncoderConfig));
            }
            const serializeCall = `ParameterSerializer.serializePathParam(${pathArgs.join(', ')})`;
            urlTemplate = urlTemplate.replace(`{${p.originalName}}`, `\${${serializeCall}}`);
        });

        const qsParam = rawOp.parameters?.find((p: Parameter) => (p.in as string) === 'querystring');
        let queryStringVariable = '';
        if (qsParam) {
            const pName = camelCase(qsParam.name);
            const contentKeys = qsParam.content ? Object.keys(qsParam.content) : [];
            const contentType = contentKeys.length > 0 ? contentKeys[0] : undefined;
            const isJson =
                qsParam.content?.['application/json'] || (contentType && contentType.includes('application/json'));
            const qsConfig = model.queryParams.find(p => p.originalName === qsParam.name);

            const encodingConfig =
                contentType && qsParam.content?.[contentType]?.encoding
                    ? qsParam.content[contentType]?.encoding
                    : undefined;

            const serializationArg = isJson ? "'json'" : 'undefined';
            const contentTypeArg = !isJson && contentType ? `'${contentType}'` : 'undefined';
            const encodingArg = encodingConfig ? JSON.stringify(encodingConfig) : 'undefined';
            const encoderArg = qsConfig?.contentEncoderConfig
                ? JSON.stringify(qsConfig.contentEncoderConfig)
                : 'undefined';

            const args = [pName, serializationArg, contentTypeArg, encodingArg, encoderArg];
            while (args.length > 1 && args[args.length - 1] === 'undefined') {
                args.pop();
            }

            lines.push(`const queryString = ParameterSerializer.serializeRawQuerystring(${args.join(', ')});`);
            queryStringVariable = "${queryString ? '?' + queryString : ''}";
        }

        if (model.operationServers && model.operationServers.length > 0) {
            lines.push(`const operationServers = ${JSON.stringify(model.operationServers, null, 2)};`);
            lines.push(
                `const basePath = resolveServerUrl(operationServers, options?.server ?? 0, options?.serverVariables ?? {});`,
            );
        } else {
            lines.push(
                `const basePath = (options?.server !== undefined || options?.serverVariables !== undefined) ? getServerUrl(options?.server ?? 0, options?.serverVariables ?? {}) : this.basePath;`,
            );
        }
        lines.push(`const url = \`\${basePath}${urlTemplate}${queryStringVariable}\`;`);

        const standardQueryParams = model.queryParams.filter(p => p.originalName !== qsParam?.name);

        if (standardQueryParams.length > 0) {
            lines.push(
                `let params = new HttpParams({ encoder: new ApiParameterCodec(), fromObject: options?.params ?? {} });`,
            );
            standardQueryParams.forEach((p: ParamSerialization) => {
                const configObj = JSON.stringify({
                    name: p.originalName,
                    in: 'query',
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    serialization: p.serializationLink,
                    allowEmptyValue: (p as unknown as Record<string, unknown>).allowEmptyValue,
                    ...(p.contentType ? { contentType: p.contentType } : {}),
                    ...(p.encoding ? { encoding: p.encoding } : {}),
                    ...(p.contentEncoderConfig ? { contentEncoderConfig: p.contentEncoderConfig } : {}),
                });
                lines.push(
                    `const serialized_${p.paramName} = ParameterSerializer.serializeQueryParam(${configObj}, ${p.paramName});`,
                );
                lines.push(
                    `serialized_${p.paramName}.forEach((entry: any) => params = params.append(entry.key, entry.value));`,
                );
            });
        }

        lines.push(
            `let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});`,
        );
        model.headerParams.forEach((p: ParamSerialization) => {
            const headerArgs: string[] = [p.paramName, `${p.explode}`];
            const hasEncoderConfig = !!p.contentEncoderConfig;
            if (p.serializationLink === 'json') {
                headerArgs.push("'json'");
            } else if (p.contentType || p.encoding || hasEncoderConfig) {
                headerArgs.push('undefined');
            }
            if (p.contentType) {
                headerArgs.push(`'${p.contentType}'`);
            } else if (p.encoding || hasEncoderConfig) {
                headerArgs.push('undefined');
            }
            if (p.encoding) {
                headerArgs.push(JSON.stringify(p.encoding));
            } else if (hasEncoderConfig) {
                headerArgs.push('undefined');
            }
            if (hasEncoderConfig) {
                headerArgs.push(JSON.stringify(p.contentEncoderConfig));
            }
            lines.push(
                `if (${p.paramName} != null) { headers = headers.set('${p.originalName}', ParameterSerializer.serializeHeaderParam(${headerArgs.join(', ')})); }`,
            );
        });

        if (model.cookieParams.length > 0) {
            if (this.config.options.platform !== 'node') {
                lines.push(`// WARNING: Setting 'Cookie' headers manually is forbidden in browsers.`);
                lines.push(
                    `if (typeof window !== 'undefined') { console.warn('Operation ${model.methodName} attempts to set "Cookie" header manually. This will fail in browsers.'); }`,
                );
            }
            lines.push(`const __cookies: string[] = [];`);
            model.cookieParams.forEach((p: ParamSerialization) => {
                const hasEncoderConfig = !!p.contentEncoderConfig;
                const hint = p.serializationLink === 'json' ? ", 'json'" : hasEncoderConfig ? ', undefined' : '';
                const encoderArg = hasEncoderConfig ? `, ${JSON.stringify(p.contentEncoderConfig)}` : '';
                lines.push(
                    `if (${p.paramName} != null) { __cookies.push(ParameterSerializer.serializeCookieParam('${p.originalName}', ${p.paramName}, '${p.style || 'form'}', ${p.explode}, ${p.allowReserved}${hint}${encoderArg})); }`,
                );
            });
            lines.push(`if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }`);
        }

        if (hasContentNegotiation) {
            lines.push(`const acceptHeader = headers.get('Accept');`);
        }

        let contextConstruction = `this.createContextWithClientId(options?.context)`;
        if (model.security.length > 0) {
            contextConstruction += `.set(SECURITY_CONTEXT_TOKEN, ${JSON.stringify(model.security)})`;
        }
        if (model.extensions && Object.keys(model.extensions).length > 0) {
            contextConstruction += `.set(EXTENSIONS_CONTEXT_TOKEN, ${JSON.stringify(model.extensions)})`;
        }

        let responseTypeVal = `options?.responseType`;

        if (hasContentNegotiation) {
            const xmlOrSeqCondition = variantsForNegotiation

                .filter(v => v.serialization === 'xml' || v.serialization.startsWith('json-'))

                .map(v => `acceptHeader?.includes('${v.mediaType}')`)

                .join(' || ');

            const binaryCondition = variantsForNegotiation

                .filter(v => v.serialization === 'blob' || v.serialization === 'arraybuffer')

                .map(v => `acceptHeader?.includes('${v.mediaType}')`)

                .join(' || ');

            if (binaryCondition || xmlOrSeqCondition) {
                const binaryResponseType = variantsForNegotiation.some(v => v.serialization === 'arraybuffer')
                    ? 'arraybuffer'
                    : 'blob';
                responseTypeVal = `(${binaryCondition || 'false'}) ? '${binaryResponseType}' : (${xmlOrSeqCondition || 'false'}) ? 'text' : (options?.responseType ?? 'json')`;
            }
        } else {
            const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
            const isXmlResp = model.responseSerialization === 'xml';
            const isBinaryResp =
                model.responseSerialization === 'blob' || model.responseSerialization === 'arraybuffer';
            if (isBinaryResp) {
                responseTypeVal = `'${model.responseSerialization === 'arraybuffer' ? 'arraybuffer' : 'blob'}'`;
            } else if (isSeq || isXmlResp) {
                responseTypeVal = `'text'`;
            }
        }

        let optionProperties = `

  observe: options?.observe, 
  reportProgress: options?.reportProgress, 
  responseType: ${responseTypeVal}, 
  withCredentials: options?.withCredentials, 
  context: ${contextConstruction}`;

        if (standardQueryParams.length > 0) optionProperties += `,\n  params`;
        optionProperties += `,\n  headers`;

        lines.push(`let requestOptions: HttpRequestOptions = {${optionProperties}\n};`);

        let bodyArgument = 'null';
        const body = model.body;
        const legacyFormData = rawOp.parameters?.filter(p => (p as Record<string, unknown>).in === 'formData');
        const isUrlEnc = rawOp.consumes?.includes('application/x-www-form-urlencoded');

        if (legacyFormData && legacyFormData.length > 0) {
            if (isUrlEnc) {
                lines.push(`let formBody = new HttpParams();`);
                legacyFormData.forEach((p: Parameter) => {
                    const paramName = camelCase(p.name);
                    lines.push(`if (${paramName} != null) { formBody = formBody.append('${p.name}', ${paramName}); }`);
                });
                bodyArgument = 'formBody';
            } else {
                lines.push(`const formData = new FormData();`);
                legacyFormData.forEach((p: Parameter) => {
                    const paramName = camelCase(p.name);
                    lines.push(`if (${paramName} != null) { formData.append('${p.name}', ${paramName}); }`);
                });
                bodyArgument = 'formData';
            }
        } else if (body) {
            if (body.type === 'raw' || body.type === 'json') {
                bodyArgument = body.paramName;
                if (model.requestEncodingConfig) {
                    lines.push(`if (${body.paramName} !== null && ${body.paramName} !== undefined) {`);
                    lines.push(
                        `  ${body.paramName} = ContentEncoder.encode(${body.paramName}, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    lines.push(`}`);
                }
            } else if (body.type === 'urlencoded') {
                let encodedBodyName = body.paramName;
                if (model.requestEncodingConfig) {
                    encodedBodyName = 'encodedBody';
                    lines.push(`let encodedBody = ${body.paramName};`);
                    lines.push(`if (encodedBody !== null && encodedBody !== undefined) {`);
                    lines.push(
                        `  encodedBody = ContentEncoder.encode(encodedBody, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    lines.push(`}`);
                }
                lines.push(
                    `const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(${encodedBodyName}, ${JSON.stringify(body.config)});`,
                );
                lines.push(`let formBody = new HttpParams({ encoder: new ApiParameterCodec() });`);
                lines.push(
                    `urlParamEntries.forEach((entry: any) => formBody = formBody.append(entry.key, entry.value));`,
                );
                bodyArgument = 'formBody';
            } else if (body.type === 'json-lines' || body.type === 'json-seq') {
                const bodyVar = body.type === 'json-seq' ? 'jsonSeqBody' : 'jsonLinesBody';
                lines.push(`let ${bodyVar} = ${body.paramName};`);
                if (model.requestEncodingConfig) {
                    lines.push(`if (${bodyVar} !== null && ${bodyVar} !== undefined) {`);
                    lines.push(
                        `  ${bodyVar} = ContentEncoder.encode(${bodyVar}, ${JSON.stringify(model.requestEncodingConfig)});`,
                    );
                    lines.push(`}`);
                }

                if (body.type === 'json-seq') {
                    lines.push(`if (Array.isArray(${bodyVar})) {`);
                    lines.push(
                        `  ${bodyVar} = ${bodyVar}.map((item: any) => '\\x1e' + JSON.stringify(item)).join('');`,
                    );
                    lines.push(`} else if (${bodyVar} != null && typeof ${bodyVar} !== 'string') {`);
                    lines.push(`  ${bodyVar} = '\\x1e' + JSON.stringify(${bodyVar});`);
                    lines.push(`}`);
                } else {
                    lines.push(`if (Array.isArray(${bodyVar})) {`);
                    lines.push(`  ${bodyVar} = ${bodyVar}.map((item: any) => JSON.stringify(item)).join('\\n');`);
                    lines.push(`} else if (${bodyVar} != null && typeof ${bodyVar} !== 'string') {`);
                    lines.push(`  ${bodyVar} = JSON.stringify(${bodyVar});`);
                    lines.push(`}`);
                }

                bodyArgument = bodyVar;
            } else if (body.type === 'multipart') {
                lines.push(`const multipartConfig = ${JSON.stringify(body.config)};`);
                lines.push(`const multipartResult = MultipartBuilder.serialize(${body.paramName}, multipartConfig);`);
                lines.push(`if (multipartResult.headers) {`);
                lines.push(
                    `  let newHeaders = requestOptions.headers instanceof HttpHeaders ? requestOptions.headers : new HttpHeaders(requestOptions.headers || {});`,
                );
                lines.push(
                    `  Object.entries(multipartResult.headers).forEach(([k, v]) => { newHeaders = newHeaders.set(k, v as string); });`,
                );
                lines.push(`  headers = newHeaders;`);
                lines.push(`  requestOptions = { ...requestOptions, headers: newHeaders };`);
                lines.push(`}`);
                bodyArgument = 'multipartResult.content';
            } else if (body.type === 'xml') {
                lines.push(
                    `const xmlBody = XmlBuilder.serialize(${body.paramName}, '${body.rootName}', ${JSON.stringify(body.config)});`,
                );
                bodyArgument = 'xmlBody';
            }
        }

        if (body && model.requestContentType && body.type !== 'multipart' && body.type !== 'encoded-form-data') {
            lines.push(
                `if (${body.paramName} != null && !headers.has('Content-Type')) { headers = headers.set('Content-Type', '${model.requestContentType}'); }`,
            );
        }

        lines.push(`requestOptions = { ...requestOptions, headers };`);

        if (isSSE) {
            const sseMode = model.sseMode ?? 'data';
            const hasSseDecoding = model.responseDecodingConfig && Object.keys(model.responseDecodingConfig).length > 0;
            if (hasSseDecoding) {
                lines.push(`const sseDecodingConfig = ${JSON.stringify(model.responseDecodingConfig)};`);
            }
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
                            Object.entries(headers as any).forEach(([key, value]) => { 
                                if (Array.isArray(value)) { 
                                    value.forEach((v: any) => h.append(key, String(v))); 
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
                        Object.entries(headers as any).forEach(([key, value]) => { 
                            if (Array.isArray(value)) raw[key] = value.map((v: any) => String(v)).join(', '); 
                            else if (value !== undefined && value !== null) raw[key] = String(value); 
                        }); 
                    } 
                    return raw; 
                })(); 

                

                const fetchOptions: RequestInit = { method: '${model.httpMethod}', headers: fetchHeaders as any }; 
                if (abortController) fetchOptions.signal = abortController.signal; 

                if (options?.withCredentials) fetchOptions.credentials = 'include'; 

                ${bodyArgument !== 'null' ? `fetchOptions.body = ${bodyArgument} as any;` : ''} 

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
                        let payload: any; 
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
                        ${hasSseDecoding ? 'payload = ContentDecoder.decode(payload, sseDecodingConfig);' : ''} 

                        observer.next(payload as any); 
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

            return lines.join('\n');
        }

        const httpMethod = model.httpMethod.toLowerCase();
        const isStandardBody = ['post', 'put', 'patch', 'query'].includes(httpMethod);
        const isStandardNonBody = ['get', 'delete', 'head', 'options', 'jsonp'].includes(httpMethod);

        const returnGeneric = `any`;

        let httpCall: string;

        if (isStandardBody) {
            if (httpMethod === 'query') {
                httpCall = `this.http.request('QUERY', url, { ...requestOptions, body: ${bodyArgument} } as any)`;
            } else {
                httpCall = `this.http.${httpMethod}<${returnGeneric}>(url, ${bodyArgument}, requestOptions as any)`;
            }
        } else if (bodyArgument !== 'null') {
            httpCall = `this.http.request<${returnGeneric}>('${model.httpMethod}', url, { ...requestOptions, body: ${bodyArgument} } as any)`;
        } else if (isStandardNonBody) {
            httpCall = `this.http.${httpMethod}<${returnGeneric}>(url, requestOptions as any)`;
        } else {
            httpCall = `this.http.request<${returnGeneric}>('${model.httpMethod}', url, requestOptions as any)`;
        }

        if (hasContentNegotiation) {
            lines.push(`return ${httpCall}.pipe(`);
            lines.push(`  map(response => {`);

            variantsForNegotiation.forEach(v => {
                const check = `acceptHeader?.includes('${v.mediaType}')`;

                lines.push(`    // Handle ${v.mediaType}`);
                if (v.isDefault) lines.push(`    // Default fallback`);

                const isXml = v.serialization === 'xml';
                const isSeq = v.serialization === 'json-seq' || v.serialization === 'json-lines';

                if (isXml) {
                    lines.push(`    if (${check}) {`);
                    lines.push(`       if (typeof response !== 'string') return response;`);
                    lines.push(`       return XmlParser.parse(response, ${JSON.stringify(v.xmlConfig)});`);
                    lines.push(`    }`);
                } else if (isSeq) {
                    const delimiter = v.serialization === 'json-seq' ? '\\x1e' : '\\n';
                    lines.push(`    if (${check}) {`);
                    lines.push(`       if (typeof response !== 'string') return response;`);
                    lines.push(
                        `       return response.split('${delimiter}').filter((p: string) => p.trim().length > 0).map((i: string) => JSON.parse(i));`,
                    );
                    lines.push(`    }`);
                } else if (v.decodingConfig) {
                    lines.push(`    if (${check}) {`);
                    lines.push(`       return ContentDecoder.decode(response, ${JSON.stringify(v.decodingConfig)});`);
                    lines.push(`    }`);
                }
            });

            const def = model.responseVariants.find(v => v.isDefault);
            if (def && def.decodingConfig) {
                lines.push(`    // Default decoding`);
                lines.push(`    return ContentDecoder.decode(response, ${JSON.stringify(def.decodingConfig)});`);
            } else {
                lines.push(`    return response;`);
            }

            lines.push(`  })`);
            lines.push(`);`);
        } else {
            const isSeq = model.responseSerialization === 'json-seq' || model.responseSerialization === 'json-lines';
            const isXmlResp = model.responseSerialization === 'xml';

            if (isSeq) {
                const delimiter = model.responseSerialization === 'json-seq' ? '\\x1e' : '\\n';
                lines.push(`return ${httpCall}.pipe(`);
                lines.push(`  map((response: any) => {`);
                lines.push(`    if (typeof response !== 'string') return response;`);
                lines.push(
                    `    const items = response.split('${delimiter}').filter((part: string) => part.trim().length > 0);`,
                );
                lines.push(`    return items.map((item: string) => JSON.parse(item));`);
                lines.push(`  })`);
                lines.push(`);`);
            } else if (isXmlResp) {
                lines.push(`return ${httpCall}.pipe(`);
                lines.push(`  map((response: any) => {`);
                lines.push(`    if (typeof response !== 'string') return response;`);
                lines.push(`    return XmlParser.parse(response, ${JSON.stringify(model.responseXmlConfig)});`);
                lines.push(`  })`);
                lines.push(`);`);
            } else if (model.responseDecodingConfig) {
                lines.push(`return ${httpCall}.pipe(`);
                lines.push(`  map((response: any) => {`);
                lines.push(
                    `    return ContentDecoder.decode(response, ${JSON.stringify(model.responseDecodingConfig)});`,
                );
                lines.push(`  })`);
                lines.push(`);`);
            } else {
                lines.push(`return ${httpCall};`);
            }
        }

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
        const paramsDocs = parameters

            .map(p => `@param ${p.name} ${p.hasQuestionToken ? '(optional) ' : ''}`)

            .join('\n');
        const uniqueTypes = [...new Set(variants.map(v => v.type))];
        const unionType = uniqueTypes.join(' | ');
        const defaultResponseType =
            uniqueTypes.length > 1 ? unionType : responseType === 'any' ? 'any' : responseType || 'unknown';
        const deprecationDoc = isDeprecated ? '\n@deprecated' : '';
        const overloads: OptionalKind<MethodDeclarationOverloadStructure>[] = [];

        if (isSSE) {
            return [
                {
                    parameters: [...parameters],
                    returnType: `Observable<${defaultResponseType}>`,
                    docs: [`${methodName} (Server-Sent Events).\n${paramsDocs}\n${deprecationDoc}`],
                },
            ];
        }

        const resolvedNegotiation = negotiationVariants ?? [];
        if (resolvedNegotiation.length > 1) {
            for (const variant of resolvedNegotiation) {
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

        return overloads.map(o => {
            if (parameters.some(p => p.hasQuestionToken) && o.parameters?.find(p => p.name === 'options')) {
                o.parameters.find(p => p.name === 'options')!.hasQuestionToken = true;
            }
            return o;
        });
    }
}
