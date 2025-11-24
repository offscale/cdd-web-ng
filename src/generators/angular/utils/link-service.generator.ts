import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";

export class LinkServiceGenerator {
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project
    ) {
    }

    public generate(outputDir: string): void {
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
            { moduleSpecifier: "@angular/common/http", namedImports: ["HttpResponse", "HttpRequest"] },
            { moduleSpecifier: "../links", namedImports: ["API_LINKS"] },
        ]);

        const linkServiceClass = sourceFile.addClass({
            name: "LinkService",
            isExported: true,
            decorators: [{ name: "Injectable", arguments: ["{ providedIn: 'root' }"] }],
            docs: ["Service to resolve OpenAPI Links from HTTP Responses using runtime expressions."]
        });

        sourceFile.addInterface({
            name: "ResolvedLink",
            isExported: true,
            properties: [
                { name: "targetOperationId", type: "string", hasQuestionToken: true },
                { name: "operationRef", type: "string", hasQuestionToken: true },
                { name: "parameters", type: "Record<string, any>" },
                { name: "body", type: "any", hasQuestionToken: true },
                { name: "targetServer", type: "string", hasQuestionToken: true }
            ]
        });

        linkServiceClass.addMethod({
            name: "resolveLink",
            scope: Scope.Public,
            parameters: [
                { name: "operationId", type: "string" },
                { name: "response", type: "HttpResponse<any>" },
                { name: "linkName", type: "string" },
                { name: "request", type: "HttpRequest<any>", hasQuestionToken: true }
            ],
            returnType: "ResolvedLink | null",
            statements: `
        const status = response.status.toString(); 
        const opLinks = (API_LINKS as any)[operationId]; 
        if (!opLinks) return null; 

        const linksForStatus = opLinks[status] || opLinks['default']; 
        if (!linksForStatus) return null; 

        const linkDef = linksForStatus[linkName]; 
        if (!linkDef) return null; 

        const context: any = { 
            statusCode: response.status, 
            response: { 
                headers: this.extractHeaders(response.headers), 
                body: response.body
            } 
        }; 

        if (request) { 
            context.url = request.url; 
            context.method = request.method; 
            context.request = { 
                headers: this.extractHeaders(request.headers), 
                query: this.extractQueryParams(request.params), 
                body: request.body
            }; 
        } 

        const parameters: Record<string, any> = {}; 
        if (linkDef.parameters) { 
            Object.entries(linkDef.parameters).forEach(([key, expr]) => { 
                parameters[key] = this.evaluate(expr, context); 
            }); 
        } 

        const body = linkDef.requestBody ? this.evaluate(linkDef.requestBody, context) : undefined; 
        const targetServer = linkDef.server ? this.resolveServer(linkDef.server) : undefined; 

        return { 
            targetOperationId: linkDef.operationId, 
            operationRef: linkDef.operationRef, 
            parameters, 
            body, 
            targetServer
        };`
        });

        linkServiceClass.addMethod({
            name: "resolveServer",
            scope: Scope.Private,
            parameters: [{ name: "server", type: "any" }],
            returnType: "string",
            statements: `
        let url = server.url; 
        if (server.variables) { 
            Object.keys(server.variables).forEach(key => { 
                const variable = server.variables[key]; 
                url = url.replace(new RegExp('{' + key + '}', 'g'), variable.default || ''); 
            }); 
        } 
        return url;`
        });

        linkServiceClass.addMethod({
            name: "extractHeaders",
            scope: Scope.Private,
            parameters: [{ name: "headers", type: "any" }],
            statements: `
        const result: Record<string, string> = {}; 
        if (!headers) return result; 
        const keys = typeof headers.keys === 'function' ? headers.keys() : Object.keys(headers); 
        keys.forEach((key: string) => { 
            const val = typeof headers.get === 'function' ? headers.get(key) : headers[key]; 
            if (val !== null && val !== undefined) result[key.toLowerCase()] = String(val); 
        }); 
        return result;`
        });

        linkServiceClass.addMethod({
            name: "extractQueryParams",
            scope: Scope.Private,
            parameters: [{ name: "params", type: "any" }],
            statements: `
        const result: Record<string, string> = {}; 
        if (!params) return result; 
        const keys = typeof params.keys === 'function' ? params.keys() : Object.keys(params); 
        keys.forEach((key: string) => { 
            const val = typeof params.get === 'function' ? params.get(key) : params[key]; 
            if (val !== null && val !== undefined) result[key] = String(val); 
        }); 
        return result;`
        });

        linkServiceClass.addMethod({
            name: "evaluate",
            scope: Scope.Private,
            parameters: [
                { name: "expression", type: "any" },
                { name: "context", type: "any" }
            ],
            statements: `
        if (typeof expression !== 'string') return expression; 
        if (!expression.startsWith('$') && !expression.includes('{')) return expression; 

        if (expression.includes('{') && expression.includes('}')) { 
            return expression.replace(/\\{([^}]+)\\}/g, (_, inner) => { 
                const val = this.evaluateExpression(inner.trim(), context); 
                return val !== undefined ? String(val) : ''; 
            }); 
        } 
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
        if (expr === '$url') return context.url; 
        if (expr === '$method') return context.method; 

        if (expr.startsWith('$response.body')) { 
            if (expr === '$response.body') return context.response.body; 
            if (expr.startsWith('$response.body#')) { 
                return this.resolvePointer(context.response.body, expr.substring(15)); 
            } 
        } 
        if (expr.startsWith('$response.header.')) { 
            const token = expr.substring(17).toLowerCase(); 
            return context.response.headers[token]; 
        } 

        if (context.request) { 
            if (expr.startsWith('$request.body')) { 
                if (expr === '$request.body') return context.request.body; 
                if (expr.startsWith('$request.body#')) { 
                    return this.resolvePointer(context.request.body, expr.substring(14)); 
                } 
            } 
            if (expr.startsWith('$request.header.')) { 
                const token = expr.substring(16).toLowerCase(); 
                return context.request.headers[token]; 
            } 
            if (expr.startsWith('$request.query.')) { 
                const token = expr.substring(15); 
                return context.request.query[token]; 
            } 
        } 
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
