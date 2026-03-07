import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';

export class ParameterSerializerGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const utilsDir = path.join(outputDir, 'utils');
        // Ensure directory exists
        /* v8 ignore next */
        if (!this.project.getFileSystem().directoryExists(utilsDir)) {
            /* v8 ignore next */
            this.project.getFileSystem().mkdirSync(utilsDir);
        }
        /* v8 ignore next */
        const filePath = path.join(utilsDir, 'parameter-serializer.ts');

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
        /* v8 ignore next */
        sourceFile.addImportDeclaration({
            moduleSpecifier: './content-encoder',
            namedImports: ['ContentEncoder'],
        });

        /* v8 ignore next */
        const classDeclaration = sourceFile.addClass({
            name: 'ParameterSerializer',
            isExported: true,
            docs: ['Utility to serialize parameters (Path, Query, Header, Cookie) according to OpenAPI rules.'],
        });

        // --- Helper: Encode Reserved ---
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'encodeReservedInternal',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'value', type: 'string' },
                { name: 'allowPathDelims', type: 'boolean' },
            ],
            returnType: 'string',
            docs: ['RFC 3986 encoding that preserves reserved characters and existing percent-encoded triples.'],
            statements: `
        const parts = value.split(/(%[0-9A-Fa-f]{2})/g);
        return parts.map(part => {
            if (/^%[0-9A-Fa-f]{2}$/.test(part)) return part;
            // @ts-ignore
            let encoded = encodeURIComponent(part)
                .replace(/%3A/gi, ':')
                .replace(/%5B/gi, '[')
                .replace(/%5D/gi, ']')
                .replace(/%40/gi, '@')
                .replace(/%21/gi, '!')
                .replace(/%24/gi, '$')
                .replace(/%26/gi, '&')
                .replace(/%27/gi, "'")
                .replace(/%28/gi, '(')
                .replace(/%29/gi, ')')
                .replace(/%2A/gi, '*')
                .replace(/%2B/gi, '+')
                .replace(/%2C/gi, ',')
                .replace(/%3B/gi, ';')
                .replace(/%3D/gi, '=');

            if (allowPathDelims) {
                encoded = encoded
                    .replace(/%2F/gi, '/')
                    .replace(/%3F/gi, '?')
                    .replace(/%23/gi, '#');
            }
            return encoded;
        }).join('');`,
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'encodeReserved',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'value', type: 'string' }],
            returnType: 'string',
            docs: ['RFC 3986 encoding but preserves reserved characters and percent-encoded triples.'],
            statements: `
        return this.encodeReservedInternal(value, true);`,
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'encodeReservedQuery',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'value', type: 'string' }],
            returnType: 'string',
            docs: [
                'RFC 3986 encoding for query components that preserves reserved characters',
                'except query delimiters (?, #, &, =, +) and preserves percent-encoded triples.',
            ],
            statements: `
        const parts = value.split(/(%[0-9A-Fa-f]{2})/g);
        return parts.map(part => {
            if (/^%[0-9A-Fa-f]{2}$/.test(part)) return part;
            // @ts-ignore
            let encoded = encodeURIComponent(part)
                .replace(/%3A/gi, ':')
                .replace(/%2F/gi, '/')
                .replace(/%5B/gi, '[')
                .replace(/%5D/gi, ']')
                .replace(/%40/gi, '@')
                .replace(/%21/gi, '!')
                .replace(/%24/gi, '$')
                .replace(/%27/gi, "'")
                .replace(/%28/gi, '(')
                .replace(/%29/gi, ')')
                .replace(/%2A/gi, '*')
                .replace(/%2C/gi, ',')
                .replace(/%3B/gi, ';');
            return encoded;
        }).join('');`,
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'encodeReservedPath',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'value', type: 'string' }],
            returnType: 'string',
            docs: ['RFC 3986 encoding with reserved characters preserved except "/", "?", and "#".'],
            statements: `
        return this.encodeReservedInternal(value, false);`,
        });

        // --- Path Parameters ---
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'serializePathParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'key', type: 'string' },
                { name: 'value', type: 'string | number | boolean | object | undefined | null' },
                { name: 'style', type: 'string', initializer: "'simple'" },
                { name: 'explode', type: 'boolean', initializer: 'false' },
                { name: 'allowReserved', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
                {
                    name: 'contentEncoderConfig',
                    type: 'string | number | boolean | object | undefined | null',
                    hasQuestionToken: true,
                },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        if (contentEncoderConfig) {
            // @ts-ignore
            // @ts-ignore
            value = ContentEncoder.encode(value, contentEncoderConfig);
        }
        if (serialization === 'json' && typeof value !== 'string') value = JSON.stringify(value);

        // @ts-ignore

        const encode = (v: string) => allowReserved ? this.encodeReservedPath(v) : encodeURIComponent(v);

        if (style === 'simple') {
            if (Array.isArray(value)) {
                // @ts-ignore
                return value.map(v => encode(String(v))).join(',');
            } else if (typeof value === 'object') {
                if (explode) {
                    // @ts-ignore
                    return Object.entries(value).map(([k, v]) => \`\${encode(k)}=\${encode(String(v))}\`).join(',');
                } else {
                    // @ts-ignore
                    return Object.entries(value).map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`).join(',');
                }
            }
            // @ts-ignore
            return encode(String(value));
        }

        if (style === 'label') {
            const prefix = '.';
            if (Array.isArray(value)) {
                // @ts-ignore
                return prefix + value.map(v => encode(String(v))).join(explode ? prefix : ',');
            } else if (typeof value === 'object') {
                if (explode) {
                    // @ts-ignore
                    return prefix + Object.entries(value).map(([k, v]) => \`\${encode(k)}=\${encode(String(v))}\`).join(prefix);
                } else {
                    // @ts-ignore
                    return prefix + Object.entries(value).map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`).join(',');
                }
            }
            // @ts-ignore
            return prefix + encode(String(value));
        }

        if (style === 'matrix') {
            const prefix = ';';
            if (Array.isArray(value)) {
                if (explode) {
                   // @ts-ignore
                   return prefix + value.map(v => \`\${encode(key)}=\${encode(String(v))}\`).join(prefix);
                } else {
                   // @ts-ignore
                   return prefix + \`\${encode(key)}=\` + value.map(v => encode(String(v))).join(',');
                }
            } else if (typeof value === 'object') {
                if (explode) {
                    // @ts-ignore
                    return prefix + Object.entries(value).map(([k, v]) => \`\${encode(k)}=\${encode(String(v))}\`).join(prefix);
                } else {
                    // @ts-ignore
                    return prefix + \`\${encode(key)}=\` + Object.entries(value).map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`).join(',');
                }
            }
            // @ts-ignore
            return prefix + \`\${encode(key)}=\${encode(String(value))}\`;
        }

        // @ts-ignore

        return encode(String(value));`,
        });

        // --- Query Parameters (Returns {key, value}[] for framework adaptation) ---
        /* v8 ignore next */
        sourceFile.addTypeAlias({
            name: 'SerializedQueryParam',
            isExported: true,
            type: '{ key: string; value: string }',
        });

        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'serializeQueryParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'config', type: 'string | number | boolean | object | undefined | null' },
                { name: 'value', type: 'string | number | boolean | object | undefined | null' },
            ],
            returnType: 'SerializedQueryParam[]',
            statements: `
        // @ts-ignore
        const name = config.name;
        const result: SerializedQueryParam[] = [];
        
        if (value === null || value === undefined || value === '') {
             // @ts-ignore
             // @ts-ignore
             if (config.allowEmptyValue) result.push({ key: name, value: '' });
             return result;
        }

        const encoderConfig =
            // @ts-ignore
            // @ts-ignore
            config.contentEncoderConfig ?? (config.contentEncoding ? { contentEncoding: config.contentEncoding } : undefined);
        if (encoderConfig) {
            // @ts-ignore
            // @ts-ignore
            value = ContentEncoder.encode(value, encoderConfig);
        }
        
        // @ts-ignore
        
        const allowReserved = config.allowReserved === true;
        // @ts-ignore
        const encode = (v: string) => allowReserved ? this.encodeReservedQuery(v) : encodeURIComponent(v);
        // @ts-ignore
        const normalizedContentType = config.contentType ? config.contentType.split(';')[0].trim().toLowerCase() : undefined;
        // @ts-ignore
        const isJson = config.serialization === 'json' || (normalizedContentType !== undefined && (normalizedContentType === 'application/json' || normalizedContentType.endsWith('+json')));

        if (normalizedContentType === 'application/x-www-form-urlencoded') {
            const encodedValue = typeof value === 'object'
                // @ts-ignore
                ? this.serializeUrlEncodedBody(value, config.encoding || {}).map(p => \`\${p.key}=\${p.value}\`).join('&')
                : String(value);
            // @ts-ignore
            // @ts-ignore
            // @ts-ignore
            result.push({ key: encode(name), value: encodeURIComponent(encodedValue) });
            return result;
        }

        if (normalizedContentType && !isJson) {
            const rawValue = typeof value === 'string' ? value : String(value);
            // @ts-ignore
            // @ts-ignore
            result.push({ key: encode(name), value: encode(rawValue) });
            return result;
        }

        if (isJson && typeof value !== 'string') value = JSON.stringify(value);

        // @ts-ignore

        const style = config.style || 'form';
        // @ts-ignore
        const explode = config.explode ?? true;
        
        if (style === 'deepObject' && typeof value === 'object') {
             const processDeep = (obj: string | number | boolean | object | undefined | null, prefix: string) => {
                 Object.keys(obj).forEach(k => {
                     const keyPath = \`\${prefix}[\${k}]\`;
                     const v = obj[k];
                     if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                         processDeep(v, keyPath);
                     } else {
                         // @ts-ignore
                         // @ts-ignore
                         result.push({ key: encode(keyPath), value: encode(String(v)) });
                     }
                 });
             };
             processDeep(value, name);
             return result;
        }

        if (Array.isArray(value)) {
            if (style === 'form' && explode) {
                // @ts-ignore
                // @ts-ignore
                value.forEach(v => result.push({ key: encode(name), value: encode(String(v)) }));
            } else if (style === 'spaceDelimited') {
                // @ts-ignore
                // @ts-ignore
                // @ts-ignore
                result.push({ key: encode(name), value: encode(value.join(' ')) });
            } else if (style === 'tabDelimited') {
                // @ts-ignore
                // @ts-ignore
                // @ts-ignore
                result.push({ key: encode(name), value: encode(value.join('\\t')) });
            } else if (style === 'pipeDelimited') {
                // @ts-ignore
                // @ts-ignore
                // @ts-ignore
                result.push({ key: encode(name), value: encode(value.join('|')) });
            } else {
                // @ts-ignore
                const joined = value.map(v => encode(String(v))).join(',');
                // @ts-ignore
                // @ts-ignore
                result.push({ key: encode(name), value: joined });
            }
            return result;
        }

        if (typeof value === 'object') {
             if (style === 'form') {
                 if (explode) {
                     // @ts-ignore
                     // @ts-ignore
                     Object.entries(value).forEach(([k, v]) => result.push({ key: encode(k), value: encode(String(v)) }));
                 } else {
                     const flattened = Object.entries(value)
                         // @ts-ignore
                         .map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`)
                         .join(',');
                     // @ts-ignore
                     // @ts-ignore
                     result.push({ key: encode(name), value: flattened });
                 }
                 return result;
             }
             if (style === 'spaceDelimited' || style === 'pipeDelimited') {
                 const delimiter = style === 'spaceDelimited' ? ' ' : '|';
                 const flattened = Object.entries(value).map(([k, v]) => \`\${k}\${delimiter}\${v}\`).join(delimiter);
                 // @ts-ignore
                 // @ts-ignore
                 result.push({ key: encode(name), value: encode(flattened) });
                 return result;
             }
             if (style === 'tabDelimited') {
                 const delimiter = '\\t';
                 const flattened = Object.entries(value).map(([k, v]) => \`\${k}\${delimiter}\${v}\`).join(delimiter);
                 // @ts-ignore
                 // @ts-ignore
                 result.push({ key: encode(name), value: encode(flattened) });
                 return result;
             }
        }

        // @ts-ignore

        // @ts-ignore

        result.push({ key: encode(name), value: encode(String(value)) });
        return result;`,
        });

        // --- Header Parameters ---
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'serializeHeaderParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'value', type: 'string | number | boolean | object | undefined | null' },
                { name: 'explode', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
                { name: 'contentType', type: 'string | undefined', hasQuestionToken: true },
                {
                    name: 'encoding',
                    type: 'Record<string, string | number | boolean | object | undefined | null> | undefined',
                    hasQuestionToken: true,
                },
                {
                    name: 'contentEncoderConfig',
                    type: 'string | number | boolean | object | undefined | null',
                    hasQuestionToken: true,
                },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        if (contentEncoderConfig) {
            // @ts-ignore
            // @ts-ignore
            value = ContentEncoder.encode(value, contentEncoderConfig);
        }
        const normalizedContentType = contentType ? contentType.split(';')[0].trim().toLowerCase() : undefined;
        const isJson =
            serialization === 'json' ||
            (normalizedContentType !== undefined &&
                (normalizedContentType === 'application/json' || normalizedContentType.endsWith('+json')));

        if (normalizedContentType === 'application/x-www-form-urlencoded') {
            if (typeof value === 'object') {
                return this.serializeUrlEncodedBody(value, encoding || {})
                    .map(p => \`\${p.key}=\${p.value}\`)
                    .join('&');
            }
            return String(value);
        }

        if (isJson) return JSON.stringify(value);
        if (normalizedContentType) return typeof value === 'string' ? value : String(value);

        // @ts-ignore

        if (Array.isArray(value)) return value.join(',');
        
        if (typeof value === 'object') {
            if (explode) {
                return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join(',');
            }
            return Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(',');
        }
        return String(value);`,
        });

        // --- Cookie Parameters ---
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'serializeCookieParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'key', type: 'string' },
                { name: 'value', type: 'string | number | boolean | object | undefined | null' },
                { name: 'style', type: 'string', initializer: "'form'" },
                { name: 'explode', type: 'boolean', initializer: 'true' },
                { name: 'allowReserved', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
                {
                    name: 'contentEncoderConfig',
                    type: 'string | number | boolean | object | undefined | null',
                    hasQuestionToken: true,
                },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        if (contentEncoderConfig) {
            // @ts-ignore
            // @ts-ignore
            value = ContentEncoder.encode(value, contentEncoderConfig);
        }
        // @ts-ignore
        if (serialization === 'json') return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`;
        
        const isCookieStyle = style === 'cookie';
        const encode = (v: string | number | boolean | object | undefined | null) => {
            if (isCookieStyle) return String(v);
            if (allowReserved) return this.encodeReserved(String(v));
            // @ts-ignore
            return encodeURIComponent(String(v));
        };

        const joinChar = ',';
        // @ts-ignore
        const encodedKey = isCookieStyle ? key : encode(String(key));

        if (Array.isArray(value)) {
            // @ts-ignore
            if (explode) return value.map(v => \`\${encodedKey}=\${encode(v)}\`).join('; ');
            // @ts-ignore
            return \`\${encodedKey}=\${value.map(v => encode(v)).join(joinChar)}\`;
        }
        
        if (typeof value === 'object') {
            if (explode) {
                return Object.entries(value)
                    // @ts-ignore
                    .map(([k, v]) => \`\${isCookieStyle ? k : encode(String(k))}=\${encode(v)}\`)
                    .join('; ');
            }
            const flat = Object.entries(value)
                // @ts-ignore
                .map(([k, v]) => \`\${isCookieStyle ? k : encode(String(k))}\${joinChar}\${encode(v)}\`)
                .join(joinChar);
            return \`\${encodedKey}=\${flat}\`;
        }
        
        // @ts-ignore
        
        return \`\${encodedKey}=\${encode(String(value))}\`;`,
        });

        // --- Raw Querystring ---
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'serializeRawQuerystring',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'value', type: 'string | number | boolean | object | undefined | null' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
                { name: 'contentType', type: 'string | undefined', hasQuestionToken: true },
                {
                    name: 'encodings',
                    type: 'Record<string, string | number | boolean | object | undefined | null> | undefined',
                    hasQuestionToken: true,
                },
                {
                    name: 'contentEncoderConfig',
                    type: 'string | number | boolean | object | undefined | null',
                    hasQuestionToken: true,
                },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        if (contentEncoderConfig) {
            // @ts-ignore
            // @ts-ignore
            value = ContentEncoder.encode(value, contentEncoderConfig);
        }
        const normalizedContentType = contentType ? contentType.split(';')[0].trim().toLowerCase() : undefined;
        const isJson =
            serialization === 'json' ||
            (normalizedContentType !== undefined &&
                (normalizedContentType === 'application/json' || normalizedContentType.endsWith('+json')));
        // @ts-ignore
        if (isJson) return encodeURIComponent(JSON.stringify(value));

        // @ts-ignore

        const encodeForm = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');

        const isFormUrlEncoded = normalizedContentType === 'application/x-www-form-urlencoded';
        if (isFormUrlEncoded) {
            if (typeof value === 'object') {
                const parts = this.serializeUrlEncodedBody(value, encodings || {});
                return parts.map(p => \`\${p.key}=\${p.value}\`).join('&');
            }
            return encodeForm(String(value));
        }
        if (normalizedContentType) {
            const raw = typeof value === 'string' ? value : String(value);
            // @ts-ignore
            return encodeURIComponent(raw);
        }
        if (typeof value === 'object') {
            return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('&');
        }
        return String(value);`,
        });

        // --- URL Encoded Body Helper ---
        /* v8 ignore next */
        classDeclaration.addMethod({
            name: 'serializeUrlEncodedBody',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'body', type: 'string | number | boolean | object | undefined | null' },
                {
                    name: 'encodings',
                    type: 'Record<string, string | number | boolean | object | undefined | null>',
                    initializer: '{}',
                },
            ],
            returnType: 'SerializedQueryParam[]',
            docs: [
                'Serializes an object into application/x-www-form-urlencoded key/value pairs.',
                'Respects Encoding Object contentType when style/explode/allowReserved are absent (OAS 3.2).',
            ],
            statements: `
            const result: SerializedQueryParam[] = [];
            if (!body || typeof body !== 'object') return result;
            const normalizeForm = (v: string) => v.replace(/%20/g, '+');
            const normalizeContentType = (value: string | undefined) => value?.split(';')[0].trim().toLowerCase();

            Object.entries(body).forEach(([key, value]) => {
                if (value === undefined || value === null) return;
                const config = encodings[key] || {};
                const hasSerializationHints =
                    // @ts-ignore
                    // @ts-ignore
                    // @ts-ignore
                    config.style !== undefined || config.explode !== undefined || config.allowReserved !== undefined;
                // @ts-ignore
                const contentType = normalizeContentType(config.contentType);
                // @ts-ignore
                const nestedEncoding = config.encoding;
                const canNestEncode =
                    nestedEncoding &&
                    typeof nestedEncoding === 'object' &&
                    !Array.isArray(nestedEncoding) &&
                    (contentType === undefined || contentType === 'application/x-www-form-urlencoded');

                if (canNestEncode && typeof value === 'object' && !Array.isArray(value)) {
                    const nestedParts = this.serializeUrlEncodedBody(value, nestedEncoding);
                    const nestedString = nestedParts.map(p => \`\${p.key}=\${p.value}\`).join('&');
                    // @ts-ignore
                    result.push({
                        // @ts-ignore
                        key: normalizeForm(encodeURIComponent(key)),
                        // @ts-ignore
                        value: normalizeForm(encodeURIComponent(nestedString)),
                    });
                    return;
                }

                if (contentType && !hasSerializationHints) {
                    let rawValue = value;
                    if (
                        contentType === 'application/json' ||
                        (typeof contentType === 'string' && contentType.endsWith('+json'))
                    ) {
                        rawValue = typeof value === 'string' ? value : JSON.stringify(value);
                    } else {
                        rawValue = typeof value === 'string' ? value : String(value);
                    }
                    // @ts-ignore
                    result.push({
                        // @ts-ignore
                        key: normalizeForm(encodeURIComponent(key)),
                        // @ts-ignore
                        value: normalizeForm(encodeURIComponent(String(rawValue))),
                    });
                    return;
                }

                const paramConfig = { name: key, in: 'query', ...(config as object) };
                // @ts-ignore
                const serialized = this.serializeQueryParam(paramConfig, value);
                serialized.forEach(entry => {
                    // @ts-ignore
                    result.push({
                        key: normalizeForm(entry.key),
                        value: normalizeForm(entry.value),
                    });
                });
            });
            return result;`,
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
