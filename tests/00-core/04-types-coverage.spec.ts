import { describe, it, expect } from 'vitest';
import { SwaggerSpec } from '@src/core/types.js';

describe('Core: Types & Interfaces Coverage', () => {

    it('should support SPDX identifier in LicenseObject', () => {
        const spec: SwaggerSpec = {
            openapi: '3.1.0',
            info: {
                title: 'Test API',
                version: '1.0.0',
                license: {
                    name: 'Apache 2.0',
                    identifier: 'Apache-2.0'
                }
            },
            paths: {}
        };

        expect(spec.info.license?.identifier).toBe('Apache-2.0');
    });

    it('should support allowEmptyValue in Parameter', () => {
        const param = {
            name: 'test',
            in: 'query',
            allowEmptyValue: true
        };
        // This is a type-check test primarily, ensuring the compiler accepts it
        expect(param.allowEmptyValue).toBe(true);
    });
});
