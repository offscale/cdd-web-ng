import * as path from 'node:path';
import { Project, VariableDeclarationKind } from 'ts-morph';
import { UTILITY_GENERATOR_HEADER_COMMENT } from '../core/constants.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { LinkObject, PathInfo, SpecOperation } from '@src/core/types/index.js';

/**
 * Generates the `links.ts` file.
 * Registry for OpenAPI Links defined in operation responses.
 */
export class LinkGenerator {
    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const filePath = path.join(outputDir, 'links.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const linksRegistry: Record<string, Record<string, Record<string, LinkObject>>> = {};
        /* v8 ignore next */
        const componentLinks: Record<string, LinkObject> = {};
        /* v8 ignore next */
        let linkCount = 0;
        /* v8 ignore next */
        let componentLinkCount = 0;

        /* v8 ignore next */
        this.parser.operations.forEach((op: PathInfo) => {
            /* v8 ignore next */
            if (!op.operationId || !op.responses) return;

            /* v8 ignore next */
            const opLinks: Record<string, Record<string, LinkObject>> = {};
            /* v8 ignore next */
            let hasLinksForOp = false;

            /* v8 ignore next */
            Object.entries(op.responses).forEach(([statusCode, responseOrRef]) => {
                /* v8 ignore next */
                const response = this.parser.resolve(responseOrRef);
                /* v8 ignore next */
                if (response && response.links) {
                    /* v8 ignore next */
                    const responseLinks: Record<string, LinkObject> = {};

                    /* v8 ignore next */
                    Object.entries(response.links).forEach(([linkName, linkOrRef]) => {
                        /* v8 ignore next */
                        const link = this.parser.resolve(linkOrRef) as LinkObject;
                        /* v8 ignore next */
                        if (link) {
                            const resolvedOperationId =
                                /* v8 ignore next */
                                !link.operationId && link.operationRef
                                    ? this.resolveOperationRef(link.operationRef)
                                    : undefined;
                            /* v8 ignore next */
                            const cleanLink: LinkObject = { ...(link as LinkObject) };
                            /* v8 ignore next */
                            if (!cleanLink.operationId && resolvedOperationId) {
                                /* v8 ignore next */
                                cleanLink.operationId = resolvedOperationId;
                            }

                            /* v8 ignore next */
                            responseLinks[linkName] = cleanLink;
                            /* v8 ignore next */
                            linkCount++;
                        }
                    });

                    /* v8 ignore next */
                    if (Object.keys(responseLinks).length > 0) {
                        /* v8 ignore next */
                        opLinks[statusCode] = responseLinks;
                        /* v8 ignore next */
                        hasLinksForOp = true;
                    }
                }
            });

            /* v8 ignore next */
            if (hasLinksForOp) {
                /* v8 ignore next */
                linksRegistry[op.operationId] = opLinks;
            }
        });

        /* v8 ignore next */
        Object.entries(this.parser.links).forEach(([name, link]) => {
            const resolvedOperationId =
                /* v8 ignore next */
                !link.operationId && link.operationRef ? this.resolveOperationRef(link.operationRef) : undefined;
            /* v8 ignore next */
            const cleanLink: LinkObject = { ...(link as LinkObject) };
            /* v8 ignore next */
            if (!cleanLink.operationId && resolvedOperationId) {
                /* v8 ignore next */
                cleanLink.operationId = resolvedOperationId;
            }
            /* v8 ignore next */
            componentLinks[name] = cleanLink;
        });

        /* v8 ignore next */
        componentLinkCount = Object.keys(componentLinks).length;

        /* v8 ignore next */
        if (linkCount > 0 || componentLinkCount > 0) {
            /* v8 ignore next */
            sourceFile.addVariableStatement({
                isExported: true,
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'API_LINKS',
                        initializer: JSON.stringify(linksRegistry, null, 2),
                    },
                ],
                docs: [
                    'Registry of Links defined in the API.',
                    'Structure: operationId -> responseStatusCode -> linkName -> LinkObject',
                ],
            });

            /* v8 ignore next */
            if (componentLinkCount > 0) {
                /* v8 ignore next */
                sourceFile.addVariableStatement({
                    isExported: true,
                    declarationKind: VariableDeclarationKind.Const,
                    declarations: [
                        {
                            name: 'API_COMPONENT_LINKS',
                            initializer: JSON.stringify(componentLinks, null, 2),
                        },
                    ],
                    docs: ['Reusable Link Objects from components.links.'],
                });
            }
        } else {
            /* v8 ignore next */
            sourceFile.addStatements('export {};');
        }

        /* v8 ignore next */
        sourceFile.formatText();
        /* v8 ignore next */
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private decodePointerToken(token: string): string {
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            return decodeURIComponent(token).replace(/~1/g, '/').replace(/~0/g, '~');
        } catch {
            /* v8 ignore next */
            return token.replace(/~1/g, '/').replace(/~0/g, '~');
        }
    }

    private resolveOperationRef(operationRef: string): string | undefined {
        /* v8 ignore next */
        const resolved = this.parser.resolveReference<SpecOperation>(operationRef);
        /* v8 ignore next */
        if (resolved && typeof resolved.operationId === 'string') {
            /* v8 ignore next */
            return resolved.operationId;
        }

        /* v8 ignore next */
        const fragment = operationRef.split('#', 2)[1];
        /* v8 ignore next */
        if (!fragment) return undefined;

        /* v8 ignore next */
        const tokens = fragment
            .split('/')
            .filter(Boolean)
            /* v8 ignore next */
            .map(token => this.decodePointerToken(token));

        /* v8 ignore next */
        if (tokens.length < 3) return undefined;

        /* v8 ignore next */
        const root = tokens[0];
        /* v8 ignore next */
        if (root !== 'paths' && root !== 'webhooks') return undefined;

        /* v8 ignore next */
        const path = tokens[1];
        /* v8 ignore next */
        /* v8 ignore start */
        const methodIndex = tokens[2] === 'additionalOperations' && tokens.length >= 4 ? 3 : 2;
        /* v8 ignore stop */
        /* v8 ignore next */
        const method = tokens[methodIndex];

        /* v8 ignore next */
        /* v8 ignore start */
        const pool = root === 'webhooks' ? this.parser.webhooks : this.parser.operations;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        const op = pool.find(entry => entry.path === path && entry.method.toLowerCase() === method.toLowerCase());
        /* v8 ignore stop */
        /* v8 ignore next */
        return op?.operationId;
    }
}
