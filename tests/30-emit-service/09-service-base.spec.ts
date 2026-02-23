import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { AbstractServiceGenerator } from '@src/generators/base/service.base.js';

class TestServiceGenerator extends AbstractServiceGenerator {
    protected getFileName(controllerName: string): string {
        return `${controllerName}.ts`;
    }

    protected generateImports(): void {
        // No-op for test
    }

    protected generateServiceContent(): void {
        // No-op for test
    }
}

describe('Generators: Service Base', () => {
    it('should sanitize invalid provided method names', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} } as any;
        const parser = new SwaggerParser(
            { openapi: '3.0.0', info: { title: 'Test', version: '1' }, paths: {} } as any,
            config,
        );

        const generator = new TestServiceGenerator(parser, project, config);
        const operations = [{ method: 'get', path: '/test', methodName: 'bad-name' } as any];

        generator.generate('/out', { Test: operations });

        // type-coverage:ignore-next-line
        expect(operations[0].methodName).toBe('badName');
    });
});
