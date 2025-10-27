import { describe, it, expect } from 'vitest';
import { groupPathsByController } from '../../src/service/parse.js';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';

describe('Unit: Service/Parse', () => {
    const createParser = (spec: object) => {
        const config: GeneratorConfig = {
            input: 'spec.json',
            output: './out',
            options: { dateType: 'string', enumStyle: 'enum' },
        };
        return new SwaggerParser(spec as any, config);
    };

    it('should group untagged paths under a controller name derived from the path', () => {
        const spec = {
            paths: {
                '/untagged/resource': {
                    get: { operationId: 'getUntagged' }
                }
            }
        };
        const parser = createParser(spec);
        const groups = groupPathsByController(parser);

        expect(groups).toHaveProperty('Untagged');
        expect(groups['Untagged'][0].operationId).toBe('getUntagged');
    });

    it('should group untagged root paths under "Default"', () => {
        const spec = {
            paths: {
                '/': {
                    get: { operationId: 'getRoot' }
                }
            }
        };
        const parser = createParser(spec);
        const groups = groupPathsByController(parser);

        expect(groups).toHaveProperty('Default');
        expect(groups['Default'][0].operationId).toBe('getRoot');
    });
});
