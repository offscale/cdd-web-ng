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
        if (value === null || value === undefined) return params; 
        
        // Pass-through check if 'serialization' key is present in config (extended config from generator)
        if (config.serialization === 'json' && typeof value !== 'string') {
            value = JSON.stringify(value);
        }

        const name = config.name; 
        const style = config.style || 'form'; 
        const explode = config.explode ?? true; 
        
        if (style === 'deepObject' && typeof value === 'object') { 
             // Recursive flattening could be implemented here, but for standard compliance:
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
                // This case is ambiguous in spec for headers, commonly toString or custom 
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
        // Cookies with OAS 'json' content mapping usually imply encoding the whole JSON string
        if (serialization === 'json') {
             return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`;
        }
        
        let valStr = '';
        if (Array.isArray(value)) { 
            valStr = value.map(v => encodeURIComponent(String(v))).join(explode ? ',' : ','); // Cookies usually ignore explode for arrays in simple form 
        } else if (typeof value === 'object') { 
            if (style === 'form') {
                if (explode) {
                    // Spec allows expanding key=val pair for each prop? 
                    // Standard cookie structure is name=value; name2=value2. 
                    // If one cookie param expands to multiple cookies, we return joined with '; ' 
                    // BUT key here is the cookie name. If explode, valid prop becomes separate cookie? 
                    // Ambiguous. Usually interpreted as flat string key=val1,val2 or flattened object.
                    // We will return key=value; key2=value2 style without the prefix 'key=' if fully exploded for the set?
                    // No, 'serializeCookieParam' is called for *one* defined cookie parameter.
                    // If explode is true, we might emit multiple key=value pairs separated by '; ' 
                    // e.g. cookie "id" exploded with {a:1, b:2} -> "a=1; b=2" (The 'id' name is ignored!)
                    return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('; ');
                } else {
                    valStr = Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(',');
                }
            }
        } else { 
            valStr = encodeURIComponent(String(value)); 
        } 
        
        // If we didn't explode top-level (returning multiple cookies), wrap in name=val
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
                // Re-use query param logic by fabricating a config object
                const paramConfig = { name: key, in: 'query', ...config };
                params = this.serializeQueryParam(params, paramConfig, value);
            });
            return params;
            `
        });

        // --- Helper: allowReserved Encoding ---
        // Encodes everything EXCEPT the reserved set: :/?#[]@!$&'()*+,;=
        classDeclaration.addMethod({
            name: "encodeReserved",
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: "value", type: "string" }],
            returnType: "string",
            statements: `
        // First standard encode 
        const encoded = encodeURIComponent(value); 
        
        // Then revert reserved characters 
        // RFC 3986 Reserved: : / ? # [ ] @ ! $ & ' ( ) * + , ; = 
        // Corresponding percent-encodings to revert: 
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

        sourceFile.formatText();
    }
}
