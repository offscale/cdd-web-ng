// tests/30-emit-service/03-service-method-precedence.spec.ts

import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig, PathInfo } from '@src/core/types/index.js';
import { TypeGenerator } from '@src/classes/emit.js';
import { ServiceMethodGenerator } from '@src/vendors/angular/service/service-method.generator.js';

describe('Emitter: ServiceMethodGenerator (Response Precedence)', () => {
    const createTestEnv = () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Precedence Test', version: '1.0' },
            paths: {},
            components: {
                schemas: {
                    SpecificModel: { type: 'object', properties: { id: { type: 'string' } } },
                    GenericModel: { type: 'string' },
                    DefaultModel: { type: 'number' },
                },
            },
        };
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'Date', enumStyle: 'enum' } };

        const project = new Project({ useInMemoryFileSystem: true });
        const parser = new SwaggerParser(spec as any, config);

        // Pre-generate types so the generator recognizes "SpecificModel" as a type name
        new TypeGenerator(parser, project, config).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const serviceClass = sourceFile.addClass({ name: 'TestService' });

        return { methodGen, serviceClass };
    };

    it('should prioritize specific 200 response over generic 2XX response', () => {
        const op: PathInfo = {
            method: 'GET',
            path: '/test',
            methodName: 'testSpecific',
            responses: {
                '2XX': {
                    description: 'ok',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericModel' } } },
                },
                '200': {
                    description: 'ok',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/SpecificModel' } } },
                },
            },
        } as any;

        const { methodGen, serviceClass } = createTestEnv();
        methodGen.addServiceMethod(serviceClass, op);

        const returnType = serviceClass.getMethodOrThrow('testSpecific').getOverloads()[0].getReturnType().getText();
        expect(returnType).toContain('SpecificModel');
        expect(returnType).not.toContain('GenericModel');
    });

    it('should fallback to 2XX response if no specific status code exists', () => {
        const op: PathInfo = {
            method: 'GET',
            path: '/test',
            methodName: 'testRange',
            responses: {
                '2XX': {
                    description: 'ok',
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericModel' } } },
                },
                '400': { description: 'Bad Request' },
            },
        } as any;

        const { methodGen, serviceClass } = createTestEnv();
        methodGen.addServiceMethod(serviceClass, op);

        const returnType = serviceClass.getMethodOrThrow('testRange').getOverloads()[0].getReturnType().getText();
        expect(returnType).toContain('GenericModel');
    });

    it('should fallback to default response if no success codes (specific or range) exist', () => {
        const op: PathInfo = {
            method: 'GET',
            path: '/test',
            methodName: 'testDefault',
            responses: {
                default: {
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/DefaultModel' } } },
                },
                '500': { description: 'Server Error' },
            },
        } as any;

        const { methodGen, serviceClass } = createTestEnv();
        methodGen.addServiceMethod(serviceClass, op);

        const returnType = serviceClass.getMethodOrThrow('testDefault').getOverloads()[0].getReturnType().getText();
        // Corrected Expectation: We expect the Alias Name 'DefaultModel' because it was defined via $ref.
        expect(returnType).toContain('DefaultModel');
    });
});
