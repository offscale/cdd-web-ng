import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/core/validator.js';

describe('Core: Server Object Validation (Additional)', () => {
    const validInfo = { title: 'Valid API', version: '1.0.0' };

    it('should reject server URLs with undefined template variables', () => {
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

    it('should reject duplicate server names', () => {
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
