import { Project } from 'ts-morph';
import * as path from 'node:path';
import { GeneratorConfig } from '@src/core/types/index.js';
import { MAIN_INDEX_GENERATOR_HEADER_COMMENT, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { SwaggerParser } from '@src/core/parser.js';

export class MainIndexGenerator {
    constructor(
        private project: Project,
        private config: GeneratorConfig,
        private parser: SwaggerParser,
    ) {}

    public generateMainIndex(outputRoot: string): void {
        const indexPath = path.join(outputRoot, 'index.ts');
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        sourceFile.insertText(0, MAIN_INDEX_GENERATOR_HEADER_COMMENT);

        sourceFile.addExportDeclaration({ moduleSpecifier: './models' });
        sourceFile.addExportDeclaration({ moduleSpecifier: './info' });
        const hasComponentExamples = !!(
            this.parser.spec.components?.examples && Object.keys(this.parser.spec.components.examples).length > 0
        );
        const hasComponentMediaTypes = !!(
            this.parser.spec.components?.mediaTypes && Object.keys(this.parser.spec.components.mediaTypes).length > 0
        );
        const hasComponentPathItems = !!(
            this.parser.spec.components?.pathItems && Object.keys(this.parser.spec.components.pathItems).length > 0
        );
        const hasPathMetadata = Object.entries(this.parser.spec.paths ?? {}).some(([_, pathItem]) => {
            if (!pathItem || typeof pathItem !== 'object') return false;
            if (pathItem.$ref || pathItem.summary || pathItem.description) return true;
            if (Array.isArray(pathItem.parameters) && pathItem.parameters.length > 0) return true;
            if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) return true;
            return Object.keys(pathItem).some(key => key.startsWith('x-'));
        });
        const hasComponentHeaders = !!(
            this.parser.spec.components?.headers && Object.keys(this.parser.spec.components.headers).length > 0
        );
        const hasComponentParameters = !!(
            this.parser.spec.components?.parameters && Object.keys(this.parser.spec.components.parameters).length > 0
        );
        const hasComponentRequestBodies = !!(
            this.parser.spec.components?.requestBodies &&
            Object.keys(this.parser.spec.components.requestBodies).length > 0
        );
        const hasComponentResponses = !!(
            this.parser.spec.components?.responses && Object.keys(this.parser.spec.components.responses).length > 0
        );
        if (hasComponentExamples) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './examples' });
        }
        if (hasComponentMediaTypes) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './media-types' });
        }
        if (hasComponentPathItems) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './path-items' });
        }
        if (hasPathMetadata) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './paths' });
        }
        if (hasComponentHeaders) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './headers' });
        }
        if (hasComponentParameters) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './parameters' });
        }
        if (hasComponentRequestBodies) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './request-bodies' });
        }
        if (hasComponentResponses) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './responses' });
        }

        if (this.config.options.generateServices !== false) {
            sourceFile.addExportDeclarations([
                { moduleSpecifier: './services' },
                { moduleSpecifier: './tokens' },
                { moduleSpecifier: './providers' },
                { moduleSpecifier: './utils/file-download' },
                { moduleSpecifier: './utils/response-header.service' },
            ]);

            const hasResponseHeaders = this.parser.operations.some(
                op =>
                    op.responses &&
                    Object.values(op.responses).some(r => r.headers && Object.keys(r.headers).length > 0),
            );
            if (hasResponseHeaders) {
                sourceFile.addExportDeclaration({ moduleSpecifier: './response-headers' });
            }

            if (this.parser.servers.length > 0) {
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/server-url' });
            }

            const hasLinks = this.parser.links && Object.keys(this.parser.links).length > 0;
            const hasOpLinks = this.parser.operations.some(
                op => op.responses && Object.values(op.responses).some(r => r.links && Object.keys(r.links).length > 0),
            );

            if (hasLinks || hasOpLinks) {
                sourceFile.addExportDeclaration({ moduleSpecifier: './links' });
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/link.service' });
            }

            const hasCallbacks =
                this.parser.operations.some(op => op.callbacks && Object.keys(op.callbacks).length > 0) ||
                (!!this.parser.spec.components?.callbacks &&
                    Object.keys(this.parser.spec.components.callbacks).length > 0);
            if (hasCallbacks) {
                sourceFile.addExportDeclaration({ moduleSpecifier: './callbacks' });
            }

            const hasWebhooks =
                (this.parser.webhooks && this.parser.webhooks.length > 0) ||
                (this.parser.spec.webhooks && Object.keys(this.parser.spec.webhooks).length > 0) ||
                (!!this.parser.spec.components?.webhooks &&
                    Object.keys(this.parser.spec.components.webhooks).length > 0);
            if (hasWebhooks) {
                sourceFile.addExportDeclaration({ moduleSpecifier: './webhooks' });
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/webhook.service' });
            }

            if (this.config.options.dateType === 'Date') {
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/date-transformer' });
            }

            if (Object.keys(this.parser.getSecuritySchemes()).length > 0) {
                sourceFile.addExportDeclaration({ moduleSpecifier: './auth/auth.tokens' });
            }

            // Export XmlParser/XmlBuilder
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/xml-builder' });
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/xml-parser' });
            // Export ContentDecoder/Encoder
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/content-decoder' });
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/content-encoder' });
        }

        sourceFile.formatText();
    }
}

export class ServiceIndexGenerator {
    constructor(private project: Project) {}

    public generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, 'services');
        // Use path.resolve for robust comparison of directory paths
        const absServicesDir = path.resolve(servicesDir);

        const serviceFiles = this.project.getSourceFiles().filter(sf => {
            const absFileDir = path.resolve(path.dirname(sf.getFilePath()));
            return absFileDir === absServicesDir && sf.getFilePath().endsWith('.service.ts');
        });

        if (serviceFiles.length === 0) return;

        const indexPath = path.join(servicesDir, 'index.ts');
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        for (const serviceFile of serviceFiles) {
            const serviceClass = serviceFile.getClasses()[0];
            const className = serviceClass?.getName();
            if (serviceClass && serviceClass.isExported() && className) {
                const moduleSpecifier = `./${path.basename(serviceFile.getFilePath(), '.ts')}`;
                sourceFile.addExportDeclaration({
                    namedExports: [className],
                    moduleSpecifier,
                });
            }
        }

        sourceFile.formatText();
    }
}
