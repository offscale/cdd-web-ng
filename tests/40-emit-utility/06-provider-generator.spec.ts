import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '../../src/core/parser.js';
import { GeneratorConfig } from '../../src/core/types.js';
import { ProviderGenerator } from '../../src/service/emit/utility/provider.generator.js';
import { TokenGenerator } from '../../src/service/emit/utility/token.generator.js';
import { BaseInterceptorGenerator } from '../../src/service/emit/utility/base-interceptor.generator.js';
import { AuthInterceptorGenerator } from '../../src/service/emit/utility/auth-interceptor.generator.js';
import { DateTransformerGenerator } from '../../src/service/emit/utility/date-transformer.generator.js';
import { emptySpec, securitySpec } from '../shared/specs.js';

describe('Emitter: ProviderGenerator', () => {

    const runGenerator = (spec: object, configOverrides: Partial<GeneratorConfig> = {}, tokenNames: string[] = []) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '', output: '/out', clientName: 'Test',
            options: { generateServices: true, dateType: 'string', enumStyle: 'enum' },
            ...configOverrides
        };
        const parser = new SwaggerParser(spec as any, config);

        // Run dependency generators
        new TokenGenerator(project, config.clientName).generate(config.output);
        new BaseInterceptorGenerator(project, config.clientName).generate(config.output);
        if (config.options.dateType === 'Date') {
            new DateTransformerGenerator(project).generate(config.output);
        }
        if (tokenNames.length > 0) {
            new AuthInterceptorGenerator(parser, project).generate(config.output);
        }

        new ProviderGenerator(parser, project, tokenNames).generate(config.output);
        return project.getSourceFile('/out/providers.ts')?.getText();
    };

    it('should not generate if generateServices is false', () => {
        const fileContent = runGenerator(emptySpec, { options: { generateServices: false, dateType: 'string', enumStyle: 'enum' } });
        expect(fileContent).toBeUndefined();
    });

    it('should generate a basic provider without security or date transform', () => {
        const fileContent = runGenerator(emptySpec);
        expect(fileContent).toContain('export function provideTestClient(config: TestConfig)');
        expect(fileContent).toContain('export interface TestConfig');
        expect(fileContent).not.toContain('AuthInterceptor');
        expect(fileContent).not.toContain('DateInterceptor');
        expect(fileContent).toContain('enableDateTransform?: boolean');
    });

    it('should add security providers if tokenNames are provided', () => {
        const fileContent = runGenerator(securitySpec, {}, ['apiKey', 'bearerToken']);
        expect(fileContent).toContain('apiKey?: string');
        expect(fileContent).toContain('bearerToken?: string | (() => string)');
        expect(fileContent).toContain('if (config.apiKey)');
        expect(fileContent).toContain('if (config.bearerToken)');
        expect(fileContent).toContain('providers.push({ provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true });');
    });

    it('should add DateInterceptor if dateType is "Date"', () => {
        const fileContent = runGenerator(emptySpec, { options: { generateServices: true, dateType: 'Date', enumStyle: 'enum' } });
        expect(fileContent).toContain('if (config.enableDateTransform !== false)');
        expect(fileContent).toContain("customInterceptors.unshift(new DateInterceptor());");
    });

    it('should handle undefined custom interceptors in config', () => {
        const fileContent = runGenerator(emptySpec, { interceptors: undefined } as any);
        expect(fileContent).toContain('const customInterceptors = config.interceptors?.map(InterceptorClass => new InterceptorClass()) || [];');
    });
});
