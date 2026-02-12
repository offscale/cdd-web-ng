import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';

export class ParameterSerializerGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        // Ensure directory exists
        if (!this.project.getFileSystem().directoryExists(utilsDir)) {
            this.project.getFileSystem().mkdirSync(utilsDir);
        }
        const filePath = path.join(utilsDir, 'parameter-serializer.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        const classDeclaration = sourceFile.addClass({
            name: 'ParameterSerializer',
            isExported: true,
            docs: ['Utility to serialize parameters (Path, Query, Header, Cookie) according to OpenAPI rules.'],
        });

        // --- Helper: Encode Reserved ---
        classDeclaration.addMethod({
            name: 'encodeReserved',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'value', type: 'string' }],
            returnType: 'string',
            docs: ['RFC 3986 encoding but preserves reserved characters.'],
            statements: `
        return encodeURIComponent(value)
            .replace(/%3A/gi, ':')
            .replace(/%2F/gi, '/')
            .replace(/%3F/gi, '?')
            .replace(/%23/gi, '#')
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
            .replace(/%3D/gi, '=');`,
        });

        classDeclaration.addMethod({
            name: 'encodeReservedPath',
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: 'value', type: 'string' }],
            returnType: 'string',
            docs: ['RFC 3986 encoding with reserved characters preserved except "/", "?", and "#".'],
            statements: `
        return encodeURIComponent(value)
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
            .replace(/%3D/gi, '=');`,
        });

        // --- Path Parameters ---
        classDeclaration.addMethod({
            name: 'serializePathParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'key', type: 'string' },
                { name: 'value', type: 'any' },
                { name: 'style', type: 'string', initializer: "'simple'" },
                { name: 'explode', type: 'boolean', initializer: 'false' },
                { name: 'allowReserved', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        if (serialization === 'json' && typeof value !== 'string') value = JSON.stringify(value);

        const encode = (v: string) => allowReserved ? this.encodeReservedPath(v) : encodeURIComponent(v);

        if (style === 'simple') {
            if (Array.isArray(value)) {
                return value.map(v => encode(String(v))).join(',');
            } else if (typeof value === 'object') {
                if (explode) {
                    return Object.entries(value).map(([k, v]) => \`\${encode(k)}=\${encode(String(v))}\`).join(',');
                } else {
                    return Object.entries(value).map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`).join(',');
                }
            }
            return encode(String(value));
        }

        if (style === 'label') {
            const prefix = '.';
            if (Array.isArray(value)) {
                return prefix + value.map(v => encode(String(v))).join(explode ? prefix : ',');
            } else if (typeof value === 'object') {
                if (explode) {
                    return prefix + Object.entries(value).map(([k, v]) => \`\${encode(k)}=\${encode(String(v))}\`).join(prefix);
                } else {
                    return prefix + Object.entries(value).map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`).join(',');
                }
            }
            return prefix + encode(String(value));
        }

        if (style === 'matrix') {
            const prefix = ';';
            if (Array.isArray(value)) {
                if (explode) {
                   return prefix + value.map(v => \`\${encode(key)}=\${encode(String(v))}\`).join(prefix);
                } else {
                   return prefix + \`\${encode(key)}=\` + value.map(v => encode(String(v))).join(',');
                }
            } else if (typeof value === 'object') {
                if (explode) {
                    return prefix + Object.entries(value).map(([k, v]) => \`\${encode(k)}=\${encode(String(v))}\`).join(prefix);
                } else {
                    return prefix + \`\${encode(key)}=\` + Object.entries(value).map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`).join(',');
                }
            }
            return prefix + \`\${encode(key)}=\${encode(String(value))}\`;
        }

        return encode(String(value));`,
        });

        // --- Query Parameters (Returns {key, value}[] for framework adaptation) ---
        sourceFile.addTypeAlias({
            name: 'SerializedQueryParam',
            isExported: true,
            type: '{ key: string; value: string }',
        });

        classDeclaration.addMethod({
            name: 'serializeQueryParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'config', type: 'any' },
                { name: 'value', type: 'any' },
            ],
            returnType: 'SerializedQueryParam[]',
            statements: `
        const name = config.name;
        const result: SerializedQueryParam[] = [];
        
        if (value === null || value === undefined || value === '') {
             if (config.allowEmptyValue) result.push({ key: name, value: '' });
             return result;
        }
        
        const allowReserved = config.allowReserved === true;
        const encode = (v: string) => allowReserved ? this.encodeReserved(v) : encodeURIComponent(v);
        const normalizedContentType = config.contentType ? config.contentType.split(';')[0].trim().toLowerCase() : undefined;
        const isJson = config.serialization === 'json' || (normalizedContentType !== undefined && (normalizedContentType === 'application/json' || normalizedContentType.endsWith('+json')));

        if (normalizedContentType === 'application/x-www-form-urlencoded') {
            const encodedValue = typeof value === 'object'
                ? this.serializeUrlEncodedBody(value, config.encoding || {}).map(p => \`\${p.key}=\${p.value}\`).join('&')
                : String(value);
            result.push({ key: encode(name), value: encodeURIComponent(encodedValue) });
            return result;
        }

        if (normalizedContentType && !isJson) {
            const rawValue = typeof value === 'string' ? value : String(value);
            result.push({ key: encode(name), value: encode(rawValue) });
            return result;
        }

        if (isJson && typeof value !== 'string') value = JSON.stringify(value);

        const style = config.style || 'form';
        const explode = config.explode ?? true;
        
        if (style === 'deepObject' && typeof value === 'object') {
             const processDeep = (obj: any, prefix: string) => {
                 Object.keys(obj).forEach(k => {
                     const keyPath = \`\${prefix}[\${k}]\`;
                     const v = obj[k];
                     if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                         processDeep(v, keyPath);
                     } else {
                         result.push({ key: encode(keyPath), value: encode(String(v)) });
                     }
                 });
             };
             processDeep(value, name);
             return result;
        }

        if (Array.isArray(value)) {
            if (style === 'form' && explode) {
                value.forEach(v => result.push({ key: encode(name), value: encode(String(v)) }));
            } else if (style === 'spaceDelimited') {
                result.push({ key: encode(name), value: encode(value.join(' ')) });
            } else if (style === 'tabDelimited') {
                result.push({ key: encode(name), value: encode(value.join('\\t')) });
            } else if (style === 'pipeDelimited') {
                result.push({ key: encode(name), value: encode(value.join('|')) });
            } else {
                const joined = value.map(v => encode(String(v))).join(',');
                result.push({ key: encode(name), value: joined });
            }
            return result;
        }

        if (typeof value === 'object') {
             if (style === 'form') {
                 if (explode) {
                     Object.entries(value).forEach(([k, v]) => result.push({ key: encode(k), value: encode(String(v)) }));
                 } else {
                     const flattened = Object.entries(value)
                         .map(([k, v]) => \`\${encode(k)},\${encode(String(v))}\`)
                         .join(',');
                     result.push({ key: encode(name), value: flattened });
                 }
                 return result;
             }
             if (style === 'spaceDelimited' || style === 'pipeDelimited') {
                 const delimiter = style === 'spaceDelimited' ? ' ' : '|';
                 const flattened = Object.entries(value).map(([k, v]) => \`\${k}\${delimiter}\${v}\`).join(delimiter);
                 result.push({ key: encode(name), value: encode(flattened) });
                 return result;
             }
             if (style === 'tabDelimited') {
                 const delimiter = '\\t';
                 const flattened = Object.entries(value).map(([k, v]) => \`\${k}\${delimiter}\${v}\`).join(delimiter);
                 result.push({ key: encode(name), value: encode(flattened) });
                 return result;
             }
        }

        result.push({ key: encode(name), value: encode(String(value)) });
        return result;`,
        });

        // --- Header Parameters ---
        classDeclaration.addMethod({
            name: 'serializeHeaderParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'value', type: 'any' },
                { name: 'explode', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
                { name: 'contentType', type: 'string | undefined', hasQuestionToken: true },
                { name: 'encoding', type: 'Record<string, any> | undefined', hasQuestionToken: true },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
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
        classDeclaration.addMethod({
            name: 'serializeCookieParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'key', type: 'string' },
                { name: 'value', type: 'any' },
                { name: 'style', type: 'string', initializer: "'form'" },
                { name: 'explode', type: 'boolean', initializer: 'true' },
                { name: 'allowReserved', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        if (serialization === 'json') return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`;
        
        const isCookieStyle = style === 'cookie';
        const encode = (v: any) => {
            if (isCookieStyle) return String(v);
            if (allowReserved) return this.encodeReserved(String(v));
            return encodeURIComponent(String(v));
        };

        const joinChar = ',';
        const encodedKey = isCookieStyle ? key : encode(String(key));

        if (Array.isArray(value)) {
            if (explode) return value.map(v => \`\${encodedKey}=\${encode(v)}\`).join('; ');
            return \`\${encodedKey}=\${value.map(v => encode(v)).join(joinChar)}\`;
        }
        
        if (typeof value === 'object') {
            if (explode) {
                return Object.entries(value)
                    .map(([k, v]) => \`\${isCookieStyle ? k : encode(String(k))}=\${encode(v)}\`)
                    .join('; ');
            }
            const flat = Object.entries(value)
                .map(([k, v]) => \`\${isCookieStyle ? k : encode(String(k))}\${joinChar}\${encode(v)}\`)
                .join(joinChar);
            return \`\${encodedKey}=\${flat}\`;
        }
        
        return \`\${encodedKey}=\${encode(String(value))}\`;`,
        });

        // --- Raw Querystring ---
        classDeclaration.addMethod({
            name: 'serializeRawQuerystring',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'value', type: 'any' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
                { name: 'contentType', type: 'string | undefined', hasQuestionToken: true },
                { name: 'encodings', type: 'Record<string, any> | undefined', hasQuestionToken: true },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return '';
        const normalizedContentType = contentType ? contentType.split(';')[0].trim().toLowerCase() : undefined;
        const isJson =
            serialization === 'json' ||
            (normalizedContentType !== undefined &&
                (normalizedContentType === 'application/json' || normalizedContentType.endsWith('+json')));
        if (isJson) return encodeURIComponent(JSON.stringify(value));

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
            return encodeURIComponent(raw);
        }
        if (typeof value === 'object') {
            return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('&');
        }
        return String(value);`,
        });

        // --- URL Encoded Body Helper ---
        classDeclaration.addMethod({
            name: 'serializeUrlEncodedBody',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'body', type: 'any' },
                { name: 'encodings', type: 'Record<string, any>', initializer: '{}' },
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
                    config.style !== undefined || config.explode !== undefined || config.allowReserved !== undefined;
                const contentType = normalizeContentType(config.contentType);

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
                    result.push({
                        key: normalizeForm(encodeURIComponent(key)),
                        value: normalizeForm(encodeURIComponent(String(rawValue))),
                    });
                    return;
                }

                const paramConfig = { name: key, in: 'query', ...config };
                const serialized = this.serializeQueryParam(paramConfig, value);
                serialized.forEach(entry => {
                    result.push({
                        key: normalizeForm(entry.key),
                        value: normalizeForm(entry.value),
                    });
                });
            });
            return result;`,
        });

        sourceFile.formatText();
    }
}
