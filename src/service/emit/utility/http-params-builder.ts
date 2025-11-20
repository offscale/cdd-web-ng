import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `http-params-builder.ts` file. This file contains a static utility class
 * for building HttpParams from complex objects and arrays according to OpenAPI serialization rules.
 */
export class HttpParamsBuilderGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "http-params-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpParams"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["Parameter"],
                moduleSpecifier: "../models",
            },
        ]);

        const classDeclaration = sourceFile.addClass({
            name: "HttpParamsBuilder",
            isExported: true,
            docs: ["A utility class for building HttpParams and serializing parameters according to OpenAPI rules."],
        });

        classDeclaration.addMethod({
            name: "serializeQueryParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "params", type: "HttpParams" },
                { name: "parameter", type: "Parameter" },
                { name: "value", type: "any" },
            ],
            returnType: "HttpParams",
            docs: [
                "Serializes a query parameter based on its OpenAPI definition (style, explode, content).",
                "@param params The current HttpParams instance to append to.",
                "@param parameter The OpenAPI parameter definition.",
                "@param value The actual value of the parameter.",
                "@returns The updated HttpParams instance."
            ],
            statements: this.getSerializeQueryParamBody(),
        });

        classDeclaration.addMethod({
            name: "serializePathParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "name", type: "string" },
                { name: "value", type: "any" },
                { name: "style", type: "string" },
                { name: "explode", type: "boolean" },
                { name: "allowReserved", type: "boolean", initializer: "false" },
                { name: "serializationType", type: "'json' | 'text'", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: [
                "Serializes a path parameter based on style and explode options (simple, label, matrix).",
                "@param name The name of the parameter.",
                "@param value The value of the parameter.",
                "@param style The OpenAPI style (simple, label, matrix).",
                "@param explode Whether to explode arrays/objects.",
                "@param allowReserved Whether to allow reserved characters like '/' and '?' in the value.",
                "@param serializationType Optional hint to force JSON serialization (for 'content' based params)."
            ],
            statements: this.getSerializePathParamBody()
        });

        classDeclaration.addMethod({
            name: "serializeHeaderParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "name", type: "string" },
                { name: "value", type: "any" },
                { name: "explode", type: "boolean" },
                { name: "serializationType", type: "'json' | 'text'", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: [
                "Serializes a header parameter. Headers always use 'simple' style.",
                "@param name The name of the parameter.",
                "@param value The value of the parameter.",
                "@param explode Whether to explode objects (key=val,key=val) vs (key,val,key,val).",
                "@param serializationType Optional hint to force JSON serialization (for 'content' based params)."
            ],
            statements: this.getSerializeHeaderParamBody()
        });

        classDeclaration.addMethod({
            name: "serializeCookieParam",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "name", type: "string" },
                { name: "value", type: "any" },
                { name: "style", type: "string" },
                { name: "explode", type: "boolean" },
                { name: "serializationType", type: "'json' | 'text'", hasQuestionToken: true }
            ],
            returnType: "string",
            docs: [
                "Serializes a cookie parameter.",
                "@param name The name of the parameter.",
                "@param value The value of the parameter.",
                "@param style The OpenAPI style (usually 'form').",
                "@param explode Whether to explode arrays/objects.",
                "@param serializationType Optional hint to force JSON serialization (for 'content' based params)."
            ],
            statements: this.getSerializeCookieParamBody()
        });

        classDeclaration.addMethod({
            name: "formatValue",
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: "value", type: "unknown" },
            ],
            returnType: "string",
            docs: ["Formats a value into a string suitable for URL parameters."],
            statements: `
if (value instanceof Date) { 
    return value.toISOString(); 
} 
return String(value);`,
        });

        classDeclaration.addMethod({
            name: "encode",
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: "value", type: "string" },
                { name: "allowReserved", type: "boolean" }
            ],
            returnType: "string",
            docs: ["Encodes a value for use in a URL path segment, optionally allowing reserved characters."],
            statements: `
if (allowReserved) { 
    // Encode everything, then decode the reserved characters 
    return encodeURIComponent(value).replace(/%[0-9A-F]{2}/g, (match) => { 
        // Reserved chars: ! * ' ( ) ; : @ & = + $ , / ? % # [ ] 
        if (match.match(/%(?:21|2A|27|28|29|3B|3A|40|26|3D|2B|24|2C|2F|3F|25|23|5B|5D)/i)) { 
            return decodeURIComponent(match); 
        } 
        return match; 
    }); 
} 
return encodeURIComponent(value); 
`
        });

        sourceFile.formatText();
    }

    private getSerializeQueryParamBody(): string {
        return `
    if (value == null) { 
        return params; 
    } 

    const name = parameter.name; 

    // Handle OAS 3.2 deprecated allowEmptyValue logic.
    if (value === '' && parameter.allowEmptyValue === false) {
        return params;
    }

    // Handle content-based serialization (mutually exclusive with style/explode in OAS3) 
    if (parameter.content) { 
        const contentType = Object.keys(parameter.content)[0]; // Use first available content type
        if (contentType && (contentType.includes('application/json') || contentType.includes('*/*'))) { 
            // Strict JSON serialization
            return params.append(name, JSON.stringify(value)); 
        } 
    } 

    // Defaulting logic from OAS spec
    const style = parameter.style ?? 'form'; 
    const explode = parameter.explode ?? (style === 'form'); 
    const schema = parameter.schema ?? { type: parameter.type }; 

    const isArray = schema.type === 'array'; 
    const isObject = schema.type === 'object'; 

    switch (style) { 
        case 'form': 
            if (isArray) { 
                const arrValue = value as any[]; 
                if (explode) { 
                    arrValue.forEach(item => { 
                        if (item != null) { 
                            params = params.append(name, this.formatValue(item)); 
                        } 
                    }); 
                } else { 
                    const csv = arrValue.map(item => this.formatValue(item)).join(','); 
                    params = params.append(name, csv); 
                } 
            } else if (isObject) { 
                const objValue = value as Record<string, any>; 
                if (explode) { 
                    Object.entries(objValue).forEach(([key, propValue]) => { 
                       if (propValue != null) params = params.append(key, this.formatValue(propValue)); 
                    }); 
                } else { 
                    const csv = Object.entries(objValue).flatMap(([k, v]) => [k, this.formatValue(v)]).join(','); 
                    params = params.append(name, csv); 
                } 
            } else { 
                params = params.append(name, this.formatValue(value)); 
            } 
            return params; 

        case 'spaceDelimited': 
            if (isArray && !explode) { 
                const ssv = (value as any[]).map(item => this.formatValue(item)).join(' '); 
                params = params.append(name, ssv); 
                return params; 
            } 
            break; 

        case 'pipeDelimited': 
             if (isArray && !explode) { 
                const psv = (value as any[]).map(item => this.formatValue(item)).join('|'); 
                params = params.append(name, psv); 
                return params; 
            } 
            break; 

        case 'deepObject': 
            if (isObject && explode) { 
                 Object.entries(value as Record<string, any>).forEach(([key, propValue]) => { 
                    if (propValue != null) { 
                       if (Array.isArray(propValue)) {
                           propValue.forEach(item => {
                               if (item != null) params = params.append(\`\${name}[\${key}]\`, this.formatValue(item)); 
                           });
                       } else {
                           params = params.append(\`\${name}[\${key}]\`, this.formatValue(propValue)); 
                       }
                    } 
                }); 
                 return params; 
            } 
            break; 
    } 

    if (Array.isArray(value)) { 
        value.forEach(item => { 
            if (item != null) params = params.append(name, this.formatValue(item)); 
        }); 
    } else { 
        params = params.append(name, this.formatValue(value)); 
    } 
    return params;`;
    }

    private getSerializePathParamBody(): string {
        return `
    if (value === null || value === undefined) return ''; 

    if (serializationType === 'json') { 
        return this.encode(JSON.stringify(value), allowReserved); 
    } 

    // Default style for path is 'simple' 
    const effectiveStyle = style || 'simple'; 
    
    const isArray = Array.isArray(value); 
    const isObject = typeof value === 'object' && value !== null && !isArray && !(value instanceof Date); 

    if (effectiveStyle === 'simple') { 
        // simple: /ids/1,2,3 (array, explode=false/true) 
        // object explode=false: a,1,b,2 
        // object explode=true: a=1,b=2 
        if (isArray) { 
            return (value as any[]).map(v => this.encode(this.formatValue(v), allowReserved)).join(','); 
        } 
        if (isObject) { 
            if (explode) { 
               return Object.entries(value).map(([k, v]) => \`\${this.encode(k, allowReserved)}=\${this.encode(this.formatValue(v), allowReserved)}\`).join(','); 
            } 
            return Object.entries(value).flatMap(([k, v]) => [this.encode(k, allowReserved), this.encode(this.formatValue(v), allowReserved)]).join(','); 
        } 
        return this.encode(this.formatValue(value), allowReserved); 
    } 

    if (effectiveStyle === 'label') { 
        // label: prefix '.' 
        const prefix = '.'; 
        if (isArray) { 
            const joiner = explode ? '.' : ','; 
            return \`\${prefix}\${(value as any[]).map(v => this.encode(this.formatValue(v), allowReserved)).join(joiner)}\`; 
        } 
        if (isObject) { 
            if (explode) { 
                return \`\${prefix}\${Object.entries(value).map(([k, v]) => \`\${this.encode(k, allowReserved)}=\${this.encode(this.formatValue(v), allowReserved)}\`).join(prefix)}\`; 
            } 
            return \`\${prefix}\${Object.entries(value).flatMap(([k, v]) => [this.encode(k, allowReserved), this.encode(this.formatValue(v), allowReserved)]).join(',')}\`; 
        } 
        return \`\${prefix}\${this.encode(this.formatValue(value), allowReserved)}\`; 
    } 

    if (effectiveStyle === 'matrix') { 
        // matrix: prefix ';' 
        const prefix = ';'; 
        if (isArray) { 
            if (explode) { 
                return (value as any[]).map(v => \`\${prefix}\${name}=\${this.encode(this.formatValue(v), allowReserved)}\`).join(''); 
            } 
            return \`\${prefix}\${name}=\${(value as any[]).map(v => this.encode(this.formatValue(v), allowReserved)).join(',')}\`; 
        } 
        if (isObject) { 
            if (explode) { 
                 return Object.entries(value).map(([k, v]) => \`\${prefix}\${this.encode(k, allowReserved)}=\${this.encode(this.formatValue(v), allowReserved)}\`).join(''); 
            } 
            const flat = Object.entries(value).flatMap(([k, v]) => [this.encode(k, allowReserved), this.encode(this.formatValue(v), allowReserved)]).join(','); 
            return \`\${prefix}\${name}=\${flat}\`; 
        } 
        return \`\${prefix}\${name}=\${this.encode(this.formatValue(value), allowReserved)}\`; 
    } 

    // Fallback
    return this.encode(this.formatValue(value), allowReserved);`;
    }

    private getSerializeCookieParamBody(): string {
        return `
    if (value === null || value === undefined) return ''; 
    
    if (serializationType === 'json') { 
        return \`\${name}=\${encodeURIComponent(JSON.stringify(value))}\`; 
    } 

    const effectiveStyle = style || 'form'; 

    const isArray = Array.isArray(value); 
    const isObject = typeof value === 'object' && value !== null && !isArray && !(value instanceof Date); 

    if (effectiveStyle === 'form') { 
        if (isArray) { 
             if (explode) { 
                 return (value as any[]).map(v => \`\${name}=\${this.formatValue(v)}\`).join('; '); 
             } 
             const joined = (value as any[]).map(v => this.formatValue(v)).join(','); 
             return \`\${name}=\${joined}\`; 
        } 
        if (isObject) { 
             if (explode) { 
                 return Object.entries(value).map(([k, v]) => \`\${k}=\${this.formatValue(v)}\`).join('; '); 
             } 
             const flat = Object.entries(value).flatMap(([k, v]) => [k, this.formatValue(v)]).join(','); 
             return \`\${name}=\${flat}\`; 
        } 
        return \`\${name}=\${this.formatValue(value)}\`; 
    } 
    
    return \`\${name}=\${this.formatValue(value)}\`; 
    `;
    }

    private getSerializeHeaderParamBody(): string {
        return `
    if (value === null || value === undefined) return ''; 

    if (serializationType === 'json') { 
        return JSON.stringify(value); 
    } 

    if (Array.isArray(value)) { 
        return (value as any[]).map(v => this.formatValue(v)).join(','); 
    } 
    
    if (typeof value === 'object' && value !== null && !(value instanceof Date)) { 
        if (explode) { 
             return Object.entries(value).map(([k, v]) => \`\${k}=\${this.formatValue(v)}\`).join(','); 
        } 
        return Object.entries(value).flatMap(([k, v]) => [k, this.formatValue(v)]).join(','); 
    } 

    return this.formatValue(value); 
    `;
    }
}
