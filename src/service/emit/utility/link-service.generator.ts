import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";

/**
 * Generates the `link.service.ts` file.
 * This service bridges the static `API_LINKS` registry and runtime expression evaluation.
 * It allows consumers to pass an HTTP Response and a Link Name to automatically derive
 * the parameters/body needed for the next request defined by the Link relations.
 */
export class LinkServiceGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
        // Swagger 2.0 does not support links.
        // Even in OAS 3, if no links are defined, we skip this service to keep the bundle small.
        const hasLinks = this.parser.operations.some(op =>
            op.responses && Object.values(op.responses).some(r => r.links && Object.keys(r.links).length > 0)
        ) || (this.parser.links && Object.keys(this.parser.links).length > 0);

        if (!hasLinks) {
            return;
        }

        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "link.service.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            { moduleSpecifier: "@angular/core", namedImports: ["Injectable"] },
            { moduleSpecifier: "@angular/common/http", namedImports: ["HttpResponse"] },
            { moduleSpecifier: "../links", namedImports: ["API_LINKS"] },
        ]);

        const linkServiceClass = sourceFile.addClass({
            name: "LinkService",
            isExported: true,
            decorators: [{ name: "Injectable", arguments: ["{ providedIn: 'root' }"] }],
            docs: ["Service to resolve OpenAPI Links from HTTP Responses using runtime expressions."]
        });

        // Define the return type interface inline for clarity in generated code
        sourceFile.addInterface({
            name: "ResolvedLink",
            isExported: true,
            properties: [
                { name: "targetOperationId", type: "string", hasQuestionToken: true },
                { name: "operationRef", type: "string", hasQuestionToken: true },
                { name: "parameters", type: "Record<string, any>" },
                { name: "body", type: "any", hasQuestionToken: true }
            ]
        });

        linkServiceClass.addMethod({
            name: "resolveLink",
            scope: Scope.Public,
            parameters: [
                { name: "operationId", type: "string" },
                { name: "response", type: "HttpResponse<any>" },
                { name: "linkName", type: "string" }
            ],
            returnType: "ResolvedLink | null",
            statements: `
        const status = response.status.toString();
        // @ts-ignore: API_LINKS is generated based on the spec structure
        const opLinks = API_LINKS[operationId];
        if (!opLinks) return null;

        // Fallback to 'default' if specific status not found, match simple status codes (e.g. 200)
        const linksForStatus = opLinks[status] || opLinks['default'];
        if (!linksForStatus) return null;

        const linkDef = linksForStatus[linkName];
        if (!linkDef) return null;

        // Context for runtime expression evaluation.
        // Note: $url, $method, $request.* are not fully available from HttpResponse alone.
        // This limited implementation focuses on $statusCode, $response.body, and $response.header
        // which satisfy the majority of Link traversal use cases (using response data to drive next request).
        const context: any = {
            statusCode: response.status,
            response: {
                headers: this.extractHeaders(response.headers),
                body: response.body
            }
        };

        const parameters: Record<string, any> = {};
        if (linkDef.parameters) {
            Object.entries(linkDef.parameters).forEach(([key, expr]) => {
                parameters[key] = this.evaluate(expr, context);
            });
        }

        const body = linkDef.requestBody ? this.evaluate(linkDef.requestBody, context) : undefined;

        return {
            targetOperationId: linkDef.operationId,
            operationRef: linkDef.operationRef,
            parameters,
            body
        };`
        });

        // Helper to extract headers to simple object
        linkServiceClass.addMethod({
            name: "extractHeaders",
            scope: Scope.Private,
            parameters: [{ name: "headers", type: "any" }], // HttpHeaders type is inferred from usage or any
            statements: `
        const result: Record<string, string> = {};
        if (!headers) return result;
        
        // Handle Angular HttpHeaders object
        const keys = typeof headers.keys === 'function' ? headers.keys() : Object.keys(headers);
        keys.forEach((key: string) => {
            const val = typeof headers.get === 'function' ? headers.get(key) : headers[key];
            if (val !== null && val !== undefined) result[key.toLowerCase()] = String(val);
        });
        return result;`
        });

        // Runtime expression evaluator implementation
        // Embedding logic here prevents dependency on core library files at runtime
        linkServiceClass.addMethod({
            name: "evaluate",
            scope: Scope.Private,
            parameters: [
                { name: "expression", type: "any" },
                { name: "context", type: "any" }
            ],
            statements: `
        if (typeof expression !== 'string') return expression;
        
        // 1. Constant string
        if (!expression.startsWith('$') && !expression.includes('{')) return expression;

        // 2. Embedded template string "foo_{$response.body#id}"
        if (expression.includes('{') && expression.includes('}')) {
            return expression.replace(/\\{([^}]+)\\}/g, (_, inner) => {
                const val = this.evaluateExpression(inner.trim(), context);
                return val !== undefined ? String(val) : '';
            });
        }

        // 3. Direct expression "$response.body#id"
        return this.evaluateExpression(expression, context);`
        });

        linkServiceClass.addMethod({
            name: "evaluateExpression",
            scope: Scope.Private,
            parameters: [
                { name: "expr", type: "string" },
                { name: "context", type: "any" }
            ],
            statements: `
        if (expr === '$statusCode') return context.statusCode;

        if (expr.startsWith('$response.body')) {
            if (expr === '$response.body') return context.response.body;
            if (expr.startsWith('$response.body#')) {
                return this.resolvePointer(context.response.body, expr.substring(15)); // len('$response.body#')
            }
        }
        
        if (expr.startsWith('$response.header.')) {
            const token = expr.substring(17).toLowerCase();
            return context.response.headers[token];
        }

        // $request and $url expressions are not supported in this lightweight implementation
        // as they require Request context access which provided via HTTP Interceptors usually.
        console.warn(\`LinkService: Expression '\${expr}' cannot be evaluated in this context.\`);
        return undefined;`
        });

        linkServiceClass.addMethod({
            name: "resolvePointer",
            scope: Scope.Private,
            parameters: [
                { name: "obj", type: "any" },
                { name: "pointer", type: "string" }
            ],
            statements: `
        if (obj === null || obj === undefined) return undefined;
        if (pointer === '' || pointer === '/') return obj;
        
        const parts = pointer.split('/').filter(p => p.length > 0);
        let current = obj;
        
        for (const part of parts) {
            if (current === null || current === undefined) return undefined;
            // RFC 6901 unescape
            const unescaped = part.replace(/~1/g, '/').replace(/~0/g, '~');
            if (Array.isArray(current)) {
                const idx = parseInt(unescaped, 10);
                if (isNaN(idx)) return undefined;
                current = current[idx];
            } else {
                current = current[unescaped];
            }
        }
        return current;`
        });

        sourceFile.formatText();
    }
}
