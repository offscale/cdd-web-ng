import { describe, it, expect } from 'vitest';
import { singular, getTypeScriptType } from '../../src/core/utils.js';
import { GeneratorConfig } from '../../src/core/types.js';

describe('Unit: Core Utils (Extra)', () => {
    const config: GeneratorConfig = {
        input: 'spec.json',
        output: './out',
        options: { dateType: 'string', enumStyle: 'enum' },
    };

    it('should correctly singularize words ending only in "s"', () => {
        expect(singular('tests')).toBe('test');
    });

    it('should handle object schema with no properties or additionalProperties', () => {
        const schema = { type: 'object' };
        const type = getTypeScriptType(schema as any, config);
        expect(type).toBe('Record<string, any>');
    });

    it('should handle unknown schema types by returning "any"', () => {
        const schema = { type: 'unknown_type' };
        const type = getTypeScriptType(schema as any, config);
        expect(type).toBe('any');
    });
});
