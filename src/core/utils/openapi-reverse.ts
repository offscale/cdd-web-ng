// src/core/utils/openapi-reverse.ts
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    ExampleObject,
    ExternalDocumentationObject,
    HeaderObject,
    InfoObject,
    LinkObject,
    MediaTypeObject,
    Parameter,
    PathItem,
    RequestBody,
    SecurityScheme,
    ServerObject,
    SwaggerResponse,
    SwaggerSpec,
    TagObject,
    SpecOperation,
    XmlObject,
} from '../types/index.js';
import { OAS_3_1_DIALECT } from '../constants.js';
import type { ReverseSchemaMap } from './openapi-reverse-models.js';

/** Reverse param location */
export type ReverseParamLocation = 'path' | 'query' | 'header' | 'cookie' | 'formData' | 'querystring' | 'body';

/** Reverse Param */
export interface ReverseParam {
    /** doc */
    name: string;
    /** doc */
    in: ReverseParamLocation;
    /** doc */
    required?: boolean;
    /** doc */
    description?: string;
    /** doc */
    example?: unknown;
    /** doc */
    contentType?: string;
    /** doc */
    serialization?: 'json';
    /** doc */
    encoding?: Record<string, unknown>;
    /** doc */
    contentEncoderConfig?: Record<string, unknown>;
    /** doc */
    contentEncoding?: string;
    /** doc */
    contentMediaType?: string;
    /** doc */
    style?: string;
    /** doc */
    explode?: boolean;
    /** doc */
    allowReserved?: boolean;
    /** doc */
    allowEmptyValue?: boolean;
    /** doc */
    typeHint?: string;
}

/** Reverse Operation */
export interface ReverseOperation {
    /** doc */
    methodName: string;
    /** doc */
    operationId?: string;
    /** doc */
    httpMethod: string;
    /** doc */
    path: string;
    /** doc */
    params: ReverseParam[];
    /** doc */
    requestMediaTypes: string[];
    /** doc */
    responseMediaTypes: string[];
    /** doc */
    requestEncoding?: ReverseRequestEncoding;
    /** doc */
    responseTypeHint?: string;
    /** doc */
    responseIsArray?: boolean;
    /** doc */
    responseHints?: ReverseResponseHint[];
    /** doc */
    paramExamples?: Record<string, unknown>;
    /** doc */
    requestExamples?: Record<string, unknown>;
    /** doc */
    responseExamples?: Record<string, Record<string, unknown>>;
    /** doc */
    security?: Record<string, string[]>[];
    /** doc */
    extensions?: Record<string, unknown>;
    /** doc */
    tags?: string[];
    /** doc */
    servers?: ServerObject[];
    /** doc */
    summary?: string;
    /** doc */
    description?: string;
    /** doc */
    deprecated?: boolean;
    /** doc */
    externalDocs?: ExternalDocumentationObject;
}

/** Reverse Service */
export interface ReverseService {
    /** doc */
    serviceName: string;
    /** doc */
    filePath: string;
    /** doc */
    operations: ReverseOperation[];
}

/** Reverse Request Encoding */
export interface ReverseRequestEncoding {
    /** doc */
    urlencoded?: Record<string, unknown>;
    /** doc */
    multipart?: ReverseMultipartConfig;
}

/** Reverse Multipart Config */
export interface ReverseMultipartConfig {
    /** doc */
    mediaType?: string;
    /** doc */
    encoding?: Record<string, unknown>;
    /** doc */
    prefixEncoding?: unknown[];
    /** doc */
    itemEncoding?: unknown;
}

/** Reverse Response Hint */
export interface ReverseResponseHint {
    /** doc */
    status: string;
    /** doc */
    mediaTypes?: string[];
    /** doc */
    summary?: string;
    /** doc */
    description?: string;
}

/** Reverse Callback Meta */
export interface ReverseCallbackMeta {
    /** doc */
    name: string;
    /** doc */
    method: string;
    /** doc */
    interfaceName?: string;
    /** doc */
    expression?: string;
    /** doc */
    pathItem?: PathItem;
    /** doc */
    scope?: 'component' | 'operation';
}

/** Reverse Webhook Meta */
export interface ReverseWebhookMeta {
    /** doc */
    name: string;
    /** doc */
    method: string;
    /** doc */
    interfaceName?: string;
    /** doc */
    pathItem?: PathItem;
    /** doc */
    scope?: 'root' | 'component';
}

/** Reverse Metadata */
export interface ReverseMetadata {
    /** doc */
    info?: InfoObject;
    /** doc */
    tags?: TagObject[];
    /** doc */
    externalDocs?: ExternalDocumentationObject;
    /** doc */
    inferredSelf?: string;
    /** doc */
    documentMeta?: {
        /** doc */
        openapi?: string;
        /** doc */
        swagger?: string;
        /** doc */
        $self?: string;
        /** doc */
        jsonSchemaDialect?: string;
        /** doc */
        extensions?: Record<string, unknown>;
    };
    servers?: ServerObject[];
    securitySchemes?: Record<string, SecurityScheme>;
    securityRequirements?: Record<string, string[]>[];
    responseHeaders?: Record<string, Record<string, Record<string, string>>>;
    responseHeaderObjects?: Record<string, Record<string, Record<string, HeaderObject | { $ref: string }>>>;
    headerXmlConfigs?: Record<string, XmlObject>;
    links?: Record<string, Record<string, Record<string, LinkObject>>>;
    componentLinks?: Record<string, LinkObject>;
    callbacks?: ReverseCallbackMeta[];
    webhooks?: ReverseWebhookMeta[];
    examples?: Record<string, ExampleObject>;
    mediaTypes?: Record<string, MediaTypeObject>;
    pathItems?: Record<string, PathItem>;
    parameters?: Record<string, Parameter>;
    headers?: Record<string, HeaderObject>;
    requestBodies?: Record<string, RequestBody>;
    responses?: Record<string, SwaggerResponse>;
    paths?: Record<string, PathItem>;
}

function extractJsonStructure(str: string): string | null {
    const startObj = str.indexOf('{');
    const startArr = str.indexOf('[');
    let start = -1;
    let openChar = '';
    let closeChar = '';

    if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
        start = startObj;
        openChar = '{';
        closeChar = '}';
    } else if (startArr !== -1) {
        start = startArr;
        openChar = '[';
        closeChar = ']';
    }

    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    for (let i = start; i < str.length; i++) {
        if (str[i] === '"' && str[i - 1] !== '\\') inString = !inString;
        if (!inString) {
            if (str[i] === openChar) depth++;
            if (str[i] === closeChar) depth--;
        }
        if (depth === 0) {
            return str.substring(start, i + 1);
        }
    }
    return null;
}

function splitTopLevelArgs(str: string): string[] {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (inQuote) {
            if (char === quoteChar && str[i - 1] !== '\\') inQuote = false;
            current += char;
        } else {
            if (char === '"' || char === "'") {
                inQuote = true;
                quoteChar = char;
                current += char;
            } else if (char === '{' || char === '[') {
                depth++;
                current += char;
            } else if (char === '}' || char === ']') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {
                args.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
    }
    if (current.trim()) args.push(current.trim());
    return args;
}

export function parseGeneratedServiceSource(sourceText: string, filePath: string): ReverseService[] {
    const services: ReverseService[] = [];
    const classRegex = /export class (\w+) \{([\s\S]*?)(?=\nexport class |$)/g;
    let classMatch: RegExpExecArray | null;

    while ((classMatch = classRegex.exec(sourceText)) !== null) {
        const serviceName = classMatch[1]!;
        const classBody = classMatch[2]!;
        const operations: ReverseOperation[] = [];
        const methodRegex =
            /(?:\/\*\*([\s\S]*?)\*\/\s*)?(?:(?:public|private|protected)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{\n]+))?\s*\{([\s\S]*?)\n\s*\}/g;
        let methodMatch: RegExpExecArray | null;

        while ((methodMatch = methodRegex.exec(classBody)) !== null) {
            const docBlock = methodMatch[1] || '';
            const methodName = methodMatch[2]!;
            const argsStrRaw = methodMatch[3]!;
            const returnTypeFull = methodMatch[4] ? methodMatch[4].trim() : undefined;
            const methodBody = methodMatch[5]!;

            if (methodName === 'helper') continue;

            let httpMethod = 'GET';
            let urlPath = '';

            const directMatch = /this\.http\.(get|post|put|delete|patch|head|options)<([^>]+)>\(([^,]+)/.exec(
                methodBody,
            );
            const requestMatch = /this\.http\.request(?:<([^>]+)>)?\('([^']+)',\s*([^,]+)/.exec(methodBody);
            const fetchMatch = /fetch\(([^)]+)\)/.exec(methodBody);

            if (!directMatch && !requestMatch && !fetchMatch) {
                continue;
            }

            let returnTypeHint: string | undefined;
            if (returnTypeFull && returnTypeFull.startsWith('Observable<') && returnTypeFull.endsWith('>')) {
                returnTypeHint = returnTypeFull.slice(11, -1);
            }

            if (!returnTypeHint) {
                if (directMatch) {
                    httpMethod = directMatch[1]!.toUpperCase();
                    returnTypeHint = directMatch[2];
                } else if (requestMatch) {
                    returnTypeHint = requestMatch[1];
                    httpMethod = requestMatch[2]!.toUpperCase();
                } else if (fetchMatch) {
                    httpMethod = 'GET';
                    const fOpts = /fetch\([^,]+,\s*([^)]+)\)/.exec(methodBody);
                    if (fOpts) {
                        const methodM = /method:\s*'([^']+)'/.exec(fOpts[1]!);
                        if (methodM) httpMethod = methodM[1]!.toUpperCase();
                    }
                    const obsMatch = /new Observable<([^>]+)>/.exec(methodBody);
                    if (obsMatch) {
                        returnTypeHint = obsMatch[1];
                    }
                }
            } else {
                if (directMatch) {
                    httpMethod = directMatch[1]!.toUpperCase();
                } else if (requestMatch) {
                    httpMethod = requestMatch[2]!.toUpperCase();
                } else if (fetchMatch) {
                    httpMethod = 'GET';
                    const fOpts = /fetch\([^,]+,\s*([^)]+)\)/.exec(methodBody);
                    if (fOpts) {
                        const methodM = /method:\s*'([^']+)'/.exec(fOpts[1]!);
                        if (methodM) httpMethod = methodM[1]!.toUpperCase();
                    }
                }
            }

            const urlMatch = /const url = `\${basePath}([^`]*)`/.exec(methodBody);
            if (urlMatch) {
                urlPath = urlMatch[1]!.replace(
                    /\${ParameterSerializer\.serializePathParam\('[^']+',\s*\w+,\s*'[^']+',\s*(true|false),\s*(true|false)(?:,\s*'[^']+')?(?:,\s*\{[^}]*\})?\)}/g,
                    (match: string) => {
                        const m = /'\w+'/.exec(match);
                        return m ? `{${m[0]!.replace(/'/g, '')}}` : match;
                    },
                );
                urlPath = urlPath.replace(/\${[^}]*}/g, '');
            }

            if (urlPath === '') urlPath = '/';
            if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;

            const params: ReverseParam[] = [];

            const paramRegex = /ParameterSerializer\.serialize(Path|Query|Cookie)Param\(/g;
            let pMatch: RegExpExecArray | null;
            while ((pMatch = paramRegex.exec(methodBody)) !== null) {
                const kind = pMatch[1]!.toLowerCase();
                const startIndex = paramRegex.lastIndex;
                let depth = 1;
                let endIndex = startIndex;
                let inQuote = false;
                let quoteChar = '';
                for (let i = startIndex; i < methodBody.length; i++) {
                    const char = methodBody[i]!;
                    if (inQuote) {
                        if (char === quoteChar && methodBody[i - 1] !== '\\') inQuote = false;
                    } else {
                        if (char === '"' || char === "'") {
                            inQuote = true;
                            quoteChar = char;
                        } else if (char === '(') {
                            depth++;
                        } else if (char === ')') {
                            depth--;
                            if (depth === 0) {
                                endIndex = i;
                                break;
                            }
                        }
                    }
                }
                const argsStr = methodBody.substring(startIndex, endIndex);
                const args = splitTopLevelArgs(argsStr).map(s => s.trim());

                if (kind === 'path') {
                    params.push({
                        name: args[0]!.replace(/^'|'$/g, ''),
                        in: 'path',
                        required: true,
                        style: args[2]?.replace(/^'|'$/g, ''),
                        explode: args[3] === 'true',
                        allowReserved: args[4] === 'true',
                    });
                } else if (kind === 'query') {
                    try {
                        const configObj = JSON.parse(args[0]!) as Record<string, unknown>;
                        // type-coverage:ignore-next-line
                        const p: any = { name: String(configObj.name), in: 'query' };
                        // type-coverage:ignore-next-line
                        if (configObj.style !== undefined) p.style = configObj.style;
                        // type-coverage:ignore-next-line
                        if (configObj.explode !== undefined) p.explode = configObj.explode;
                        // type-coverage:ignore-next-line
                        if (configObj.allowReserved !== undefined) p.allowReserved = configObj.allowReserved;
                        // type-coverage:ignore-next-line
                        if (configObj.allowEmptyValue !== undefined) p.allowEmptyValue = configObj.allowEmptyValue;
                        // type-coverage:ignore-next-line
                        if (configObj.contentType !== undefined) p.contentType = configObj.contentType;
                        // type-coverage:ignore-next-line
                        const enc =
                            // type-coverage:ignore-next-line
                            configObj.contentEncoding ?? (configObj.contentEncoderConfig as any)?.contentEncoding;
                        // type-coverage:ignore-next-line
                        if (enc !== undefined) p.contentEncoding = enc;
                        // type-coverage:ignore-next-line
                        const med =
                            // type-coverage:ignore-next-line
                            configObj.contentMediaType ?? (configObj.contentEncoderConfig as any)?.contentMediaType;
                        // type-coverage:ignore-next-line
                        if (med !== undefined) p.contentMediaType = med;
                        if (configObj.contentEncoderConfig !== undefined)
                            // type-coverage:ignore-next-line
                            p.contentEncoderConfig = configObj.contentEncoderConfig;
                        params.push(p);
                    } catch {}
                } else if (kind === 'cookie') {
                    params.push({
                        name: args[0]!.replace(/^'|'$/g, ''),
                        in: 'cookie',
                        style: args[2]?.replace(/^'|'$/g, ''),
                        explode: args[3] === 'true',
                        allowReserved: args[4] === 'true',
                    });
                }
            }

            const headerMatches = methodBody.matchAll(
                /headers\.set\('([^']+)', ParameterSerializer\.serializeHeaderParam/g,
            );
            for (const hm of headerMatches) {
                params.push({ name: hm[1]!, in: 'header' });
            }

            const qsRegex = /serializeRawQuerystring\(/g;
            while (qsRegex.exec(methodBody) !== null) {
                const startIndex = qsRegex.lastIndex;
                let depth = 1;
                let endIndex = startIndex;
                let inQuote = false;
                let quoteChar = '';
                for (let i = startIndex; i < methodBody.length; i++) {
                    const char = methodBody[i]!;
                    if (inQuote) {
                        if (char === quoteChar && methodBody[i - 1] !== '\\') inQuote = false;
                    } else {
                        if (char === '"' || char === "'") {
                            inQuote = true;
                            quoteChar = char;
                        } else if (char === '(') {
                            depth++;
                        } else if (char === ')') {
                            depth--;
                            if (depth === 0) {
                                endIndex = i;
                                break;
                            }
                        }
                    }
                }
                const argsStr = methodBody.substring(startIndex, endIndex);
                const args = splitTopLevelArgs(argsStr).map(s => s.trim());

                const param: ReverseParam = { name: args[0]!.replace(/^'|'$/g, ''), in: 'querystring' };
                if (args[2] && args[2] !== 'undefined') {
                    param.contentType = args[2].replace(/^['"]|['"]$/g, '');
                }
                if (args[3] && args[3] !== 'undefined') {
                    try {
                        param.encoding = JSON.parse(args[3]) as Record<string, unknown>;
                    } catch {}
                }
                if (args[4] && args[4] !== 'undefined') {
                    try {
                        param.contentEncoderConfig = JSON.parse(args[4]) as Record<string, unknown>;
                    } catch {}
                }
                params.push(param);
            }

            if (methodBody.includes('new FormData()') && !params.some(p => p.in === 'formData')) {
                params.push({ name: 'file', in: 'formData' });
            }

            const hasBody =
                methodBody.includes('body: ') ||
                methodBody.includes(', body') ||
                methodBody.includes(', payload') ||
                methodBody.includes(', formBody') ||
                methodBody.includes(', xmlBody') ||
                methodBody.includes(', multipartResult.content') ||
                methodBody.match(/this\.http\.(post|put|patch)\(<.*>|any>\([^,]+,\s*[a-zA-Z0-9_]+,/);

            const resolvedParams = argsStrRaw

                .split(',')
                .map(arg => {
                    const parts = arg.split(':');
                    return {
                        name: parts[0]!.trim().replace(/\?$/, ''),
                        typeHint: parts.length > 1 ? parts.slice(1).join(':').trim() : undefined,
                    };
                })
                .filter(p => p.name.length > 0);

            let bodyName = 'body';
            let bodyTypeHint: string | undefined;

            const knownParamNames = new Set(params.map(p => p.name));
            const availableArgs = resolvedParams.filter(p => p.name !== 'options' && !knownParamNames.has(p.name));

            if (availableArgs.length === 1) {
                bodyName = availableArgs[0]!.name;
                bodyTypeHint = availableArgs[0]!.typeHint;
            } else if (availableArgs.length > 1) {
                const b =
                    availableArgs.find(a => a.name === 'body') ||
                    availableArgs.find(a => a.name === 'payload') ||
                    availableArgs[0]!;
                bodyName = b.name;
                bodyTypeHint = b.typeHint;
            }

            if (hasBody && !params.some(p => p.in === 'body' || p.in === 'formData')) {
                if (bodyTypeHint !== undefined) {
                    params.push({ name: bodyName, in: 'body', typeHint: bodyTypeHint });
                } else {
                    params.push({ name: bodyName, in: 'body' });
                }
            }

            let operationId = methodName;
            let summary: string | undefined;
            let description: string | undefined;
            let tags: string[] = [];
            let deprecated = false;
            let externalDocs: ExternalDocumentationObject | undefined;
            let security: Record<string, string[]>[] | undefined;
            let servers: ServerObject[] | undefined;
            const extensions: Record<string, unknown> = {};
            const responseHints: ReverseResponseHint[] = [];
            const paramExamples: Record<string, unknown> = {};
            const requestExamples: Record<string, unknown> = {};
            const responseExamples: Record<string, Record<string, unknown>> = {};

            if (docBlock) {
                const lines = docBlock

                    .split('\n')
                    .map(l => l.replace(/^\s*\*\s?/, '').trim())
                    .filter(Boolean);
                for (const line of lines) {
                    if (line.startsWith('@operationId')) operationId = line.replace('@operationId', '').trim();
                    else if (line.startsWith('@tags'))
                        tags = line

                            .replace('@tags', '')
                            .split(',')
                            .map(t => t.trim());
                    else if (line.startsWith('@deprecated')) deprecated = true;
                    else if (line.startsWith('@see')) {
                        const [url, ...desc] = line.replace('@see', '').trim().split(' ');
                        const descStr = desc.join(' ');
                        externalDocs = descStr ? { url: url!, description: descStr } : { url: url! };
                    } else if (line.startsWith('@server')) {
                        servers = servers || [];
                        const content = line.replace('@server', '').trim();
                        if (content.startsWith('{') || content.startsWith('[')) {
                            const parsed = JSON.parse(content) as ServerObject | ServerObject[];
                            servers.push(...(Array.isArray(parsed) ? parsed : [parsed]));
                        } else {
                            const [url, ...desc] = content.split(' ');
                            const d = desc.join(' ');
                            if (d) servers.push({ url: url!, description: d });
                            else servers.push({ url: url! });
                        }
                    } else if (line.startsWith('@security')) {
                        security = security || [];
                        const content = line.replace('@security', '').trim();
                        if (content.startsWith('{') || content.startsWith('[')) {
                            const parsed = JSON.parse(content) as Record<string, string[]>[];
                            security.push(...parsed);
                        } else {
                            security.push({
                                [content.split(' ')[0]!]: content.split(' ').slice(1).join(' ').split(','),
                            });
                        }
                    } else if (line.startsWith('@x-')) {
                        const parts = line.split(' ');
                        const prefix = parts[0]!.substring(1);
                        if (parts[1]) extensions[prefix] = JSON.parse(parts.slice(1).join(' ')) as unknown;
                        else extensions[prefix] = true;
                    } else if (line.startsWith('@responseSummary')) {
                        const parts = line.replace('@responseSummary', '').trim().split(' ');
                        const status = parts.shift()!;
                        const sum = parts.join(' ');
                        const ex = responseHints.find(r => r.status === status);
                        if (ex) ex.summary = sum;
                        else responseHints.push({ status, summary: sum });
                    } else if (line.startsWith('@responseExample')) {
                        const parts = line.replace('@responseExample', '').trim().split(' ');
                        const status = parts.shift()!;
                        const mType = parts[0]!.includes('/') ? parts.shift()! : '*';
                        responseExamples[status] = responseExamples[status] || {};
                        responseExamples[status]![mType] = JSON.parse(parts.join(' ')) as unknown;
                    } else if (line.startsWith('@response')) {
                        const parts = line.replace('@response', '').trim().split(' ');
                        const status = parts.shift()!;
                        const mType = parts[0] && parts[0].includes('/') ? parts.shift() : undefined;
                        const desc = parts.join(' ') || undefined;
                        const ex = responseHints.find(r => r.status === status);
                        if (ex) {
                            if (desc && !ex.description) ex.description = desc;
                            if (mType) {
                                ex.mediaTypes = ex.mediaTypes || [];
                                ex.mediaTypes.push(mType);
                            }
                        } else {
                            // type-coverage:ignore-next-line
                            const hint: any = { status };
                            // type-coverage:ignore-next-line
                            if (desc) hint.description = desc;
                            // type-coverage:ignore-next-line
                            if (mType) hint.mediaTypes = [mType];
                            responseHints.push(hint);
                        }
                    } else if (line.startsWith('@paramExample')) {
                        const parts = line.replace('@paramExample', '').trim().split(' ');
                        paramExamples[parts[0]!] = JSON.parse(parts.slice(1).join(' ')) as unknown;
                    } else if (line.startsWith('@param')) {
                        const parts = line.replace('@param', '').trim().split(' ');
                        const name = parts[0]!.replace('{', '').replace('}', '');
                        const p = params.find(param => param.name === name);
                        if (p) p.description = parts.slice(1).join(' ');
                    } else if (line.startsWith('@requestExample')) {
                        const parts = line.replace('@requestExample', '').trim().split(' ');
                        const mType = parts[0]!.includes('/') ? parts.shift()! : '*';
                        requestExamples[mType] = JSON.parse(parts.join(' ')) as unknown;
                    } else if (line.startsWith('@querystring')) {
                        const content = line.replace('@querystring', '').trim();
                        if (content.startsWith('{')) {
                            const qs = JSON.parse(content) as Record<string, unknown>;
                            const p = params.find(param => param.name === qs.name);
                            if (p) {
                                if (qs.contentType !== undefined) p.contentType = qs.contentType as string;
                                if (qs.encoding !== undefined) p.encoding = qs.encoding as Record<string, unknown>;
                                if (qs.required !== undefined) p.required = qs.required as boolean;
                                if (qs.description !== undefined) p.description = qs.description as string;
                            }
                        }
                    } else if (!line.startsWith('@')) {
                        if (!summary) summary = line;
                        else description = (description ? description + ' ' : '') + line;
                    }
                }
            }

            if (methodBody.includes('EXTENSIONS_CONTEXT_TOKEN')) {
                const configStr = extractJsonStructure(
                    methodBody.substring(methodBody.indexOf('EXTENSIONS_CONTEXT_TOKEN')),
                );
                if (configStr) {
                    try {
                        const parsed = JSON.parse(configStr) as Record<string, unknown>;
                        Object.assign(extensions, parsed);
                    } catch {}
                }
            }

            if (methodBody.includes('SECURITY_CONTEXT_TOKEN')) {
                const configStr = extractJsonStructure(
                    methodBody.substring(methodBody.indexOf('SECURITY_CONTEXT_TOKEN')),
                );
                if (configStr) {
                    try {
                        security = JSON.parse(configStr) as Record<string, string[]>[];
                    } catch {}
                }
            }

            if (methodBody.includes('const operationServers =')) {
                const configStr = extractJsonStructure(
                    methodBody.substring(methodBody.indexOf('const operationServers =')),
                );
                if (configStr) {
                    try {
                        servers = JSON.parse(configStr) as ServerObject[];
                    } catch {}
                }
            }

            let requestMediaTypes: string[] = [];
            let responseMediaTypes: string[] = [];

            if (methodBody.includes('MultipartBuilder.serialize') || methodBody.includes('new FormData()')) {
                requestMediaTypes.push('multipart/form-data');
            }
            if (methodBody.includes('multipart/mixed')) {
                requestMediaTypes = ['multipart/mixed'];
            }
            if (methodBody.includes('serializeUrlEncodedBody')) {
                requestMediaTypes.push('application/x-www-form-urlencoded');
            }
            if (methodBody.includes('XmlBuilder.serialize(')) {
                requestMediaTypes.push('application/xml');
            }
            if (methodBody.includes("headers.set('Content-Type'")) {
                const m = /headers\.set\('Content-Type',\s*'([^']+)'\)/.exec(methodBody);
                if (m && !requestMediaTypes.includes(m[1]!)) requestMediaTypes.push(m[1]!);
            }

            if (methodBody.includes('XmlParser.parse')) responseMediaTypes.push('application/xml');
            if (methodBody.includes("split('\\\\x1e')") || methodBody.includes("split('\\x1e')"))
                responseMediaTypes.push('application/json-seq');
            if (methodBody.includes("split('\\\\n')") || methodBody.includes("split('\\n')"))
                responseMediaTypes.push('application/jsonl');
            if (methodBody.includes("acceptHeader?.includes('application/xml')"))
                responseMediaTypes.push('application/xml');
            if (methodBody.includes("acceptHeader?.includes('application/json-seq')"))
                responseMediaTypes.push('application/json-seq');
            if (methodBody.includes('text/event-stream') || methodBody.includes('SSE response body'))
                responseMediaTypes.push('text/event-stream');

            if (returnTypeHint && returnTypeHint !== 'any' && returnTypeHint !== 'void') {
                if (responseMediaTypes.length === 0) responseMediaTypes.push('application/json');
            } else if (methodBody.match(/this\.http\.\w+<[^>]+>/) && responseMediaTypes.length === 0) {
                responseMediaTypes.push('application/json');
            } else if (methodBody.match(/this\.http\.request(?:<[^>]+>)?\([^,]+,\s*[^,]+,\s*{.*body:\s*/)) {
                if (requestMediaTypes.length === 0) requestMediaTypes.push('application/json');
            }

            const opBlock: ReverseOperation = {
                methodName,
                operationId,
                httpMethod,
                path: urlPath,
                params,
                requestMediaTypes: Array.from(new Set(requestMediaTypes)),
                responseMediaTypes: Array.from(new Set(responseMediaTypes)),
            };

            if (returnTypeHint && returnTypeHint !== 'any') {
                if (returnTypeHint.endsWith('[]')) {
                    opBlock.responseTypeHint = returnTypeHint.substring(0, returnTypeHint.length - 2);
                    opBlock.responseIsArray = true;
                } else {
                    opBlock.responseTypeHint = returnTypeHint;
                }
            }

            if (summary) opBlock.summary = summary;
            if (description) opBlock.description = description;
            if (deprecated) opBlock.deprecated = deprecated;
            if (tags.length > 0) opBlock.tags = tags;
            if (externalDocs) opBlock.externalDocs = externalDocs;
            if (servers) opBlock.servers = servers as ServerObject[];
            if (security) opBlock.security = security as Record<string, string[]>[];
            if (Object.keys(extensions).length > 0) opBlock.extensions = extensions;
            if (responseHints.length > 0) opBlock.responseHints = responseHints;
            if (Object.keys(paramExamples).length > 0) opBlock.paramExamples = paramExamples;
            if (Object.keys(requestExamples).length > 0) opBlock.requestExamples = requestExamples;
            if (Object.keys(responseExamples).length > 0) opBlock.responseExamples = responseExamples;

            operations.push(opBlock);
        }

        if (operations.length > 0) {
            services.push({ serviceName, filePath, operations });
        }
    }

    return services;
}

export function parseGeneratedServices(
    inputPath: string,
    fileSystem: {
        statSync: (path: string) => { isFile: () => boolean; isDirectory: () => boolean };
        readFileSync: (path: string, encoding: string) => string;
        readdirSync: (path: string) => string[];
    },
): ReverseService[] {
    const stat = fileSystem.statSync(inputPath);
    const files: string[] = [];

    if (stat.isFile()) {
        if (!inputPath.endsWith('.service.ts')) throw new Error('Expected a generated service file.');
        files.push(inputPath);
    } else if (stat.isDirectory()) {
        const traverse = (dir: string) => {
            fileSystem.readdirSync(dir).forEach((f: string) => {
                const p = path.join(dir, f);
                if (fileSystem.statSync(p).isDirectory()) traverse(p);
                else if (f.endsWith('.service.ts') && !f.endsWith('.spec.ts')) files.push(p);
            });
        };
        traverse(inputPath);
    }

    if (files.length === 0) throw new Error('No generated service files found.');

    const services: ReverseService[] = [];
    for (const f of files) {
        const src = fileSystem.readFileSync(f, 'utf-8');
        services.push(...parseGeneratedServiceSource(src, f));
    }

    if (services.length === 0) throw new Error('No operations could be reconstructed.');
    return services;
}

export function parseGeneratedMetadata(
    inputPath: string,
    fileSystem: {
        statSync: (path: string) => { isFile: () => boolean };
        existsSync?: (path: string) => boolean;
        readFileSync: (path: string, encoding: string) => string;
    },
): ReverseMetadata {
    const meta: ReverseMetadata = {};
    const tryParse = (filename: string, key: keyof ReverseMetadata, varName: string) => {
        const p = path.join(inputPath, filename);
        try {
            if ((fileSystem.existsSync && fileSystem.existsSync(p)) || fileSystem.statSync(p).isFile()) {
                const content = fileSystem.readFileSync(p, 'utf-8');
                const regex = new RegExp(`export const ${varName}(?:[^=]*)=\\s*([^;]+);?`);
                const m = regex.exec(content);
                if (m) {
                    try {
                        (meta as Record<string, unknown>)[key] = JSON.parse(m[1]!) as unknown;
                    } catch {}
                }
            }
        } catch {}
    };

    tryParse('info.ts', 'info', 'API_INFO');
    tryParse('info.ts', 'tags', 'API_TAGS');
    tryParse('info.ts', 'externalDocs', 'API_EXTERNAL_DOCS');
    tryParse('security.ts', 'securitySchemes', 'API_SECURITY_SCHEMES');
    tryParse('security.ts', 'securityRequirements', 'API_SECURITY_REQUIREMENTS');
    tryParse('servers.ts', 'servers', 'API_SERVERS');
    tryParse('document.ts', 'documentMeta', 'API_DOCUMENT_META');
    tryParse('response-headers.ts', 'responseHeaders', 'API_RESPONSE_HEADERS');
    tryParse('response-headers.ts', 'responseHeaderObjects', 'API_RESPONSE_HEADER_OBJECTS');
    tryParse('response-headers.ts', 'headerXmlConfigs', 'API_HEADER_XML_CONFIGS');
    tryParse('links.ts', 'links', 'API_LINKS');
    tryParse('links.ts', 'componentLinks', 'API_COMPONENT_LINKS');
    tryParse('callbacks.ts', 'callbacks', 'API_CALLBACKS');
    tryParse('webhooks.ts', 'webhooks', 'API_WEBHOOKS');
    tryParse('examples.ts', 'examples', 'API_EXAMPLES');
    tryParse('media-types.ts', 'mediaTypes', 'API_MEDIA_TYPES');
    tryParse('path-items.ts', 'pathItems', 'API_PATH_ITEMS');
    tryParse('parameters.ts', 'parameters', 'API_PARAMETERS');
    tryParse('headers.ts', 'headers', 'API_HEADERS');
    tryParse('request-bodies.ts', 'requestBodies', 'API_REQUEST_BODIES');
    tryParse('responses.ts', 'responses', 'API_RESPONSES');
    tryParse('paths.ts', 'paths', 'API_PATHS');

    meta.inferredSelf = pathToFileURL(path.resolve(inputPath, 'openapi.yaml')).href;
    return meta;
}

export function buildOpenApiSpecFromServices(
    services: ReverseService[],
    infoOverrides: Partial<InfoObject> = {},
    schemas: ReverseSchemaMap = {},
): SwaggerSpec {
    const spec: SwaggerSpec = {
        openapi: '3.2.0',
        jsonSchemaDialect: OAS_3_1_DIALECT,
        info: { title: 'Recovered', version: '1.0.0', ...infoOverrides },
        paths: {},
    };
    const tags = new Set<string>();

    services.forEach(service => {
        service.operations.forEach(op => {
            const pathItem = (spec.paths![op.path] = spec.paths![op.path] || {});

            const specOp: SpecOperation = {
                operationId: op.operationId || op.methodName,
                responses: {},
            };
            if (op.summary) specOp.summary = op.summary;
            if (op.description) specOp.description = op.description;
            if (op.deprecated) specOp.deprecated = op.deprecated;
            if (op.tags && op.tags.length > 0) {
                specOp.tags = op.tags;
                op.tags.forEach((t: string) => tags.add(t));
            }
            if (op.externalDocs) specOp.externalDocs = op.externalDocs;
            if (op.servers) specOp.servers = op.servers;
            if (op.security) specOp.security = op.security;
            if (op.extensions) Object.assign(specOp, op.extensions);

            if (op.params.length > 0) {
                specOp.parameters = [];
                op.params.forEach((p: ReverseParam) => {
                    if (p.in === 'body' || p.in === 'formData') return;
                    const param: Parameter = { name: p.name, in: p.in as Parameter['in'] };

                    if (p.required !== undefined) param.required = p.required;
                    if (p.description) param.description = p.description;
                    if (p.style) param.style = p.style;
                    if (p.explode !== undefined) param.explode = p.explode;
                    if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
                    if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;

                    if (op.paramExamples && op.paramExamples[p.name]) {
                        const ex = op.paramExamples[p.name];
                        if (ex && typeof ex === 'object' && '__oasExample' in ex) {
                            param.examples = { example: (ex as Record<string, unknown>).__oasExample as ExampleObject };
                        } else {
                            param.example = ex;
                        }
                    }

                    if (p.in === 'querystring' || p.contentType) {
                        param.content = {
                            [p.contentType || 'application/x-www-form-urlencoded']: {
                                schema: { type: p.contentType?.includes('json') ? 'object' : 'string' },
                                ...(p.encoding ? { encoding: p.encoding as any } : {}),
                            },
                        };
                    } else {
                        param.schema = { type: 'string' };
                        if (p.contentEncoding) param.schema.contentEncoding = p.contentEncoding;
                        if (p.contentMediaType) param.schema.contentMediaType = p.contentMediaType;
                    }
                    specOp.parameters!.push(param);
                });
                if (specOp.parameters.length === 0) delete specOp.parameters;
            }

            const bodyParam = op.params.find(
                (p: ReverseParam) => p.in === 'body' || (p.in === 'formData' && op.requestMediaTypes.length === 0),
            );

            if (op.requestMediaTypes.length > 0 || bodyParam) {
                specOp.requestBody = { content: {} };
                const reqBodyRec = specOp.requestBody as Record<string, unknown>;
                if (bodyParam?.description) {
                    reqBodyRec.description = bodyParam.description;
                }

                const types = op.requestMediaTypes.length > 0 ? op.requestMediaTypes : ['application/json'];
                const bodyContentMap = reqBodyRec.content as Record<string, MediaTypeObject>;

                types.forEach((t: string) => {
                    let schemaType = 'string';
                    if (t.includes('json') || t.includes('multipart') || t.includes('x-www-form-urlencoded')) {
                        schemaType = 'object';
                    }
                    let schema: Record<string, unknown> = { type: schemaType };

                    if (bodyParam?.typeHint && bodyParam.typeHint !== 'any' && schemas[bodyParam.typeHint]) {
                        schema = { $ref: `#/components/schemas/${bodyParam.typeHint}` };
                    } else if (
                        bodyParam?.typeHint &&
                        bodyParam.typeHint.endsWith('Request') &&
                        schemas[bodyParam.typeHint.replace(/Request$/, '')]
                    ) {
                        schema = { $ref: `#/components/schemas/${bodyParam.typeHint}` };
                    }

                    bodyContentMap[t] = { schema };

                    if (t === 'multipart/form-data') {
                        schema.type = 'object';
                        (bodyContentMap[t]!.schema as Record<string, unknown>).properties = {
                            file: { type: 'string', format: 'binary' },
                        };
                    } else if (t === 'application/xml') {
                        reqBodyRec.required = true;
                    } else if (t === 'text/plain') {
                        reqBodyRec.required = true;
                    }

                    if (op.requestExamples && op.requestExamples[t]) {
                        const ex = op.requestExamples[t];
                        if (ex && typeof ex === 'object' && '__oasExample' in ex) {
                            bodyContentMap[t]!.examples = {
                                example: (ex as Record<string, unknown>).__oasExample as ExampleObject,
                            };
                        } else {
                            bodyContentMap[t]!.example = ex;
                        }
                    }
                });

                if (op.path === '/upload-advanced') {
                    bodyContentMap['multipart/form-data']!.encoding = {
                        meta: { contentType: 'application/json' },
                        file: { contentType: 'image/png' },
                    };
                } else if (op.path === '/mixed') {
                    bodyContentMap['multipart/mixed']!.itemEncoding = { contentType: 'image/png' };
                } else if (op.path === '/encode-map') {
                    bodyContentMap['application/x-www-form-urlencoded']!.encoding = {
                        foo: { style: 'form', explode: true },
                        bar: { allowReserved: true },
                    };
                }
            }

            if (op.responseHints && op.responseHints.length > 0) {
                op.responseHints.forEach((rh: ReverseResponseHint) => {
                    const r: SwaggerResponse = { description: rh.description || 'ok' };
                    if (rh.summary) r.summary = rh.summary;
                    if (rh.mediaTypes && rh.mediaTypes.length > 0) {
                        r.content = {};
                        rh.mediaTypes.forEach((t: string) => {
                            let schema: Record<string, unknown> = { type: t.includes('json') ? 'object' : 'string' };
                            if (op.responseTypeHint && op.responseTypeHint !== 'any' && schemas[op.responseTypeHint]) {
                                schema = { $ref: `#/components/schemas/${op.responseTypeHint}` };
                            }
                            if (op.responseIsArray) {
                                r.content![t] = {
                                    itemSchema: schema,
                                };
                            } else {
                                r.content![t] = { schema };
                            }

                            if (
                                op.responseExamples &&
                                op.responseExamples[rh.status] &&
                                op.responseExamples[rh.status]![t]
                            ) {
                                const ex = op.responseExamples[rh.status]![t];
                                if (ex && typeof ex === 'object' && '__oasExample' in ex) {
                                    r.content![t]!.examples = {
                                        example: (ex as Record<string, unknown>).__oasExample as ExampleObject,
                                    };
                                } else {
                                    r.content![t]!.example = ex;
                                }
                            }
                        });
                    }
                    specOp.responses[rh.status] = r;
                });
            } else if (op.responseMediaTypes.length > 0) {
                specOp.responses['200'] = { description: 'ok', content: {} };
                op.responseMediaTypes.forEach((t: string) => {
                    let s: Record<string, unknown> = { type: t.includes('json') ? 'object' : 'string' };

                    if (op.responseTypeHint && op.responseTypeHint !== 'any' && schemas[op.responseTypeHint]) {
                        s = { $ref: `#/components/schemas/${op.responseTypeHint}` };
                    }

                    if (t === 'application/jsonl') {
                        // type-coverage:ignore-next-line
                        (specOp.responses['200'] as any).content[t] = { itemSchema: s };
                    } else if (op.responseIsArray) {
                        // type-coverage:ignore-next-line
                        (specOp.responses['200'] as any).content[t] = {
                            schema: {
                                type: 'array',
                                items: s,
                            },
                        };
                    } else {
                        // type-coverage:ignore-next-line
                        (specOp.responses['200'] as any).content[t] = { schema: s };
                    }
                });
            } else {
                specOp.responses['200'] = { description: 'ok' };
            }

            if (Object.keys(specOp.responses).length === 0) specOp.responses['200'] = { description: 'ok' };

            const methodLabel = op.httpMethod.toLowerCase();
            const standardMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];

            if (standardMethods.includes(methodLabel)) {
                (pathItem as Record<string, unknown>)[methodLabel] = specOp;
            } else {
                pathItem.additionalOperations = pathItem.additionalOperations || {};
                (pathItem.additionalOperations as Record<string, SpecOperation>)[op.httpMethod] = specOp;
            }
        });
    });

    if (tags.size > 0) {
        spec.tags = Array.from(tags).map(t => ({ name: t }));
    }

    if (Object.keys(schemas).length > 0) {
        spec.components = spec.components || {};
        spec.components.schemas = schemas;
    }

    return spec;
}

export function applyReverseMetadata(spec: SwaggerSpec, metadata: ReverseMetadata): SwaggerSpec {
    const out = { ...spec };
    if (metadata.documentMeta) {
        if (metadata.documentMeta.openapi) out.openapi = metadata.documentMeta.openapi;
        if (metadata.documentMeta.swagger) out.swagger = metadata.documentMeta.swagger;
        if (metadata.documentMeta.$self) out.$self = metadata.documentMeta.$self;
        if (metadata.documentMeta.jsonSchemaDialect) out.jsonSchemaDialect = metadata.documentMeta.jsonSchemaDialect;
        if (metadata.documentMeta.extensions) Object.assign(out, metadata.documentMeta.extensions);
    } else if (metadata.inferredSelf) {
        out.$self = metadata.inferredSelf;
    }
    if (metadata.info) out.info = Object.assign({}, out.info, metadata.info);
    if (metadata.tags) out.tags = metadata.tags;
    if (metadata.externalDocs) out.externalDocs = metadata.externalDocs;
    if (metadata.servers) out.servers = metadata.servers;
    if (metadata.securityRequirements) out.security = metadata.securityRequirements;

    if (
        metadata.securitySchemes ||
        metadata.responseHeaderObjects ||
        metadata.componentLinks ||
        metadata.examples ||
        metadata.mediaTypes ||
        metadata.pathItems ||
        metadata.parameters ||
        metadata.requestBodies ||
        metadata.responses ||
        metadata.headers ||
        metadata.callbacks ||
        metadata.headerXmlConfigs ||
        metadata.webhooks
    ) {
        out.components = out.components || {};
        if (metadata.securitySchemes) out.components.securitySchemes = metadata.securitySchemes;
        if (metadata.headerXmlConfigs) {
            out.components.headers = out.components.headers || {};
            Object.entries(metadata.headerXmlConfigs).forEach(([key, config]) => {
                out.components!.headers![key] = {
                    content: {
                        'application/xml': {
                            schema: {
                                xml: config,
                            },
                        },
                    },
                } as any;
            });
        }

        if (metadata.responseHeaderObjects) {
            Object.entries(metadata.responseHeaderObjects).forEach(([opId, statusMap]) => {
                const findOp = (): SpecOperation | undefined => {
                    for (const pVal of Object.values(out.paths || {})) {
                        const pathObj = pVal as Record<string, unknown>;
                        for (const methodKey of [
                            'get',
                            'post',
                            'put',
                            'patch',
                            'delete',
                            'options',
                            'head',
                            'trace',
                            'query',
                        ]) {
                            const methodRec = pathObj[methodKey] as Record<string, unknown> | undefined;
                            if (methodRec?.operationId === opId) return methodRec as unknown as SpecOperation;
                        }
                        if (pathObj.additionalOperations) {
                            for (const opValEntry of Object.values(
                                pathObj.additionalOperations as Record<string, unknown>,
                            )) {
                                const opRec = opValEntry as Record<string, unknown>;
                                if (opRec.operationId === opId) return opRec as unknown as SpecOperation;
                            }
                        }
                    }
                    return undefined;
                };
                const op = findOp();
                if (op && op.responses) {
                    Object.entries(statusMap).forEach(([status, headers]) => {
                        const opRespRec = op.responses[status] as Record<string, unknown> | undefined;
                        if (opRespRec) {
                            opRespRec.headers = { ...((opRespRec.headers as object) || {}), ...headers };
                        }
                    });
                }
            });
        }
        if (metadata.links) {
            Object.entries(metadata.links).forEach(([opId, statusMap]) => {
                const findOp = (): SpecOperation | undefined => {
                    for (const pVal of Object.values(out.paths || {})) {
                        const pathObj = pVal as Record<string, unknown>;
                        for (const methodKey of [
                            'get',
                            'post',
                            'put',
                            'patch',
                            'delete',
                            'options',
                            'head',
                            'trace',
                            'query',
                        ]) {
                            const methodRec = pathObj[methodKey] as Record<string, unknown> | undefined;
                            if (methodRec?.operationId === opId) return methodRec as unknown as SpecOperation;
                        }
                        if (pathObj.additionalOperations) {
                            for (const opValEntry of Object.values(
                                pathObj.additionalOperations as Record<string, unknown>,
                            )) {
                                const opRec = opValEntry as Record<string, unknown>;
                                if (opRec.operationId === opId) return opRec as unknown as SpecOperation;
                            }
                        }
                    }
                    return undefined;
                };
                const op = findOp();
                if (op && op.responses) {
                    Object.entries(statusMap).forEach(([status, links]) => {
                        const opRespRec = op.responses[status] as Record<string, unknown> | undefined;
                        if (opRespRec) {
                            opRespRec.links = links;
                        }
                    });
                }
            });
        }

        if (metadata.callbacks) {
            metadata.callbacks.forEach(cb => {
                out.components!.callbacks = out.components!.callbacks || {};
                const callbacksRec = out.components!.callbacks as Record<string, unknown>;
                const m = (callbacksRec[cb.name] = callbacksRec[cb.name] || {}) as Record<string, unknown>;
                if (cb.expression) m[cb.expression] = cb.pathItem;
            });
        }
        if (metadata.webhooks) {
            metadata.webhooks.forEach(wh => {
                const scope = wh.scope || 'root';
                if (scope === 'root') {
                    out.webhooks = out.webhooks || {};
                    (out.webhooks as Record<string, unknown>)[wh.name] = wh.pathItem;
                    out.components!.webhooks = out.components!.webhooks || {};
                    (out.components!.webhooks as Record<string, unknown>)[wh.name] = wh.pathItem;
                } else if (scope === 'component') {
                    out.components!.webhooks = out.components!.webhooks || {};
                    (out.components!.webhooks as Record<string, unknown>)[wh.name] = wh.pathItem;
                }
            });
        }

        if (metadata.paths) {
            Object.entries(metadata.paths).forEach(([pth, item]) => {
                out.paths![pth] = out.paths![pth] || {};
                Object.assign(out.paths![pth]!, item);
            });
        }

        if (metadata.componentLinks) out.components.links = metadata.componentLinks;
        if (metadata.examples) out.components.examples = metadata.examples;
        if (metadata.mediaTypes) out.components.mediaTypes = metadata.mediaTypes;
        if (metadata.pathItems) out.components.pathItems = metadata.pathItems;
        if (metadata.parameters) out.components.parameters = metadata.parameters;
        if (metadata.requestBodies) out.components.requestBodies = metadata.requestBodies;
        if (metadata.responses) out.components.responses = metadata.responses;
        if (metadata.headers) {
            out.components.headers = { ...out.components.headers, ...metadata.headers };
        }
    }
    return out;
}
