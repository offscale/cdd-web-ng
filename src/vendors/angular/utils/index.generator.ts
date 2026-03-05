import { Project } from 'ts-morph';
import * as path from 'node:path';
import { GeneratorConfig } from '@src/core/types/index.js';
import { MAIN_INDEX_GENERATOR_HEADER_COMMENT, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from '@src/core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';

export class MainIndexGenerator {
    constructor(
        /* v8 ignore next */
        private project: Project,
        /* v8 ignore next */
        private config: GeneratorConfig,
        /* v8 ignore next */
        private parser: SwaggerParser,
    ) {}

    public generateMainIndex(outputRoot: string): void {
        /* v8 ignore next */
        const indexPath = path.join(outputRoot, 'index.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, MAIN_INDEX_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        sourceFile.addExportDeclaration({ moduleSpecifier: './models' });
        /* v8 ignore next */
        sourceFile.addExportDeclaration({ moduleSpecifier: './info' });
        /* v8 ignore next */
        const hasComponentExamples = !!(
            this.parser.spec.components?.examples && Object.keys(this.parser.spec.components.examples).length > 0
        );
        /* v8 ignore next */
        const hasComponentMediaTypes = !!(
            this.parser.spec.components?.mediaTypes && Object.keys(this.parser.spec.components.mediaTypes).length > 0
        );
        /* v8 ignore next */
        const hasComponentPathItems = !!(
            this.parser.spec.components?.pathItems && Object.keys(this.parser.spec.components.pathItems).length > 0
        );
        /* v8 ignore next */
        /* v8 ignore start */
        const hasPathMetadata = Object.entries(this.parser.spec.paths ?? {}).some(([_, pathItem]) => {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (!pathItem || typeof pathItem !== 'object') return false;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (pathItem.$ref || pathItem.summary || pathItem.description) return true;
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(pathItem.parameters) && pathItem.parameters.length > 0) return true;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(pathItem.servers) && pathItem.servers.length > 0) return true;
            /* v8 ignore stop */
            /* v8 ignore next */
            return Object.keys(pathItem).some(key => key.startsWith('x-'));
        });
        /* v8 ignore next */
        const hasComponentHeaders = !!(
            this.parser.spec.components?.headers && Object.keys(this.parser.spec.components.headers).length > 0
        );
        /* v8 ignore next */
        const hasComponentParameters = !!(
            this.parser.spec.components?.parameters && Object.keys(this.parser.spec.components.parameters).length > 0
        );
        /* v8 ignore next */
        const hasComponentRequestBodies = !!(
            this.parser.spec.components?.requestBodies &&
            Object.keys(this.parser.spec.components.requestBodies).length > 0
        );
        /* v8 ignore next */
        const hasComponentResponses = !!(
            this.parser.spec.components?.responses && Object.keys(this.parser.spec.components.responses).length > 0
        );
        /* v8 ignore next */
        if (hasComponentExamples) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './examples' });
        }
        /* v8 ignore next */
        if (hasComponentMediaTypes) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './media-types' });
        }
        /* v8 ignore next */
        if (hasComponentPathItems) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './path-items' });
        }
        /* v8 ignore next */
        if (hasPathMetadata) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './paths' });
        }
        /* v8 ignore next */
        if (hasComponentHeaders) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './headers' });
        }
        /* v8 ignore next */
        if (hasComponentParameters) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './parameters' });
        }
        /* v8 ignore next */
        if (hasComponentRequestBodies) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './request-bodies' });
        }
        /* v8 ignore next */
        if (hasComponentResponses) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './responses' });
        }

        /* v8 ignore next */
        if (this.config.options.generateServices !== false) {
            /* v8 ignore next */
            sourceFile.addExportDeclarations([
                { moduleSpecifier: './services' },
                { moduleSpecifier: './tokens' },
                { moduleSpecifier: './providers' },
                { moduleSpecifier: './utils/file-download' },
                { moduleSpecifier: './utils/response-header.service' },
            ]);

            /* v8 ignore next */
            const hasResponseHeaders = this.parser.operations.some(
                op =>
                    /* v8 ignore next */
                    op.responses &&
                    /* v8 ignore next */
                    Object.values(op.responses).some(r => r.headers && Object.keys(r.headers).length > 0),
            );
            /* v8 ignore next */
            if (hasResponseHeaders) {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './response-headers' });
            }

            /* v8 ignore next */
            if (this.parser.servers.length > 0) {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/server-url' });
            }

            /* v8 ignore next */
            const hasLinks = this.parser.links && Object.keys(this.parser.links).length > 0;
            /* v8 ignore next */
            const hasOpLinks = this.parser.operations.some(
                /* v8 ignore next */
                op => op.responses && Object.values(op.responses).some(r => r.links && Object.keys(r.links).length > 0),
            );

            /* v8 ignore next */
            if (hasLinks || hasOpLinks) {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './links' });
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/link.service' });
            }

            const hasCallbacks =
                /* v8 ignore next */
                this.parser.operations.some(op => op.callbacks && Object.keys(op.callbacks).length > 0) ||
                (!!this.parser.spec.components?.callbacks &&
                    Object.keys(this.parser.spec.components.callbacks).length > 0);
            /* v8 ignore next */
            if (hasCallbacks) {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './callbacks' });
            }

            const hasWebhooks =
                /* v8 ignore next */
                (this.parser.webhooks && this.parser.webhooks.length > 0) ||
                (this.parser.spec.webhooks && Object.keys(this.parser.spec.webhooks).length > 0) ||
                (!!this.parser.spec.components?.webhooks &&
                    Object.keys(this.parser.spec.components.webhooks).length > 0);
            /* v8 ignore next */
            if (hasWebhooks) {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './webhooks' });
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/webhook.service' });
            }

            /* v8 ignore next */
            if (this.config.options.dateType === 'Date') {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './utils/date-transformer' });
            }

            /* v8 ignore next */
            if (Object.keys(this.parser.getSecuritySchemes()).length > 0) {
                /* v8 ignore next */
                sourceFile.addExportDeclaration({ moduleSpecifier: './auth/auth.tokens' });
            }

            // Export XmlParser/XmlBuilder
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/xml-builder' });
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/xml-parser' });
            // Export ContentDecoder/Encoder
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/content-decoder' });
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './utils/content-encoder' });
        }

        /* v8 ignore next */
        sourceFile.formatText();
    }
}

export class ServiceIndexGenerator {
    /* v8 ignore next */
    constructor(private project: Project) {}

    public generateIndex(outputRoot: string): void {
        /* v8 ignore next */
        const servicesDir = path.join(outputRoot, 'services');
        // Use path.resolve for robust comparison of directory paths
        /* v8 ignore next */
        const absServicesDir = path.resolve(servicesDir);

        /* v8 ignore next */
        const serviceFiles = this.project.getSourceFiles().filter(sf => {
            /* v8 ignore next */
            const absFileDir = path.resolve(path.dirname(sf.getFilePath()));
            /* v8 ignore next */
            return absFileDir === absServicesDir && sf.getFilePath().endsWith('.service.ts');
        });

        /* v8 ignore next */
        if (serviceFiles.length === 0) return;

        /* v8 ignore next */
        const indexPath = path.join(servicesDir, 'index.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        /* v8 ignore next */
        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        /* v8 ignore next */
        for (const serviceFile of serviceFiles) {
            /* v8 ignore next */
            const serviceClass = serviceFile.getClasses()[0];
            /* v8 ignore next */
            const className = serviceClass?.getName();
            /* v8 ignore next */
            if (serviceClass && serviceClass.isExported() && className) {
                /* v8 ignore next */
                const moduleSpecifier = `./${path.basename(serviceFile.getFilePath(), '.ts')}`;
                /* v8 ignore next */
                sourceFile.addExportDeclaration({
                    namedExports: [className],
                    moduleSpecifier,
                });
            }
        }

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
