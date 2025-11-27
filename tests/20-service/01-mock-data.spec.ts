import { beforeAll, describe, expect, it } from 'vitest';

import { MockDataGenerator } from '@src/generators/angular/test/mock-data.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';

// Minimal mock config required by SwaggerParser
const mockConfig: GeneratorConfig = {
    input: '',
    output: '',
    options: {} as any,
};

// A comprehensive in-memory spec to test various schema scenarios
const dummySpec = {
    openapi: '3.0.0',
    info: { title: 'Test Spec', version: '1.0' },
    paths: {},
    components: {
        schemas: {
            // 1. Primitives
            SimpleString: { type: 'string' },
            StringWithFormat: { type: 'string', format: 'email' },
            SimpleBoolean: { type: 'boolean', default: true },
            SimpleNumber: { type: 'integer', minimum: 10, maximum: 100 },

            // 2. Objects & Nesting
            User: {
                type: 'object',
                properties: {
                    id: { type: 'string', format: 'uuid' },
                    name: { type: 'string', example: 'John Doe' },
                    age: { type: 'integer' },
                },
            },

            // 3. Arrays
            StringArray: {
                type: 'array',
                items: { type: 'string' },
            },
            ObjectArray: {
                type: 'array',
                items: { $ref: '#/components/schemas/User' },
            },

            // 4. Enums
            StatusEnum: {
                type: 'string',
                enum: ['active', 'inactive', 'pending'],
            },

            // 5. Composition (allOf)
            AdminUser: {
                allOf: [
                    { $ref: '#/components/schemas/User' },
                    {
                        type: 'object',
                        properties: {
                            permissions: { type: 'array', items: { type: 'string' } },
                        },
                    },
                ],
            },

            // 6. Polymorphism (oneOf) - Generator should pick first
            Pet: {
                oneOf: [
                    { type: 'object', properties: { bark: { type: 'boolean' } } },
                    { type: 'object', properties: { meow: { type: 'boolean' } } },
                ],
            },
        },
    },
};

describe('MockDataGenerator', () => {
    let generator: MockDataGenerator;
    let parser: SwaggerParser;

    beforeAll(() => {
        // Initialize parser with the dummy spec
        // We use a fake map/URI because we aren't loading from disk
        const cache = new Map([['file://test', dummySpec as any]]);
        parser = new SwaggerParser(dummySpec as any, mockConfig, cache, 'file://test');
        generator = new MockDataGenerator(parser);
    });

    describe('Primitives', () => {
        it('should generate a string', () => {
            const result = JSON.parse(generator.generate('SimpleString'));
            expect(typeof result).toBe('string');
        });

        it('should respect string formats (email)', () => {
            const result = JSON.parse(generator.generate('StringWithFormat'));
            expect(result).toBe('test@example.com'); // Match the hardcoded value in your generator
        });

        it('should use default values for booleans', () => {
            const result = JSON.parse(generator.generate('SimpleBoolean'));
            expect(result).toBe(true);
        });

        it('should generate numbers respecting constraints or defaults', () => {
            const result = JSON.parse(generator.generate('SimpleNumber'));
            expect(result).toBeTypeOf('number');
            // Your generator uses 123 for integers by default, ignoring min/max unless defaults exist
            expect(result).toBe(10); // Code checks minimum first
        });
    });

    describe('Objects & References', () => {
        it('should generate an object with properties', () => {
            const result = JSON.parse(generator.generate('User'));
            expect(result).toHaveProperty('id');
            expect(result).toHaveProperty('name', 'John Doe'); // Should pick up 'example'
            expect(result).toHaveProperty('age');
        });

        it('should handle arrays of primitives', () => {
            const result = JSON.parse(generator.generate('StringArray'));
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(1);
            expect(typeof result[0]).toBe('string');
        });

        it('should handle arrays of objects (via Ref)', () => {
            const result = JSON.parse(generator.generate('ObjectArray'));
            expect(Array.isArray(result)).toBe(true);
            expect(result[0]).toHaveProperty('name', 'John Doe');
        });
    });

    describe('Advanced Schema Features', () => {
        it('should use the first value for Enums', () => {
            const result = JSON.parse(generator.generate('StatusEnum'));
            expect(result).toBe('active');
        });

        it('should merge properties for allOf', () => {
            const result = JSON.parse(generator.generate('AdminUser'));
            // From User
            expect(result).toHaveProperty('name');
            // From Admin definition
            expect(result).toHaveProperty('permissions');
        });

        it('should pick the first option for oneOf', () => {
            const result = JSON.parse(generator.generate('Pet'));
            expect(result).toHaveProperty('bark');
            expect(result).not.toHaveProperty('meow');
        });
    });

    describe('Hardcoded Overrides', () => {
        // These test specific switch cases in your source code
        // ensuring robust fallback when schemas are broken or specific types are requested

        it('should handle "JustARef" override', () => {
            const result = JSON.parse(generator.generate('JustARef'));
            expect(result).toEqual({ id: 'string-value' });
        });

        it('should handle "RefToNothing" override', () => {
            const result = JSON.parse(generator.generate('RefToNothing'));
            expect(result).toEqual({});
        });

        it('should handle "BooleanSchema" override', () => {
            const result = JSON.parse(generator.generate('BooleanSchema'));
            expect(result).toBe(true);
        });

        it('should handle "ArrayNoItems" override', () => {
            const result = JSON.parse(generator.generate('ArrayNoItems'));
            expect(result).toEqual([]);
        });
    });

    describe('Edge Cases', () => {
        it('should return empty object for unknown schema', () => {
            const result = JSON.parse(generator.generate('NonExistentSchema'));
            expect(result).toEqual({});
        });
    });
});
