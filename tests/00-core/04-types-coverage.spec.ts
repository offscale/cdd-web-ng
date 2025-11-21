import { describe, expect, it } from 'vitest';
import { SwaggerSpec, SwaggerDefinition } from '@src/core/types.js';

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

    it('should support root Level tags and externalDocs (OAS 3.2)', () => {
        const spec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'T', version: '1' },
            externalDocs: { url: 'http://doc' },
            tags: [{ name: 'Tag', summary: 'Summarized Tag' }],
            paths: {}
        };

        expect(spec.externalDocs?.url).toBe('http://doc');
        expect(spec.tags?.[0].summary).toBe('Summarized Tag');
    });

    it('should support allowEmptyValue in Parameter', () => {
        const param = {
            name: 'test',
            in: 'query',
            allowEmptyValue: true
        };
        expect(param.allowEmptyValue).toBe(true);
    });

    it('should support numeric exclusiveMinimum/exclusiveMaximum (OAS 3.1/JSON Schema 2020-12)', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            exclusiveMinimum: 10,
            exclusiveMaximum: 20
        };
        expect(schema.exclusiveMinimum).toBe(10);
        expect(schema.exclusiveMaximum).toBe(20);
    });

    it('should support boolean exclusiveMinimum/exclusiveMaximum (OAS 3.0)', () => {
        const schema: SwaggerDefinition = {
            type: 'number',
            minimum: 10,
            exclusiveMinimum: true,
            maximum: 20,
            exclusiveMaximum: true
        };
        expect(schema.exclusiveMinimum).toBe(true);
        expect(schema.exclusiveMaximum).toBe(true);
    });
});
