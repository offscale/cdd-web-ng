import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../../core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

export class ServerUrlGenerator {
    constructor(
        private parser: SwaggerParser,
        private project: Project,
    ) {}

    public generate(outputDir: string): void {
        // Note: We generate even if 0, because SwaggerParser defaults to '/' if empty,
        // ensuring API_SERVERS is always available for the ServiceGenerator.
        const servers = this.parser.servers && this.parser.servers.length > 0 ? this.parser.servers : [{ url: '/' }];

        const utilsDir = path.join(outputDir, 'utils');
        const filePath = path.join(utilsDir, 'server-url.ts');

        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

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
                    type: 'Record<string, { enum?: string[]; default: string; description?: string; }>',
                },
            ],
        });

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

        const lookupParamType = 'number | string';

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
                writer.writeLine('let server: ServerConfiguration | undefined;');
                writer
                    .writeLine("if (typeof indexOrDescription === 'number') {")
                    .indent(() => {
                        writer.writeLine('server = API_SERVERS[indexOrDescription];');
                    })
                    .writeLine('} else {')
                    .indent(() => {
                        writer.writeLine(
                            'server = API_SERVERS.find(s => s.name === indexOrDescription || s.description === indexOrDescription);',
                        );
                    })
                    .writeLine('}');

                writer
                    .writeLine('if (!server) {')
                    .indent(() => {
                        writer.writeLine('throw new Error(`Server not found: ${indexOrDescription}`);');
                    })
                    .writeLine('}');

                writer.writeLine('let url = server.url;');
                writer
                    .writeLine('if (server.variables) {')
                    .indent(() => {
                        writer
                            .writeLine('Object.entries(server.variables).forEach(([key, config]) => {')
                            .indent(() => {
                                writer.writeLine('const value = variables?.[key] ?? config.default;');
                                writer
                                    .writeLine('if (config.enum && !config.enum.includes(value)) {')
                                    .indent(() => {
                                        writer.writeLine(
                                            'throw new Error(`Value "${value}" for variable "${key}" is not in the allowed enum: ${config.enum.join(\', \')}`);',
                                        );
                                    })
                                    .writeLine('}');
                                writer.writeLine("url = url.replace(new RegExp(`{${key}}`, 'g'), value);");
                            })
                            .writeLine('});');
                    })
                    .writeLine('}');
                writer.writeLine('return url;');
            },
        });

        sourceFile.formatText();
    }
}
