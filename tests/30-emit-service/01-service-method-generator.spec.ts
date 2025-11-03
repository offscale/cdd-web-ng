import { describe, it, expect, vi } from 'vitest';
import { Project, ClassDeclaration } from 'ts-morph';
import { ServiceMethodGenerator } from '@src/service/emit/service/service-method.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, PathInfo } from '@src/core/types.js';
import { finalCoverageSpec } from '../shared/specs.js';
import { TypeGenerator } from '@src/service/emit/type/type.generator.js';
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

describe('Emitter: ServiceMethodGenerator Coverage', () => {

    const createTestEnvironment = () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
        const parser = new SwaggerParser(finalCoverageSpec as any, config);

        // Pre-generate dependencies that methods might require
        new TypeGenerator(parser, project, config).generate('/out');
        new HttpParamsBuilderGenerator(project).generate('/out');

        const methodGen = new ServiceMethodGenerator(config, parser);
        const serviceClass = project.createSourceFile('/out/tmp.service.ts').addClass('TmpService');

        // Manually add required service properties for the method body to be valid
        serviceClass.addProperty({ name: 'basePath', isReadonly: true, scope: 'private', type: 'string', initializer: "''"});
        serviceClass.addProperty({ name: 'http', isReadonly: true, scope: 'private', type: 'any', initializer: "{}"});
        serviceClass.addMethod({ name: 'createContextWithClientId', isPrivate: true, returnType: 'any', statements: 'return {};' });

        return { methodGen, serviceClass, parser };
    };

    it('should warn and skip generation if operation has no methodName', () => {
        const { methodGen, serviceClass } = createTestEnvironment();
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const operationWithoutName: PathInfo = { path: '/test', method: 'GET' }; // No methodName

        methodGen.addServiceMethod(serviceClass, operationWithoutName);

        expect(serviceClass.getMethods().filter(m => !m.isAbstract() && m.getName() !== 'createContextWithClientId').length).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping method generation for operation without a methodName'));
        warnSpy.mockRestore();
    });

    it('should fall back to a generic `body: any` parameter for non-json content', () => {
        const { methodGen, serviceClass, parser } = createTestEnvironment();
        const operation = parser.operations.find(op => op.operationId === 'allParams')!;
        operation.methodName = 'allParams'; // Ensure methodName is set

        methodGen.addServiceMethod(serviceClass, operation);
        const method = serviceClass.getMethodOrThrow('allParams');
        const param = method.getParameters().find(p => p.getName() === 'body');
        expect(param?.getType().getText()).toBe('any');
    });
});
