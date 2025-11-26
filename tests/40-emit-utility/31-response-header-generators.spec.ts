import { describe, expect, it, vi } from 'vitest';
import { ResponseHeaderRegistryGenerator } from '@src/generators/shared/response-header-registry.generator.js';
import { ResponseHeaderParserGenerator } from '@src/generators/angular/utils/response-header-parser.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { SwaggerParser } from '@src/core/parser.js';
import ts from 'typescript';

describe('Emitter: Response Header Utilities', () => {
    const createParser = (spec: any, options: any = {}) => new SwaggerParser({
        openapi: '3.0.0',
        info: { title: 'T', version: '1' },
        ...spec
    } as any, { options } as any);

    describe('Registry Generator', () => {
        it('should skip generation if no response headers are defined', () => {
            const project = createTestProject();
            const parser = createParser({ paths: {} });
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');
            const file = project.getSourceFile('/out/response-headers.ts');
            expect(file).toBeDefined();
            expect(file!.getText()).toContain('export { };');
        });

        it('should generate registry with type hints including Date when configured', () => {
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
                                        'X-Date': { schema: { type: 'string', format: 'date-time' } },
                                        'X-Json': { content: { 'application/json': { schema: { type: 'object' } } } }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const parser = createParser(spec, { dateType: 'Date' });
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
                'X-Str': 'string',
                'X-Date': 'date',
                'X-Json': 'json'
            });
        });

        it('should generate registry with String type hint for dates when Date config is disabled', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/test': {
                        get: {
                            operationId: 'getHeadersStringDate',
                            responses: {
                                '200': {
                                    headers: {
                                        'X-Date': { schema: { type: 'string', format: 'date-time' } }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            const parser = createParser(spec, { dateType: 'string' });
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            const moduleScope = { exports: {} as any };
            new Function('exports', jsCode)(moduleScope.exports);

            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;

            // Should default to string
            expect(API_RESPONSE_HEADERS['getHeadersStringDate']['200']['X-Date']).toBe('string');
        });

        it('should handle XML content in headers', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/xml-header': {
                        get: {
                            operationId: 'getXmlHeader',
                            responses: {
                                '200': {
                                    headers: {
                                        'X-Xml': {
                                            content: {
                                                'application/xml': {
                                                    schema: {
                                                        type: 'object',
                                                        properties: { id: { type: 'integer' } },
                                                        xml: { name: 'Data' }
                                                    }
                                                }
                                            }
                                        }
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

            const { API_RESPONSE_HEADERS, API_HEADER_XML_CONFIGS } = moduleScope.exports;

            expect(API_RESPONSE_HEADERS['getXmlHeader']['200']['X-Xml']).toBe('xml');
            expect(API_HEADER_XML_CONFIGS['getXmlHeader_200_X-Xml']).toBeDefined();
            expect(API_HEADER_XML_CONFIGS['getXmlHeader_200_X-Xml'].name).toBe('Data');
        });

        // New Test: LinkSet Support via Header detection
        it('should generate registry with type hints including LinkSet support', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/test': {
                        get: {
                            operationId: 'getLinkHeaders',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'Link': { schema: { type: 'string' } }, // Should detect 'linkset' from name
                                        'X-Link-Set': { content: { 'application/linkset': {} } }, // Explicit header content type
                                        'X-Str': { schema: { type: 'string' } }
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

            expect(API_RESPONSE_HEADERS['getLinkHeaders']['200']).toEqual({
                'Link': 'linkset',
                'X-Link-Set': 'linkset',
                'X-Str': 'string'
            });
        });

        it('should handle edge cases: bad refs, non-json content, unknown schema types', () => {
            const project = createTestProject();
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
                                        'X-Missing': { $ref: '#/components/headers/Missing' },
                                        'X-Html': { content: { 'text/html': {} } },
                                        'X-Bad-Ref': { schema: { $ref: '#/components/schemas/Missing' } },
                                        'X-Unknown': { schema: { type: 'something-else' } },
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

            expect(headers['X-Missing']).toBeUndefined();
            expect(headers['X-Html']).toBe('string');
            expect(headers['X-Bad-Ref']).toBe('string');
            expect(headers['X-Unknown']).toBe('string');
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

            const API_RESPONSE_HEADERS = {
                'op1': {
                    '200': {
                        'X-Count': 'number',
                        'X-Valid': 'boolean',
                        'X-Meta': 'json',
                        'X-Time': 'date'
                    }
                }
            };
            const API_HEADER_XML_CONFIGS = {};

            const headersMap = new Map<string, string>();
            headersMap.set('X-Count', '42');
            headersMap.set('X-Valid', 'true');
            headersMap.set('X-Meta', '{"id":1}');
            headersMap.set('X-Time', '2023-01-01T00:00:00.000Z');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)]
            };

            const moduleScope = { exports: {} as any };
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: () => null };
                const LinkSetParser = { parseHeader: () => null };
                ${jsCode} 
            `;

            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            const service = new ServiceClass();

            const result = service.parse(mockHeaders, 'op1', 200);

            expect(result).toBeDefined();
            expect(result['X-Count']).toBe(42);
            expect(result['X-Valid']).toBe(true);
            expect(result['X-Meta']).toEqual({ id: 1 });
            expect(result['X-Time']).toBeInstanceOf(Date);
            expect(result['X-Time'].toISOString()).toBe('2023-01-01T00:00:00.000Z');
        });

        it('should generate a service that parses XML headers', () => {
            const project = createTestProject();
            new ResponseHeaderParserGenerator(project).generate('/out');

            const sourceFile = project.getSourceFileOrThrow('/out/utils/response-header.service.ts');
            const code = sourceFile.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(code, {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                experimentalDecorators: true
            });

            const XmlParserMock = {
                parse: (xml: string, config: any) => ({ parsed: true, root: config.name, raw: xml })
            };

            const API_RESPONSE_HEADERS = {
                'op1': { '200': { 'X-Data': 'xml' } }
            };
            const API_HEADER_XML_CONFIGS = {
                'op1_200_X-Data': { name: 'RootDetails' }
            };

            const headersMap = new Map<string, string>();
            headersMap.set('X-Data', '<RootDetails><val>1</val></RootDetails>');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)]
            };

            const moduleScope = { exports: {} as any };
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: ${XmlParserMock.parse.toString()} };
                const LinkSetParser = { parseHeader: () => null };

                ${jsCode} 
            `;

            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            const service = new ServiceClass();

            const result = service.parse(mockHeaders, 'op1', 200);

            expect(result['X-Data']).toEqual({
                parsed: true,
                root: 'RootDetails',
                raw: '<RootDetails><val>1</val></RootDetails>'
            });
        });

        // New Test: Link Set Parsing execution in service
        it('should generate a service that parses Link headers using LinkSetParser', () => {
            const project = createTestProject();
            new ResponseHeaderParserGenerator(project).generate('/out');

            const sourceFile = project.getSourceFileOrThrow('/out/utils/response-header.service.ts');
            const code = sourceFile.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(code, {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                experimentalDecorators: true
            });

            const API_RESPONSE_HEADERS = {
                'op1': {
                    '200': {
                        'Link': 'linkset'
                    }
                }
            };
            const API_HEADER_XML_CONFIGS = {};
            const XmlParser = { parse: () => null };
            const LinkSetParser = { parseHeader: (val: any) => [{ href: val }] }; // Mock implementation

            const headersMap = new Map<string, string>();
            headersMap.set('Link', '<http://example.com>; rel="next"');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)]
            };

            const moduleScope = { exports: {} as any };
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: ${XmlParser.parse.toString()} };
                const LinkSetParser = { parseHeader: ${LinkSetParser.parseHeader.toString()} };
                ${jsCode} 
            `;

            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            const service = new ServiceClass();

            const result = service.parse(mockHeaders, 'op1', 200);

            // Verify LinkSetParser was called correctly and result integration worked
            expect(result['Link']).toEqual([{ href: '<http://example.com>; rel="next"' }]);
        });
    });
});
