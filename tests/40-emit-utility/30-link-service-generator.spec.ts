import { describe, expect, it } from 'vitest';
import { LinkServiceGenerator } from '@src/generators/angular/utils/link-service.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { SwaggerParser } from '@src/core/parser.js';
import ts from 'typescript';

describe('Emitter: LinkServiceGenerator', () => {
    // type-coverage:ignore-next-line
    const createParser = (spec: any) => new SwaggerParser(spec, { options: {} } as any);

    it('should skip generation if no links defined in spec', () => {
        const project = createTestProject();
        const spec = { openapi: '3.0.0', info: { title: 'T', version: '1' }, paths: {} };
        const parser = createParser(spec);

        new LinkServiceGenerator(parser, project).generate('/out');
        const sourceFile = project.getSourceFile('/out/utils/link.service.ts');
        expect(sourceFile).toBeUndefined();
    });

    it('should generate a service that resolves values from response body', () => {
        const project = createTestProject();

        const specWithLinks = {
            openapi: '3.0.0',
            info: { title: 'Links', version: '1' },
            paths: {
                '/test': {
                    get: {
                        responses: {
                            '200': {
                                description: 'ok',
                                links: { next: { operationId: 'nextOp' } },
                            },
                        },
                    },
                },
            },
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
            emitDecoratorMetadata: true,
        });

        // Mock Dependencies
        const API_LINKS = {
            op1: {
                '200': {
                    nextPage: {
                        operationId: 'op2',
                        parameters: { id: '$response.body#/nextId' },
                    },
                },
            },
        };

        const responseMock = {
            status: 200,
            url: 'http://test.com',
            body: { nextId: 123 },
            headers: {
                keys: () => [],
                get: () => null,
            },
        };

        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };

        // Returns a decorator function that does nothing, satisfying usage like @Injectable()
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;

        // Inject mock API_LINKS into global scope of evaluation
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

        // type-coverage:ignore-next-line
        const ServiceClass = moduleScope.exports.LinkService;
        // type-coverage:ignore-next-line
        const service = new ServiceClass();

        // type-coverage:ignore-next-line
        const result = service.resolveLink('op1', responseMock, 'nextPage');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.targetOperationId).toBe('op2');
        // type-coverage:ignore-next-line
        expect(result.parameters['id']).toBe(123);
    });

    it('should resolve values from response headers', () => {
        const project = createTestProject();

        const spec = {
            openapi: '3.0.0',
            info: { title: 'Header Test', version: '1.0' },
            components: { links: { Test: { operationId: 'noop' } } },
            paths: {},
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            opHeading: {
                '201': {
                    detail: {
                        operationId: 'getDetail',
                        parameters: {
                            uuid: '$response.header.x-resource-id',
                            static: 'constant',
                        },
                    },
                },
            },
        };

        const headerMap = new Map([['x-resource-id', 'abc-123']]);
        const responseMock = {
            status: 201,
            headers: headerMap,
            body: {},
        };

        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // type-coverage:ignore-next-line
        const result = service.resolveLink('opHeading', responseMock, 'detail');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.parameters.uuid).toBe('abc-123');
        // type-coverage:ignore-next-line
        expect(result.parameters.static).toBe('constant');
    });

    it('should resolve values from REQUEST context (including path params)', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: { links: { L: { operationId: 'noop' } } },
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            createItem: {
                '201': {
                    getRelated: {
                        operationId: 'search',
                        parameters: {
                            // request expressions
                            u: '$url',
                            m: '$method',
                            q: '$request.query.filter',
                            h: '$request.header.x-req-id',
                            b: '$request.body#/data/nested',
                            p: '$request.path.id', // NEW path param request
                        },
                    },
                },
            },
        };

        // Mock HttpRequest
        const requestMock = {
            url: 'https://api.com/v1/items/999?filter=active',
            method: 'POST',
            body: { data: { nested: 'foo' } },
            headers: new Map([['x-req-id', 'req-99']]),
            params: new Map([['filter', 'active']]),
        };

        const responseMock = { status: 201, headers: {}, body: {} };

        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // Call with request arg and urlTemplate
        // type-coverage:ignore-next-line
        const result = service.resolveLink('createItem', responseMock, 'getRelated', requestMock, '/items/{id}');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.parameters.u).toBe('https://api.com/v1/items/999?filter=active');
        // type-coverage:ignore-next-line
        expect(result.parameters.m).toBe('POST');
        // type-coverage:ignore-next-line
        expect(result.parameters.q).toBe('active');
        // type-coverage:ignore-next-line
        expect(result.parameters.h).toBe('req-99');
        // type-coverage:ignore-next-line
        expect(result.parameters.b).toBe('foo');
        // type-coverage:ignore-next-line
        expect(result.parameters.p).toBe('999'); // extracted path param
    });

    it('should normalize qualified parameter keys and report locations', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: { links: { L: { operationId: 'noop' } } },
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            op1: {
                '200': {
                    next: {
                        operationId: 'op2',
                        parameters: {
                            'path.id': '$request.path.id',
                            'query.filter': '$request.query.filter',
                            'header.x-req-id': '$request.header.x-req-id',
                        },
                    },
                },
            },
        };

        const requestMock = {
            url: 'https://api.com/v1/items/123?filter=active',
            method: 'GET',
            body: undefined,
            headers: new Map([['x-req-id', 'req-1']]),
            params: new Map([['filter', 'active']]),
        };

        const responseMock = { status: 200, headers: {}, body: {} };

        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // type-coverage:ignore-next-line
        const result = service.resolveLink('op1', responseMock, 'next', requestMock, '/items/{id}');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.parameters.id).toBe('123');
        // type-coverage:ignore-next-line
        expect(result.parameters.filter).toBe('active');
        // type-coverage:ignore-next-line
        expect(result.parameters['x-req-id']).toBe('req-1');
        // type-coverage:ignore-next-line
        expect(result.parameterLocations).toEqual({
            id: 'path',
            filter: 'query',
            'x-req-id': 'header',
        });
    });

    it('should resolve targetServer with variable substitution', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: { links: { L: { operationId: 'noop' } } },
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            op1: {
                '200': {
                    crossServer: {
                        operationId: 'op2',
                        server: {
                            url: 'https://{region}.api.com/v1',
                            variables: { region: { default: 'eu-west' } },
                        },
                    },
                },
            },
        };

        const responseMock = { status: 200, headers: {}, body: {} };
        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // type-coverage:ignore-next-line
        const result = service.resolveLink('op1', responseMock, 'crossServer');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.targetServer).toBe('https://eu-west.api.com/v1');
    });

    it('should omit parameters when runtime expression evaluation fails', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: { links: { L: { operationId: 'noop' } } },
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            opMissing: {
                '200': {
                    next: {
                        operationId: 'op2',
                        parameters: {
                            missing: '$response.body#/missing',
                            templated: 'user-{$response.body#/missing}',
                            ok: 'static',
                        },
                    },
                },
            },
        };

        const responseMock = { status: 200, headers: {}, body: {} };
        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // type-coverage:ignore-next-line
        const result = service.resolveLink('opMissing', responseMock, 'next');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.parameters.ok).toBe('static');
        // type-coverage:ignore-next-line
        expect(Object.prototype.hasOwnProperty.call(result.parameters, 'missing')).toBe(false);
        // type-coverage:ignore-next-line
        expect(Object.prototype.hasOwnProperty.call(result.parameters, 'templated')).toBe(false);
    });

    it('should decode percent-encoded JSON pointer segments in runtime expressions', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: { links: { L: { operationId: 'noop' } } },
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            opPointer: {
                '200': {
                    next: {
                        operationId: 'op2',
                        parameters: {
                            value: '$response.body#/a%2Fb',
                        },
                    },
                },
            },
        };

        const responseMock = { status: 200, headers: {}, body: { 'a/b': 42 } };
        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)}; 
            ${jsCode} 
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // type-coverage:ignore-next-line
        const result = service.resolveLink('opPointer', responseMock, 'next');

        // type-coverage:ignore-next-line
        expect(result).toBeDefined();
        // type-coverage:ignore-next-line
        expect(result.parameters.value).toBe(42);
    });

    it('should throw validation error if link server variable default is invalid', () => {
        const project = createTestProject();
        const spec = {
            openapi: '3.0.0',
            info: { title: 'T', version: '1' },
            paths: {},
            components: { links: { L: { operationId: 'noop' } } },
        };
        const parser = createParser(spec);
        new LinkServiceGenerator(parser, project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/link.service.ts');
        const code = sourceFile.getText().replace(/import.*;/g, '');
        const jsCode = ts.transpile(code, {
            target: ts.ScriptTarget.ES2020,
            module: ts.ModuleKind.CommonJS,
            experimentalDecorators: true,
        });

        const API_LINKS = {
            opInvalid: {
                '200': {
                    invalidServer: {
                        operationId: 'opTarget',
                        server: {
                            url: 'https://{region}.api.com',
                            variables: {
                                region: {
                                    default: 'mars', // Invalid value
                                    enum: ['earth', 'moon'],
                                },
                            },
                        },
                    },
                },
            },
        };

        const responseMock = { status: 200, headers: {}, body: {} };
        // type-coverage:ignore-next-line
        const moduleScope = { exports: {} as any };
        // type-coverage:ignore-next-line
        const mockInjectable = () => (target: any) => target;
        const wrappedCode = `
            const API_LINKS = ${JSON.stringify(API_LINKS)};
            ${jsCode}
        `;

        // type-coverage:ignore-next-line
        new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);
        // type-coverage:ignore-next-line
        const service = new moduleScope.exports.LinkService();

        // type-coverage:ignore-next-line
        expect(() => service.resolveLink('opInvalid', responseMock, 'invalidServer')).toThrow(
            'Value "mars" for variable "region" is not in the allowed enum: earth, moon',
        );
    });
});
