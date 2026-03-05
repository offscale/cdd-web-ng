import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class ResponseHeaderParserGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const utilsDir = path.join(outputDir, 'utils');
        /* v8 ignore next */
        const filePath = path.join(utilsDir, 'response-header.service.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
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

        /* v8 ignore next */
        const serviceClass = sourceFile.addClass({
            name: 'ResponseHeaderService',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: ["{ providedIn: 'root' }"] }],
            docs: ['Service to parse and coerce response headers into typed objects based on API metadata.'],
        });

        /* v8 ignore next */
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
        const result: Record<string, never> = {};
        const opHeaders = (API_RESPONSE_HEADERS as Record<string, Record<string, Record<string, string>>>)[operationId];
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
                    const xmlConfig = (API_HEADER_XML_CONFIGS as Record<string, never>)[xmlConfigKey];
                    result[headerName] = this.coerce(val, typeHint as string, xmlConfig);
                }
            }
        });

        return result as T;`,
        });

        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'coerce',
            scope: Scope.Private,
            parameters: [
                { name: 'value', type: 'string' },
                { name: 'type', type: 'string' },
                { name: 'xmlConfig', type: 'Record<string, never>', hasQuestionToken: true },
            ],
            returnType: 'Record<string, never>',
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

        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'parseLinkSetBody',
            typeParameters: [{ name: 'T' }],
            scope: Scope.Public,
            parameters: [{ name: 'body', type: 'Record<string, never>' }],
            returnType: 'Record<string, never>',
            statements: `
            return LinkSetParser.parseJson(body);`,
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
