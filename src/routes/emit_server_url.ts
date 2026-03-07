import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

export class ServerUrlGenerator {
    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    public generate(outputDir: string): void {
        // Note: We generate even if 0, because SwaggerParser defaults to '/' if empty,
        // ensuring API_SERVERS is always available for the ServiceGenerator.
        /* v8 ignore next */
        const servers = this.parser.servers && this.parser.servers.length > 0 ? this.parser.servers : [{ url: '/' }];

        /* v8 ignore next */
        const utilsDir = path.join(outputDir, 'utils');
        /* v8 ignore next */
        const filePath = path.join(utilsDir, 'server-url.ts');

        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ServerVariable',
            isExported: true,
            properties: [
                { name: 'enum', type: 'string[]', hasQuestionToken: true },
                { name: 'default', type: 'string' },
                { name: 'description', type: 'string', hasQuestionToken: true },
            ],
            indexSignatures: [{ keyName: 'key', keyType: 'string', returnType: 'string | number | boolean | object | undefined | null' }],
            docs: ['Server variable definition (OAS Server Variable Object).'],
        });

        /* v8 ignore next */
        sourceFile.addInterface({
            name: 'ServerConfiguration',
            isExported: true,
            properties: [
                { name: 'url', type: 'string' },
                { name: 'description', type: 'string', hasQuestionToken: true },
                { name: 'name', type: 'string', hasQuestionToken: true },
                {
                    name: 'variables',
                    hasQuestionToken: true,
                    type: 'Record<string, ServerVariable>',
                },
            ],
            indexSignatures: [{ keyName: 'key', keyType: 'string', returnType: 'string | number | boolean | object | undefined | null' }],
            docs: ['Server configuration entries declared in the OpenAPI document.'],
        });

        /* v8 ignore next */
        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'API_SERVERS',
                    type: 'ServerConfiguration[]',
                    initializer: JSON.stringify(servers, null, 2),
                },
            ],
            docs: ['The list of servers defined in the OpenAPI specification.'],
        });

        /* v8 ignore next */
        const lookupParamType = 'number | string';

        /* v8 ignore next */
        sourceFile.addFunction({
            name: 'resolveServerUrl',
            isExported: true,
            parameters: [
                { name: 'servers', type: 'ServerConfiguration[]' },
                { name: 'indexOrDescription', type: lookupParamType, initializer: '0' },
                { name: 'variables', type: 'Record<string, string>', hasQuestionToken: true },
            ],
            returnType: 'string',
            docs: [
                'Resolves a server URL from a provided server list.',
                '@param servers The list of servers to resolve against (operation-level or global).',
                '@param indexOrDescription The index of the server, or its name (OAS 3.2), or description.',
                "@param variables A dictionary of variable values (e.g. { port: '8080' }) to override defaults.",
            ],
            statements: writer => {
                /* v8 ignore next */
                writer.writeLine('let server: ServerConfiguration | undefined;');
                /* v8 ignore next */
                writer
                    .writeLine("if (typeof indexOrDescription === 'number') {")
                    .indent(() => {
                        /* v8 ignore next */
                        writer.writeLine('server = servers[indexOrDescription];');
                    })
                    .writeLine('} else {')
                    .indent(() => {
                        /* v8 ignore next */
                        writer.writeLine(
                            'server = servers.find(s => s.name === indexOrDescription || s.description === indexOrDescription);',
                        );
                    })
                    .writeLine('}');

                /* v8 ignore next */
                writer
                    .writeLine('if (!server) {')
                    .indent(() => {
                        /* v8 ignore next */
                        writer.writeLine('throw new Error(`Server not found: ${indexOrDescription}`);');
                    })
                    .writeLine('}');

                /* v8 ignore next */
                writer.writeLine('let url = server.url;');
                /* v8 ignore next */
                writer
                    .writeLine('if (server.variables) {')
                    .indent(() => {
                        /* v8 ignore next */
                        writer
                            .writeLine('Object.entries(server.variables).forEach(([key, config]) => {')
                            .indent(() => {
                                /* v8 ignore next */
                                writer.writeLine('const value = variables?.[key] ?? config.default;');
                                /* v8 ignore next */
                                writer
                                    .writeLine('if (config.enum && !config.enum.includes(value)) {')
                                    .indent(() => {
                                        /* v8 ignore next */
                                        writer.writeLine(
                                            'throw new Error(`Value "${value}" for variable "${key}" is not in the allowed enum: ${config.enum.join(\', \')}`);',
                                        );
                                    })
                                    .writeLine('}');
                                /* v8 ignore next */
                                writer.writeLine("url = url.replace(new RegExp(`{${key}}`, 'g'), value);");
                            })
                            .writeLine('});');
                    })
                    .writeLine('}');
                /* v8 ignore next */
                writer.writeLine('return url;');
            },
        });

        /* v8 ignore next */
        sourceFile.addFunction({
            name: 'getServerUrl',
            isExported: true,
            parameters: [
                { name: 'indexOrDescription', type: lookupParamType, initializer: '0' },
                { name: 'variables', type: 'Record<string, string>', hasQuestionToken: true },
            ],
            returnType: 'string',
            docs: [
                'Gets the URL for a specific server definition.',
                '@param indexOrDescription The index of the server, or its name (OAS 3.2), or description.',
                "@param variables A dictionary of variable values (e.g. { port: '8080' }) to override defaults.",
            ],
            statements: writer => {
                /* v8 ignore next */
                writer.writeLine('return resolveServerUrl(API_SERVERS, indexOrDescription, variables);');
            },
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
