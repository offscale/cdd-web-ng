import { describe, expect, it, vi } from 'vitest';
import { ResponseHeaderRegistryGenerator } from '@src/generators/shared/response-header-registry.generator.js';
import { ResponseHeaderParserGenerator } from '@src/generators/angular/utils/response-header-parser.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { SwaggerParser } from '@src/core/parser.js';
import ts from 'typescript';

describe('Emitter: Response Header Utilities', () => {
    const createParser = (spec: any) => new SwaggerParser({
        openapi: '3.0.0',
        info: { title: 'T', version: '1' },
        ...spec
    } as any, { options: {} } as any);

    describe('Registry Generator', () => {
        it('should skip generation if no response headers are defined', () => {
            const project = createTestProject();
            const parser = createParser({ paths: {} });
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');
            const file = project.getSourceFile('/out/response-headers.ts');
            expect(file).toBeDefined();
            expect(file!.getText()).toContain('export { };');
        });

        it('should generate registry with type hints', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/test': {
                        get: {
                            operationId: 'getHeaders',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Int': { schema: { type: 'integer' } },
                                        'X-Bool': { schema: { type: 'boolean' } },
                                        'X-Str': { schema: { type: 'string' } },
                                        'X-Json': { content: { 'application/json': { schema: { type: 'object' } } } }
                                    }
                                }
                            }
                        }
                    }
                }
            };
            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            const moduleScope = { exports: {} as any };
            new Function('exports', jsCode)(moduleScope.exports);

            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;

            expect(API_RESPONSE_HEADERS).toBeDefined();
            expect(API_RESPONSE_HEADERS['getHeaders']['200']).toEqual({
                'X-Int': 'number',
                'X-Bool': 'boolean',
                'X-Str': 'string', // defaults to string
                'X-Json': 'json'
            });
        });

        it('should handle edge cases: bad refs, non-json content, unknown schema types', () => {
            const project = createTestProject();
            // Suppress warnings from the parser regarding missing refs
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });

            const spec = {
                paths: {
                    '/edge-cases': {
                        get: {
                            operationId: 'getEdgeCases',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        // Case 1: Header definition itself is a bad ref
                                        'X-Missing': { $ref: '#/components/headers/Missing' },
                                        // Case 2: Content type is not JSON (content map iteration)
                                        'X-Html': { content: { 'text/html': {} } },
                                        // Case 3: Schema inside header is a bad ref
                                        'X-Bad-Ref': { schema: { $ref: '#/components/schemas/Missing' } },
                                        // Case 4: Schema type is unknown or missing (fallback)
                                        'X-Unknown': { schema: { type: 'something-else' } },
                                        // Case 5: Array type
                                        'X-Arr': { schema: { type: 'array' } }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            const moduleScope = { exports: {} as any };
            new Function('exports', jsCode)(moduleScope.exports);

            const headers = moduleScope.exports.API_RESPONSE_HEADERS['getEdgeCases']['200'];

            // 'X-Missing' should be absent because the loop returns early if (!headerDef)
            expect(headers['X-Missing']).toBeUndefined();

            // 'X-Html' should be 'string' because content type doesn't include 'json'
            expect(headers['X-Html']).toBe('string');

            // 'X-Bad-Ref' should be 'string' because (!resolvedSchema) -> return 'string'
            expect(headers['X-Bad-Ref']).toBe('string');

            // 'X-Unknown' should be 'string' because type switch falls through
            expect(headers['X-Unknown']).toBe('string');

            // 'X-Arr' should be 'array'
            expect(headers['X-Arr']).toBe('array');

            warnSpy.mockRestore();
        });
    });

    describe('Parser Service Generator', () => {
        it('should generate a service that parses headers correctly using registry', () => {
            const project = createTestProject();
            new ResponseHeaderParserGenerator(project).generate('/out');

            const sourceFile = project.getSourceFileOrThrow('/out/utils/response-header.service.ts');
            const code = sourceFile.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(code, {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                experimentalDecorators: true
            });

            // Mock Dependencies
            const API_RESPONSE_HEADERS = {
                'op1': {
                    '200': {
                        'X-Count': 'number',
                        'X-Valid': 'boolean',
                        'X-Meta': 'json'
                    }
                }
            };

            // Mock HttpHeaders
            const headersMap = new Map<string, string>();
            headersMap.set('X-Count', '42');
            headersMap.set('X-Valid', 'true');
            headersMap.set('X-Meta', '{"id":1}');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)]
            };

            const moduleScope = { exports: {} as any };
            const mockInjectable = () => (target: any) => target;

            // Inject mock Registry
            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)}; 
                ${jsCode} 
            `;

            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            const service = new ServiceClass();

            // Result should be the typed object
            const result = service.parse(mockHeaders, 'op1', 200);

            expect(result).toBeDefined();
            expect(result['X-Count']).toBe(42);
            expect(result['X-Valid']).toBe(true);
            expect(result['X-Meta']).toEqual({ id: 1 });
        });
    });
});
