import { describe, expect, it } from 'vitest';
import { WebhookHelperGenerator } from '@src/vendors/angular/utils/webhook-helper.generator.js';
import { WebhookGenerator } from '@src/functions/emit_webhook.js';
import { createTestProject } from '../shared/helpers.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import ts from 'typescript';

describe('Emitter: WebhookHelperGenerator', () => {
    // type-coverage:ignore-next-line
    const createParser = (spec: any) => new SwaggerParser(spec, { options: {} } as any);

    it('should skip generation if no webhooks are defined', () => {
        const project = createTestProject();
        const spec = { openapi: '3.1.0', info: { title: 'No Webhooks', version: '1.0' }, paths: {} };
        const parser = createParser(spec);

        new WebhookHelperGenerator(parser, project).generate('/out');
        const sourceFile = project.getSourceFile('/out/utils/webhook.service.ts');
        expect(sourceFile).toBeUndefined();
    });

    it('should generate service if webhooks exist', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Webhooks', version: '1.0' },
            paths: {},
            webhooks: {
                'user.created': {
                    post: { responses: { '200': { description: 'ok' } } },
                },
            },
        };
        const parser = createParser(spec);

        new WebhookHelperGenerator(parser, project).generate('/out');
        const sourceFile = project.getSourceFileOrThrow('/out/utils/webhook.service.ts');
        const text = sourceFile.getText();
        expect(text).toContain('export class WebhookService');
        expect(text).toContain('findEntry(name: string, method?: string)');
    });

    it('should provide runtime matching logic', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Runtime Test', version: '1.0' },
            paths: {},
            webhooks: {
                'order.shipped': { post: { responses: { '200': { description: 'ok' } } } },
                'order.cancelled': { put: { responses: { '200': { description: 'ok' } } } },
            },
        };
        const parser = createParser(spec);

        // Need both generators: Shared definition + Helper service
        new WebhookGenerator(parser, project).generate('/out');
        new WebhookHelperGenerator(parser, project).generate('/out');

        const serviceFile = project.getSourceFileOrThrow('/out/utils/webhook.service.ts');
        const definitionsFile = project.getSourceFileOrThrow('/out/webhooks.ts');

        // Prepare for compilation
        // Strip imports in utility because we will inject the dependency manually
        const serviceCode = serviceFile.getText().replace(/import.*;/g, '');
        const definitionsCode = definitionsFile.getText().replace('export const', 'const');

        const jsService = ts.transpile(serviceCode, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
        const jsDefs = ts.transpile(definitionsCode, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
        });

        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;

        const wrappedCode = `
            ${jsDefs} 
            // API_WEBHOOKS is now in local scope
            ${jsService} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

        // type-coverage:ignore-next-line
        const ServiceClass = moduleScope.exports.WebhookService;
        // type-coverage:ignore-next-line
        const service = new ServiceClass();

        // Test Find Logic
        // type-coverage:ignore-next-line
        const shipped = service.findEntry('order.shipped');
        // type-coverage:ignore-next-line
        expect(shipped).toBeDefined();
        // type-coverage:ignore-next-line
        expect(shipped.method).toBe('POST');

        // type-coverage:ignore-next-line
        const cancelled = service.findEntry('order.cancelled', 'PUT');
        // type-coverage:ignore-next-line
        expect(cancelled).toBeDefined();
        // type-coverage:ignore-next-line
        expect(cancelled.method).toBe('PUT');

        // Test Type Guard Logic
        // type-coverage:ignore-next-line
        const isShipped = service.isWebhookEvent('order.shipped', {}, 'POST');
        // type-coverage:ignore-next-line
        expect(isShipped).toBe(true);

        // type-coverage:ignore-next-line
        const isFake = service.isWebhookEvent('order.fake', {}, 'POST');
        // type-coverage:ignore-next-line
        expect(isFake).toBe(false);
    });

    it('should use raw spec webhooks if parser.webhooks is empty', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.1.0',
            info: { title: 'Fallback', version: '1.0' },
            paths: {},
            webhooks: {
                'fallback.event': { post: { responses: { '200': { description: 'ok' } } } },
            },
        };
        const parser = createParser(spec);
        // Force parser.webhooks empty to exercise fallback branch
        // type-coverage:ignore-next-line
        (parser as any).webhooks = [];

        new WebhookHelperGenerator(parser, project).generate('/out');
        const sourceFile = project.getSourceFile('/out/utils/webhook.service.ts');
        expect(sourceFile).toBeDefined();
    });
});
