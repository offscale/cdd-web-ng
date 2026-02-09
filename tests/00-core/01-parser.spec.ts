import { afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

import * as fs from 'node:fs';
import * as path from 'node:path';

import * as yaml from 'js-yaml';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';
import { JSON_SCHEMA_2020_12_DIALECT, OAS_3_1_DIALECT } from '@src/core/constants.js';
import * as validator from '@src/core/validator.js';

import { parserCoverageSpec } from '../shared/specs.js';

vi.mock('fs', async importOriginal => {
    const actual = await importOriginal<typeof fs>();
    return { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() };
});
vi.mock('js-yaml');
vi.mock('@src/core/validator.js');

const mockFetch = vi.fn();
global.fetch = mockFetch;
vi.mock('node:url', () => ({
    pathToFileURL: (p: string) => ({ href: `file://${p.replace(/\\/g, '/')}` }),
}));

describe('Core: SwaggerParser', () => {
    let config: GeneratorConfig;
    let consoleWarnSpy: any;
    const originalJsonParse = JSON.parse;
    const validInfo = { title: 'Test API', version: '1.0.0' };
    let realValidateSpec: any;

    beforeAll(async () => {
        // Load the real implementation once to avoid race conditions in tests
        const actual = await vi.importActual<typeof validator>('@src/core/validator.js');
        realValidateSpec = actual.validateSpec;
    });

    beforeEach(() => {
        config = {
            input: 'spec.json',
            output: './out',
            options: {},
        };
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Default behavior for most tests: bypass validation logic
        (validator.validateSpec as Mock).mockImplementation(() => {});
    });

    afterEach(() => {
        JSON.parse = originalJsonParse;
        vi.restoreAllMocks();
        mockFetch.mockReset();
    });

    describe('File Loading and Instantiation', () => {
        beforeEach(() => {
            // For this section, we need the real validator behavior
            (validator.validateSpec as Mock).mockImplementation(realValidateSpec);
        });

        it('should create parser from local JSON file', async () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockReturnValue(JSON.stringify({ openapi: '3.0.0', info: validInfo, paths: {} }));
            const parser = await SwaggerParser.create('spec.json', config);
            expect(parser.getSpec().openapi).toBe('3.0.0');
        });

        it('should create parser from local YAML file (by extension)', async () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockReturnValue('openapi: 3.0.1');
            (yaml.load as Mock).mockReturnValue({ openapi: '3.0.1', info: validInfo, paths: {} });
            const parser = await SwaggerParser.create('spec.yaml', config);
            expect(parser.getSpec().openapi).toBe('3.0.1');
            expect(parser.getSpecVersion()).toEqual({ type: 'openapi', version: '3.0.1' });
        });

        it('should create parser from local YAML file (by content)', async () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockReturnValue('openapi: 3.0.1');
            (yaml.load as Mock).mockReturnValue({ openapi: '3.0.1', info: validInfo, paths: {} });
            const parser = await SwaggerParser.create('spec-no-ext', config);
            expect(parser.getSpec().openapi).toBe('3.0.1');
        });

        it('should throw if local file does not exist', async () => {
            (fs.existsSync as Mock).mockReturnValue(false);
            const expectedPath = path.resolve(process.cwd(), 'nonexistent.json');
            await expect(SwaggerParser.create('nonexistent.json', config)).rejects.toThrow(
                `Input file not found at ${expectedPath}`,
            );
        });

        it('should create parser from URL', async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(JSON.stringify({ openapi: '3.0.2', info: validInfo, paths: {} })),
            });
            const parser = await SwaggerParser.create('http://test.com/spec.json', config);
            expect(parser.getSpec().openapi).toBe('3.0.2');
        });

        it('should throw if URL fetch fails', async () => {
            mockFetch.mockResolvedValue({ ok: false, statusText: 'Not Found' });
            await expect(SwaggerParser.create('http://test.com/fail.json', config)).rejects.toThrow(
                'Failed to fetch spec from http://test.com/fail.json: Not Found',
            );
        });

        it('should throw on invalid JSON', async () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockReturnValue('invalid');
            await expect(SwaggerParser.create('spec.json', config)).rejects.toThrow(/Failed to parse content/);
        });

        it('should throw on invalid YAML', async () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockReturnValue('key: value:\n  - invalid');
            (yaml.load as Mock).mockImplementation(() => {
                throw new Error('YAML error');
            });
            await expect(SwaggerParser.create('spec.yaml', config)).rejects.toThrow(/Failed to parse content/);
        });

        it('should throw with non-Error object during parsing', async () => {
            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockReturnValue('invalid json');
            JSON.parse = vi.fn().mockImplementation(() => {
                throw 'a string error';
            });
            const fullPath = `file://${path.resolve(process.cwd(), 'spec.json').replace(/\\/g, '/')}`;
            await expect(SwaggerParser.create('spec.json', config)).rejects.toThrow(
                `Failed to parse content from ${fullPath}. Error: a string error`,
            );
        });

        it('should correctly initialize when spec has no $self property', () => {
            const spec = { openapi: '3.0.0', info: validInfo, paths: {} };
            // This test covers the branch by not providing a specCache,
            // which forces the parser to calculate its own base URI.
            expect(() => new SwaggerParser(spec as any, config)).not.toThrow();
        });
    });

    describe('OAS 3.2 Compliance: Server URL Resolution', () => {
        it('should resolve relative server URLs against document URI', async () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                servers: [{ url: 'v1/api' }, { url: '/root/api' }],
            } as any;

            // Parser treated as loaded from https://example.com/docs/openapi.json
            const parser = new SwaggerParser(spec, config, undefined, 'https://example.com/docs/openapi.json');

            expect(parser.servers[0].url).toBe('https://example.com/docs/v1/api');
            expect(parser.servers[1].url).toBe('https://example.com/root/api');
        });

        it('should prefer $self for relative resolution if present', async () => {
            const spec = {
                openapi: '3.2.0',
                $self: 'https://cdn.spec.com/latest/spec.yaml',
                info: validInfo,
                paths: {},
                servers: [{ url: './v1' }],
            } as any;

            const parser = new SwaggerParser(spec, config, undefined, 'file://local/download.json');

            // Should resolve against $self, not file://
            expect(parser.servers[0].url).toBe('https://cdn.spec.com/latest/v1');
        });

        it('should resolve relative $self against document URI before resolving servers', () => {
            const spec = {
                openapi: '3.2.0',
                // relative $self
                $self: '../canon/spec.yaml',
                info: validInfo,
                paths: {},
                servers: [{ url: './api' }],
            } as any;

            const parser = new SwaggerParser(spec, config, undefined, 'https://example.com/v2/draft/doc.json');

            // $self resolves to https://example.com/v2/canon/spec.yaml
            // Server resolves relative to that $self -> https://example.com/v2/canon/api
            expect(parser.servers[0].url).toBe('https://example.com/v2/canon/api');
        });

        it('should leave template URLs untouched if they start with braces', async () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                servers: [{ url: '{scheme}://api.com' }],
            } as any;

            const parser = new SwaggerParser(spec, config, undefined, 'https://example.com');
            expect(parser.servers[0].url).toBe('{scheme}://api.com');
        });

        it('should preserve template variables in path during resolution', async () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                // Relative path containing a variable
                servers: [{ url: 'api/{version}' }],
            } as any;

            const parser = new SwaggerParser(spec, config, undefined, 'https://example.com/spec.json');
            // Resolved URL normalizes to include trailing matching logic if applied, but here just relative checking.
            // new URL('api/{version}', 'https://example.com/spec.json') => 'https://example.com/api/%7Bversion%7D'
            // The implementation should revert brace encoding.
            expect(parser.servers[0].url).toBe('https://example.com/api/{version}');
        });

        it('should keep server entries without url unchanged', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                servers: [{ description: 'no url' } as any],
            } as any;
            const parser = new SwaggerParser(spec, config);
            expect(parser.servers[0]).toEqual({ description: 'no url' });
        });

        it('should return original server URL when resolution fails', () => {
            const spec = {
                openapi: '3.2.0',
                info: validInfo,
                paths: {},
                servers: [{ url: 'http://[invalid]' }],
            } as any;

            const parser = new SwaggerParser(spec, config, undefined, 'https://example.com');
            expect(parser.servers[0].url).toBe('http://[invalid]');
        });
    });

    describe('Reference Resolution (`resolve()` and `resolveReference()`)', () => {
        const spec = {
            openapi: '3.1.0',
            info: validInfo,
            paths: {},
            components: {
                schemas: {
                    User: { type: 'string' },
                    Broken: null,
                    // For recursive static test
                    A_Static: { $ref: '#/components/schemas/B_Static' },
                    B_Static: { $ref: '#/components/schemas/C_Static' },
                    C_Static: { type: 'string', description: 'Final destination' },
                    // For recursive dynamic test
                    A_Dynamic: { $dynamicRef: '#/components/schemas/B_Dynamic' },
                    B_Dynamic: { $dynamicRef: '#/components/schemas/C_Dynamic' },
                    C_Dynamic: { type: 'number' },
                },
            },
        };
        let parser: SwaggerParser;

        beforeEach(() => {
            parser = new SwaggerParser(spec as any, config, new Map([['file://entry-spec.json', spec as any]]));
        });

        it('should resolve a valid local reference object', () => {
            const result = parser.resolve<{ type: string }>({ $ref: '#/components/schemas/User' });
            expect(result).toEqual({ type: 'string' });
        });

        it('should resolve a valid $dynamicRef object (OAS 3.1)', () => {
            const result = parser.resolve<{ type: string }>({ $dynamicRef: '#/components/schemas/User' });
            expect(result).toEqual({ type: 'string' });
        });

        it('should return the object itself if it is not a reference', () => {
            const obj = { type: 'number' };
            const result = parser.resolve(obj);
            expect(result).toBe(obj);
        });

        it('should warn and return undefined for invalid reference paths', () => {
            const result = parser.resolve({ $ref: '#/components/schemas/NonExistent' });
            expect(result).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to resolve reference part "NonExistent"'),
            );
        });

        it('should return undefined if an intermediate part of the ref path is null', () => {
            const result = parser.resolve({ $ref: '#/components/schemas/Broken/property' });
            expect(result).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Failed to resolve reference part "property" in path "#/components/schemas/Broken/property"',
                ),
            );
        });

        it('should return undefined for a null/undefined object', () => {
            expect(parser.resolve(null as any)).toBeUndefined();
            expect(parser.resolve(undefined as any)).toBeUndefined();
        });

        it('should handle nested (recursive) static references', () => {
            const result = parser.resolveReference('#/components/schemas/A_Static');
            expect(result).toEqual({ type: 'string', description: 'Final destination' });
        });

        it('should handle nested (recursive) dynamic references', () => {
            const result = parser.resolveReference('#/components/schemas/A_Dynamic');
            expect(result).toEqual({ type: 'number' });
        });
    });

    describe('Multi-document Parsing', () => {
        beforeEach(() => {
            (validator.validateSpec as Mock).mockImplementation(realValidateSpec);
        });

        it('should pre-load and resolve external file references', async () => {
            const mainSpecContent = JSON.stringify({
                openapi: '3.0.0',
                info: validInfo,
                paths: {
                    '/user': {
                        get: {
                            responses: {
                                '200': {
                                    content: {
                                        'application/json': {
                                            schema: { $ref: './schemas.json#/components/schemas/User' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            const schemasSpecContent = JSON.stringify({
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        User: { type: 'object', properties: { name: { type: 'string' } } },
                    },
                },
            });

            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockImplementation((p: string) => {
                const normalizedPath = p.replace(/\\/g, '/');
                if (normalizedPath.endsWith('/main.json')) return mainSpecContent;
                if (normalizedPath.endsWith('/schemas.json')) return schemasSpecContent;
                return '';
            });

            const parser = await SwaggerParser.create('main.json', config);
            const userSchema = parser.resolveReference(
                '#/paths/~1user/get/responses/200/content/application~1json/schema',
            );

            expect(userSchema).toEqual({ type: 'object', properties: { name: { type: 'string' } } });
            expect((fs.readFileSync as Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
        });

        it('should use $self as the base URI for resolving references', async () => {
            const mainSpecContent = JSON.stringify({
                openapi: '3.0.0',
                $self: 'https://api.example.com/specs/v1/',
                info: validInfo,
                paths: {
                    '/user': {
                        get: {
                            responses: {
                                '200': {
                                    content: {
                                        'application/json': {
                                            schema: { $ref: 'schemas.json#/components/schemas/User' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            });
            const schemasSpecContent = JSON.stringify({
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: { schemas: { User: { type: 'string' } } },
            });

            mockFetch
                .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(mainSpecContent) })
                .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(schemasSpecContent) });

            const parser = await SwaggerParser.create('http://some.other.domain/main.json', config);
            const userSchema = parser.resolveReference(
                '#/paths/~1user/get/responses/200/content/application~1json/schema',
            );

            expect(userSchema).toEqual({ type: 'string' });
            expect(mockFetch).toHaveBeenCalledWith('https://api.example.com/specs/v1/schemas.json');
        });

        it('should handle nested external references', async () => {
            const mainSpec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: { schemas: { Entry: { $ref: './schemas.json#/components/schemas/User' } } },
            };
            const schemasSpec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: { schemas: { User: { allOf: [{ $ref: './base.json#/components/schemas/Base' }] } } },
            };
            const baseSpec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: { schemas: { Base: { type: 'object', properties: { id: { type: 'string' } } } } },
            };

            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readFileSync as Mock).mockImplementation((p: string) => {
                const normalizedPath = p.replace(/\\/g, '/');
                if (normalizedPath.endsWith('main.json')) return JSON.stringify(mainSpec);
                if (normalizedPath.endsWith('schemas.json')) return JSON.stringify(schemasSpec);
                if (normalizedPath.endsWith('base.json')) return JSON.stringify(baseSpec);
                return '';
            });

            const parser = await SwaggerParser.create('main.json', config);
            const resolved = parser.resolveReference('#/components/schemas/Entry');

            expect(resolved).toEqual({ allOf: [{ $ref: './base.json#/components/schemas/Base' }] });
        });
    });

    describe('Polymorphism Logic', () => {
        it('getPolymorphicSchemaOptions should return empty array for non-polymorphic schema', () => {
            const parser = new SwaggerParser(
                {
                    openapi: '3.0.0',
                    ...validInfo,
                    paths: {},
                } as any,
                { options: {} } as GeneratorConfig,
            );
            expect(parser.getPolymorphicSchemaOptions({ type: 'object' })).toEqual([]);
            expect(parser.getPolymorphicSchemaOptions({ discriminator: { propertyName: 'type' } })).toEqual([]);
        });

        it('should correctly use explicit discriminator mapping', () => {
            const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
            const schema = parser.getDefinition('WithMapping');
            const options = parser.getPolymorphicSchemaOptions(schema!);
            expect(options).toHaveLength(1);
            expect(options[0].name).toBe('subtype3');
            expect(options[0].schema.properties).toHaveProperty('type');
        });

        it('should filter out unresolvable schemas from discriminator mapping', () => {
            const specWithBadMapping = {
                ...parserCoverageSpec,
                components: {
                    ...parserCoverageSpec.components,
                    schemas: {
                        ...parserCoverageSpec.components.schemas,
                        BadMap: {
                            oneOf: [],
                            discriminator: {
                                propertyName: 'type',
                                mapping: { bad: '#/non/existent' },
                            },
                        },
                    },
                },
            };
            const parser = new SwaggerParser(specWithBadMapping as any, { options: {} } as GeneratorConfig);
            const schema = parser.getDefinition('BadMap');
            const options = parser.getPolymorphicSchemaOptions(schema!);
            expect(options).toEqual([]);
        });

        it('should correctly infer discriminator mapping when it is not explicitly provided', () => {
            const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
            const schema = parser.getDefinition('PolyWithInline');
            const options = parser.getPolymorphicSchemaOptions(schema!);
            expect(options).toHaveLength(1);
            expect(options[0].name).toBe('sub3');
        });

        it('getPolymorphicSchemaOptions should handle oneOf items that are not refs', () => {
            const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
            const schema = parser.getDefinition('PolyWithInline');
            const options = parser.getPolymorphicSchemaOptions(schema!);
            expect(options.length).toBe(1);
            expect(options[0].name).toBe('sub3');
        });

        it('getPolymorphicSchemaOptions should handle refs to schemas without the discriminator property or enum', () => {
            const parser = new SwaggerParser(parserCoverageSpec as any, { options: {} } as GeneratorConfig);
            const schema = parser.getDefinition('PolyWithInvalidRefs');
            const options = parser.getPolymorphicSchemaOptions(schema!);
            // Updated Expectation:
            // Sub1: has no 'type' property -> Skipped by stricter parser check
            // Sub2: has 'type' property but no enum -> Accepted via Implicit Mapping (OAS 3.2) -> "Sub2"
            // Total: 1 option
            expect(options.length).toBe(1);
            expect(options[0].name).toBe('Sub2');
        });

        it('should handle $dynamicRef in oneOf for getPolymorphicSchemaOptions', () => {
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                components: {
                    schemas: {
                        Poly: {
                            oneOf: [{ $dynamicRef: '#/components/schemas/Sub' }],
                            discriminator: { propertyName: 'type' },
                        },
                        Sub: {
                            type: 'object',
                            properties: { type: { type: 'string', enum: ['sub-type'] } },
                        },
                    },
                },
            };
            const parser = new SwaggerParser(spec as any, config);
            const polySchema = parser.getDefinition('Poly')!;
            const options = parser.getPolymorphicSchemaOptions(polySchema);

            expect(options).toHaveLength(1);
            expect(options[0].name).toBe('sub-type');
        });

        it('should return empty options when implicit name is missing', () => {
            const parser = new SwaggerParser(
                {
                    openapi: '3.1.0',
                    info: validInfo,
                    paths: {},
                } as any,
                config,
            );
            vi.spyOn(parser, 'resolveReference').mockReturnValue({ properties: { type: { type: 'string' } } } as any);
            const options = parser.getPolymorphicSchemaOptions({
                oneOf: [{ $ref: '/' }],
                discriminator: { propertyName: 'type' },
            } as any);

            expect(options).toEqual([]);
        });
    });

    describe('OAS 3.1+ Features', () => {
        it('should parse jsonSchemaDialect', () => {
            const spec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                jsonSchemaDialect: OAS_3_1_DIALECT,
            } as any;
            const parser = new SwaggerParser(spec, config);
            expect(parser.getJsonSchemaDialect()).toBe(OAS_3_1_DIALECT);
        });

        it('should default jsonSchemaDialect for OpenAPI 3.1 when missing', () => {
            const spec = { openapi: '3.1.0', info: validInfo, paths: {} } as any;
            const parser = new SwaggerParser(spec, config);
            expect(parser.getJsonSchemaDialect()).toBe(OAS_3_1_DIALECT);
        });

        it('should return undefined jsonSchemaDialect for OpenAPI 3.0 without dialect', () => {
            const spec = { openapi: '3.0.3', info: validInfo, paths: {} } as any;
            const parser = new SwaggerParser(spec, config);
            expect(parser.getJsonSchemaDialect()).toBeUndefined();
        });

        it('should accept JSON Schema 2020-12 dialect silently', () => {
            const spec = { ...validInfo, openapi: '3.1.0', jsonSchemaDialect: JSON_SCHEMA_2020_12_DIALECT, paths: {} };
            new SwaggerParser(spec as any, { options: {} } as GeneratorConfig);
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should accept a custom dialect without warning (OAS 3.2)', () => {
            const spec = {
                ...validInfo,
                openapi: '3.1.0',
                jsonSchemaDialect: 'https://spec.openapis.org/oas/3.0/dialect',
                paths: {},
            };
            new SwaggerParser(spec as any, { options: {} } as GeneratorConfig);
            expect(consoleWarnSpy).not.toHaveBeenCalled();
        });

        it('should parse webhooks', () => {
            const spec: SwaggerSpec = {
                openapi: '3.1.0',
                info: validInfo,
                paths: {},
                webhooks: {
                    newPet: {
                        post: {
                            requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
                            responses: { '200': { description: 'ok' } },
                        },
                    },
                },
            };
            const parser = new SwaggerParser(spec, config);
            const webhooks = parser.webhooks;
            expect(webhooks).toHaveLength(1);
            expect(webhooks[0].path).toBe('newPet');
        });

        it('should merge sibling description into resolved object on ref', () => {
            const REF_TARGET = { type: 'string', description: 'Original' };
            const specWithOverrides = {
                ...validInfo,
                openapi: '3.0.0',
                paths: {},
                components: {
                    schemas: {
                        Target: REF_TARGET,
                        WithOverride: {
                            $ref: '#/components/schemas/Target',
                            description: 'Overridden',
                            summary: 'New',
                        },
                    },
                },
            };
            const parser = new SwaggerParser(specWithOverrides as any, { options: {} } as GeneratorConfig);
            const resolved = parser.resolve<any>(specWithOverrides.components.schemas.WithOverride);
            expect(resolved?.description).toBe('Overridden');
            expect(resolved?.summary).toBe('New');
        });
    });

    describe('General Getters & Edge Cases', () => {
        beforeEach(() => {
            (validator.validateSpec as Mock).mockImplementation(realValidateSpec);
        });

        it('should get definitions from Swagger 2.0 `definitions`', () => {
            const spec = { swagger: '2.0', info: validInfo, paths: {}, definitions: { Pet: { type: 'object' } } };
            const parser = new SwaggerParser(spec as any, config);
            expect(parser.getDefinitions()).toHaveProperty('Pet');
            expect(parser.getDefinition('Pet')).toEqual({ type: 'object' });
        });

        it('should get security schemes from Swagger 2.0 `securityDefinitions`', () => {
            const spec = {
                swagger: '2.0',
                info: validInfo,
                paths: {},
                securityDefinitions: { ApiKey: { type: 'apiKey' } },
            };
            const parser = new SwaggerParser(spec as any, config);
            expect(parser.getSecuritySchemes()).toHaveProperty('ApiKey');
        });

        it('should validate spec versions correctly', () => {
            expect(
                new SwaggerParser(
                    {
                        openapi: '3.1.0',
                        info: validInfo,
                        paths: {},
                    } as any,
                    config,
                ).isValidSpec(),
            ).toBe(true);
            expect(
                new SwaggerParser(
                    {
                        swagger: '2.0',
                        info: validInfo,
                        paths: {},
                    } as any,
                    config,
                ).isValidSpec(),
            ).toBe(true);
        });

        it('should get spec version for Swagger 2.0', () => {
            const parser = new SwaggerParser({ swagger: '2.0', info: validInfo, paths: {} } as any, config);
            expect(parser.getSpecVersion()).toEqual({ type: 'swagger', version: '2.0' });
        });

        it('should get security schemes from OpenAPI 3.x `components.securitySchemes`', () => {
            const spec = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: { securitySchemes: { Bearer: { type: 'http' } } },
            };
            const parser = new SwaggerParser(spec as any, config);
            expect(parser.getSecuritySchemes()).toHaveProperty('Bearer');
        });

        it('should parse inline LinkObjects from components', () => {
            const specWithInlineLink = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    links: {
                        MyLink: {
                            operationId: 'myOperation',
                            description: 'An inline link',
                        },
                    },
                },
            };
            const parser = new SwaggerParser(specWithInlineLink as any, config);
            const links = parser.getLinks();
            expect(links).toHaveProperty('MyLink');
            expect(links.MyLink.description).toBe('An inline link');
        });

        it('should resolve $ref LinkObjects from components', () => {
            const specWithRefLink = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    links: {
                        BaseLink: {
                            operationId: 'baseOp',
                            description: 'Base link',
                        },
                        RefLink: {
                            $ref: '#/components/links/BaseLink',
                        },
                    },
                },
            };
            const parser = new SwaggerParser(specWithRefLink as any, config);
            const links = parser.getLinks();
            expect(links.RefLink.description).toBe('Base link');
        });

        it('should skip unresolved $ref LinkObjects', () => {
            const specWithMissingLink = {
                openapi: '3.0.0',
                info: validInfo,
                paths: {},
                components: {
                    links: {
                        RefLink: {
                            $ref: '#/components/links/DoesNotExist',
                        },
                    },
                },
            };
            const parser = new SwaggerParser(specWithMissingLink as any, config);
            const links = parser.getLinks();
            expect(links.RefLink).toBeUndefined();
        });

        it('should return null for getSpecVersion on a spec without a version field', () => {
            (validator.validateSpec as Mock).mockImplementation(() => {
                /* Bypass for this test */
            });
            const invalidSpec = { info: validInfo, paths: {} };
            const parser = new SwaggerParser(invalidSpec as any, config);
            expect(parser.getSpecVersion()).toBeNull();
        });

        it('should default to "/" server for OAS 3.x when servers field is missing', async () => {
            const spec = { openapi: '3.0.0', info: validInfo, paths: {} };
            const parser = new SwaggerParser(spec as any, config);
            expect(parser.servers).toHaveLength(1);
            expect(parser.servers[0].url).toBe('/');
        });

        it('should default to "/" server for OAS 3.x when servers field is empty array', () => {
            const spec = { openapi: '3.0.0', info: validInfo, paths: {}, servers: [] };
            const p = new SwaggerParser(spec as any, config);
            expect(p.servers).toHaveLength(1);
            expect(p.servers[0].url).toBe('/');
        });

        it('should NOT default servers for Swagger 2.0', () => {
            const spec = { swagger: '2.0', info: validInfo, paths: {} };
            const p = new SwaggerParser(spec as any, config);
            expect(p.servers).toEqual([]);
        });
    });
});
