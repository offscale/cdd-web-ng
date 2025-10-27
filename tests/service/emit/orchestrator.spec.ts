import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Project } from 'ts-morph';
import { emitClientLibrary } from '../../../src/service/emit/orchestrator.js';
import { SwaggerParser } from '../../../src/core/parser.js';
import { GeneratorConfig } from '../../../src/core/types.js';

const mockAdminGenerate = vi.fn().mockResolvedValue(undefined);
const mockServiceGenerateFile = vi.fn();
const mockOAuthGenerate = vi.fn();

vi.mock('../../../src/service/emit/admin/admin.generator.js', () => ({
    AdminGenerator: vi.fn().mockImplementation(function() { return { generate: mockAdminGenerate }; }),
}));

vi.mock('../../../src/service/emit/service/service.generator.js', () => ({
    ServiceGenerator: vi.fn().mockImplementation(function() { return { generateServiceFile: mockServiceGenerateFile }; }),
}));

vi.mock('../../../src/service/emit/utility/oauth-helper.generator.js', () => ({
    OAuthHelperGenerator: vi.fn().mockImplementation(function() { return { generate: mockOAuthGenerate }; }),
}));

import { AdminGenerator } from '../../../src/service/emit/admin/admin.generator.js';
import { ServiceGenerator } from '../../../src/service/emit/service/service.generator.js';
import { OAuthHelperGenerator } from '../../../src/service/emit/utility/oauth-helper.generator.js';

describe('Unit: Orchestrator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createMocks = (spec: object) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: 'spec.json',
            output: '/generated',
            options: { dateType: 'string', enumStyle: 'enum', admin: false, generateServices: true }
        };
        const parser = new SwaggerParser(spec as any, config);
        return { project, parser, config };
    };

    it('should call AdminGenerator when admin option is true', async () => {
        const spec = { openapi: '3.0.0', paths: {}, info: { title: 'test', version: '1' } };
        const { project, parser, config } = createMocks(spec);
        config.options.admin = true;
        await emitClientLibrary('/generated', parser, config, project);
        expect(AdminGenerator).toHaveBeenCalledTimes(1);
        expect(mockAdminGenerate).toHaveBeenCalledTimes(1);
    });

    it('should NOT call ServiceGenerator when generateServices option is false', async () => {
        const spec = { openapi: '3.0.0', paths: {}, info: { title: 'test', version: '1' } };
        const { project, parser, config } = createMocks(spec);
        config.options.generateServices = false;
        await emitClientLibrary('/generated', parser, config, project);
        expect(ServiceGenerator).not.toHaveBeenCalled();
    });

    it('should call OAuthHelperGenerator when an oauth2 scheme is present', async () => {
        const spec = {
            openapi: '3.0.0', info: { title: 'test', version: '1' }, paths: {},
            components: { securitySchemes: { OAuth2: { type: 'oauth2' } } }
        };
        const { project, parser, config } = createMocks(spec);
        await emitClientLibrary('/generated', parser, config, project);
        expect(OAuthHelperGenerator).toHaveBeenCalledTimes(1);
        expect(mockOAuthGenerate).toHaveBeenCalledTimes(1);
    });
});
