import { describe, it, expect } from 'vitest';
import { groupPathsByController } from '../../src/service/parse.js';
import { SwaggerParser } from '../../src/core/parser.js';

describe('Service Parser: groupPathsByController', () => {
    const createParser = (spec: object) => new SwaggerParser(spec as any, { options: {} } as any);

    it('should group untagged paths by path segment', () => {
        const spec = { paths: { '/untagged/resource': { get: { operationId: 'getUntagged' } } } };
        const groups = groupPathsByController(createParser(spec));
        expect(groups).toHaveProperty('Untagged');
        expect(groups['Untagged'][0].operationId).toBe('getUntagged');
    });

    it('should group untagged root paths under "Default"', () => {
        const spec = { paths: { '/': { get: { operationId: 'getRoot' } } } };
        const groups = groupPathsByController(createParser(spec));
        expect(groups).toHaveProperty('Default');
        expect(groups['Default'][0].operationId).toBe('getRoot');
    });
});
