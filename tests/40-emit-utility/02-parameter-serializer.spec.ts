import { describe, expect, it } from 'vitest';
import ts from 'typescript';

import { ParameterSerializerGenerator } from '@src/generators/shared/parameter-serializer.generator.js';
import { createTestProject } from '../shared/helpers.js';

function getSerializerContext() {
    const project = createTestProject();
    new ParameterSerializerGenerator(project).generate('/');
    const sourceFile = project.getSourceFileOrThrow('/utils/parameter-serializer.ts');

    const codeWithoutImports = sourceFile.getText().replace(/import\s+.*from\s+['"].*['"];?/g, '');

    const jsCode = ts.transpile(codeWithoutImports, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
    });

    const exportsMock: Record<string, any> = {};
    new Function('exports', jsCode)(exportsMock);

    return {
        ParameterSerializer: (exportsMock as any).ParameterSerializer,
    };
}

describe('Utility: ParameterSerializer', () => {
    const { ParameterSerializer } = getSerializerContext();

    it('should serialize x-www-form-urlencoded querystring payloads with encoding', () => {
        const result = ParameterSerializer.serializeRawQuerystring(
            { foo: 'a b', bar: 'c+d' },
            undefined,
            'application/x-www-form-urlencoded',
        );
        expect(result).toBe('foo=a+b&bar=c%2Bd');
    });

    it('should honor per-property encoding hints for x-www-form-urlencoded querystring payloads', () => {
        const result = ParameterSerializer.serializeRawQuerystring(
            { tags: ['a', 'b'] },
            undefined,
            'application/x-www-form-urlencoded',
            { tags: { style: 'pipeDelimited', explode: false } },
        );
        expect(result).toBe('tags=a%7Cb');
    });
});
