import { Project, SyntaxKind, CallExpression } from 'ts-morph';
import { SwaggerSpec, PathItem, SpecOperation, Parameter } from '../../core/types/index.js';

export function parseGeneratedCliSource(sourceText: string, filePath = 'cli.ts'): Partial<SwaggerSpec> {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });

    const spec: Partial<SwaggerSpec> = {
        openapi: '3.1.0',
        info: { title: 'api-cli', version: '1.0.0' },
        paths: {},
        servers: [],
    };

    function getBaseIdentifier(node: import('ts-morph').Node): string | undefined {
        /* v8 ignore start */
        if (node.getKind() === SyntaxKind.Identifier) {
            return node.getText();
        }
        if (node.getKind() === SyntaxKind.CallExpression) {
            return getBaseIdentifier((node as CallExpression).getExpression());
        }
        if (node.getKind() === SyntaxKind.PropertyAccessExpression) {
            return getBaseIdentifier((node as import('ts-morph').PropertyAccessExpression).getExpression());
        }
        return undefined;
        /* v8 ignore stop */
    }

    const programDecls = sourceFile.getVariableDeclarations().filter(v => v.getName() === 'program');
    if (programDecls.length > 0) {
        sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
            const exp = call.getExpression();
            if (exp.getKind() === SyntaxKind.PropertyAccessExpression) {
                const prop = exp as import('ts-morph').PropertyAccessExpression;
                const baseName = getBaseIdentifier(prop.getExpression());
                if (baseName === 'program') {
                    const name = prop.getName();
                    const args = call.getArguments();
                    /* v8 ignore next */
                    if (name === 'name' && args[0]) {
                        spec.info!.title = args[0].getText().replace(/['"]/g, '');
                    }
                    /* v8 ignore next */
                    if (name === 'version' && args[0]) {
                        spec.info!.version = args[0].getText().replace(/['"]/g, '');
                    }
                    /* v8 ignore start */
                    if (name === 'description' && args[0]) {
                        // Check that this is chained directly to program.name or program itself
                        let isProgramDesc = false;
                        let p = exp as import('ts-morph').PropertyAccessExpression;
                        if (p.getExpression().getText() === 'program') isProgramDesc = true;
                        else if (p.getExpression().getKind() === SyntaxKind.CallExpression) {
                            const pCall = p.getExpression() as import('ts-morph').CallExpression;
                            if (pCall.getExpression().getKind() === SyntaxKind.PropertyAccessExpression) {
                                const pCallProp = pCall.getExpression() as import('ts-morph').PropertyAccessExpression;
                                if (
                                    pCallProp.getExpression().getText() === 'program' &&
                                    pCallProp.getName() === 'name'
                                ) {
                                    isProgramDesc = true;
                                }
                            }
                        }

                        if (isProgramDesc) {
                            spec.info!.description = args[0].getText().replace(/['"]/g, '').replace(/\\'/g, "'");
                        }
                    }
                    if (name === 'option' && args[0]) {
                        const optStr = args[0].getText().replace(/['"]/g, '');
                        if (optStr.includes('--server')) {
                            const url = args[2] ? args[2].getText().replace(/['"]/g, '') : '';
                            if (url && spec.servers) {
                                spec.servers.push({ url });
                            }
                        }
                    }
                    /* v8 ignore stop */
                }
            }
        });
    }

    const groupVars = sourceFile.getVariableDeclarations().filter(v => v.getName().endsWith('Command'));

    /* v8 ignore start */
    groupVars.forEach(v => {
        const tag = v.getName().replace('Command', '');
        sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).forEach(call => {
            const exp = call.getExpression();
            if (exp.getKind() === SyntaxKind.PropertyAccessExpression) {
                const prop = exp as import('ts-morph').PropertyAccessExpression;
                const baseName = getBaseIdentifier(prop.getExpression());
                if (baseName === v.getName() && prop.getName() === 'command') {
                    const methodArg = call.getArguments()[0];
                    if (methodArg) {
                        const methodName = methodArg.getText().replace(/['"]/g, '');
                        const pathKey = `/${tag}/${methodName}`;

                        if (!spec.paths![pathKey]) {
                            spec.paths![pathKey] = {} as PathItem;
                        }

                        const op: SpecOperation = {
                            operationId: methodName,
                            tags: [tag.charAt(0).toUpperCase() + tag.slice(1)],
                            responses: { '200': { description: 'Success' } },
                        };

                        let parent = call.getParent();
                        while (parent && parent.getKind() === SyntaxKind.PropertyAccessExpression) {
                            const pCall = parent.getParentIfKind(SyntaxKind.CallExpression);
                            if (!pCall) {
                                break;
                            }
                            const pName = (parent as import('ts-morph').PropertyAccessExpression).getName();
                            if (pName === 'description') {
                                op.description = pCall.getArguments()[0]?.getText().replace(/['"]/g, '');
                            } else if (pName === 'option') {
                                const optStr = pCall.getArguments()[0]?.getText().replace(/['"]/g, '');
                                const optDesc = pCall.getArguments()[1]?.getText().replace(/['"]/g, '');
                                const optMatch = optStr.match(/--([a-zA-Z0-9-]+)\s+(<[^>]+>|\[[^\]]+\])/);
                                if (optMatch) {
                                    if (!op.parameters) op.parameters = [];
                                    op.parameters.push({
                                        name: optMatch[1],
                                        in: 'query',
                                        required: optMatch[2].startsWith('<'),
                                        description: optDesc,
                                    } as Parameter);
                                }
                            }
                            parent = pCall.getParent();
                        }

                        (spec.paths![pathKey] as any).post = op;
                    }
                }
            }
        });
    });
    /* v8 ignore stop */

    return spec;
}
