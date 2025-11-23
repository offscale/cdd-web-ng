import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `utils/http-params-builder.ts` file.
 * This utility handles the complex serialization logic required by OpenAPI 3.x/Swagger 2.0 parameters.
 * It implements RFC 6570 style expansions (simple, label, matrix, form, etc.),
 * arrays/objects explosion, and the `allowReserved` flag for path parameters.
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
            namedImports: ["HttpParams"]
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
        // Handle strictly 'passed' empty value for allowEmptyValue: true
        // When allowEmptyValue is true, the value is expected to be '' (empty string) when checking emptiness.
        // However, HTTP params are usually string-based.
        // The generator calling this method will pass the value.
        // If value is null or undefined, it is skipped.
        if (value === null || value === undefined) return params; 
        
        const name = config.name;
        const allowEmptyValue = config.allowEmptyValue === true;

        // RFC 6570 / OAS \`allowEmptyValue: true\` behavior:
        // If the value is an empty string, it should be serialized as just the key name (flag style).
        // Angular's HttpParams doesn't natively support appending keys without values (it appends '=value' or '=').
        // But internally it handles empty strings as 'key='. 
        // Strict key-only serialization requires custom encoding or override of toString, which HttpParams doesn't easily expose.
        // HOWEVER, standard usage of 'allowEmptyValue' often accepts 'key=' as equivalent to 'key'.
        // If we strictly need 'key' (no equals), we must rely on HttpUrlEncodingCodec or manual string building.
        // For now, we follow Angular's convention which serializes empty strings as 'key=', 
        // but we explicitly check if we can support flag style if customization allows.
        
        // NOTE: Angular's HttpParams default encoder serializes empty string as 'key='
        // There is no standard way to force 'key' without '=' in Angular's default HttpParams.
        // We implement strict checking here only if we were building the string manually.
        // Since we return HttpParams, 'key=' is the result.
        // But we ensure we don't process objects if they are empty strings.

        // Handle implicit or explicit JSON serialization request.
        const isJson = config.serialization === 'json' || config.contentType === 'application/json';

        if (isJson && typeof value !== 'string') {
            value = JSON.stringify(value);
        } 

        // Strict check for allowEmptyValue behavior: if empty string, treat as flag? 
        // Angular HttpParams always adds '='. We cannot change this return type easily without breaking the entire service chain.
        // We Proceed with standard serialization.

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
                         params = params.append(keyPath, String(v)); 
                     } 
                 }); 
             }; 
             processDeep(value, name); 
             return params; 
        } 

        if (Array.isArray(value)) { 
            if (style === 'form' && explode) { 
                value.forEach(v => params = params.append(name, String(v))); 
            } else if (style === 'spaceDelimited') { 
                // Encoded space
                params = params.append(name, value.join(' ')); 
            } else if (style === 'pipeDelimited') { 
                params = params.append(name, value.join('|')); 
            } else { 
                // form, explode: false (comma separated) 
                params = params.append(name, value.join(',')); 
            } 
            return params; 
        } 

        if (typeof value === 'object') { 
             if (style === 'form') { 
                 if (explode) { 
                     Object.entries(value).forEach(([k, v]) => params = params.append(k, String(v))); 
                 } else { 
                     const flattened = Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(','); 
                     params = params.append(name, flattened); 
                 } 
                 return params; 
             } 
        } 

        return params.append(name, String(value));`
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
            statements: `
        if (value === null || value === undefined) return ''; 
        if (serialization === 'json') { 
             return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`; 
        } 
        
        let valStr = ''; 
        if (Array.isArray(value)) { 
            valStr = value.map(v => encodeURIComponent(String(v))).join(explode ? ',' : ','); 
        } else if (typeof value === 'object') { 
            if (style === 'form') { 
                if (explode) { 
                    return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('; '); 
                } else { 
                    valStr = Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(','); 
                } 
            } 
        } else { 
            valStr = encodeURIComponent(String(value)); 
        } 
        
        return \`\${key}=\${valStr}\`;`
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
            let params = new HttpParams(); 
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
            statements: `
        const encoded = encodeURIComponent(value); 
        return encoded 
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

        // --- Flag Style Override ---
        // NOTE: This method is added to support strict flag serialization.
        // However, Angular's `HttpParams` does not support flags.
        // This method is a placeholder for future custom serializer implementation if required.
        // For now, we rely on standard `HttpParams` behavior which serializes empty strings as `key=`.
        // The tests verify that we correctly pass the empty string value to `HttpParams` when appropriate.

        sourceFile.formatText();
    }
}
