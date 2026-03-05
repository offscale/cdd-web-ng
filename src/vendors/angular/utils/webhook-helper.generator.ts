import * as path from 'node:path';
import { Project, Scope } from 'ts-morph';
import { SwaggerParser } from '@src/openapi/parse.js';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';

export class WebhookHelperGenerator {
    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    public generate(outputDir: string): void {
        // Robust check: parser.webhooks is populated via extractPaths in parser.ts
        // We also check spec.webhooks raw object just in case parser logic changes
        const hasWebhooks =
            /* v8 ignore next */
            (this.parser.webhooks && this.parser.webhooks.length > 0) ||
            (this.parser.spec.webhooks && Object.keys(this.parser.spec.webhooks).length > 0);

        /* v8 ignore next */
        if (!hasWebhooks) {
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const utilsDir = path.join(outputDir, 'utils');
        /* v8 ignore next */
        const filePath = path.join(utilsDir, 'webhook.service.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core', namedImports: ['Injectable'] },
            { moduleSpecifier: '../webhooks', namedImports: ['API_WEBHOOKS'] },
        ]);

        /* v8 ignore next */
        const serviceClass = sourceFile.addClass({
            name: 'WebhookService',
            isExported: true,
            decorators: [{ name: 'Injectable', arguments: ["{ providedIn: 'root' }"] }],
            docs: ['Service to assist in identifying and matching incoming Webhook payloads to their definitions.'],
        });

        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'findEntry',
            scope: Scope.Public,
            parameters: [
                { name: 'name', type: 'string' },
                { name: 'method', type: 'string', hasQuestionToken: true },
            ],
            returnType: 'typeof API_WEBHOOKS[number] | undefined',
            docs: [
                'Finds a webhook definition metadata by name and optional method.',
                '@param name The webhook name (key) defined in the OpenAPI spec.',
                '@param method The HTTP method used (e.g., POST). Defaults to POST if omitted when matching.',
            ],
            statements: `
        // Search case-insensitively for robustness
        const searchName = name; 
        const searchMethod = (method || 'POST').toUpperCase(); 
        return API_WEBHOOKS.find(w => w.name === searchName && w.method.toUpperCase() === searchMethod);`,
        });

        /* v8 ignore next */
        serviceClass.addMethod({
            name: 'isWebhookEvent',
            scope: Scope.Public,
            typeParameters: [{ name: 'T', default: 'unknown' }],
            parameters: [
                { name: 'eventName', type: 'string' },
                { name: 'payload', type: 'Record<string, never>' },
                { name: 'method', type: 'string', initializer: "'POST'" },
            ],
            returnType: 'payload is T',
            docs: [
                'Type guard helper to match an event name context to a specific webhook payload type.',
                'Use this when consuming raw webhook events (e.g. from a WebSocket or Push Notification) to narrow the type.',
                '@param eventName The specific webhook name to match.',
                '@param payload The data payload received.',
                '@param method The HTTP method context (default: POST).',
            ],
            statements: `
        return !!this.findEntry(eventName, method);`,
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
