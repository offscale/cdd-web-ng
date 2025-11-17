import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `http-params-builder.ts` file. This file contains a static utility class
 * for building HttpParams from complex objects and arrays according to OpenAPI serialization rules,
 * which is a common requirement for API query parameters that Angular's HttpClient does not handle out-of-the-box.
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
            docs: ["A utility class for building HttpParams from complex objects and arrays based on OpenAPI serialization styles."],
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
                "Serializes a query parameter based on its OpenAPI definition (style, explode).",
                "@param params The current HttpParams instance to append to.",
                "@param parameter The OpenAPI parameter definition.",
                "@param value The actual value of the parameter.",
                "@returns The updated HttpParams instance."
            ],
            statements: this.getSerializeQueryParamBody(),
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

        sourceFile.formatText();
    }

    private getSerializeQueryParamBody(): string {
        return `
    if (value == null) { 
        return params; 
    } 

    const name = parameter.name; 
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
            // Other combinations are not specified for query params
            break; 

        case 'pipeDelimited': 
             if (isArray && !explode) { 
                const psv = (value as any[]).map(item => this.formatValue(item)).join('|'); 
                params = params.append(name, psv); 
                return params; 
            } 
            // Other combinations are not specified for query params
            break; 

        case 'deepObject': 
            if (isObject && explode) { 
                 Object.entries(value as Record<string, any>).forEach(([key, propValue]) => { 
                    if (propValue != null) { 
                       params = params.append(\`\${name}[\${key}]\`, this.formatValue(propValue)); 
                    } 
                }); 
                 return params; 
            } 
            // Other combinations are not specified for query params
            break; 
    } 

    // Fallback for simple cases or unsupported styles/combos. 
    // This often defaults to <code>style: 'form', explode: true</code> for arrays. 
    if (Array.isArray(value)) { 
        value.forEach(item => { 
            if (item != null) params = params.append(name, this.formatValue(item)); 
        }); 
    } else { 
        params = params.append(name, this.formatValue(value)); 
    } 
    return params;`;
    }
}
