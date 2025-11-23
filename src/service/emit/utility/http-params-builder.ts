import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `utils/http-params-builder.ts` file.
 * This utility handles the complex serialization logic required by OpenAPI 3.x/Swagger 2.0 parameters.
 * It implements RFC 6570 style expansions (simple, label, matrix, form, etc.) and
 * provides a custom HttpParameterCodec to support `allowReserved`.
 */
export class HttpParamsBuilderGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "http-params-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Imports
        sourceFile.addImportDeclaration({
            moduleSpecifier: "@angular/common/http",
            namedImports: ["HttpParams", "HttpParameterCodec"]
        });

        /**
         * 1. Generate Custom Codec Class
         * We use an Identity Codec that performs NO encoding.
         * This delegates full control of encoding (standard vs reserved) to the serializeQueryParam method logic.
         *
         * Angular's default codec uses strict encoding. By providing this identity codec,
         * we signal to Angular's HttpParams to trust the keys and values we pass to `.append()`.
         */
        sourceFile.addClass({
            name: "ApiParameterCodec",
            isExported: true,
            implements: ["HttpParameterCodec"],
            docs: ["A custom parameter codec that disables Angular's default encoding, delegating control to the HttpParamsBuilder."],
            methods: [
                { name: "encodeKey", parameters: [{ name: "key", type: "string" }], returnType: "string", statements: "return key;" },
                { name: "encodeValue", parameters: [{ name: "value", type: "string" }], returnType: "string", statements: "return value;" },
                // Decoding isn't strictly used by HttpParams.toString(), but required by interface
                { name: "decodeKey", parameters: [{ name: "key", type: "string" }], returnType: "string", statements: "return decodeURIComponent(key);" },
                { name: "decodeValue", parameters: [{ name: "value", type: "string" }], returnType: "string", statements: "return decodeURIComponent(value);" }
            ]
        });

        const classDeclaration = sourceFile.addClass({
            name: "HttpParamsBuilder",
            isExported: true,
            docs: ["Utility to serialize parameters (Path, Query, Header, Cookie) according to OpenAPI style/explode rules."],
        });

        // --- Path Parameter Serialization ---
        classDeclaration.addMethod({
            name: "serializePathParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "key", type: "string" },
                { name: "value", type: "any" },
                { name: "style", type: "string", initializer: "'simple'" },
                { name: "explode", type: "boolean", initializer: "false" },
                { name: "allowReserved", type: "boolean", initializer: "false" },
                { name: "serialization", type: "'json' | undefined", hasQuestionToken: true }
            ],
            returnType: "string",
            statements: `
        if (value === null || value === undefined) return '';

        if (serialization === 'json' && typeof value !== 'string') {
            value = JSON.stringify(value);
        }

        const encode = (v: string) => allowReserved ? this.encodeReserved(v) : encodeURIComponent(v);

        if (style === 'simple') {
             // Path: /users/{id*}
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
            // Path: /users/{.id*}
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
            // Path: /users/{;id*}
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

        // Default fallback
        return encode(String(value));`
        });

        // --- Query Parameter Serialization ---
        classDeclaration.addMethod({
            name: "serializeQueryParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "params", type: "HttpParams" },
                { name: "config", type: "any" }, // Parameter Object
                { name: "value", type: "any" }
            ],
            returnType: "HttpParams",
            statements: `
        if (value === null || value === undefined) return params;
        
        const name = config.name;
        
        // Allow reserved characters if specified in config (RFC 6570 +)
        const allowReserved = config.allowReserved === true;
        const encode = (v: string) => allowReserved ? this.encodeReserved(v) : encodeURIComponent(v);

        // Handle implicit or explicit JSON serialization request.
        const isJson = config.serialization === 'json' || config.contentType === 'application/json';

        if (isJson && typeof value !== 'string') {
            value = JSON.stringify(value);
        }

        const style = config.style || 'form';
        const explode = config.explode ?? true;
        
        if (style === 'deepObject' && typeof value === 'object') {
             // Recursive flattening
             const processDeep = (obj: any, prefix: string) => {
                 Object.keys(obj).forEach(k => {
                     const keyPath = \`\${prefix}[\${k}]\`;
                     const v = obj[k];
                     if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                         processDeep(v, keyPath);
                     } else {
                         // Manually encode keyPath since identity codec won't
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
            } else if (style === 'pipeDelimited') { 
                params = params.append(encode(name), encode(value.join('|'))); 
            } else { 
                // form, explode: false (comma separated)
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
        }

        // Default: primitive
        // Manually encode both key and value using our encoder variable
        // (which respects allowReserved)
        return params.append(encode(name), encode(String(value)));`
        });

        // --- Header Parameter Serialization ---
        classDeclaration.addMethod({
            name: "serializeHeaderParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "key", type: "string" },
                { name: "value", type: "any" },
                { name: "explode", type: "boolean", initializer: "false" },
                { name: "serialization", type: "'json' | undefined", hasQuestionToken: true }
            ],
            returnType: "string",
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
        return String(value);`
        });

        // --- Cookie Parameter Serialization ---
        classDeclaration.addMethod({
            name: "serializeCookieParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "key", type: "string" },
                { name: "value", type: "any" },
                { name: "style", type: "string", initializer: "'form'" },
                { name: "explode", type: "boolean", initializer: "true" },
                { name: "serialization", type: "'json' | undefined", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: [
                "Serializes a cookie parameter according to OAS rules (RFC 6265).",
                "Handles 'form' style (default) and correct delimiters."
            ],
            statements: `
        if (value === null || value === undefined) return '';
        
        if (serialization === 'json') {
             // Simple JSON serialization override
             return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`;
        }
        
        if (Array.isArray(value)) {
            const encodedValues = value.map(v => encodeURIComponent(String(v)));
            if (explode) {
                // style: form, explode: true (Array) -> name=val1; name=val2
                return encodedValues.map(v => \`\${key}=\${v}\`).join('; ');
            } else {
                // style: form, explode: false (Array) -> name=val1,val2
                return \`\${key}=\${encodedValues.join(',')}\`;
            }
        } 
        
        if (typeof value === 'object') {
            if (explode) {
                // style: form, explode: true (Object) -> prop1=val1; prop2=val2
                return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('; ');
            } else {
                // style: form, explode: false (Object) -> name=prop1,val1,prop2,val2
                const flat = Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(',');
                return \`\${key}=\${encodeURIComponent(flat)}\`;
            }
        }
        
        // Primitive
        return \`\${key}=\${encodeURIComponent(String(value))}\`;`
        });

        // --- Raw Querystring (OAS 3.2) ---
        classDeclaration.addMethod({
            name: "serializeRawQuerystring",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "value", type: "any" },
                { name: "serialization", type: "'json' | undefined", hasQuestionToken: true }
            ],
            returnType: "string",
            statements: `
        if (value === null || value === undefined) return '';
        if (serialization === 'json') return encodeURIComponent(JSON.stringify(value));
        if (typeof value === 'object') {
            return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('&');
        }
        return String(value);`
        });

        // --- URL Encoded Body ---
        classDeclaration.addMethod({
            name: "serializeUrlEncodedBody",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "body", type: "any" },
                { name: "encodings", type: "Record<string, any>", initializer: "{}" }
            ],
            returnType: "HttpParams",
            statements: `
            // Bodies usually adhere to strict URI encoding, but if we reuse serializeQueryParam logic
            // we must ensure a consistent codec.
            let params = new HttpParams({ encoder: new ApiParameterCodec() });
            if (!body || typeof body !== 'object') return params;

            Object.entries(body).forEach(([key, value]) => {
                if (value === undefined || value === null) return;
                const config = encodings[key] || { style: 'form', explode: true };
                const paramConfig = { name: key, in: 'query', ...config };
                params = this.serializeQueryParam(params, paramConfig, value);
            });
            return params;
            `
        });

        // --- Helper: allowReserved Encoding ---
        classDeclaration.addMethod({
            name: "encodeReserved",
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: "value", type: "string" }],
            returnType: "string",
            docs: ["RFC 3986 encoding but preserves reserved characters (/, :, etc) as per allowReserved: true."],
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
            .replace(/%3D/gi, '=');`
        });

        sourceFile.formatText();
    }
}
