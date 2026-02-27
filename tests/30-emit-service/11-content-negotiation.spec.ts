import { describe, expect, it } from 'vitest';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/vendors/angular/service/service-method.generator.js';
import { TypeGenerator } from '@src/classes/emit.js';
import { XmlBuilderGenerator } from '@src/openapi/emit_xml_builder.js';

const negotiationSpec = {
    openapi: '3.0.0',
    info: { title: 'Negotiation Test', version: '1.0' },
    paths: {
        '/negotiate': {
            get: {
                operationId: 'getNegotiatedData',
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    properties: { id: { type: 'number' } },
                                },
                            },
                            'application/xml': {
                                schema: {
                                    type: 'object',
                                    xml: { name: 'Data' },
                                    properties: {
                                        id: { type: 'number', xml: { attribute: true } },
                                        val: { type: 'string' },
                                    },
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

describe('Emitter: ServiceMethodGenerator (Content Negotiation)', () => {
    const createTestEnv = (spec: object = negotiationSpec) => {
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { enumStyle: 'enum', framework: 'angular' },
        };
        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(spec as any, config);

        new TypeGenerator(parser, project, config).generate('/out');
        new XmlBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });
        serviceClass.addProperty({ name: 'http', scope: Scope.Private, isReadonly: true, type: 'any' });
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, scope: Scope.Private, initializer: "''" });
        serviceClass.addMethod({
            name: 'createContextWithClientId',
            scope: Scope.Private,
            returnType: 'any',
            statements: 'return {};',
        });

        return { methodGen, serviceClass, parser };
    };

    it('should generate overloads for explicit Accept headers', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getNegotiatedData')!;
        // Ensure methodName set to avoid warning skip
        op.methodName = 'getNegotiatedData';

        methodGen.addServiceMethod(serviceClass, op);

        const method = serviceClass.getMethodOrThrow('getNegotiatedData');
        const overloads = method.getOverloads();

        // 1. Check XML specific overload
        const xmlOverload = overloads.find(o => o.getText().includes("'Accept': 'application/xml'"));
        expect(xmlOverload).toBeDefined();
        // It should return an object with 'id' and 'val', inferred from XML schema
        // (The type string check assumes TypeGenerator behavior, here we just check it exists)
        // expect(xmlOverload!.getReturnType().getText()).toContain('Observable');

        // 2. Check JSON specific overload
        const jsonOverload = overloads.find(o => o.getText().includes("'Accept': 'application/json'"));
        expect(jsonOverload).toBeDefined();

        // 3. Check Default overload
        const defaultOverload = overloads.find(o => !o.getText().includes("'Accept':"));
        expect(defaultOverload).toBeDefined();
    });

    it('should generate runtime logic to parse XML if Accept header requests it', () => {
        const { methodGen, serviceClass, parser } = createTestEnv();
        const op = parser.operations.find(o => o.operationId === 'getNegotiatedData')!;
        op.methodName = 'getNegotiatedData';
        methodGen.addServiceMethod(serviceClass, op);

        const body = serviceClass.getMethodOrThrow('getNegotiatedData').getBodyText()!;

        // Logic should extract Accept header
        expect(body).toContain("const acceptHeader = headers.get('Accept');");

        // Logic should set responseType to 'text' if XML requested
        expect(body).toContain("acceptHeader?.includes('application/xml')");
        expect(body).toContain("? 'text' :");

        // Logic should attempt to parse XML
        expect(body).toContain("if (acceptHeader?.includes('application/xml')) {");
        expect(body).toContain('return XmlParser.parse(response,');
    });

    it('should drop wildcard media types when more specific types exist', () => {
        const wildcardSpec = {
            openapi: '3.2.0',
            info: { title: 'Wildcard API', version: '1.0' },
            paths: {
                '/wildcards': {
                    get: {
                        operationId: 'getWildcardData',
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    '*/*': { schema: { type: 'string' } },
                                    'text/*': { schema: { type: 'string' } },
                                    'text/plain': { schema: { type: 'string' } },
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            properties: { id: { type: 'number' } },
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

        const { methodGen, serviceClass, parser } = createTestEnv(wildcardSpec);
        const op = parser.operations.find(o => o.operationId === 'getWildcardData')!;
        op.methodName = 'getWildcardData';

        methodGen.addServiceMethod(serviceClass, op);

        const method = serviceClass.getMethodOrThrow('getWildcardData');
        const overloads = method.getOverloads().map(o => o.getText());

        expect(overloads.some(text => text.includes("'Accept': 'application/json'"))).toBe(true);
        expect(overloads.some(text => text.includes("'Accept': 'text/plain'"))).toBe(true);
        expect(overloads.some(text => text.includes("'Accept': 'text/*'"))).toBe(false);
        expect(overloads.some(text => text.includes("'Accept': '*/*'"))).toBe(false);
    });
});
