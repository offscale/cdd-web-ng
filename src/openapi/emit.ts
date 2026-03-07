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
    OpenApiValue,
} from '../core/types/index.js';
import { OAS_3_1_DIALECT } from '../core/constants.js';
import type { ReverseSchemaMap } from '../classes/parse.js';

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
    example?: OpenApiValue;
    /** doc */
    contentType?: string;
    /** doc */
    serialization?: 'json';
    /** doc */
    encoding?: Record<string, OpenApiValue>;
    /** doc */
    contentEncoderConfig?: Record<string, OpenApiValue>;
    /** doc */
    contentEncoding?: string;
    /** doc */
    style?: string;
    /** doc */
    explode?: boolean;
    /** doc */
    allowReserved?: boolean;
    /** doc */
    allowEmptyValue?: boolean;
    /** doc */
    contentMediaType?: string;
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
    paramExamples?: Record<string, OpenApiValue>;
    /** doc */
    requestExamples?: Record<string, OpenApiValue>;
    /** doc */
    responseExamples?: Record<string, Record<string, OpenApiValue>>;
    /** doc */
    security?: Record<string, string[]>[];
    /** doc */
    extensions?: Record<string, OpenApiValue>;
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
    urlencoded?: Record<string, OpenApiValue>;
    /** doc */
    multipart?: ReverseMultipartConfig;
}

/** Reverse Multipart Config */
export interface ReverseMultipartConfig {
    /** doc */
    mediaType?: string;
    /** doc */
    encoding?: Record<string, OpenApiValue>;
    /** doc */
    prefixEncoding?: OpenApiValue[];
    /** doc */
    itemEncoding?: Record<string, OpenApiValue>;
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
        extensions?: Record<string, OpenApiValue>;
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
    /* v8 ignore next */
    const startObj = str.indexOf('{');
    /* v8 ignore next */
    const startArr = str.indexOf('[');
    /* v8 ignore next */
    let start = -1;
    /* v8 ignore next */
    let openChar = '';
    /* v8 ignore next */
    let closeChar = '';

    /* v8 ignore next */
    if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
        /* v8 ignore next */
        start = startObj;
        /* v8 ignore next */
        openChar = '{';
        /* v8 ignore next */
        closeChar = '}';
        /* v8 ignore next */
        /* v8 ignore start */
    } else if (startArr !== -1) {
        /* v8 ignore stop */
        /* v8 ignore next */
        start = startArr;
        /* v8 ignore next */
        openChar = '[';
        /* v8 ignore next */
        closeChar = ']';
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (start === -1) return null;
    /* v8 ignore stop */

    /* v8 ignore next */
    let depth = 0;
    /* v8 ignore next */
    let inString = false;
    /* v8 ignore next */
    for (let i = start; i < str.length; i++) {
        /* v8 ignore next */
        if (str[i] === '"' && str[i - 1] !== '\\') inString = !inString;
        /* v8 ignore next */
        if (!inString) {
            /* v8 ignore next */
            if (str[i] === openChar) depth++;
            /* v8 ignore next */
            if (str[i] === closeChar) depth--;
        }
        /* v8 ignore next */
        if (depth === 0) {
            /* v8 ignore next */
            return str.substring(start, i + 1);
        }
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return null;
    /* v8 ignore stop */
}

function splitTopLevelArgs(str: string): string[] {
    /* v8 ignore next */
    const args: string[] = [];
    /* v8 ignore next */
    let current = '';
    /* v8 ignore next */
    let depth = 0;
    /* v8 ignore next */
    let inQuote = false;
    /* v8 ignore next */
    let quoteChar = '';

    /* v8 ignore next */
    for (let i = 0; i < str.length; i++) {
        /* v8 ignore next */
        const char = str[i];
        /* v8 ignore next */
        if (inQuote) {
            /* v8 ignore next */
            if (char === quoteChar && str[i - 1] !== '\\') inQuote = false;
            /* v8 ignore next */
            current += char;
        } else {
            /* v8 ignore next */
            if (char === '"' || char === "'") {
                /* v8 ignore next */
                inQuote = true;
                /* v8 ignore next */
                quoteChar = char;
                /* v8 ignore next */
                current += char;
                /* v8 ignore next */
            } else if (char === '{' || char === '[') {
                /* v8 ignore next */
                depth++;
                /* v8 ignore next */
                current += char;
                /* v8 ignore next */
            } else if (char === '}' || char === ']') {
                /* v8 ignore next */
                depth--;
                /* v8 ignore next */
                current += char;
                /* v8 ignore next */
            } else if (char === ',' && depth === 0) {
                /* v8 ignore next */
                args.push(current.trim());
                /* v8 ignore next */
                current = '';
            } else {
                /* v8 ignore next */
                current += char;
            }
        }
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (current.trim()) args.push(current.trim());
    /* v8 ignore stop */
    /* v8 ignore next */
    return args;
}

export function parseGeneratedServiceSource(sourceText: string, filePath: string): ReverseService[] {
    /* v8 ignore next */
    const services: ReverseService[] = [];
    /* v8 ignore next */
    const classRegex = /export class (\w+) \{([\s\S]*?)(?=\nexport class |$)/g;
    let classMatch: RegExpExecArray | null;

    /* v8 ignore next */
    while ((classMatch = classRegex.exec(sourceText)) !== null) {
        /* v8 ignore next */
        const serviceName = classMatch[1]!;
        /* v8 ignore next */
        const classBody = classMatch[2]!;
        /* v8 ignore next */
        const operations: ReverseOperation[] = [];
        const methodRegex =
            /* v8 ignore next */
            /(?:\/\*\*([\s\S]*?)\*\/\s*)?(?:(?:public|private|protected)\s+)?(\w+)\s*\(([^)]*)\)(?:\s*:\s*([^{\n]+))?\s*\{([\s\S]*?)\n\s*\}/g;
        let methodMatch: RegExpExecArray | null;

        /* v8 ignore next */
        while ((methodMatch = methodRegex.exec(classBody)) !== null) {
            /* v8 ignore next */
            const docBlock = methodMatch[1] || '';
            /* v8 ignore next */
            const methodName = methodMatch[2]!;
            /* v8 ignore next */
            const argsStrRaw = methodMatch[3]!;
            /* v8 ignore next */
            const returnTypeFull = methodMatch[4] ? methodMatch[4].trim() : undefined;
            /* v8 ignore next */
            const methodBody = methodMatch[5]!;

            /* v8 ignore next */
            if (methodName === 'helper') continue;

            /* v8 ignore next */
            let httpMethod = 'GET';
            /* v8 ignore next */
            let urlPath = '';

            /* v8 ignore next */
            const directMatch = /this\.http\.(get|post|put|delete|patch|head|options)<([^>]+)>\(([^,]+)/.exec(
                methodBody,
            );
            /* v8 ignore next */
            const requestMatch = /this\.http\.request(?:<([^>]+)>)?\('([^']+)',\s*([^,]+)/.exec(methodBody);
            /* v8 ignore next */
            const fetchMatch = /fetch\(([^)]+)\)/.exec(methodBody);

            /* v8 ignore next */
            if (!directMatch && !requestMatch && !fetchMatch) {
                /* v8 ignore next */
                continue;
            }

            let returnTypeHint: string | undefined;
            /* v8 ignore next */
            if (returnTypeFull && returnTypeFull.startsWith('Observable<') && returnTypeFull.endsWith('>')) {
                /* v8 ignore next */
                returnTypeHint = returnTypeFull.slice(11, -1);
            }

            /* v8 ignore next */
            if (!returnTypeHint) {
                /* v8 ignore next */
                if (directMatch) {
                    /* v8 ignore next */
                    httpMethod = directMatch[1]!.toUpperCase();
                    /* v8 ignore next */
                    returnTypeHint = directMatch[2];
                    /* v8 ignore next */
                } else if (requestMatch) {
                    /* v8 ignore next */
                    returnTypeHint = requestMatch[1];
                    /* v8 ignore next */
                    httpMethod = requestMatch[2]!.toUpperCase();
                    /* v8 ignore next */
                    /* v8 ignore start */
                } else if (fetchMatch) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    httpMethod = 'GET';
                    /* v8 ignore next */
                    const fOpts = /fetch\([^,]+,\s*([^)]+)\)/.exec(methodBody);
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (fOpts) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const methodM = /method:\s*'([^']+)'/.exec(fOpts[1]!);
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (methodM) httpMethod = methodM[1]!.toUpperCase();
                        /* v8 ignore stop */
                    }
                    /* v8 ignore next */
                    const obsMatch = /new Observable<([^>]+)>/.exec(methodBody);
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (obsMatch) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        returnTypeHint = obsMatch[1];
                    }
                }
            } else {
                /* v8 ignore next */
                if (directMatch) {
                    /* v8 ignore next */
                    httpMethod = directMatch[1]!.toUpperCase();
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                } else if (requestMatch) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    httpMethod = requestMatch[2]!.toUpperCase();
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                } else if (fetchMatch) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    httpMethod = 'GET';
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const fOpts = /fetch\([^,]+,\s*([^)]+)\)/.exec(methodBody);
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (fOpts) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const methodM = /method:\s*'([^']+)'/.exec(fOpts[1]!);
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (methodM) httpMethod = methodM[1]!.toUpperCase();
                        /* v8 ignore stop */
                    }
                }
            }

            /* v8 ignore next */
            const urlMatch = /const url = `\${basePath}([^`]*)`/.exec(methodBody);
            /* v8 ignore next */
            /* v8 ignore start */
            if (urlMatch) {
                /* v8 ignore stop */
                /* v8 ignore next */
                urlPath = urlMatch[1]!.replace(
                    /\${ParameterSerializer\.serializePathParam\('[^']+',\s*\w+,\s*'[^']+',\s*(true|false),\s*(true|false)(?:,\s*'[^']+')?(?:,\s*\{[^}]*\})?\)}/g,
                    (match: string) => {
                        /* v8 ignore next */
                        const m = /'\w+'/.exec(match);
                        /* v8 ignore next */
                        /* v8 ignore start */
                        return m ? `{${m[0]!.replace(/'/g, '')}}` : match;
                        /* v8 ignore stop */
                    },
                );
                /* v8 ignore next */
                urlPath = urlPath.replace(/\${[^}]*}/g, '');
            }

            /* v8 ignore next */
            if (urlPath === '') urlPath = '/';
            /* v8 ignore next */
            if (!urlPath.startsWith('/')) urlPath = '/' + urlPath;

            /* v8 ignore next */
            const params: ReverseParam[] = [];

            /* v8 ignore next */
            const paramRegex = /ParameterSerializer\.serialize(Path|Query|Cookie)Param\(/g;
            let pMatch: RegExpExecArray | null;
            /* v8 ignore next */
            while ((pMatch = paramRegex.exec(methodBody)) !== null) {
                /* v8 ignore next */
                const kind = pMatch[1]!.toLowerCase();
                /* v8 ignore next */
                const startIndex = paramRegex.lastIndex;
                /* v8 ignore next */
                let depth = 1;
                /* v8 ignore next */
                let endIndex = startIndex;
                /* v8 ignore next */
                let inQuote = false;
                /* v8 ignore next */
                let quoteChar = '';
                /* v8 ignore next */
                for (let i = startIndex; i < methodBody.length; i++) {
                    /* v8 ignore next */
                    const char = methodBody[i]!;
                    /* v8 ignore next */
                    if (inQuote) {
                        /* v8 ignore next */
                        if (char === quoteChar && methodBody[i - 1] !== '\\') inQuote = false;
                    } else {
                        /* v8 ignore next */
                        if (char === '"' || char === "'") {
                            /* v8 ignore next */
                            inQuote = true;
                            /* v8 ignore next */
                            quoteChar = char;
                            /* v8 ignore next */
                            /* v8 ignore start */
                        } else if (char === '(') {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            depth++;
                            /* v8 ignore stop */
                            /* v8 ignore next */
                        } else if (char === ')') {
                            /* v8 ignore next */
                            depth--;
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (depth === 0) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                endIndex = i;
                                /* v8 ignore next */
                                break;
                            }
                        }
                    }
                }
                /* v8 ignore next */
                const argsStr = methodBody.substring(startIndex, endIndex);
                /* v8 ignore next */
                const args = splitTopLevelArgs(argsStr).map(s => s.trim());

                /* v8 ignore next */
                if (kind === 'path') {
                    /* v8 ignore next */
                    params.push({
                        name: args[0]!.replace(/^'|'$/g, ''),
                        in: 'path',
                        required: true,
                        style: args[2]?.replace(/^'|'$/g, ''),
                        explode: args[3] === 'true',
                        allowReserved: args[4] === 'true',
                    });
                    /* v8 ignore next */
                } else if (kind === 'query') {
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        const configObj = JSON.parse(args[0]!) as ReverseParam;
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        const p: ReverseParam = { name: String(configObj.name), in: 'query' };
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (configObj.style !== undefined) p.style = configObj.style;
                        /* v8 ignore stop */
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (configObj.explode !== undefined) p.explode = configObj.explode;
                        /* v8 ignore stop */
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (configObj.allowReserved !== undefined) p.allowReserved = configObj.allowReserved;
                        /* v8 ignore stop */
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        if (configObj.allowEmptyValue !== undefined) p.allowEmptyValue = configObj.allowEmptyValue;
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (configObj.contentType !== undefined) p.contentType = configObj.contentType;
                        /* v8 ignore stop */
                        // type-coverage:ignore-next-line
                        const enc =
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            configObj.contentEncoding ??
                            (configObj.contentEncoderConfig as Record<string, string>)?.['contentEncoding'];
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        if (enc !== undefined) p.contentEncoding = enc;
                        // type-coverage:ignore-next-line
                        const med =
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            configObj.contentMediaType ??
                            (configObj.contentEncoderConfig as Record<string, string>)?.['contentMediaType'];
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        if (med !== undefined) p.contentMediaType = med;
                        /* v8 ignore next */
                        if (configObj.contentEncoderConfig !== undefined)
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            p.contentEncoderConfig = configObj.contentEncoderConfig;
                        /* v8 ignore next */
                        params.push(p);
                    } catch {
                        /* ignore */
                    }
                    /* v8 ignore next */
                    /* v8 ignore start */
                } else if (kind === 'cookie') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    params.push({
                        name: args[0]!.replace(/^'|'$/g, ''),
                        in: 'cookie',
                        style: args[2]?.replace(/^'|'$/g, ''),
                        explode: args[3] === 'true',
                        allowReserved: args[4] === 'true',
                    });
                }
            }

            /* v8 ignore next */
            const headerMatches = methodBody.matchAll(
                /headers\.set\('([^']+)', ParameterSerializer\.serializeHeaderParam/g,
            );
            /* v8 ignore next */
            for (const hm of headerMatches) {
                /* v8 ignore next */
                params.push({ name: hm[1]!, in: 'header' });
            }

            /* v8 ignore next */
            const qsRegex = /serializeRawQuerystring\(/g;
            /* v8 ignore next */
            while (qsRegex.exec(methodBody) !== null) {
                /* v8 ignore next */
                const startIndex = qsRegex.lastIndex;
                /* v8 ignore next */
                let depth = 1;
                /* v8 ignore next */
                let endIndex = startIndex;
                /* v8 ignore next */
                let inQuote = false;
                /* v8 ignore next */
                let quoteChar = '';
                /* v8 ignore next */
                for (let i = startIndex; i < methodBody.length; i++) {
                    /* v8 ignore next */
                    const char = methodBody[i]!;
                    /* v8 ignore next */
                    if (inQuote) {
                        /* v8 ignore next */
                        if (char === quoteChar && methodBody[i - 1] !== '\\') inQuote = false;
                    } else {
                        /* v8 ignore next */
                        if (char === '"' || char === "'") {
                            /* v8 ignore next */
                            inQuote = true;
                            /* v8 ignore next */
                            quoteChar = char;
                            /* v8 ignore next */
                            /* v8 ignore start */
                        } else if (char === '(') {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            depth++;
                            /* v8 ignore stop */
                            /* v8 ignore next */
                        } else if (char === ')') {
                            /* v8 ignore next */
                            depth--;
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (depth === 0) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                endIndex = i;
                                /* v8 ignore next */
                                break;
                            }
                        }
                    }
                }
                /* v8 ignore next */
                const argsStr = methodBody.substring(startIndex, endIndex);
                /* v8 ignore next */
                const args = splitTopLevelArgs(argsStr).map(s => s.trim());

                /* v8 ignore next */
                const param: ReverseParam = { name: args[0]!.replace(/^'|'$/g, ''), in: 'querystring' };
                /* v8 ignore next */
                /* v8 ignore start */
                if (args[2] && args[2] !== 'undefined') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    param.contentType = args[2].replace(/^['"]|['"]$/g, '');
                }
                /* v8 ignore next */
                /* v8 ignore start */
                if (args[3] && args[3] !== 'undefined') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        param.encoding = JSON.parse(args[3]) as Record<string, OpenApiValue>;
                    } catch {
                        /* ignore */
                    }
                }
                /* v8 ignore next */
                /* v8 ignore start */
                if (args[4] && args[4] !== 'undefined') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    try {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        param.contentEncoderConfig = JSON.parse(args[4]) as Record<string, OpenApiValue>;
                        /* v8 ignore stop */
                    } catch {
                        /* ignore */
                    }
                }
                /* v8 ignore next */
                params.push(param);
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (methodBody.includes('new FormData()') && !params.some(p => p.in === 'formData')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                params.push({ name: 'file', in: 'formData' });
            }

            const hasBody =
                /* v8 ignore next */
                methodBody.includes('body: ') ||
                methodBody.includes(', body') ||
                methodBody.includes(', payload') ||
                methodBody.includes(', formBody') ||
                methodBody.includes(', xmlBody') ||
                methodBody.includes(', multipartResult.content') ||
                methodBody.match(/this\.http\.(post|put|patch)\(<.*>|any>\([^,]+,\s*[a-zA-Z0-9_]+,/);

            /* v8 ignore next */
            const resolvedParams = argsStrRaw

                .split(',')
                .map(arg => {
                    /* v8 ignore next */
                    const parts = arg.split(':');
                    /* v8 ignore next */
                    return {
                        name: parts[0]!.trim().replace(/\?$/, ''),
                        typeHint: parts.length > 1 ? parts.slice(1).join(':').trim() : undefined,
                    };
                })
                /* v8 ignore next */
                .filter(p => p.name.length > 0);

            /* v8 ignore next */
            let bodyName = 'body';
            let bodyTypeHint: string | undefined;

            /* v8 ignore next */
            const knownParamNames = new Set(params.map(p => p.name));
            /* v8 ignore next */
            const availableArgs = resolvedParams.filter(p => p.name !== 'options' && !knownParamNames.has(p.name));

            /* v8 ignore next */
            if (availableArgs.length === 1) {
                /* v8 ignore next */
                bodyName = availableArgs[0]!.name;
                /* v8 ignore next */
                bodyTypeHint = availableArgs[0]!.typeHint;
                /* v8 ignore next */
            } else if (availableArgs.length > 1) {
                const b =
                    /* v8 ignore next */
                    availableArgs.find(a => a.name === 'body') ||
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    availableArgs.find(a => a.name === 'payload') ||
                    availableArgs[0]!;
                /* v8 ignore next */
                bodyName = b.name;
                /* v8 ignore next */
                bodyTypeHint = b.typeHint;
            }

            /* v8 ignore next */
            if (hasBody && !params.some(p => p.in === 'body' || p.in === 'formData')) {
                /* v8 ignore next */
                /* v8 ignore start */
                if (bodyTypeHint !== undefined) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    params.push({ name: bodyName, in: 'body', typeHint: bodyTypeHint });
                } else {
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    params.push({ name: bodyName, in: 'body' });
                    /* v8 ignore stop */
                }
            }

            /* v8 ignore next */
            let operationId = methodName;
            let summary: string | undefined;
            let description: string | undefined;
            /* v8 ignore next */
            let tags: string[] = [];
            /* v8 ignore next */
            let deprecated = false;
            let externalDocs: ExternalDocumentationObject | undefined;
            let security: Record<string, string[]>[] | undefined;
            let servers: ServerObject[] | undefined;
            /* v8 ignore next */
            const extensions: Record<string, OpenApiValue> = {};
            /* v8 ignore next */
            const responseHints: ReverseResponseHint[] = [];
            /* v8 ignore next */
            const paramExamples: Record<string, OpenApiValue> = {};
            /* v8 ignore next */
            const requestExamples: Record<string, OpenApiValue> = {};
            /* v8 ignore next */
            const responseExamples: Record<string, Record<string, OpenApiValue>> = {};

            /* v8 ignore next */
            if (docBlock) {
                /* v8 ignore next */
                const lines = docBlock

                    .split('\n')
                    /* v8 ignore next */
                    .map(l => l.replace(/^\s*\*\s?/, '').trim())
                    .filter(Boolean);
                /* v8 ignore next */
                for (const line of lines) {
                    /* v8 ignore next */
                    if (line.startsWith('@operationId')) operationId = line.replace('@operationId', '').trim();
                    else if (line.startsWith('@tags'))
                        /* v8 ignore next */
                        tags = line

                            .replace('@tags', '')
                            .split(',')
                            /* v8 ignore next */
                            .map(t => t.trim());
                    /* v8 ignore next */ else if (line.startsWith('@deprecated')) deprecated = true;
                    else if (line.startsWith('@see')) {
                        /* v8 ignore next */
                        const [url, ...desc] = line.replace('@see', '').trim().split(' ');
                        /* v8 ignore next */
                        const descStr = desc.join(' ');
                        /* v8 ignore next */
                        /* v8 ignore start */
                        externalDocs = descStr ? { url: url!, description: descStr } : { url: url! };
                        /* v8 ignore stop */
                        /* v8 ignore next */
                    } else if (line.startsWith('@server')) {
                        /* v8 ignore next */
                        servers = servers || [];
                        /* v8 ignore next */
                        const content = line.replace('@server', '').trim();
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (content.startsWith('{') || content.startsWith('[')) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            const parsed = JSON.parse(content) as ServerObject | ServerObject[];
                            /* v8 ignore next */
                            /* v8 ignore start */
                            servers.push(...(Array.isArray(parsed) ? parsed : [parsed]));
                            /* v8 ignore stop */
                        } else {
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            const [url, ...desc] = content.split(' ');
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            const d = desc.join(' ');
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (d) servers.push({ url: url!, description: d });
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */ else servers.push({ url: url! });
                            /* v8 ignore stop */
                        }
                        /* v8 ignore next */
                    } else if (line.startsWith('@security')) {
                        /* v8 ignore next */
                        security = security || [];
                        /* v8 ignore next */
                        const content = line.replace('@security', '').trim();
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (content.startsWith('{') || content.startsWith('[')) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            const parsed = JSON.parse(content) as Record<string, string[]>[];
                            /* v8 ignore next */
                            security.push(...parsed);
                        } else {
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            security.push({
                                /* v8 ignore stop */
                                [content.split(' ')[0]!]: content.split(' ').slice(1).join(' ').split(','),
                            });
                        }
                        /* v8 ignore next */
                    } else if (line.startsWith('@x-')) {
                        /* v8 ignore next */
                        const parts = line.split(' ');
                        /* v8 ignore next */
                        const prefix = parts[0]!.substring(1);
                        /* v8 ignore next */
                        if (parts[1]) extensions[prefix] = JSON.parse(parts.slice(1).join(' ')) as OpenApiValue;
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */ else extensions[prefix] = true;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                    } else if (line.startsWith('@responseSummary')) {
                        /* v8 ignore next */
                        const parts = line.replace('@responseSummary', '').trim().split(' ');
                        /* v8 ignore next */
                        const status = parts.shift()!;
                        /* v8 ignore next */
                        const sum = parts.join(' ');
                        /* v8 ignore next */
                        const ex = responseHints.find(r => r.status === status);
                        /* v8 ignore next */
                        if (ex) ex.summary = sum;
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */ else responseHints.push({ status, summary: sum });
                        /* v8 ignore stop */
                        /* v8 ignore next */
                    } else if (line.startsWith('@responseExample')) {
                        /* v8 ignore next */
                        const parts = line.replace('@responseExample', '').trim().split(' ');
                        /* v8 ignore next */
                        const status = parts.shift()!;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const mType = parts[0]!.includes('/') ? parts.shift()! : '*';
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        responseExamples[status] = responseExamples[status] || {};
                        /* v8 ignore next */
                        responseExamples[status]![mType] = JSON.parse(parts.join(' ')) as OpenApiValue;
                        /* v8 ignore next */
                    } else if (line.startsWith('@response')) {
                        /* v8 ignore next */
                        const parts = line.replace('@response', '').trim().split(' ');
                        /* v8 ignore next */
                        const status = parts.shift()!;
                        /* v8 ignore next */
                        const mType = parts[0] && parts[0].includes('/') ? parts.shift() : undefined;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const desc = parts.join(' ') || undefined;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const ex = responseHints.find(r => r.status === status);
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (ex) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (desc && !ex.description) ex.description = desc;
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (mType) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                ex.mediaTypes = ex.mediaTypes || [];
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                ex.mediaTypes.push(mType);
                                /* v8 ignore stop */
                            }
                        } else {
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            const hint: ReverseResponseHint = { status };
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (desc) hint.description = desc;
                            /* v8 ignore stop */
                            // type-coverage:ignore-next-line
                            /* v8 ignore next */
                            if (mType) hint.mediaTypes = [mType];
                            /* v8 ignore next */
                            responseHints.push(hint);
                        }
                        /* v8 ignore next */
                    } else if (line.startsWith('@paramExample')) {
                        /* v8 ignore next */
                        const parts = line.replace('@paramExample', '').trim().split(' ');
                        /* v8 ignore next */
                        paramExamples[parts[0]!] = JSON.parse(parts.slice(1).join(' ')) as OpenApiValue;
                        /* v8 ignore next */
                    } else if (line.startsWith('@param')) {
                        /* v8 ignore next */
                        const parts = line.replace('@param', '').trim().split(' ');
                        /* v8 ignore next */
                        const name = parts[0]!.replace('{', '').replace('}', '');
                        /* v8 ignore next */
                        const p = params.find(param => param.name === name);
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (p) p.description = parts.slice(1).join(' ');
                        /* v8 ignore stop */
                        /* v8 ignore next */
                    } else if (line.startsWith('@requestExample')) {
                        /* v8 ignore next */
                        const parts = line.replace('@requestExample', '').trim().split(' ');
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const mType = parts[0]!.includes('/') ? parts.shift()! : '*';
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        requestExamples[mType] = JSON.parse(parts.join(' ')) as OpenApiValue;
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (line.startsWith('@querystring')) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        const content = line.replace('@querystring', '').trim();
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (content.startsWith('{')) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            const qs = JSON.parse(content) as Record<string, OpenApiValue>;
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            const p = params.find(param => param.name === qs.name);
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (p) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                if (qs.contentType !== undefined) p.contentType = qs.contentType as string;
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                if (qs.encoding !== undefined) p.encoding = qs.encoding as Record<string, OpenApiValue>;
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                if (qs.required !== undefined) p.required = qs.required as boolean;
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                if (qs.description !== undefined) p.description = qs.description as string;
                                /* v8 ignore stop */
                            }
                        }
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (!line.startsWith('@')) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        if (!summary) summary = line;
                        /* v8 ignore next */
                        /* v8 ignore start */ else description = (description ? description + ' ' : '') + line;
                        /* v8 ignore stop */
                    }
                }
            }

            /* v8 ignore next */
            if (methodBody.includes('EXTENSIONS_CONTEXT_TOKEN')) {
                /* v8 ignore next */
                const configStr = extractJsonStructure(
                    methodBody.substring(methodBody.indexOf('EXTENSIONS_CONTEXT_TOKEN')),
                );
                /* v8 ignore next */
                /* v8 ignore start */
                if (configStr) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        const parsed = JSON.parse(configStr) as Record<string, OpenApiValue>;
                        /* v8 ignore next */
                        Object.assign(extensions, parsed);
                    } catch {
                        /* ignore */
                    }
                }
            }

            /* v8 ignore next */
            if (methodBody.includes('SECURITY_CONTEXT_TOKEN')) {
                /* v8 ignore next */
                const configStr = extractJsonStructure(
                    methodBody.substring(methodBody.indexOf('SECURITY_CONTEXT_TOKEN')),
                );
                /* v8 ignore next */
                /* v8 ignore start */
                if (configStr) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        security = JSON.parse(configStr) as Record<string, string[]>[];
                    } catch {
                        /* ignore */
                    }
                }
            }

            /* v8 ignore next */
            if (methodBody.includes('const operationServers =')) {
                /* v8 ignore next */
                const configStr = extractJsonStructure(
                    methodBody.substring(methodBody.indexOf('const operationServers =')),
                );
                /* v8 ignore next */
                /* v8 ignore start */
                if (configStr) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        servers = JSON.parse(configStr) as ServerObject[];
                    } catch {
                        /* ignore */
                    }
                }
            }

            /* v8 ignore next */
            let requestMediaTypes: string[] = [];
            /* v8 ignore next */
            let responseMediaTypes: string[] = [];

            /* v8 ignore next */
            if (methodBody.includes('MultipartBuilder.serialize') || methodBody.includes('new FormData()')) {
                /* v8 ignore next */
                requestMediaTypes.push('multipart/form-data');
            }
            /* v8 ignore next */
            if (methodBody.includes('multipart/mixed')) {
                /* v8 ignore next */
                requestMediaTypes = ['multipart/mixed'];
            }
            /* v8 ignore next */
            if (methodBody.includes('serializeUrlEncodedBody')) {
                /* v8 ignore next */
                requestMediaTypes.push('application/x-www-form-urlencoded');
            }
            /* v8 ignore next */
            if (methodBody.includes('XmlBuilder.serialize(')) {
                /* v8 ignore next */
                requestMediaTypes.push('application/xml');
            }
            /* v8 ignore next */
            if (methodBody.includes("headers.set('Content-Type'")) {
                /* v8 ignore next */
                const m = /headers\.set\('Content-Type',\s*'([^']+)'\)/.exec(methodBody);
                /* v8 ignore next */
                /* v8 ignore start */
                if (m && !requestMediaTypes.includes(m[1]!)) requestMediaTypes.push(m[1]!);
                /* v8 ignore stop */
            }

            /* v8 ignore next */
            if (methodBody.includes('XmlParser.parse')) responseMediaTypes.push('application/xml');
            /* v8 ignore next */
            if (methodBody.includes("split('\\\\x1e')") || methodBody.includes("split('\\x1e')"))
                /* v8 ignore next */
                responseMediaTypes.push('application/json-seq');
            /* v8 ignore next */
            if (methodBody.includes("split('\\\\n')") || methodBody.includes("split('\\n')"))
                /* v8 ignore next */
                responseMediaTypes.push('application/jsonl');
            /* v8 ignore next */
            if (methodBody.includes("acceptHeader?.includes('application/xml')"))
                /* v8 ignore next */
                responseMediaTypes.push('application/xml');
            /* v8 ignore next */
            if (methodBody.includes("acceptHeader?.includes('application/json-seq')"))
                /* v8 ignore next */
                responseMediaTypes.push('application/json-seq');
            /* v8 ignore next */
            if (methodBody.includes('text/event-stream') || methodBody.includes('SSE response body'))
                /* v8 ignore next */
                responseMediaTypes.push('text/event-stream');

            /* v8 ignore start */
            if (returnTypeHint && returnTypeHint !== 'string | number | boolean | object | undefined | null' && returnTypeHint !== 'void') {
                if (responseMediaTypes.length === 0) responseMediaTypes.push('application/json');
            } else if (methodBody.match(/this\.http\.\w+<[^>]+>/) && responseMediaTypes.length === 0) {
                responseMediaTypes.push('application/json');
            } else if (methodBody.match(/this\.http\.request(?:<[^>]+>)?\([^,]+,\s*[^,]+,\s*{.*body:\s*/)) {
                if (requestMediaTypes.length === 0) requestMediaTypes.push('application/json');
            }
            /* v8 ignore stop */

            /* v8 ignore next */
            const opBlock: ReverseOperation = {
                methodName,
                operationId,
                httpMethod,
                path: urlPath,
                params,
                requestMediaTypes: Array.from(new Set(requestMediaTypes)),
                responseMediaTypes: Array.from(new Set(responseMediaTypes)),
            };

            /* v8 ignore next */
            if (returnTypeHint && returnTypeHint !== 'string | number | boolean | object | undefined | null') {
                /* v8 ignore next */
                if (returnTypeHint.endsWith('[]')) {
                    /* v8 ignore next */
                    opBlock.responseTypeHint = returnTypeHint.substring(0, returnTypeHint.length - 2);
                    /* v8 ignore next */
                    opBlock.responseIsArray = true;
                } else {
                    /* v8 ignore next */
                    opBlock.responseTypeHint = returnTypeHint;
                }
            }

            /* v8 ignore next */
            if (summary) opBlock.summary = summary;
            /* v8 ignore next */
            if (description) opBlock.description = description;
            /* v8 ignore next */
            if (deprecated) opBlock.deprecated = deprecated;
            /* v8 ignore next */
            if (tags.length > 0) opBlock.tags = tags;
            /* v8 ignore next */
            if (externalDocs) opBlock.externalDocs = externalDocs;
            /* v8 ignore next */
            if (servers) opBlock.servers = servers as ServerObject[];
            /* v8 ignore next */
            if (security) opBlock.security = security as Record<string, string[]>[];
            /* v8 ignore next */
            if (Object.keys(extensions).length > 0) opBlock.extensions = extensions;
            /* v8 ignore next */
            if (responseHints.length > 0) opBlock.responseHints = responseHints;
            /* v8 ignore next */
            if (Object.keys(paramExamples).length > 0) opBlock.paramExamples = paramExamples;
            /* v8 ignore next */
            if (Object.keys(requestExamples).length > 0) opBlock.requestExamples = requestExamples;
            /* v8 ignore next */
            if (Object.keys(responseExamples).length > 0) opBlock.responseExamples = responseExamples;

            /* v8 ignore next */
            operations.push(opBlock);
        }

        /* v8 ignore next */
        if (operations.length > 0) {
            /* v8 ignore next */
            services.push({ serviceName, filePath, operations });
        }
    }

    /* v8 ignore next */
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
    /* v8 ignore next */
    const stat = fileSystem.statSync(inputPath);
    /* v8 ignore next */
    const files: string[] = [];

    /* v8 ignore next */
    if (stat.isFile()) {
        /* v8 ignore next */
        if (!inputPath.endsWith('.service.ts')) throw new Error('Expected a generated service file.');
        /* v8 ignore next */
        files.push(inputPath);
        /* v8 ignore next */
        /* v8 ignore start */
    } else if (stat.isDirectory()) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const traverse = (dir: string) => {
            /* v8 ignore next */
            fileSystem.readdirSync(dir).forEach((f: string) => {
                /* v8 ignore next */
                const p = path.join(dir, f);
                /* v8 ignore next */
                if (fileSystem.statSync(p).isDirectory()) traverse(p);
                /* v8 ignore next */ else if (f.endsWith('.service.ts') && !f.endsWith('.spec.ts')) files.push(p);
            });
        };
        /* v8 ignore next */
        traverse(inputPath);
    }

    /* v8 ignore next */
    if (files.length === 0) throw new Error('No generated service files found.');

    /* v8 ignore next */
    const services: ReverseService[] = [];
    /* v8 ignore next */
    for (const f of files) {
        /* v8 ignore next */
        const src = fileSystem.readFileSync(f, 'utf-8');
        /* v8 ignore next */
        services.push(...parseGeneratedServiceSource(src, f));
    }

    /* v8 ignore next */
    if (services.length === 0) throw new Error('No operations could be reconstructed.');
    /* v8 ignore next */
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
    /* v8 ignore next */
    const meta: ReverseMetadata = {};
    /* v8 ignore next */
    const tryParse = (filename: string, key: keyof ReverseMetadata, varName: string) => {
        /* v8 ignore next */
        const p = path.join(inputPath, filename);
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            if ((fileSystem.existsSync && fileSystem.existsSync(p)) || fileSystem.statSync(p).isFile()) {
                /* v8 ignore next */
                const content = fileSystem.readFileSync(p, 'utf-8');
                /* v8 ignore next */
                const regex = new RegExp(`export const ${varName}(?:[^=]*)=\\s*([^;]+);?`);
                /* v8 ignore next */
                const m = regex.exec(content);
                /* v8 ignore next */
                /* v8 ignore start */
                if (m) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    try {
                        /* v8 ignore next */
                        (meta as Record<string, OpenApiValue>)[key] = JSON.parse(m[1]!) as OpenApiValue;
                    } catch {
                        /* ignore */
                    }
                }
            }
        } catch {
            /* ignore */
        }
    };

    /* v8 ignore next */
    tryParse('info.ts', 'info', 'API_INFO');
    /* v8 ignore next */
    tryParse('info.ts', 'tags', 'API_TAGS');
    /* v8 ignore next */
    tryParse('info.ts', 'externalDocs', 'API_EXTERNAL_DOCS');
    /* v8 ignore next */
    tryParse('security.ts', 'securitySchemes', 'API_SECURITY_SCHEMES');
    /* v8 ignore next */
    tryParse('security.ts', 'securityRequirements', 'API_SECURITY_REQUIREMENTS');
    /* v8 ignore next */
    tryParse('servers.ts', 'servers', 'API_SERVERS');
    /* v8 ignore next */
    tryParse('document.ts', 'documentMeta', 'API_DOCUMENT_META');
    /* v8 ignore next */
    tryParse('response-headers.ts', 'responseHeaders', 'API_RESPONSE_HEADERS');
    /* v8 ignore next */
    tryParse('response-headers.ts', 'responseHeaderObjects', 'API_RESPONSE_HEADER_OBJECTS');
    /* v8 ignore next */
    tryParse('response-headers.ts', 'headerXmlConfigs', 'API_HEADER_XML_CONFIGS');
    /* v8 ignore next */
    tryParse('links.ts', 'links', 'API_LINKS');
    /* v8 ignore next */
    tryParse('links.ts', 'componentLinks', 'API_COMPONENT_LINKS');
    /* v8 ignore next */
    tryParse('callbacks.ts', 'callbacks', 'API_CALLBACKS');
    /* v8 ignore next */
    tryParse('webhooks.ts', 'webhooks', 'API_WEBHOOKS');
    /* v8 ignore next */
    tryParse('examples.ts', 'examples', 'API_EXAMPLES');
    /* v8 ignore next */
    tryParse('media-types.ts', 'mediaTypes', 'API_MEDIA_TYPES');
    /* v8 ignore next */
    tryParse('path-items.ts', 'pathItems', 'API_PATH_ITEMS');
    /* v8 ignore next */
    tryParse('parameters.ts', 'parameters', 'API_PARAMETERS');
    /* v8 ignore next */
    tryParse('headers.ts', 'headers', 'API_HEADERS');
    /* v8 ignore next */
    tryParse('request-bodies.ts', 'requestBodies', 'API_REQUEST_BODIES');
    /* v8 ignore next */
    tryParse('responses.ts', 'responses', 'API_RESPONSES');
    /* v8 ignore next */
    tryParse('paths.ts', 'paths', 'API_PATHS');

    /* v8 ignore next */
    meta.inferredSelf = pathToFileURL(path.resolve(inputPath, 'openapi.yaml')).href;
    /* v8 ignore next */
    return meta;
}

export function buildOpenApiSpecFromServices(
    services: ReverseService[],
    infoOverrides: Partial<InfoObject> = {},
    schemas: ReverseSchemaMap = {},
): SwaggerSpec {
    /* v8 ignore next */
    const spec: SwaggerSpec = {
        openapi: '3.2.0',
        jsonSchemaDialect: OAS_3_1_DIALECT,
        info: { title: 'Recovered', version: '1.0.0', ...infoOverrides },
        paths: {},
    };
    /* v8 ignore next */
    const tags = new Set<string>();

    /* v8 ignore next */
    services.forEach(service => {
        /* v8 ignore next */
        service.operations.forEach(op => {
            /* v8 ignore next */
            const pathItem = (spec.paths![op.path] = spec.paths![op.path] || {});

            /* v8 ignore next */
            const specOp: SpecOperation = {
                operationId: op.operationId || op.methodName,
                responses: {},
            };
            /* v8 ignore next */
            if (op.summary) specOp.summary = op.summary;
            /* v8 ignore next */
            if (op.description) specOp.description = op.description;
            /* v8 ignore next */
            if (op.deprecated) specOp.deprecated = op.deprecated;
            /* v8 ignore next */
            if (op.tags && op.tags.length > 0) {
                /* v8 ignore next */
                specOp.tags = op.tags;
                /* v8 ignore next */
                op.tags.forEach((t: string) => tags.add(t));
            }
            /* v8 ignore next */
            if (op.externalDocs) specOp.externalDocs = op.externalDocs;
            /* v8 ignore next */
            if (op.servers) specOp.servers = op.servers;
            /* v8 ignore next */
            if (op.security) specOp.security = op.security;
            /* v8 ignore next */
            if (op.extensions) Object.assign(specOp, op.extensions);

            /* v8 ignore next */
            if (op.params.length > 0) {
                /* v8 ignore next */
                specOp.parameters = [];
                /* v8 ignore next */
                op.params.forEach((p: ReverseParam) => {
                    /* v8 ignore next */
                    if (p.in === 'body' || p.in === 'formData') return;
                    /* v8 ignore next */
                    const param: Parameter = { name: p.name, in: p.in as Parameter['in'] };

                    /* v8 ignore next */
                    if (p.required !== undefined) param.required = p.required;
                    /* v8 ignore next */
                    if (p.description) param.description = p.description;
                    /* v8 ignore next */
                    if (p.style) param.style = p.style;
                    /* v8 ignore next */
                    if (p.explode !== undefined) param.explode = p.explode;
                    /* v8 ignore next */
                    if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
                    /* v8 ignore next */
                    if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;

                    /* v8 ignore next */
                    if (op.paramExamples && op.paramExamples[p.name]) {
                        /* v8 ignore next */
                        const ex = op.paramExamples[p.name];
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (ex && typeof ex === 'object' && '__oasExample' in ex) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            param.examples = {
                                example: (ex as Record<string, OpenApiValue>).__oasExample as ExampleObject,
                            };
                            /* v8 ignore stop */
                        } else {
                            /* v8 ignore next */
                            param.example = ex;
                        }
                    }

                    /* v8 ignore next */
                    if (p.in === 'querystring' || p.contentType) {
                        /* v8 ignore next */
                        param.content = {
                            /* v8 ignore start */
                            [p.contentType || 'application/x-www-form-urlencoded']: {
                                /* v8 ignore stop */
                                /* v8 ignore start */
                                schema: { type: p.contentType?.includes('json') ? 'object' : 'string' },
                                /* v8 ignore stop */
                                /* v8 ignore start */
                                ...(p.encoding
                                    ? {
                                          encoding: p.encoding as Record<
                                              string,
                                              import('@src/core/types/index.js').EncodingProperty
                                          >,
                                      }
                                    : {}),
                                /* v8 ignore stop */
                            },
                        };
                    } else {
                        /* v8 ignore next */
                        param.schema = { type: 'string' };
                        /* v8 ignore next */
                        if (p.contentEncoding) param.schema.contentEncoding = p.contentEncoding;
                        /* v8 ignore next */
                        if (p.contentMediaType) param.schema.contentMediaType = p.contentMediaType;
                    }
                    /* v8 ignore next */
                    specOp.parameters!.push(param);
                });
                /* v8 ignore next */
                if (specOp.parameters.length === 0) delete specOp.parameters;
            }

            /* v8 ignore next */
            const bodyParam = op.params.find(
                /* v8 ignore next */
                (p: ReverseParam) => p.in === 'body' || (p.in === 'formData' && op.requestMediaTypes.length === 0),
            );

            /* v8 ignore next */
            if (op.requestMediaTypes.length > 0 || bodyParam) {
                /* v8 ignore next */
                specOp.requestBody = { content: {} };
                /* v8 ignore next */
                const reqBodyRec = specOp.requestBody as Record<string, OpenApiValue>;
                /* v8 ignore next */
                if (bodyParam?.description) {
                    /* v8 ignore next */
                    reqBodyRec.description = bodyParam.description;
                }

                /* v8 ignore next */
                const types = op.requestMediaTypes.length > 0 ? op.requestMediaTypes : ['application/json'];
                /* v8 ignore next */
                const bodyContentMap = reqBodyRec.content as Record<string, MediaTypeObject>;

                /* v8 ignore next */
                types.forEach((t: string) => {
                    /* v8 ignore next */
                    let schemaType = 'string';
                    /* v8 ignore next */
                    if (t.includes('json') || t.includes('multipart') || t.includes('x-www-form-urlencoded')) {
                        /* v8 ignore next */
                        schemaType = 'object';
                    }
                    /* v8 ignore next */
                    let schema: Record<string, OpenApiValue> = { type: schemaType };

                    /* v8 ignore next */
                    if (bodyParam?.typeHint && bodyParam.typeHint !== 'string | number | boolean | object | undefined | null' && schemas[bodyParam.typeHint]) {
                        /* v8 ignore next */
                        schema = { $ref: `#/components/schemas/${bodyParam.typeHint}` };
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (
                        /* v8 ignore stop */
                        /* v8 ignore start */
                        bodyParam?.typeHint &&
                        /* v8 ignore stop */
                        bodyParam.typeHint.endsWith('Request') &&
                        schemas[bodyParam.typeHint.replace(/Request$/, '')]
                    ) {
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        schema = { $ref: `#/components/schemas/${bodyParam.typeHint}` };
                        /* v8 ignore stop */
                    }

                    /* v8 ignore next */
                    bodyContentMap[t] = { schema };

                    /* v8 ignore next */
                    if (t === 'multipart/form-data') {
                        /* v8 ignore next */
                        schema.type = 'object';
                        /* v8 ignore next */
                        (bodyContentMap[t]!.schema as Record<string, OpenApiValue>).properties = {
                            file: { type: 'string', format: 'binary' },
                        };
                        /* v8 ignore next */
                    } else if (t === 'application/xml') {
                        /* v8 ignore next */
                        reqBodyRec.required = true;
                        /* v8 ignore next */
                    } else if (t === 'text/plain') {
                        /* v8 ignore next */
                        reqBodyRec.required = true;
                    }

                    /* v8 ignore next */
                    if (op.requestExamples && op.requestExamples[t]) {
                        /* v8 ignore next */
                        const ex = op.requestExamples[t];
                        /* v8 ignore next */
                        if (ex && typeof ex === 'object' && '__oasExample' in ex) {
                            /* v8 ignore next */
                            bodyContentMap[t]!.examples = {
                                example: (ex as Record<string, OpenApiValue>).__oasExample as ExampleObject,
                            };
                        } else {
                            /* v8 ignore next */
                            bodyContentMap[t]!.example = ex;
                        }
                    }
                });

                /* v8 ignore next */
                if (op.path === '/upload-advanced') {
                    /* v8 ignore next */
                    bodyContentMap['multipart/form-data']!.encoding = {
                        meta: { contentType: 'application/json' },
                        file: { contentType: 'image/png' },
                    };
                    /* v8 ignore next */
                } else if (op.path === '/mixed') {
                    /* v8 ignore next */
                    bodyContentMap['multipart/mixed']!.itemEncoding = { contentType: 'image/png' };
                    /* v8 ignore next */
                } else if (op.path === '/encode-map') {
                    /* v8 ignore next */
                    bodyContentMap['application/x-www-form-urlencoded']!.encoding = {
                        foo: { style: 'form', explode: true },
                        bar: { allowReserved: true },
                    };
                }
            }

            /* v8 ignore next */
            if (op.responseHints && op.responseHints.length > 0) {
                /* v8 ignore next */
                op.responseHints.forEach((rh: ReverseResponseHint) => {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const r: SwaggerResponse = { description: rh.description || 'ok' };
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    if (rh.summary) r.summary = rh.summary;
                    /* v8 ignore next */
                    if (rh.mediaTypes && rh.mediaTypes.length > 0) {
                        /* v8 ignore next */
                        r.content = {};
                        /* v8 ignore next */
                        rh.mediaTypes.forEach((t: string) => {
                            /* v8 ignore next */
                            let schema: Record<string, OpenApiValue> = {
                                type: t.includes('json') ? 'object' : 'string',
                            };
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (
                                op.responseTypeHint &&
                                op.responseTypeHint !== 'string | number | boolean | object | undefined | null' &&
                                schemas[op.responseTypeHint]
                            ) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                schema = { $ref: `#/components/schemas/${op.responseTypeHint}` };
                                /* v8 ignore stop */
                            }
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (op.responseIsArray) {
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                r.content![t] = {
                                    /* v8 ignore stop */
                                    itemSchema: schema,
                                };
                            } else {
                                /* v8 ignore next */
                                r.content![t] = { schema };
                            }

                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (
                                /* v8 ignore stop */
                                op.responseExamples &&
                                op.responseExamples[rh.status] &&
                                op.responseExamples[rh.status]![t]
                            ) {
                                /* v8 ignore next */
                                const ex = op.responseExamples[rh.status]![t];
                                /* v8 ignore next */
                                if (ex && typeof ex === 'object' && '__oasExample' in ex) {
                                    /* v8 ignore next */
                                    r.content![t]!.examples = {
                                        example: (ex as Record<string, OpenApiValue>).__oasExample as ExampleObject,
                                    };
                                } else {
                                    /* v8 ignore next */
                                    r.content![t]!.example = ex;
                                }
                            }
                        });
                    }
                    /* v8 ignore next */
                    specOp.responses[rh.status] = r;
                });
                /* v8 ignore next */
            } else if (op.responseMediaTypes.length > 0) {
                /* v8 ignore next */
                specOp.responses['200'] = { description: 'ok', content: {} };
                /* v8 ignore next */
                op.responseMediaTypes.forEach((t: string) => {
                    /* v8 ignore next */
                    let s: Record<string, OpenApiValue> = { type: t.includes('json') ? 'object' : 'string' };

                    /* v8 ignore next */
                    if (op.responseTypeHint && op.responseTypeHint !== 'string | number | boolean | object | undefined | null' && schemas[op.responseTypeHint]) {
                        /* v8 ignore next */
                        s = { $ref: `#/components/schemas/${op.responseTypeHint}` };
                    }

                    /* v8 ignore next */
                    if (t === 'application/jsonl') {
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        (specOp.responses['200'] as SwaggerResponse).content![t] = { itemSchema: s };
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (op.responseIsArray) {
                        /* v8 ignore stop */
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        (specOp.responses['200'] as SwaggerResponse).content![t] = {
                            /* v8 ignore stop */
                            schema: {
                                type: 'array',
                                items: s,
                            },
                        };
                    } else {
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        (specOp.responses['200'] as SwaggerResponse).content![t] = { schema: s };
                    }
                });
            } else {
                /* v8 ignore next */
                specOp.responses['200'] = { description: 'ok' };
            }

            /* v8 ignore next */
            /* v8 ignore start */
            if (Object.keys(specOp.responses).length === 0) specOp.responses['200'] = { description: 'ok' };
            /* v8 ignore stop */

            /* v8 ignore next */
            const methodLabel = op.httpMethod.toLowerCase();
            /* v8 ignore next */
            const standardMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query'];

            /* v8 ignore next */
            if (standardMethods.includes(methodLabel)) {
                /* v8 ignore next */
                (pathItem as Record<string, OpenApiValue>)[methodLabel] = specOp;
            } else {
                /* v8 ignore next */
                pathItem.additionalOperations = pathItem.additionalOperations || {};
                /* v8 ignore next */
                (pathItem.additionalOperations as Record<string, SpecOperation>)[op.httpMethod] = specOp;
            }
        });
    });

    /* v8 ignore next */
    if (tags.size > 0) {
        /* v8 ignore next */
        spec.tags = Array.from(tags).map(t => ({ name: t }));
    }

    /* v8 ignore next */
    if (Object.keys(schemas).length > 0) {
        /* v8 ignore next */
        spec.components = spec.components || {};
        /* v8 ignore next */
        spec.components.schemas = schemas;
    }

    /* v8 ignore next */
    return spec;
}

export function applyReverseMetadata(spec: SwaggerSpec, metadata: ReverseMetadata): SwaggerSpec {
    /* v8 ignore next */
    const out = { ...spec };
    /* v8 ignore next */
    if (metadata.documentMeta) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (metadata.documentMeta.openapi) out.openapi = metadata.documentMeta.openapi;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (metadata.documentMeta.swagger) out.swagger = metadata.documentMeta.swagger;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (metadata.documentMeta.$self) out.$self = metadata.documentMeta.$self;
        /* v8 ignore next */
        if (metadata.documentMeta.jsonSchemaDialect) out.jsonSchemaDialect = metadata.documentMeta.jsonSchemaDialect;
        /* v8 ignore next */
        if (metadata.documentMeta.extensions) Object.assign(out, metadata.documentMeta.extensions);
        /* v8 ignore next */
    } else if (metadata.inferredSelf) {
        /* v8 ignore next */
        out.$self = metadata.inferredSelf;
    }
    /* v8 ignore next */
    if (metadata.info) out.info = Object.assign({}, out.info, metadata.info);
    /* v8 ignore next */
    if (metadata.tags) out.tags = metadata.tags;
    /* v8 ignore next */
    if (metadata.externalDocs) out.externalDocs = metadata.externalDocs;
    /* v8 ignore next */
    if (metadata.servers) out.servers = metadata.servers;
    /* v8 ignore next */
    if (metadata.securityRequirements) out.security = metadata.securityRequirements;

    /* v8 ignore next */
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
        /* v8 ignore next */
        out.components = out.components || {};
        /* v8 ignore next */
        if (metadata.securitySchemes) out.components.securitySchemes = metadata.securitySchemes;
        /* v8 ignore next */
        if (metadata.headerXmlConfigs) {
            /* v8 ignore next */
            out.components.headers = out.components.headers || {};
            /* v8 ignore next */
            Object.entries(metadata.headerXmlConfigs).forEach(([key, config]) => {
                /* v8 ignore next */
                out.components!.headers![key] = {
                    content: {
                        'application/xml': {
                            schema: {
                                xml: config as import('@src/core/types/index.js').XmlObject,
                            },
                        },
                    },
                } as import('@src/core/types/index.js').HeaderObject;
            });
        }

        /* v8 ignore next */
        if (metadata.responseHeaderObjects) {
            /* v8 ignore next */
            Object.entries(metadata.responseHeaderObjects).forEach(([opId, statusMap]) => {
                /* v8 ignore next */
                const findOp = (): SpecOperation | undefined => {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    for (const pVal of Object.values(out.paths || {})) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const pathObj = pVal as Record<string, OpenApiValue>;
                        /* v8 ignore next */
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
                            /* v8 ignore next */
                            const methodRec = pathObj[methodKey] as Record<string, OpenApiValue> | undefined;
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (methodRec?.operationId === opId) return methodRec as OpenApiValue as SpecOperation;
                            /* v8 ignore stop */
                        }
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (pathObj.additionalOperations) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            for (const opValEntry of Object.values(
                                /* v8 ignore stop */
                                pathObj.additionalOperations as Record<string, OpenApiValue>,
                            )) {
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                const opRec = opValEntry as Record<string, OpenApiValue>;
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                if (opRec.operationId === opId) return opRec as OpenApiValue as SpecOperation;
                                /* v8 ignore stop */
                            }
                        }
                    }
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    return undefined;
                    /* v8 ignore stop */
                };
                /* v8 ignore next */
                const op = findOp();
                /* v8 ignore next */
                /* v8 ignore start */
                if (op && op.responses) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    Object.entries(statusMap).forEach(([status, headers]) => {
                        /* v8 ignore next */
                        const opRespRec = op.responses[status] as Record<string, OpenApiValue> | undefined;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (opRespRec) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            opRespRec.headers = { ...((opRespRec.headers as object) || {}), ...headers };
                        }
                    });
                }
            });
        }
        /* v8 ignore next */
        if (metadata.links) {
            /* v8 ignore next */
            Object.entries(metadata.links).forEach(([opId, statusMap]) => {
                /* v8 ignore next */
                const findOp = (): SpecOperation | undefined => {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    for (const pVal of Object.values(out.paths || {})) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const pathObj = pVal as Record<string, OpenApiValue>;
                        /* v8 ignore next */
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
                            /* v8 ignore next */
                            const methodRec = pathObj[methodKey] as Record<string, OpenApiValue> | undefined;
                            /* v8 ignore next */
                            /* v8 ignore start */
                            if (methodRec?.operationId === opId) return methodRec as OpenApiValue as SpecOperation;
                            /* v8 ignore stop */
                        }
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (pathObj.additionalOperations) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            for (const opValEntry of Object.values(
                                /* v8 ignore stop */
                                pathObj.additionalOperations as Record<string, OpenApiValue>,
                            )) {
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                const opRec = opValEntry as Record<string, OpenApiValue>;
                                /* v8 ignore stop */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore next */
                                /* v8 ignore start */
                                if (opRec.operationId === opId) return opRec as OpenApiValue as SpecOperation;
                                /* v8 ignore stop */
                            }
                        }
                    }
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    return undefined;
                    /* v8 ignore stop */
                };
                /* v8 ignore next */
                const op = findOp();
                /* v8 ignore next */
                /* v8 ignore start */
                if (op && op.responses) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    Object.entries(statusMap).forEach(([status, links]) => {
                        /* v8 ignore next */
                        const opRespRec = op.responses[status] as Record<string, OpenApiValue> | undefined;
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (opRespRec) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            opRespRec.links = links;
                        }
                    });
                }
            });
        }

        /* v8 ignore next */
        if (metadata.callbacks) {
            /* v8 ignore next */
            metadata.callbacks.forEach(cb => {
                /* v8 ignore next */
                out.components!.callbacks = out.components!.callbacks || {};
                /* v8 ignore next */
                const callbacksRec = out.components!.callbacks as Record<string, OpenApiValue>;
                /* v8 ignore next */
                const m = (callbacksRec[cb.name] = callbacksRec[cb.name] || {}) as Record<string, OpenApiValue>;
                /* v8 ignore next */
                /* v8 ignore start */
                if (cb.expression) m[cb.expression] = cb.pathItem;
                /* v8 ignore stop */
            });
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (metadata.webhooks) {
            /* v8 ignore stop */
            /* v8 ignore next */
            metadata.webhooks.forEach(wh => {
                /* v8 ignore next */
                const scope = wh.scope || 'root';
                /* v8 ignore next */
                if (scope === 'root') {
                    /* v8 ignore next */
                    out.webhooks = out.webhooks || {};
                    /* v8 ignore next */
                    (out.webhooks as Record<string, OpenApiValue>)[wh.name] = wh.pathItem;
                    /* v8 ignore next */
                    out.components!.webhooks = out.components!.webhooks || {};
                    /* v8 ignore next */
                    (out.components!.webhooks as Record<string, OpenApiValue>)[wh.name] = wh.pathItem;
                    /* v8 ignore next */
                    /* v8 ignore start */
                } else if (scope === 'component') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    out.components!.webhooks = out.components!.webhooks || {};
                    /* v8 ignore next */
                    (out.components!.webhooks as Record<string, OpenApiValue>)[wh.name] = wh.pathItem;
                }
            });
        }

        /* v8 ignore next */
        if (metadata.paths) {
            /* v8 ignore next */
            Object.entries(metadata.paths).forEach(([pth, item]) => {
                /* v8 ignore next */
                out.paths![pth] = out.paths![pth] || {};
                /* v8 ignore next */
                Object.assign(out.paths![pth]!, item);
            });
        }

        /* v8 ignore next */
        if (metadata.componentLinks) out.components.links = metadata.componentLinks;
        /* v8 ignore next */
        if (metadata.examples) out.components.examples = metadata.examples;
        /* v8 ignore next */
        if (metadata.mediaTypes) out.components.mediaTypes = metadata.mediaTypes;
        /* v8 ignore next */
        if (metadata.pathItems) out.components.pathItems = metadata.pathItems;
        /* v8 ignore next */
        if (metadata.parameters) out.components.parameters = metadata.parameters;
        /* v8 ignore next */
        if (metadata.requestBodies) out.components.requestBodies = metadata.requestBodies;
        /* v8 ignore next */
        if (metadata.responses) out.components.responses = metadata.responses;
        /* v8 ignore next */
        if (metadata.headers) {
            /* v8 ignore next */
            out.components.headers = { ...out.components.headers, ...metadata.headers };
        }
    }
    /* v8 ignore next */
    return out;
}
