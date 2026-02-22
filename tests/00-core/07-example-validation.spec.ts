import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/core/validator.js';
import { SwaggerSpec } from '@src/core/types/index.js';

const baseSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Example API', version: '1.0.0' },
    paths: {
        '/pets': {
            get: {
                responses: {
                    '200': {
                        description: 'ok',
                        content: {
                            'application/json': {
                                schema: { type: 'string' },
                                examples: {
                                    ok: {
                                        dataValue: 'hello',
                                        serializedValue: '"hello"',
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

function cloneSpec(): SwaggerSpec {
    return JSON.parse(JSON.stringify(baseSpec)) as SwaggerSpec;
}

describe('Core: Example Object validation (OAS 3.2)', () => {
    it('should accept dataValue alongside serializedValue', () => {
        const spec = cloneSpec();
        expect(() => validateSpec(spec)).not.toThrow();
    });

    it('should reject Example Object with both value and dataValue', () => {
        const spec = cloneSpec();
        spec.paths!['/pets'].get!.parameters = [
            {
                name: 'q',
                in: 'query',
                schema: { type: 'string' },
                examples: {
                    bad: {
                        value: 'x',
                        dataValue: 'y',
                    },
                },
            },
        ];
        expect(() => validateSpec(spec)).toThrow(/value.*dataValue/);
    });

    it('should reject Example Object with both serializedValue and externalValue', () => {
        const spec = cloneSpec();
        spec.paths!['/pets'].get!.responses!['200']!.content!['application/json']!.examples = {
            bad: {
                serializedValue: '{"a":1}',
                externalValue: 'http://example.com/example.json',
            },
        } as any;
        expect(() => validateSpec(spec)).toThrow(/serializedValue.*externalValue/);
    });

    it('should reject component examples with both value and serializedValue', () => {
        const spec = cloneSpec();
        spec.components = {
            examples: {
                BadExample: {
                    value: 'foo',
                    serializedValue: 'foo',
                },
            },
        };
        expect(() => validateSpec(spec)).toThrow(/value.*serializedValue/);
    });
});
