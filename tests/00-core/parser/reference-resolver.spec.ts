import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReferenceResolver } from '@src/core/parser/reference-resolver.js';
import { SwaggerSpec } from '@src/core/types/index.js';

describe('Core: ReferenceResolver', () => {
    let cache: Map<string, SwaggerSpec>;
    let resolver: ReferenceResolver;
    const rootUri = 'file:///root.json';

    beforeEach(() => {
        cache = new Map();
        cache.set(rootUri, { openapi: '3.0.0', paths: {} } as any);
        resolver = new ReferenceResolver(cache, rootUri);
    });

    afterEach(() => {
        vi.restoreAllMocks(); // Clean up console spies to prevent cross-test pollution
    });

    describe('indexSchemaIds', () => {
        it('should return early for non-object specs', () => {
            const sizeBefore = cache.size;
            ReferenceResolver.indexSchemaIds(null as any, rootUri, cache);
            expect(cache.size).toBe(sizeBefore);
        });

        it('should index standard $id and anchors', () => {
            const spec = {
                schemas: {
                    User: { $id: 'http://example.com/user', $anchor: 'local', $dynamicAnchor: 'dyn' },
                },
            };
            ReferenceResolver.indexSchemaIds(spec, rootUri, cache);
            expect(cache.has('http://example.com/user')).toBe(true);
            expect(cache.has('http://example.com/user#local')).toBe(true);
            expect(cache.has('http://example.com/user#dyn')).toBe(true);
        });

        it('should safely ignore invalid IDs', () => {
            const spec = { schemas: { Bad: { $id: 'invalid-uri' } } };
            expect(() => ReferenceResolver.indexSchemaIds(spec, rootUri, cache)).not.toThrow();
        });

        it('should skip inherited properties and avoid re-adding anchors', () => {
            const proto = { inherited: { $anchor: 'skip' } };
            const spec = Object.create(proto);
            spec.schemas = {
                User: { $id: 'http://example.com/user', $anchor: 'local', $dynamicAnchor: 'dyn' },
            };
            ReferenceResolver.indexSchemaIds(spec, rootUri, cache);
            const sizeAfterFirst = cache.size;
            ReferenceResolver.indexSchemaIds(spec, rootUri, cache);
            expect(cache.size).toBe(sizeAfterFirst);
            expect(cache.has('http://example.com/user#skip')).toBe(false);
        });
    });

    describe('resolveReference', () => {
        it('should handle JSON pointer traversal', () => {
            cache.set(rootUri, { nested: { val: 123 } } as any);
            const res = resolver.resolveReference('#/nested/val');
            expect(res).toBe(123);
        });

        it('should return undefined and warn when traversal fails on missing property', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            cache.set(rootUri, { nested: {} } as any);
            const res = resolver.resolveReference('#/nested/missing');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve reference part "missing"'));
        });

        it('should warn if property access fails during traversal', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            cache.set(rootUri, { a: { b: 1 } } as any);
            // 'c' doesn't exist on { b: 1 }
            const res = resolver.resolveReference('#/a/c');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve reference part "c"'));
        });

        it('should return undefined and warn when traversal fails on null intermediate', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            cache.set(rootUri, { nested: null } as any);
            const res = resolver.resolveReference('#/nested/child');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve reference part "child"'));
        });

        it('should resolve references to external files in cache', () => {
            cache.set('http://external.com/doc.json', { id: 'extern' } as any);
            const res = resolver.resolveReference('http://external.com/doc.json#/id');
            expect(res).toBe('extern');
        });

        it('should resolve JSON pointers with percent-encoded tokens', () => {
            const spec = {
                openapi: '3.2.0',
                paths: {
                    '/2.0/repositories/{username}': {
                        get: { operationId: 'getRepo', responses: { '200': { description: 'ok' } } },
                    },
                },
            };
            cache.set(rootUri, spec as any);
            const res = resolver.resolveReference('#/paths/~12.0~1repositories~1%7Busername%7D/get') as any;
            expect(res?.operationId).toBe('getRepo');
        });

        it('should return undefined if external file missing from cache', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const res = resolver.resolveReference('http://missing.com/doc.json');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unresolved external file reference'));
        });

        it('should NOT warn on invalid reference type input (not string)', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const res = resolver.resolveReference(123 as any);
            expect(res).toBeUndefined();
            expect(spy).not.toHaveBeenCalled();
        });
    });

    describe('findRefs', () => {
        it('should find all $ref and $dynamicRef strings', () => {
            const obj = {
                a: { $ref: '#/a' },
                b: [{ $dynamicRef: '#/b' }],
                c: 'not-a-ref',
            };
            const refs = ReferenceResolver.findRefs(obj);
            expect(refs).toContain('#/a');
            expect(refs).toContain('#/b');
            expect(refs.length).toBe(2);
        });

        it('should ignore inherited ref properties', () => {
            const proto = { inherited: { $ref: '#/proto' } };
            const obj = Object.create(proto);
            const refs = ReferenceResolver.findRefs(obj);
            expect(refs).toEqual([]);
        });
    });

    describe('resolve', () => {
        it('should augment resolved object with summary/description from ref wrapper', () => {
            cache.set(rootUri, { defs: { Target: { type: 'string', description: 'Original' } } } as any);
            const refObj = {
                $ref: '#/defs/Target',
                description: 'Overridden',
                summary: 'Summary',
            };
            const res: any = resolver.resolve(refObj);
            expect(res.type).toBe('string');
            expect(res.description).toBe('Overridden');
            expect(res.summary).toBe('Summary');
        });

        it('should only override description when summary is omitted', () => {
            cache.set(rootUri, { defs: { Target: { type: 'string', description: 'Original' } } } as any);
            const refObj = {
                $ref: '#/defs/Target',
                description: 'Only description',
            };
            const res: any = resolver.resolve(refObj);
            expect(res.description).toBe('Only description');
            expect(res.summary).toBeUndefined();
        });

        it('should only override summary when description is omitted', () => {
            cache.set(rootUri, { defs: { Target: { type: 'string', description: 'Original' } } } as any);
            const refObj = {
                $ref: '#/defs/Target',
                summary: 'Only summary',
            };
            const res: any = resolver.resolve(refObj);
            expect(res.summary).toBe('Only summary');
            expect(res.description).toBe('Original');
        });

        it('should return null/undefined if input is null/undefined', () => {
            expect(resolver.resolve(null)).toBeUndefined();
            expect(resolver.resolve(undefined)).toBeUndefined();
        });

        it('should return input object if it is not a reference', () => {
            const obj = { type: 'number' };
            expect(resolver.resolve(obj)).toBe(obj);
        });

        it('should resolve relative $ref using nearest $id base URI', () => {
            const spec = {
                components: {
                    schemas: {
                        Foo: {
                            $id: 'http://example.com/schemas/foo',
                            type: 'object',
                            properties: {
                                bar: { $ref: 'bar' },
                            },
                        },
                        Bar: {
                            $id: 'http://example.com/schemas/bar',
                            type: 'string',
                        },
                    },
                },
            };

            cache.set(rootUri, spec as any);
            ReferenceResolver.indexSchemaIds(spec, rootUri, cache);

            const refObj = (spec as any).components.schemas.Foo.properties.bar;
            const resolved = resolver.resolve(refObj as any) as any;

            expect(resolved).toBeDefined();
            expect(resolved.type).toBe('string');
        });
    });

    describe('$dynamicRef Resolution', () => {
        it('should prefer properties from the resolution stack over static definition', () => {
            // 1. Base Generic schema (defines fallback 'item')
            const genericSchema = {
                $id: 'http://base/generic',
                $dynamicAnchor: 'meta',
                type: 'object',
                properties: {
                    data: { $dynamicRef: '#item' },
                },
                $defs: {
                    defaultItem: {
                        $dynamicAnchor: 'item',
                        type: 'string',
                        description: 'default string',
                    },
                },
            };

            // 2. Specific usage (defines override 'item')
            const specificSchema = {
                $id: 'http://base/specific',
                allOf: [{ $ref: 'http://base/generic' }],
                $defs: {
                    overrideItem: {
                        $dynamicAnchor: 'item',
                        type: 'number',
                        description: 'override number',
                    },
                },
            };

            // Pre-seed cache (mimic loader)
            cache.set('http://base/generic', genericSchema as any);
            cache.set('http://base/specific', specificSchema as any);
            ReferenceResolver.indexSchemaIds(genericSchema, 'http://base/generic', cache);
            ReferenceResolver.indexSchemaIds(specificSchema, 'http://base/specific', cache);

            // Manually triggering resolve with stack: [Specific, Generic]
            const stack = ['http://base/specific', 'http://base/generic'];
            const resolved = resolver.resolveReference('#item', 'http://base/generic', stack) as any;

            expect(resolved).toBeDefined();
            expect(resolved.type).toBe('number');
            expect(resolved.description).toBe('override number');
        });

        it('should fallback to local anchor definition if no overrides in stack', () => {
            const genericSchema = {
                $id: 'http://base/generic',
                properties: {
                    data: { $dynamicRef: '#item' },
                },
                $defs: {
                    defaultItem: {
                        $dynamicAnchor: 'item',
                        type: 'string',
                    },
                },
            };
            cache.set('http://base/generic', genericSchema as any);
            ReferenceResolver.indexSchemaIds(genericSchema, 'http://base/generic', cache);

            const resolved = resolver.resolveReference('#item', 'http://base/generic', []) as any;

            expect(resolved).toBeDefined();
            expect(resolved.type).toBe('string');
        });

        it('should return undefined when dynamic anchor is not found in stack', () => {
            cache.set('http://base/generic', { openapi: '3.0.0', paths: {} } as any);
            const resolved = resolver.resolveReference('#missing', 'http://base/generic', ['http://base/generic']);
            expect(resolved).toBeUndefined();
        });

        it('should resolve dynamic anchors when scope URIs include fragments', () => {
            const specificSchema = {
                $id: 'http://base/specific',
                $defs: {
                    overrideItem: {
                        $dynamicAnchor: 'item',
                        type: 'number',
                    },
                },
            };

            cache.set('http://base/specific', specificSchema as any);
            ReferenceResolver.indexSchemaIds(specificSchema, 'http://base/specific', cache);

            const resolved = resolver.resolveReference('#item', 'http://base/specific', [
                'http://base/specific#/defs/overrideItem',
            ]) as any;

            expect(resolved?.type).toBe('number');
        });
    });

    describe('resolveReference edge cases', () => {
        it('should return entire document when ref has no pointer', () => {
            const spec = { openapi: '3.0.0', paths: { '/x': {} } } as any;
            cache.set('http://doc.com/root.json', spec);
            const res = resolver.resolveReference('http://doc.com/root.json');
            expect(res).toBe(spec);
        });

        it('should return undefined without warning when current document is missing and ref has no file path', () => {
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const res = resolver.resolveReference('#/missing', 'file:///missing.json');
            expect(res).toBeUndefined();
            expect(warnSpy).not.toHaveBeenCalled();
        });

        it('should skip JSON pointer traversal when no fragment is present and cache has() returns false', () => {
            class NonHasCache extends Map<string, SwaggerSpec> {
                // Force has() to return false to bypass the early cache hit
                override has(_key: string): boolean {
                    return false;
                }
            }

            const customCache = new NonHasCache();
            const spec = { openapi: '3.0.0', paths: {} } as any;
            customCache.set('http://doc.com/root.json', spec);
            const customResolver = new ReferenceResolver(customCache, 'http://doc.com/root.json');
            const res = customResolver.resolveReference('http://doc.com/root.json');
            expect(res).toBe(spec);
        });
    });
});
