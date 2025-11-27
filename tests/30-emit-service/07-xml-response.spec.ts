import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';

const xmlResponseSpec = {
    openapi: '3.0.0',
    info: { title: 'XML Response Test', version: '1.0' },
    paths: {
        '/xml-data': {
            get: {
                operationId: 'getXmlData',
                responses: {
                    '200': {
                        content: {
                            'application/xml': {
                                schema: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'integer', xml: { attribute: true } },
                                        label: { type: 'string' },
                                    },
                                    xml: { name: 'DataRoot' },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
    components: {},
};

describe('Emitter: ServiceMethodGenerator (XML Response Parsing)', () => {
    const createTestEnv = () => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { enumStyle: 'enum', framework: 'angular' },
        };
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(xmlResponseSpec as any, config);

        new TypeGenerator(parser, project, config).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({
            name: 'basePath',
            scope: Scope.Private,
            isReadonly: true,
            type: 'string',
            initializer: "''",
        });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};',
        });

        return { methodGen, serviceClass };
    };

    it('should set responseType to text and pipe through XmlParser.parse', () => {
        const { methodGen, serviceClass } = createTestEnv();
        const op: any = {
            method: 'GET',
            path: '/xml-data',
            methodName: 'getXmlData',
            responses: xmlResponseSpec.paths['/xml-data'].get.responses,
        };

        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getXmlData').getBodyText()!;

        // Expect responseType to be forced to 'text'
        expect(body).toContain(`responseType: 'text'`);

        // Expect pipe and map chain
        expect(body).toContain('.pipe(');
        expect(body).toContain('map(response => {');

        // Expect call to XmlParser.parse with correct Config structure.
        // We check specific property existence to be robust against object key ordering
        expect(body).toContain('return XmlParser.parse(response,');
        expect(body).toContain('"name":"DataRoot"');
        expect(body).toContain('"nodeType":"element"');
        expect(body).toContain('"properties":{');
        expect(body).toContain('"id":{"attribute":true');
    });
});
