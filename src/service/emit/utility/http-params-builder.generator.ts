import * as path from "path";
import { ClassDeclaration, MethodDeclarationStructure, OptionalKind, Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `http-params-builder.ts` file. This file contains a static utility class
 * for recursively building HttpParams from complex objects and arrays, which is a common
 * requirement for API query parameters that Angular's HttpClient does not handle out-of-the-box.
 */
export class HttpParamsBuilderGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "http-params-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclaration({
            namedImports: ["HttpParams"],
            moduleSpecifier: "@angular/common/http",
        });

        const classDeclaration = sourceFile.addClass({
            name: "HttpParamsBuilder",
            isExported: true,
            docs: ["A utility class for building HttpParams recursively from complex objects."],
        });

        this.addMethods(classDeclaration);
    }

    private addMethods(classDeclaration: ClassDeclaration): void {
        const methods: OptionalKind<MethodDeclarationStructure>[] = [
            {
                name: "addToHttpParams",
                isStatic: true,
                scope: Scope.Public,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "value", type: "unknown", docs: ["The value to add. Can be a primitive, object, or array."] },
                    { name: "key", type: "string", docs: ["The key for the parameter."] },
                ],
                returnType: "HttpParams",
                docs: ["Public entry point to add a value to HttpParams. It delegates to the recursive handler."],
                statements: `
if (value == null) {
    return httpParams;
}

const isDate = value instanceof Date;
const isObject = typeof value === 'object' && !isDate;

if (isObject) {
    return this.addFromObject(httpParams, value as Record<string, unknown>, key);
}

// For primitives, dates, and other types
return httpParams.append(key, this.formatValue(value));`,
            },
            {
                name: "addFromObject",
                isStatic: true,
                scope: Scope.Private,
                parameters: [
                    { name: "httpParams", type: "HttpParams" },
                    { name: "obj", type: "Record<string, unknown> | unknown[]" },
                    { name: "prefix", type: "string" },
                ],
                returnType: "HttpParams",
                docs: ["Recursively processes an object or array."],
                statements: `
if (Array.isArray(obj)) {
    // For arrays, append each item under the same key.
    // e.g., { ids: [1, 2] } becomes 'ids=1&ids=2'
    for (const value of obj) {
        if (value != null) {
            httpParams = this.addToHttpParams(httpParams, value, prefix);
        }
    }
} else {
    // For objects, iterate over keys and build nested keys.
    // e.g., { filter: { name: 'test' } } becomes 'filter.name=test'
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = (obj as Record<string, unknown>)[key];
            if (value != null) {
                const newPrefix = prefix ? \`\${prefix}.\${key}\` : key;
                httpParams = this.addToHttpParams(httpParams, value, newPrefix);
            }
        }
    }
}
return httpParams;`,
            },
            {
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
            },
        ];

        classDeclaration.addMethods(methods);
    }
}
