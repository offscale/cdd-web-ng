import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReferenceResolver } from '@src/core/parser/reference-resolver.js';
import { SwaggerSpec } from "@src/core/types/index.js";

describe('Core: ReferenceResolver', () => {
    let cache: Map<string, SwaggerSpec>;
    let resolver: ReferenceResolver;
    const rootUri = 'file:///root.json';

    beforeEach(() => {
        cache = new Map();
        cache.set(rootUri, { openapi: '3.0.0', paths: {} } as any);
        resolver = new ReferenceResolver(cache, rootUri);
    });

    describe('indexSchemaIds', () => {
        it('should index standard $id and anchors', () => {
            const spec = {
                schemas: {
                    User: { $id: 'http://example.com/user', $anchor: 'local', $dynamicAnchor: 'dyn' }
                }
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
    });

    describe('resolveReference', () => {
        it('should handle JSON pointer traversal', () => {
            cache.set(rootUri, { nested: { val: 123 } } as any);
            const res = resolver.resolveReference('#/nested/val');
            expect(res).toBe(123);
        });

        it('should return undefined and warn when traversal fails on missing property', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });
            cache.set(rootUri, { nested: {} } as any);
            const res = resolver.resolveReference('#/nested/missing');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve reference part "missing"'));
        });

        // ** NEW COVERAGE **
        // Hits line 144 logic: `result` is valid object but doesn't have property
        it('should warn if property access fails during traversal', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });
            cache.set(rootUri, { a: { b: 1 } } as any);
            // 'c' doesn't exist on { b: 1 }
            const res = resolver.resolveReference('#/a/c');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Failed to resolve reference part "c"'));
        });

        it('should return undefined and warn when traversal fails on null intermediate', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });
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

        it('should return undefined if external file missing from cache', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });
            const res = resolver.resolveReference('http://missing.com/doc.json');
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Unresolved external file reference'));
        });

        it('should warn on invalid reference type input', () => {
            const spy = vi.spyOn(console, 'warn').mockImplementation(() => {
            });
            const res = resolver.resolveReference(123 as any);
            expect(res).toBeUndefined();
            expect(spy).toHaveBeenCalledWith(expect.stringContaining('Encountered an unsupported or invalid reference'));
        });
    });

    describe('findRefs', () => {
        it('should find all $ref and $dynamicRef strings', () => {
            const obj = {
                a: { $ref: '#/a' },
                b: [{ $dynamicRef: '#/b' }],
                c: 'not-a-ref'
            };
            const refs = ReferenceResolver.findRefs(obj);
            expect(refs).toContain('#/a');
            expect(refs).toContain('#/b');
            expect(refs.length).toBe(2);
        });
    });

    describe('resolve', () => {
        it('should augment resolved object with summary/description from ref wrapper', () => {
            cache.set(rootUri, { defs: { Target: { type: 'string', description: 'Original' } } } as any);
            const refObj = {
                $ref: '#/defs/Target',
                description: 'Overridden',
                summary: 'Summary'
            };
            const res: any = resolver.resolve(refObj);
            expect(res.type).toBe('string');
            expect(res.description).toBe('Overridden');
            expect(res.summary).toBe('Summary');
        });

        it('should return null/undefined if input is null/undefined', () => {
            expect(resolver.resolve(null)).toBeUndefined();
            expect(resolver.resolve(undefined)).toBeUndefined();
        });

        it('should return input object if it is not a reference', () => {
            const obj = { type: 'number' };
            expect(resolver.resolve(obj)).toBe(obj);
        });
    });
});
