import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { ServiceMethodGenerator } from '@src/generators/angular/service/service-method.generator.js';
import { ExtensionTokensGenerator } from '@src/generators/angular/utils/extension-tokens.generator.js';

const extensionsSpec = {
    openapi: '3.0.0',
    info: { title: 'Ext', version: '1' },
    paths: {
        '/cached': {
            get: {
                operationId: 'getCachedData',
                'x-cache-ttl': 300,
                'x-important': true,
                responses: { '200': {} },
            },
        },
    },
};

describe('Generated Code: Extensions Runtime Support', () => {
    const run = () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: { framework: 'angular' } } as any;
        const parser = new SwaggerParser(extensionsSpec as any, config);

        // 1. Test Token Generation
        new ExtensionTokensGenerator(project).generate('/out');
        const tokenFile = project.getSourceFileOrThrow('/out/tokens/extensions.token.ts');
        expect(tokenFile.getText()).toContain('export const EXTENSIONS_CONTEXT_TOKEN');

        // 2. Test Service Generation Injection
        const op = parser.operations[0];
        op.methodName = 'getCachedData';

        const methodGen = new ServiceMethodGenerator(config, parser);
        const sourceFile = project.createSourceFile('/out/service.ts');
        const cls = sourceFile.addClass({ name: 'TestService' });
        cls.addMethod({
            name: 'createContextWithClientId',
            returnType: 'any',
            statements: 'return {};',
        });

        methodGen.addServiceMethod(cls, op);
        return cls.getMethodOrThrow('getCachedData').getBodyText()!;
    };

    it('should inject extensions into HttpContext when present', () => {
        const body = run();
        expect(body).toContain('EXTENSIONS_CONTEXT_TOKEN');
        expect(body).toContain('"x-cache-ttl":300');
        expect(body).toContain('"x-important":true');
    });
});
