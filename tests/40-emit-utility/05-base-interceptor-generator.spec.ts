import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { BaseInterceptorGenerator } from '@src/generators/angular/utils/base-interceptor.generator.js';

describe('Emitter: BaseInterceptorGenerator', () => {
    const runGenerator = (clientName?: string) => {
        const project = new Project({ useInMemoryFileSystem: true });
        new BaseInterceptorGenerator(project, clientName).generate('/out');
        return project.getSourceFileOrThrow('/out/utils/base-interceptor.ts').getText();
    };

    it('should generate a default interceptor when no clientName is provided', () => {
        const fileContent = runGenerator();
        expect(fileContent).toContain('export class DefaultBaseInterceptor');
        expect(fileContent).toContain('inject(HTTP_INTERCEPTORS_DEFAULT)');
        expect(fileContent).toContain('if (!req.context.has(this.clientContextToken))');
    });

    it('should generate a named interceptor when a clientName is provided', () => {
        const fileContent = runGenerator('MyApi');
        expect(fileContent).toContain('export class MyApiBaseInterceptor');
        expect(fileContent).toContain('inject(HTTP_INTERCEPTORS_MYAPI)');
        expect(fileContent).toContain(
            'private readonly clientContextToken: HttpContextToken<string> = CLIENT_CONTEXT_TOKEN_MYAPI;',
        );
    });

    it('should contain the correct intercept logic', () => {
        const fileContent = runGenerator();
        const logic = fileContent.substring(fileContent.indexOf('intercept(')); // Get the method body for inspection

        expect(logic).toContain('if (!req.context.has(this.clientContextToken))');
        expect(logic).toContain('return next.handle(req);');
        expect(logic).toContain('const handler: HttpHandler = this.httpInterceptors.reduceRight(');
        expect(logic).toContain('=> interceptor.intercept(request, nextHandler)');
        expect(logic).toContain('return handler.handle(req);');
    });
});
