import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/core/validator.js';

describe('Core: Server Object Validation (Additional)', () => {
    const validInfo = { title: 'Valid API', version: '1.0.0' };

    it('should reject server URLs with undefined template variables', () => {
        // type-coverage:ignore-next-line
        const spec: any = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{region}.example.com',
                    variables: { env: { default: 'prod' } },
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec)).toThrow(/not defined in variables/);
    });

    it('should reject server variables missing required default', () => {
        // type-coverage:ignore-next-line
        const spec: any = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{env}.example.com',
                    variables: { env: {} },
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec)).toThrow(/must define a string default/);
    });

    it('should reject server variables with non-string default', () => {
        // type-coverage:ignore-next-line
        const spec: any = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                {
                    url: 'https://{env}.example.com',
                    variables: { env: { default: 123 } },
                },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec)).toThrow(/must define a string default/);
    });

    it('should reject duplicate server names', () => {
        // type-coverage:ignore-next-line
        const spec: any = {
            openapi: '3.2.0',
            info: validInfo,
            servers: [
                { url: 'https://api.example.com', name: 'prod' },
                { url: 'https://staging.example.com', name: 'prod' },
            ],
            paths: {},
        };
        expect(() => validateSpec(spec)).toThrow(/Server name "prod" must be unique/);
    });
});
