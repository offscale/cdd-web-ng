import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/core/validator.js';

describe('Input Validation: additionalOperations', () => {
    it('should reject additionalOperations that reuse fixed HTTP methods', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Additional Ops', version: '1.0' },
            paths: {
                '/bad': {
                    additionalOperations: {
                        POST: { responses: { '200': { description: 'ok' } } },
                    },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(/additionalOperations method "POST"/);
    });

    it('should allow non-standard methods in additionalOperations', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Additional Ops', version: '1.0' },
            paths: {
                '/good': {
                    additionalOperations: {
                        LOCK: { responses: { '200': { description: 'ok' } } },
                    },
                },
            },
        };

        expect(() => validateSpec(spec as any)).not.toThrow();
    });
});
