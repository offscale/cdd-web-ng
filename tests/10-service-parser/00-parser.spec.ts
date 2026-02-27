import { describe, expect, it } from 'vitest';

import { groupPathsByController } from '@src/functions/utils.js';
import { SwaggerParser } from '@src/openapi/parse.js';

describe('Service Parser: groupPathsByController', () => {
    const createParser = (spec: object) => new SwaggerParser(spec as any, { options: {} } as any);
    const info = { title: 'Test', version: '1.0' };

    it('should group untagged paths by path segment', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {
                '/untagged/resource': {
                    get: { operationId: 'getUntagged', responses: { '200': { description: 'ok' } } },
                },
            },
        };
        const groups = groupPathsByController(createParser(spec));
        expect(groups).toHaveProperty('Untagged');
        expect(groups['Untagged'][0].operationId).toBe('getUntagged');
    });

    it('should group untagged root paths under "Default"', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: { '/': { get: { operationId: 'getRoot', responses: { '200': { description: 'ok' } } } } },
        };
        const groups = groupPathsByController(createParser(spec));
        expect(groups).toHaveProperty('Default');
        expect(groups['Default'][0].operationId).toBe('getRoot');
    });
});
