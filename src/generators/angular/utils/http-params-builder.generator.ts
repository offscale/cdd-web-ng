import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class HttpParamsBuilderGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'http-params-builder.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: ['HttpParams', 'HttpParameterCodec'],
        });

        sourceFile.addClass({
            name: 'ApiParameterCodec',
            isExported: true,
            implements: ['HttpParameterCodec'],
            docs: [
                "A custom parameter codec that disables Angular's default encoding, delegating control to the HttpParamsBuilder.",
            ],
            methods: [
                {
                    name: 'encodeKey',
                    parameters: [{ name: 'key', type: 'string' }],
                    returnType: 'string',
                    statements: 'return key;',
                },
                {
                    name: 'encodeValue',
                    parameters: [{ name: 'value', type: 'string' }],
                    returnType: 'string',
                    statements: 'return value;',
                },
                {
                    name: 'decodeKey',
                    parameters: [{ name: 'key', type: 'string' }],
                    returnType: 'string',
                    statements: 'return decodeURIComponent(key);',
                },
                {
                    name: 'decodeValue',
                    parameters: [{ name: 'value', type: 'string' }],
                    returnType: 'string',
                    statements: 'return decodeURIComponent(value);',
                },
            ],
        });

        const classDeclaration = sourceFile.addClass({
            name: 'HttpParamsBuilder',
            isExported: true,
            docs: [
                'Utility to serialize parameters (Path, Query, Header, Cookie) according to OpenAPI style/explode rules.',
            ],
        });

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

        if (serialization === 'json' && typeof value !== 'string') {
            value = JSON.stringify(value);
        }

        const encode = (v: string) => allowReserved ? this.encodeReserved(v) : encodeURIComponent(v);

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

        classDeclaration.addMethod({
            name: 'serializeQueryParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'params', type: 'HttpParams' },
                { name: 'config', type: 'any' },
                { name: 'value', type: 'any' },
            ],
            returnType: 'HttpParams',
            statements: `
        const name = config.name;
        const allowEmptyValue = config.allowEmptyValue === true;

        // OAS 3.2: allowEmptyValue support. If true, we emit the key with empty string value for null/undefined/empty input.
        if (value === null || value === undefined || value === '') {
             if (allowEmptyValue) {
                 // Angular HttpParams appends '=' for empty value by default, resulting in 'key='.
                 return params.append(name, '');
             }
             return params;
        }
        
        const allowReserved = config.allowReserved === true;
        const encode = (v: string) => allowReserved ? this.encodeReserved(v) : encodeURIComponent(v);
        const normalizedContentType = config.contentType ? config.contentType.split(';')[0].trim().toLowerCase() : undefined;
        const isJson =
            config.serialization === 'json' ||
            (normalizedContentType !== undefined &&
                (normalizedContentType === 'application/json' || normalizedContentType.endsWith('+json')));

        if (normalizedContentType === 'application/x-www-form-urlencoded') {
            const encodedValue = typeof value === 'object'
                ? this.serializeUrlEncodedBody(value, config.encoding || {}).map(p => \`\${p.key}=\${p.value}\`).join('&')
                : String(value);
            return params.append(encode(name), encodeURIComponent(encodedValue));
        }

        if (normalizedContentType && !isJson) {
            const rawValue = typeof value === 'string' ? value : String(value);
            return params.append(encode(name), encode(rawValue));
        }

        if (isJson && typeof value !== 'string') {
            value = JSON.stringify(value);
        }

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
                         params = params.append(encode(keyPath), encode(String(v)));
                     }
                 });
             }; 
             processDeep(value, name); 
             return params; 
        } 

        if (Array.isArray(value)) { 
            if (style === 'form' && explode) { 
                value.forEach(v => params = params.append(encode(name), encode(String(v)))); 
            } else if (style === 'spaceDelimited') { 
                params = params.append(encode(name), encode(value.join(' '))); 
            } else if (style === 'tabDelimited') { 
                params = params.append(encode(name), encode(value.join('\\t'))); 
            } else if (style === 'pipeDelimited') { 
                params = params.append(encode(name), encode(value.join('|'))); 
            } else { 
                params = params.append(encode(name), encode(value.join(','))); 
            } 
            return params; 
        } 

        if (typeof value === 'object') { 
             if (style === 'form') { 
                 if (explode) { 
                     Object.entries(value).forEach(([k, v]) => params = params.append(encode(k), encode(String(v)))); 
                 } else { 
                     const flattened = Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(','); 
                     params = params.append(encode(name), encode(flattened)); 
                 } 
                 return params; 
             } 
             if (style === 'tabDelimited') { 
                 const delimiter = '\\t'; 
                 const flattened = Object.entries(value).map(([k, v]) => \`\${k}\${delimiter}\${v}\`).join(delimiter); 
                 params = params.append(encode(name), encode(flattened)); 
                 return params; 
             } 
        } 

        return params.append(encode(name), encode(String(value)));`,
        });

        classDeclaration.addMethod({
            name: 'serializeUrlEncodedBody',
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: 'body', type: 'any' },
                { name: 'encodings', type: 'Record<string, any>', initializer: '{}' },
            ],
            returnType: 'Array<{ key: string; value: string }>',
            statements: `
        const result: Array<{ key: string; value: string }> = [];
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
            const serialized = this.serializeQueryParam(new HttpParams(), paramConfig, value);
            // SerializeQueryParam returns a HttpParams; convert by re-encoding key/value pairs.
            serialized.keys().forEach(paramKey => {
                const values = serialized.getAll(paramKey) ?? [];
                values.forEach(paramValue => {
                    result.push({ key: normalizeForm(paramKey), value: normalizeForm(paramValue) });
                });
            });
        });
        return result;`,
        });

        classDeclaration.addMethod({
            name: 'serializeHeaderParam',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'key', type: 'string' },
                { name: 'value', type: 'any' },
                { name: 'explode', type: 'boolean', initializer: 'false' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return ''; 
        if (serialization === 'json') return JSON.stringify(value); 

        if (Array.isArray(value)) { 
            return value.join(','); 
        } 
        if (typeof value === 'object') { 
            if (explode) { 
                return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join(','); 
            } 
            return Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(','); 
        } 
        return String(value);`,
        });

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
            docs: ['Serializes a cookie parameter according to OAS rules (RFC 6265).'],
            statements: `
        if (value === null || value === undefined) return ''; 
        if (serialization === 'json') return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`; 
        
        // OAS 3.2 Strict: 'cookie' style does NOT percent-encode. 'form' style DOES percent-encode... 
        // UNLESS allowReserved is true, in which case we use RFC 6570-style reserved expansion
        const isCookieStyle = style === 'cookie'; 
        const encode = (v: any) => { 
            if (isCookieStyle) return String(v); 
            if (allowReserved) return this.encodeReserved(String(v)); 
            return encodeURIComponent(String(v)); 
        }; 

        // If not exploding, 'form' style for cookies comma-separates values. 
        // Since commas are not allowed in cookie values, standard 'form' behavior implies encoding. 
        // 'cookie' style implies raw values, so use raw comma. 
        const joinChar = isCookieStyle ? ',' : (allowReserved ? ',' : '%2C'); 

        if (Array.isArray(value)) { 
            if (explode) { 
                // Explode: 'param=v1; param=v2'  (Cookie header separates cookies with "; ") 
                // Note: This works because the generated string is appended to the header. 
                return value.map(v => \`\${key}=\${encode(v)}\`).join('; '); 
            } else { 
                // No Explode
                return \`\${key}=\${value.map(v => encode(v)).join(joinChar)}\`; 
            } 
        } 
        
        if (typeof value === 'object') { 
            if (explode) { 
                // Explode: 'k1=v1; k2=v2' (Parameter name omitted for object props) 
                return Object.entries(value).map(([k, v]) => \`\${k}=\${encode(v)}\`).join('; '); 
            } else { 
                // No Explode: 'param=k1,v1,k2,v2' 
                const flat = Object.entries(value).map(([k, v]) => \`\${isCookieStyle ? k : encodeURIComponent(k)}\${joinChar}\${encode(v)}\`).join(joinChar); 
                return \`\${key}=\${flat}\`; 
            } 
        } 
        
        // Primitive logic
        const valStr = String(value); 
        return \`\${key}=\${encode(valStr)}\`;`,
        });

        classDeclaration.addMethod({
            name: 'serializeRawQuerystring',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'value', type: 'any' },
                { name: 'serialization', type: "'json' | undefined", hasQuestionToken: true },
            ],
            returnType: 'string',
            statements: `
        if (value === null || value === undefined) return ''; 
        if (serialization === 'json') return encodeURIComponent(JSON.stringify(value)); 
        if (typeof value === 'object') { 
            return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('&'); 
        } 
        return String(value);`,
        });

        classDeclaration.addMethod({
            name: 'serializeUrlEncodedBody',
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: 'body', type: 'any' },
                { name: 'encodings', type: 'Record<string, any>', initializer: '{}' },
            ],
            returnType: 'HttpParams',
            statements: `
            let params = new HttpParams({ encoder: new ApiParameterCodec() }); 
            if (!body || typeof body !== 'object') return params; 

            Object.entries(body).forEach(([key, value]) => { 
                if (value === undefined || value === null) return; 
                const config = encodings[key] || { style: 'form', explode: true }; 
                const paramConfig = { name: key, in: 'query', ...config }; 
                params = this.serializeQueryParam(params, paramConfig, value); 
            }); 
            return params;`,
        });

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

        sourceFile.formatText();
    }
}
