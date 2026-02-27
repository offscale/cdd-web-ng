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
        private readonly parser: SwaggerParser,
        private readonly project: Project,
    ) {}

    public generate(outputDir: string): void {
        const filePath = path.join(outputDir, 'links.ts');
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        const linksRegistry: Record<string, Record<string, Record<string, LinkObject>>> = {};
        const componentLinks: Record<string, LinkObject> = {};
        let linkCount = 0;
        let componentLinkCount = 0;

        this.parser.operations.forEach((op: PathInfo) => {
            if (!op.operationId || !op.responses) return;

            const opLinks: Record<string, Record<string, LinkObject>> = {};
            let hasLinksForOp = false;

            Object.entries(op.responses).forEach(([statusCode, responseOrRef]) => {
                const response = this.parser.resolve(responseOrRef);
                if (response && response.links) {
                    const responseLinks: Record<string, LinkObject> = {};

                    Object.entries(response.links).forEach(([linkName, linkOrRef]) => {
                        const link = this.parser.resolve(linkOrRef) as LinkObject;
                        if (link) {
                            const resolvedOperationId =
                                !link.operationId && link.operationRef
                                    ? this.resolveOperationRef(link.operationRef)
                                    : undefined;
                            const cleanLink: LinkObject = { ...(link as LinkObject) };
                            if (!cleanLink.operationId && resolvedOperationId) {
                                cleanLink.operationId = resolvedOperationId;
                            }

                            responseLinks[linkName] = cleanLink;
                            linkCount++;
                        }
                    });

                    if (Object.keys(responseLinks).length > 0) {
                        opLinks[statusCode] = responseLinks;
                        hasLinksForOp = true;
                    }
                }
            });

            if (hasLinksForOp) {
                linksRegistry[op.operationId] = opLinks;
            }
        });

        Object.entries(this.parser.links).forEach(([name, link]) => {
            const resolvedOperationId =
                !link.operationId && link.operationRef ? this.resolveOperationRef(link.operationRef) : undefined;
            const cleanLink: LinkObject = { ...(link as LinkObject) };
            if (!cleanLink.operationId && resolvedOperationId) {
                cleanLink.operationId = resolvedOperationId;
            }
            componentLinks[name] = cleanLink;
        });

        componentLinkCount = Object.keys(componentLinks).length;

        if (linkCount > 0 || componentLinkCount > 0) {
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

            if (componentLinkCount > 0) {
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
            sourceFile.addStatements('export {};');
        }

        sourceFile.formatText();
        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);
    }

    private decodePointerToken(token: string): string {
        try {
            return decodeURIComponent(token).replace(/~1/g, '/').replace(/~0/g, '~');
        } catch {
            return token.replace(/~1/g, '/').replace(/~0/g, '~');
        }
    }

    private resolveOperationRef(operationRef: string): string | undefined {
        const resolved = this.parser.resolveReference<SpecOperation>(operationRef);
        if (resolved && typeof resolved.operationId === 'string') {
            return resolved.operationId;
        }

        const fragment = operationRef.split('#', 2)[1];
        if (!fragment) return undefined;

        const tokens = fragment
            .split('/')
            .filter(Boolean)
            .map(token => this.decodePointerToken(token));

        if (tokens.length < 3) return undefined;

        const root = tokens[0];
        if (root !== 'paths' && root !== 'webhooks') return undefined;

        const path = tokens[1];
        const methodIndex = tokens[2] === 'additionalOperations' && tokens.length >= 4 ? 3 : 2;
        const method = tokens[methodIndex];

        const pool = root === 'webhooks' ? this.parser.webhooks : this.parser.operations;
        const op = pool.find(entry => entry.path === path && entry.method.toLowerCase() === method.toLowerCase());
        return op?.operationId;
    }
}
