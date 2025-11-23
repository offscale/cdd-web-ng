import { describe, expect, it } from 'vitest';
import { LinkServiceGenerator } from '@src/service/emit/utility/link-service.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { SwaggerParser } from '@src/core/parser.js';
import ts from 'typescript';

describe('Emitter: LinkServiceGenerator', () => {
    const createParser = (spec: any) => new SwaggerParser(spec, { options: {} } as any);

    it('should skip generation if no links defined in spec', () => {
        const project = createTestProject();
        const spec = { openapi: '3.0.0', info: {title:'T', version:'1'}, paths: {} };
        const parser = createParser(spec);

        new LinkServiceGenerator(parser, project).generate('/out');
        const sourceFile = project.getSourceFile('/out/utils/link.service.ts');
        expect(sourceFile).toBeUndefined();
    });

    it('should generate a service that resolves values from response body', () => {
        const project = createTestProject();

        const specWithLinks = {
            openapi: '3.0.0',
            info: {title:'Links', version:'1'},
            paths: {
                '/test': {
                    get: {
                        responses: {
                            '200': {
                                description: 'ok',
                                links: { 'next': { operationId: 'nextOp' } }
                            }
                        }
                    }
                }
            }
        };
        const parser = createParser(specWithLinks);

        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');

        // Strip imports so we can evaluate in the test context
        const code = sourceFile.getText().replace(/import.*;/g, '');

        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
            emitDecoratorMetadata: true
        });

        // Mock Dependencies
        const API_LINKS = {
            'op1': {
                '200': {
                    'nextPage': {
                        operationId: 'op2',
                        parameters: { id: '$response.body#/nextId' }
                    }
                }
            }
        };

        const responseMock = {
            status: 200,
            url: 'http://test.com',
            body: { nextId: 123 },
            headers: {
                keys: () => [],
                get: () => null
            }
        };

        const moduleScope = { exports: {} as any };

        // Returns a decorator function that does nothing, satisfying usage like @Injectable()
        const mockInjectable = () => (target: any) => target;

        // Inject mock API_LINKS into global scope of evaluation
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

        const ServiceClass = moduleScope.exports.LinkService;
        const service = new ServiceClass();

        const result = service.resolveLink('op1', responseMock, 'nextPage');

        expect(result).toBeDefined();
        expect(result.targetOperationId).toBe('op2');
        expect(result.parameters['id']).toBe(123);
    });

    it('should resolve values from response headers', () => {
        const project = createTestProject();

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Header Test', version: '1.0' },
            components: { links: { Test: {} } },
            paths:{}
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true
        });

        const API_LINKS = {
            'opHeading': {
                '201': {
                    'detail': {
                        operationId: 'getDetail',
                        parameters: {
                            uuid: '$response.header.x-resource-id',
                            static: 'constant'
                        }
                    }
                }
            }
        };

        const headerMap = new Map([['x-resource-id', 'abc-123']]);
        const responseMock = {
            status: 201,
            headers: headerMap,
            body: {}
        };

        const moduleScope = { exports: {} as any };
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        const service = new moduleScope.exports.LinkService();

        const result = service.resolveLink('opHeading', responseMock, 'detail');

        expect(result).toBeDefined();
        expect(result.parameters.uuid).toBe('abc-123');
        expect(result.parameters.static).toBe('constant');
    });

    it('should resolve values from REQUEST context', () => {
        const project = createTestProject();
        const spec = { openapi: '3.0.0', info: {title:'T', version:'1'}, paths: {}, components: { links: { L: {} } } };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true
        });

        const API_LINKS = {
            'createItem': {
                '201': {
                    'getRelated': {
                        operationId: 'search',
                        parameters: {
                            // request expressions
                            u: '$url',
                            m: '$method',
                            q: '$request.query.filter',
                            h: '$request.header.x-req-id',
                            b: '$request.body#/data/nested'
                        }
                    }
                }
            }
        };

        // Mock HttpRequest
        const requestMock = {
            url: 'https://api.com/items?filter=active',
            method: 'POST',
            body: { data: { nested: 'foo' } },
            headers: new Map([['x-req-id', 'req-99']]),
            params: new Map([['filter', 'active']])
        };

        const responseMock = { status: 201, headers: {}, body: {} };

        const moduleScope = { exports: {} as any };
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        const service = new moduleScope.exports.LinkService();

        // Call with request arg
        const result = service.resolveLink('createItem', responseMock, 'getRelated', requestMock);

        expect(result).toBeDefined();
        expect(result.parameters.u).toBe('https://api.com/items?filter=active');
        expect(result.parameters.m).toBe('POST');
        expect(result.parameters.q).toBe('active');
        expect(result.parameters.h).toBe('req-99');
        expect(result.parameters.b).toBe('foo');
    });

    it('should resolve targetServer with variable substitution', () => {
        const project = createTestProject();
        const spec = { openapi: '3.0.0', info: {title:'T', version:'1'}, paths: {}, components: { links: { L: {} } } };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true
        });

        const API_LINKS = {
            'op1': {
                '200': {
                    'crossServer': {
                        operationId: 'op2',
                        server: {
                            url: 'https://{region}.api.com/v1',
                            variables: { region: { default: 'eu-west' } }
                        }
                    }
                }
            }
        };

        const responseMock = { status: 200, headers: {}, body: {} };
        const moduleScope = { exports: {} as any };
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        const service = new moduleScope.exports.LinkService();

        const result = service.resolveLink('op1', responseMock, 'crossServer');

        expect(result).toBeDefined();
        expect(result.targetServer).toBe('https://eu-west.api.com/v1');
    });
});
