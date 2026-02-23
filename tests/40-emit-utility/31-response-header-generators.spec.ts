import { describe, expect, it, vi } from 'vitest';
import { ResponseHeaderRegistryGenerator } from '@src/generators/shared/response-header-registry.generator.js';
import { ResponseHeaderParserGenerator } from '@src/generators/angular/utils/response-header-parser.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { SwaggerParser } from '@src/core/parser.js';
import ts from 'typescript';

describe('Emitter: Response Header Utilities', () => {
    // type-coverage:ignore-next-line
    const createParser = (spec: any, options: any = {}) =>
        new SwaggerParser(
            {
                openapi: '3.0.0',
                info: { title: 'T', version: '1' },
                // type-coverage:ignore-next-line
                ...spec,
            } as any,
            // type-coverage:ignore-next-line
            { options } as any,
        );

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
                                        'X-Json': { content: { 'application/json': { schema: { type: 'object' } } } },
                                        'Content-Type': { schema: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const parser = createParser(spec, { dateType: 'Date' });
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;

            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS).toBeDefined();
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getHeaders']['200']).toEqual({
                'X-Int': 'number',
                'X-Bool': 'boolean',
                'X-Str': 'string',
                'X-Date': 'date',
                'X-Json': 'json',
            });
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getHeaders']['200']).not.toHaveProperty('Content-Type');
        });

        it('should mark Set-Cookie headers as multi-value (set-cookie)', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/cookies': {
                        get: {
                            operationId: 'getCookies',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'Set-Cookie': { schema: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getCookies']['200']['Set-Cookie']).toBe('set-cookie');
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
                                    description: 'ok',
                                    headers: {
                                        'X-Date': { schema: { type: 'string', format: 'date-time' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const parser = createParser(spec, { dateType: 'string' });
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;

            // Should default to string
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getHeadersStringDate']['200']['X-Date']).toBe('string');
        });

        it('should export full header objects for reverse generation', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/full': {
                        get: {
                            operationId: 'getFull',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Full': {
                                            description: 'Full header',
                                            schema: { type: 'string', pattern: '^a' },
                                        },
                                        'X-Ref': { $ref: '#/components/headers/TraceId' },
                                    },
                                },
                            },
                        },
                    },
                },
                components: {
                    headers: {
                        TraceId: { schema: { type: 'string' }, description: 'Trace header' },
                    },
                },
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const API_RESPONSE_HEADER_OBJECTS = moduleScope.exports.API_RESPONSE_HEADER_OBJECTS;

            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADER_OBJECTS['getFull']['200']['X-Full'].description).toBe('Full header');
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADER_OBJECTS['getFull']['200']['X-Full'].schema.pattern).toBe('^a');
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADER_OBJECTS['getFull']['200']['X-Ref'].description).toBe('Trace header');
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADER_OBJECTS['getFull']['200']['X-Ref'].schema.type).toBe('string');
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
                                    description: 'ok',
                                    headers: {
                                        'X-Xml': {
                                            content: {
                                                'application/xml': {
                                                    schema: {
                                                        type: 'object',
                                                        properties: { id: { type: 'integer' } },
                                                        xml: { name: 'Data' },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };
            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const { API_RESPONSE_HEADERS, API_HEADER_XML_CONFIGS } = moduleScope.exports;

            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getXmlHeader']['200']['X-Xml']).toBe('xml');
            // type-coverage:ignore-next-line
            expect(API_HEADER_XML_CONFIGS['getXmlHeader_200_X-Xml']).toBeDefined();
            // type-coverage:ignore-next-line
            expect(API_HEADER_XML_CONFIGS['getXmlHeader_200_X-Xml'].name).toBe('Data');
        });

        it('should preserve application/linkset+json headers distinctly', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/linkset-json': {
                        get: {
                            operationId: 'getLinksetJson',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Linkset': {
                                            content: {
                                                'application/linkset+json': {
                                                    schema: {
                                                        type: 'array',
                                                        items: { type: 'object' },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getLinksetJson']['200']['X-Linkset']).toBe('linkset+json');
        });

        it('should capture XML config fields and handle missing schema', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/xml-extra': {
                        get: {
                            operationId: 'getXmlExtra',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: {
                                        'X-Xml-NoSchema': {
                                            content: { 'application/xml': {} },
                                        },
                                        'X-Xml-Config': {
                                            content: {
                                                'application/xml': {
                                                    schema: {
                                                        type: 'object',
                                                        xml: {
                                                            name: 'Root',
                                                            prefix: 'p',
                                                            namespace: 'https://example.com/ns',
                                                            nodeType: 'element',
                                                        },
                                                        properties: {
                                                            id: { type: 'string', xml: { name: 'Id' } },
                                                            missing: { $ref: '#/components/schemas/Missing' },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                        'X-Obj': { schema: { type: 'object', properties: { a: { type: 'string' } } } },
                                    },
                                },
                            },
                        },
                    },
                },
                components: { schemas: {} },
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const { API_RESPONSE_HEADERS, API_HEADER_XML_CONFIGS } = moduleScope.exports;
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getXmlExtra']['200']['X-Xml-NoSchema']).toBe('xml');
            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getXmlExtra']['200']['X-Obj']).toBe('json');

            // type-coverage:ignore-next-line
            const xmlConfig = API_HEADER_XML_CONFIGS['getXmlExtra_200_X-Xml-Config'];
            // type-coverage:ignore-next-line
            expect(xmlConfig.name).toBe('Root');
            // type-coverage:ignore-next-line
            expect(xmlConfig.attribute).toBeUndefined();
            // type-coverage:ignore-next-line
            expect(xmlConfig.wrapped).toBeUndefined();
            // type-coverage:ignore-next-line
            expect(xmlConfig.prefix).toBe('p');
            // type-coverage:ignore-next-line
            expect(xmlConfig.namespace).toBe('https://example.com/ns');
            // type-coverage:ignore-next-line
            expect(xmlConfig.nodeType).toBe('element');
            // type-coverage:ignore-next-line
            expect(xmlConfig.properties?.id).toBeDefined();
        });

        it('should skip headers when getHeaderTypeInfo returns no typeHint', () => {
            const project = createTestProject();
            const spec = {
                paths: {
                    '/skip-header': {
                        get: {
                            operationId: 'skipHeader',
                            responses: {
                                '200': {
                                    description: 'ok',
                                    headers: { 'X-Skip': { schema: { type: 'string' } } },
                                },
                            },
                        },
                    },
                },
            };
            const parser = createParser(spec);
            const generator = new ResponseHeaderRegistryGenerator(parser, project);
            vi.spyOn(generator as any, 'getHeaderTypeInfo').mockReturnValue({ typeHint: undefined });

            generator.generate('/out');
            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            expect(moduleScope.exports.API_RESPONSE_HEADERS).toEqual({});
            // type-coverage:ignore-next-line
            expect(moduleScope.exports.API_RESPONSE_HEADER_OBJECTS['skipHeader']['200']['X-Skip']).toBeDefined();
        });

        it('should return empty XML config when schema is missing or depth limit is reached', () => {
            const project = createTestProject();
            const parser = createParser({ paths: {} });
            const generator = new ResponseHeaderRegistryGenerator(parser, project);

            // type-coverage:ignore-next-line
            expect((generator as any).getXmlConfig(undefined, 1)).toEqual({});
            // type-coverage:ignore-next-line
            expect((generator as any).getXmlConfig({ type: 'object' } as any, 0)).toEqual({});
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
                                        Link: { schema: { type: 'string' } }, // Should detect 'linkset' from name
                                        'X-Link-Set': { content: { 'application/linkset': {} } }, // Explicit header content type
                                        'X-Str': { schema: { type: 'string' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const API_RESPONSE_HEADERS = moduleScope.exports.API_RESPONSE_HEADERS;

            // type-coverage:ignore-next-line
            expect(API_RESPONSE_HEADERS['getLinkHeaders']['200']).toEqual({
                Link: 'linkset',
                'X-Link-Set': 'linkset',
                'X-Str': 'string',
            });
        });

        it('should handle edge cases: bad refs, non-json content, unknown schema types', () => {
            const project = createTestProject();
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
                                        'X-Arr': { schema: { type: 'array' } },
                                    },
                                },
                            },
                        },
                    },
                },
            };

            const parser = createParser(spec);
            new ResponseHeaderRegistryGenerator(parser, project).generate('/out');

            const file = project.getSourceFileOrThrow('/out/response-headers.ts');
            const text = file.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(text, { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS });
            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            new Function('exports', jsCode)(moduleScope.exports);

            // type-coverage:ignore-next-line
            const headers = moduleScope.exports.API_RESPONSE_HEADERS['getEdgeCases']['200'];

            // type-coverage:ignore-next-line
            expect(headers['X-Missing']).toBeUndefined();
            // type-coverage:ignore-next-line
            expect(headers['X-Html']).toBe('string');
            // type-coverage:ignore-next-line
            expect(headers['X-Bad-Ref']).toBe('string');
            // type-coverage:ignore-next-line
            expect(headers['X-Unknown']).toBe('string');
            // type-coverage:ignore-next-line
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
                experimentalDecorators: true,
            });

            const API_RESPONSE_HEADERS = {
                op1: {
                    '200': {
                        'X-Count': 'number',
                        'X-Valid': 'boolean',
                        'X-Meta': 'json',
                        'X-Time': 'date',
                    },
                },
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
                getAll: (k: string) => [headersMap.get(k)],
            };

            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: () => null };
                const LinkSetParser = { parseHeader: () => null };
                ${jsCode} 
            `;

            // type-coverage:ignore-next-line
            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            // type-coverage:ignore-next-line
            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            // type-coverage:ignore-next-line
            const service = new ServiceClass();

            // type-coverage:ignore-next-line
            const result = service.parse(mockHeaders, 'op1', 200);

            // type-coverage:ignore-next-line
            expect(result).toBeDefined();
            // type-coverage:ignore-next-line
            expect(result['X-Count']).toBe(42);
            // type-coverage:ignore-next-line
            expect(result['X-Valid']).toBe(true);
            // type-coverage:ignore-next-line
            expect(result['X-Meta']).toEqual({ id: 1 });
            // type-coverage:ignore-next-line
            expect(result['X-Time']).toBeInstanceOf(Date);
            // type-coverage:ignore-next-line
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
                experimentalDecorators: true,
            });

            const XmlParserMock = {
                // type-coverage:ignore-next-line
                parse: (xml: string, config: any) => ({ parsed: true, root: config.name, raw: xml }),
            };

            const API_RESPONSE_HEADERS = {
                op1: { '200': { 'X-Data': 'xml' } },
            };
            const API_HEADER_XML_CONFIGS = {
                'op1_200_X-Data': { name: 'RootDetails' },
            };

            const headersMap = new Map<string, string>();
            headersMap.set('X-Data', '<RootDetails><val>1</val></RootDetails>');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)],
            };

            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: ${XmlParserMock.parse.toString()} };
                const LinkSetParser = { parseHeader: () => null };

                ${jsCode} 
            `;

            // type-coverage:ignore-next-line
            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            // type-coverage:ignore-next-line
            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            // type-coverage:ignore-next-line
            const service = new ServiceClass();

            // type-coverage:ignore-next-line
            const result = service.parse(mockHeaders, 'op1', 200);

            // type-coverage:ignore-next-line
            expect(result['X-Data']).toEqual({
                parsed: true,
                root: 'RootDetails',
                raw: '<RootDetails><val>1</val></RootDetails>',
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
                experimentalDecorators: true,
            });

            const API_RESPONSE_HEADERS = {
                op1: {
                    '200': {
                        Link: 'linkset',
                    },
                },
            };
            const API_HEADER_XML_CONFIGS = {};
            const XmlParser = { parse: () => null };
            // type-coverage:ignore-next-line
            const LinkSetParser = { parseHeader: (val: any) => [{ href: val }] }; // Mock implementation

            const headersMap = new Map<string, string>();
            headersMap.set('Link', '<http://example.com>; rel="next"');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)],
            };

            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: ${XmlParser.parse.toString()} };
                const LinkSetParser = { parseHeader: ${LinkSetParser.parseHeader.toString()} };
                ${jsCode} 
            `;

            // type-coverage:ignore-next-line
            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            // type-coverage:ignore-next-line
            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            // type-coverage:ignore-next-line
            const service = new ServiceClass();

            // type-coverage:ignore-next-line
            const result = service.parse(mockHeaders, 'op1', 200);

            // Verify LinkSetParser was called correctly and result integration worked
            // type-coverage:ignore-next-line
            expect(result['Link']).toEqual([{ href: '<http://example.com>; rel="next"' }]);
        });

        it('should parse application/linkset+json headers using LinkSetParser.parseJson', () => {
            const project = createTestProject();
            new ResponseHeaderParserGenerator(project).generate('/out');

            const sourceFile = project.getSourceFileOrThrow('/out/utils/response-header.service.ts');
            const code = sourceFile.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(code, {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                experimentalDecorators: true,
            });

            const API_RESPONSE_HEADERS = {
                op1: {
                    '200': {
                        'X-Linkset': 'linkset+json',
                    },
                },
            };
            const API_HEADER_XML_CONFIGS = {};
            const XmlParser = { parse: () => null };
            const LinkSetParser = {
                parseHeader: () => null,
                // type-coverage:ignore-next-line
                parseJson: (val: any) => [{ href: val?.[0]?.href ?? 'missing' }],
            };

            const headersMap = new Map<string, string>();
            headersMap.set('X-Linkset', '[{"href":"https://example.com/next"}]');

            const mockHeaders = {
                has: (k: string) => headersMap.has(k),
                get: (k: string) => headersMap.get(k),
                getAll: (k: string) => [headersMap.get(k)],
            };

            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            const mockInjectable = () => (target: any) => target;

            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: ${XmlParser.parse.toString()} };
                const LinkSetParser = { parseHeader: ${LinkSetParser.parseHeader.toString()}, parseJson: ${LinkSetParser.parseJson.toString()} };
                ${jsCode}
            `;

            // type-coverage:ignore-next-line
            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            // type-coverage:ignore-next-line
            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            // type-coverage:ignore-next-line
            const service = new ServiceClass();

            // type-coverage:ignore-next-line
            const result = service.parse(mockHeaders, 'op1', 200);
            // type-coverage:ignore-next-line
            expect(result['X-Linkset']).toEqual([{ href: 'https://example.com/next' }]);
        });

        it('should parse Set-Cookie headers as a string array', () => {
            const project = createTestProject();
            new ResponseHeaderParserGenerator(project).generate('/out');

            const sourceFile = project.getSourceFileOrThrow('/out/utils/response-header.service.ts');
            const code = sourceFile.getText().replace(/import.*;/g, '');
            const jsCode = ts.transpile(code, {
                target: ts.ScriptTarget.ES2020,
                module: ts.ModuleKind.CommonJS,
                experimentalDecorators: true,
            });

            const API_RESPONSE_HEADERS = {
                op1: {
                    '200': {
                        'Set-Cookie': 'set-cookie',
                    },
                },
            };
            const API_HEADER_XML_CONFIGS = {};
            const XmlParser = { parse: () => null };
            const LinkSetParser = { parseHeader: () => null };

            const values = ['a=1; Path=/', 'b=2; Path=/'];
            const mockHeaders = {
                has: (k: string) => k === 'Set-Cookie',
                get: (k: string) => (k === 'Set-Cookie' ? values[0] : null),
                getAll: (k: string) => (k === 'Set-Cookie' ? values : []),
            };

            // type-coverage:ignore-next-line
            const moduleScope = { exports: {} as any };
            // type-coverage:ignore-next-line
            const mockInjectable = () => (target: any) => target;
            const wrappedCode = `
                const API_RESPONSE_HEADERS = ${JSON.stringify(API_RESPONSE_HEADERS)};
                const API_HEADER_XML_CONFIGS = ${JSON.stringify(API_HEADER_XML_CONFIGS)};
                const XmlParser = { parse: ${XmlParser.parse.toString()} };
                const LinkSetParser = { parseHeader: ${LinkSetParser.parseHeader.toString()} };
                ${jsCode}
            `;

            // type-coverage:ignore-next-line
            new Function('exports', 'Injectable', wrappedCode)(moduleScope.exports, mockInjectable);

            // type-coverage:ignore-next-line
            const ServiceClass = moduleScope.exports.ResponseHeaderService;
            // type-coverage:ignore-next-line
            const service = new ServiceClass();
            // type-coverage:ignore-next-line
            const result = service.parse(mockHeaders as any, 'op1', 200);

            // type-coverage:ignore-next-line
            expect(result['Set-Cookie']).toEqual(values);
        });
    });
});
