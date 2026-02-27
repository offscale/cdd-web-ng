import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class ResponseHeaderParserGenerator {
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'response-header.service.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable'] },
            { moduleSpecifier: '@angular/common/http', namedImports: ['HttpHeaders'] },
            {
                moduleSpecifier: '../response-headers',
                namedImports: ['API_RESPONSE_HEADERS', 'API_HEADER_XML_CONFIGS'],
            },
            { moduleSpecifier: './xml-parser', namedImports: ['XmlParser'] },
            { moduleSpecifier: './linkset-parser', namedImports: ['LinkSetParser'] },
        ]);

        const serviceClass = sourceFile.addClass({
            name: 'ResponseHeaderService',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: ["{ providedIn: 'root' }"] }],
            docs: ['Service to parse and coerce response headers into typed objects based on API metadata.'],
        });

        serviceClass.addMethod({
            name: 'parse',
            typeParameters: [{ name: 'T' }],
            scope: Scope.Public,
            parameters: [
                { name: 'headers', type: 'HttpHeaders' },
                { name: 'operationId', type: 'string' },
                { name: 'statusCode', type: 'number | string' },
            ],
            returnType: 'T',
            statements: `
        const result: any = {};
        const opHeaders = (API_RESPONSE_HEADERS as any)[operationId];
        if (!opHeaders) return result as T;

        const status = statusCode.toString();
        const headerConfig = opHeaders[status] || opHeaders['default'];
        if (!headerConfig) return result as T;

        Object.entries(headerConfig).forEach(([headerName, typeHint]) => {
            if (!headers.has(headerName)) return;

            if (typeHint === 'array' || typeHint === 'set-cookie') {
                const values = headers.getAll(headerName) ?? [];
                if (values.length === 0) {
                    const fallback = headers.get(headerName);
                    result[headerName] = fallback !== null ? [fallback] : [];
                } else {
                    result[headerName] = values;
                }
            } else {
                const val = headers.get(headerName);
                if (val !== null) {
                    const xmlConfigKey = \`\${operationId}_\${status}_\${headerName}\`;
                    const xmlConfig = (API_HEADER_XML_CONFIGS as any)[xmlConfigKey];
                    result[headerName] = this.coerce(val, typeHint as string, xmlConfig);
                }
            }
        });

        return result as T;`,
        });

        serviceClass.addMethod({
            name: 'coerce',
            scope: Scope.Private,
            parameters: [
                { name: 'value', type: 'string' },
                { name: 'type', type: 'string' },
                { name: 'xmlConfig', type: 'any', hasQuestionToken: true },
            ],
            returnType: 'any',
            statements: `
        switch (type) {
            case 'number': return parseFloat(value);
            case 'boolean': return value.toLowerCase() === 'true';
            case 'json':
                try { return JSON.parse(value); }
                catch { return value; }
            case 'xml':
                return XmlParser.parse(value, xmlConfig || {});
            case 'date':
                return new Date(value);
            case 'linkset':
                return LinkSetParser.parseHeader(value);
            case 'linkset+json':
                try {
                    return LinkSetParser.parseJson(JSON.parse(value));
                } catch {
                    return value;
                }
            default: return value;
        }`,
        });

        serviceClass.addMethod({
            name: 'parseLinkSetBody',
            typeParameters: [{ name: 'T' }],
            scope: Scope.Public,
            parameters: [{ name: 'body', type: 'any' }],
            returnType: 'any',
            statements: `
            return LinkSetParser.parseJson(body);`,
        });

        sourceFile.formatText();
    }
}
