import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

export class HttpParamsBuilderGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "http-params-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclaration({
            moduleSpecifier: "@angular/common/http",
            namedImports: ["HttpParams", "HttpParameterCodec"]
        });

        sourceFile.addClass({
            name: "ApiParameterCodec",
            isExported: true,
            implements: ["HttpParameterCodec"],
            docs: ["A custom parameter codec that disables Angular's default encoding, delegating control to the HttpParamsBuilder."],
            methods: [
                {
                    name: "encodeKey",
                    parameters: [{ name: "key", type: "string" }],
                    returnType: "string",
                    statements: "return key;"
                },
                {
                    name: "encodeValue",
                    parameters: [{ name: "value", type: "string" }],
                    returnType: "string",
                    statements: "return value;"
                },
                {
                    name: "decodeKey",
                    parameters: [{ name: "key", type: "string" }],
                    returnType: "string",
                    statements: "return decodeURIComponent(key);"
                },
                {
                    name: "decodeValue",
                    parameters: [{ name: "value", type: "string" }],
                    returnType: "string",
                    statements: "return decodeURIComponent(value);"
                }
            ]
        });

        const classDeclaration = sourceFile.addClass({
            name: "HttpParamsBuilder",
            isExported: true,
            docs: ["Utility to serialize parameters (Path, Query, Header, Cookie) according to OpenAPI style/explode rules."],
        });

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

        return encode(String(value));`
        });

        classDeclaration.addMethod({
            name: "serializeQueryParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "params", type: "HttpParams" },
                { name: "config", type: "any" },
                { name: "value", type: "any" }
            ],
            returnType: "HttpParams",
            statements: `
        if (value === null || value === undefined) return params; 
        
        const name = config.name; 
        const allowReserved = config.allowReserved === true; 
        const encode = (v: string) => allowReserved ? this.encodeReserved(v) : encodeURIComponent(v); 
        const isJson = config.serialization === 'json' || config.contentType === 'application/json'; 

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
        } 

        return params.append(encode(name), encode(String(value)));`
        });

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
            docs: ["Serializes a cookie parameter according to OAS rules (RFC 6265)."],
            statements: `
        if (value === null || value === undefined) return ''; 
        if (serialization === 'json') return \`\${key}=\${encodeURIComponent(JSON.stringify(value))}\`; 
        
        if (Array.isArray(value)) { 
            const encodedValues = value.map(v => encodeURIComponent(String(v))); 
            if (explode) { 
                return encodedValues.map(v => \`\${key}=\${v}\`).join('; '); 
            } else { 
                return \`\${key}=\${encodedValues.join(',')}\`; 
            } 
        } 
        
        if (typeof value === 'object') { 
            if (explode) { 
                return Object.entries(value).map(([k, v]) => \`\${k}=\${v}\`).join('; '); 
            } else { 
                const flat = Object.entries(value).map(([k, v]) => \`\${k},\${v}\`).join(','); 
                return \`\${key}=\${encodeURIComponent(flat)}\`; 
            } 
        } 
        return \`\${key}=\${encodeURIComponent(String(value))}\`;`
        });

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
            let params = new HttpParams({ encoder: new ApiParameterCodec() }); 
            if (!body || typeof body !== 'object') return params; 

            Object.entries(body).forEach(([key, value]) => { 
                if (value === undefined || value === null) return; 
                const config = encodings[key] || { style: 'form', explode: true }; 
                const paramConfig = { name: key, in: 'query', ...config }; 
                params = this.serializeQueryParam(params, paramConfig, value); 
            }); 
            return params;`
        });

        classDeclaration.addMethod({
            name: "encodeReserved",
            isStatic: true,
            scope: Scope.Private,
            parameters: [{ name: "value", type: "string" }],
            returnType: "string",
            docs: ["RFC 3986 encoding but preserves reserved characters."],
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
