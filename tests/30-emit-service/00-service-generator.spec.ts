import { describe, expect, it, vi } from 'vitest';

import { Project, Scope } from 'ts-morph';

import { ServiceGenerator } from '@src/generators/angular/service/service.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { groupPathsByController } from '@src/core/utils/index.js';
import { TypeGenerator } from '@src/generators/shared/type.generator.js';
import { TokenGenerator } from '@src/generators/angular/utils/token.generator.js';
// Using ParameterSerializerGenerator instead of HttpParamsBuilderGenerator
import { ParameterSerializerGenerator } from '@src/generators/shared/parameter-serializer.generator.js';
import { AuthTokensGenerator } from '@src/generators/angular/utils/auth-tokens.generator.js';

import { branchCoverageSpec, coverageSpec, fullCRUD_Users } from '../shared/specs.js';

describe('Generators (Angular): ServiceGenerator', () => {
    // type-coverage:ignore-next-line
    const ensureResponses = (spec: any) => {
        // type-coverage:ignore-next-line
        if (!spec?.paths) return spec;
        const methods = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch', 'trace', 'query'];
        // type-coverage:ignore-next-line
        for (const pathItem of Object.values(spec.paths)) {
            if (!pathItem || typeof pathItem !== 'object') continue;
            for (const method of methods) {
                // type-coverage:ignore-next-line
                const operation = (pathItem as any)[method];
                // type-coverage:ignore-next-line
                if (operation && operation.responses === undefined) {
                    // type-coverage:ignore-next-line
                    operation.responses = { '200': { description: 'ok' } };
                }
            }
            // type-coverage:ignore-next-line
            if ((pathItem as any).additionalOperations) {
                // type-coverage:ignore-next-line
                for (const operation of Object.values((pathItem as any).additionalOperations)) {
                    // type-coverage:ignore-next-line
                    if (operation && (operation as any).responses === undefined) {
                        // type-coverage:ignore-next-line
                        (operation as any).responses = { '200': { description: 'ok' } };
                    }
                }
            }
        }
        // type-coverage:ignore-next-line
        return spec;
    };

    // type-coverage:ignore-next-line
    const createTestEnvironment = (spec: any, configOverrides: Partial<GeneratorConfig['options']> = {}) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            clientName: 'default',
            options: { dateType: 'string', enumStyle: 'enum', framework: 'angular', ...configOverrides },
        };

        // type-coverage:ignore-next-line
        const specClone = ensureResponses(JSON.parse(JSON.stringify(spec)));
        // type-coverage:ignore-next-line
        const safeSpec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            // type-coverage:ignore-next-line
            ...specClone,
        };

        const parser = new SwaggerParser(safeSpec, config);

        new TypeGenerator(parser, project, config).generate('/out');
        new TokenGenerator(project, config.clientName).generate('/out');
        new ParameterSerializerGenerator(project).generate('/out');
        new AuthTokensGenerator(project).generate('/out');

        const serviceGen = new ServiceGenerator(parser, project, config);
        const controllerGroups = groupPathsByController(parser);

        // Using the new bulk generate method
        serviceGen.generate('/out/services', controllerGroups);

        return project;
    };

    it('should create utils directory for parameter serializer when missing', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        const fsHost = project.getFileSystem();
        const dirSpy = vi.spyOn(fsHost, 'directoryExists').mockReturnValue(false as unknown as Promise<boolean>);
        const mkdirSpy = vi.spyOn(fsHost, 'mkdirSync');

        new ParameterSerializerGenerator(project).generate('/out');

        expect(dirSpy).toHaveBeenCalled();
        expect(mkdirSpy).toHaveBeenCalledWith('/out/utils');
    });

    it('should handle methods with query, path, and body parameters', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project
            .getSourceFileOrThrow('/out/services/users.service.ts')
            .getClassOrThrow('UsersService');
        const method = serviceClass
            .getMethods()
            .find(m => m.getName() === 'updateUser' && m.getParameters().some(p => p.getName() === 'user'))!;
        const body = method.getBodyText() ?? '';

        expect(body).toContain('getServerUrl');
        expect(body).toContain('options?.serverVariables');
        // Updated expectation: ParameterSerializer
        expect(body).toContain(
            "const url = `${basePath}/users/${ParameterSerializer.serializePathParam('id', id, 'simple', false, false)}`;",
        );
        // Expect generic call now
        expect(body).toContain('return this.http.put<any>(url, user, requestOptions as any);');
        expect(body).not.toContain('finalOptions.body = user;');
    });

    it('should resolve operation-level servers with per-request overrides', () => {
        const specWithOpServer = {
            paths: {
                '/op': {
                    get: {
                        tags: ['Op'],
                        operationId: 'getOp',
                        servers: [
                            {
                                url: 'https://{env}.example.com/v1',
                                variables: { env: { default: 'dev' } },
                            },
                        ],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const project = createTestEnvironment(specWithOpServer);
        const serviceClass = project.getSourceFileOrThrow('/out/services/op.service.ts').getClassOrThrow('OpService');
        const method = serviceClass.getMethodOrThrow('getOp');
        const body = method.getBodyText() ?? '';

        expect(body).toContain('resolveServerUrl');
        expect(body).toContain('operationServers');
        expect(body).toContain('options?.serverVariables');
    });

    it('should generate a void return type for 204 responses', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project
            .getSourceFileOrThrow('/out/services/noContent.service.ts')
            .getClassOrThrow('NoContentService');
        const method = serviceClass.getMethodOrThrow('deleteNoContent');
        const firstOverload = method.getOverloads()[0]!;
        expect(firstOverload.getReturnType().getText()).toBe('Observable<void>');
    });

    it('should use a custom method name when provided in config', () => {
        const project = createTestEnvironment(coverageSpec, {
            customizeMethodName: (opId: string) => `custom_${opId.replace(/-/g, '_')}`,
        });
        const serviceFile = project.getSourceFileOrThrow('/out/services/customName.service.ts');
        const serviceClass = serviceFile.getClassOrThrow('CustomNameService');
        expect(serviceClass.getMethod('custom_get_custom_name')).toBeDefined();
    });

    it('should fall back to path-based name if customizer exists but op has no ID', () => {
        const project = createTestEnvironment(branchCoverageSpec, {
            customizeMethodName: (opId: string) => `custom_${opId}`,
        });
        const serviceFile = project.getSourceFileOrThrow('/out/services/noOperationId.service.ts');
        const serviceClass = serviceFile.getClassOrThrow('NoOperationIdService');
        expect(serviceClass.getMethod('headNoOperationId')).toBeDefined();
    });

    it('should sanitize invalid method names (e.g. separated by hyphens)', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/customName.service.ts');
        const serviceClass = serviceFile.getClassOrThrow('CustomNameService');
        expect(serviceClass.getMethod('getCustomName')).toBeDefined();
    });

    it('should de-duplicate method names from conflicting customizer outputs', () => {
        const conflictSpec = {
            paths: {
                '/duplicate-name': {
                    get: {
                        tags: ['DuplicateName'],
                        operationId: 'getName',
                        responses: { '200': { description: 'ok' } },
                    },
                    post: {
                        tags: ['DuplicateName'],
                        operationId: 'postName',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const project = createTestEnvironment(conflictSpec, {
            customizeMethodName: () => 'getName',
        });
        const serviceFile = project.getSourceFileOrThrow('/out/services/duplicateName.service.ts');
        const serviceClass = serviceFile.getClassOrThrow('DuplicateNameService');
        expect(serviceClass.getMethod('getName')).toBeDefined();
        expect(serviceClass.getMethod('getName2')).toBeDefined();
    });

    it('should import a model used in a request body', () => {
        const project = createTestEnvironment(fullCRUD_Users);
        const serviceFile = project.getSourceFileOrThrow('/out/services/users.service.ts');
        const importDecl = serviceFile.getImportDeclaration(d => d.getModuleSpecifierValue() === '../models')!;
        const namedImports = importDecl.getNamedImports().map(ni => ni.getName());
        expect(namedImports).toContain('User');
    });

    it('should not add primitive array types to model imports', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/stringArray.service.ts');
        const importDecl = serviceFile.getImportDeclaration(d => d.getModuleSpecifierValue() === '../models');
        const namedImports = importDecl!.getNamedImports().map(ni => ni.getName());
        expect(namedImports).toEqual(['RequestOptions']);
    });

    it('should not add primitive parameter types to model imports', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/users.service.ts');
        const importDecl = serviceFile.getImportDeclaration('../models')!;
        const namedImports = importDecl.getNamedImports().map(i => i.getName());
        expect(namedImports).not.toContain('string');
        expect(namedImports).toContain('User');
    });

    it('should generate a correct create-context method', () => {
        const project = createTestEnvironment(coverageSpec);
        const serviceClass = project
            .getSourceFileOrThrow('/out/services/users.service.ts')
            .getClassOrThrow('UsersService');
        const method = serviceClass.getMethodOrThrow('createContextWithClientId');
        expect(method.getScope()).toBe(Scope.Private);
        const body = method.getBodyText() ?? '';
        expect(body).toContain(`return context.set(this.clientContextToken, 'default');`);
    });

    it('should add SECURITY_CONTEXT_TOKEN import only if security override is present AND global security exists', () => {
        const specWithOverride = {
            ...coverageSpec,
            components: {
                securitySchemes: { Basic: { type: 'http', scheme: 'basic' } },
            },
            paths: {
                '/public': {
                    get: {
                        tags: ['Public'],
                        security: [],
                        responses: { '200': { description: 'ok' } },
                    },
                },
                '/protected': {
                    get: {
                        tags: ['Public'],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
            security: [{ Basic: [] }],
        };

        const project = createTestEnvironment(specWithOverride);
        const serviceFile = project.getSourceFileOrThrow('/out/services/public.service.ts');
        const authImport = serviceFile.getImportDeclarations().find(d => {
            const specifier = d.getModuleSpecifierValue();
            return specifier.includes('auth.tokens');
        });

        expect(authImport).toBeDefined();
        expect(authImport!.getNamedImports().map(i => i.getName())).toContain('SECURITY_CONTEXT_TOKEN');
    });

    it('should NOT add SECURITY_CONTEXT_TOKEN import if no security requirements exist', () => {
        const specWithoutGlobalSec = {
            openapi: '3.0.0',
            info: { title: 'Public API', version: '1.0' },
            paths: {
                '/public': {
                    get: {
                        tags: ['Public'],
                        security: [],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
            components: {},
        };

        const project = createTestEnvironment(specWithoutGlobalSec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/public.service.ts');
        const authImport = serviceFile.getImportDeclarations().find(d => {
            const specifier = d.getModuleSpecifierValue();
            return specifier.includes('auth.tokens');
        });
        expect(authImport).toBeUndefined();
    });

    it('should import xml, content encoder/decoder, and extensions when needed', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Mixed', version: '1.0' },
            paths: {
                '/mixed': {
                    post: {
                        tags: ['Mixed'],
                        operationId: 'postMixed',
                        'x-test': 'ext',
                        requestBody: {
                            content: {
                                'application/xml': {
                                    schema: {
                                        type: 'object',
                                        xml: { name: 'Root' },
                                        properties: { id: { type: 'string' } },
                                    },
                                },
                                'application/json': {
                                    schema: {
                                        type: 'string',
                                        contentMediaType: 'application/json',
                                    },
                                },
                            },
                        },
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'application/xml': { schema: { type: 'string' } },
                                    'application/json': {
                                        schema: {
                                            type: 'string',
                                            contentSchema: { type: 'string' },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                '/no-resp': {
                    get: {
                        tags: ['Mixed'],
                        operationId: 'noResp',
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const project = createTestEnvironment(spec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/mixed.service.ts');

        expect(serviceFile.getImportDeclaration('../utils/xml.builder')).toBeDefined();
        expect(serviceFile.getImportDeclaration('../utils/xml-parser')).toBeDefined();
        expect(serviceFile.getImportDeclaration('../utils/content-decoder')).toBeDefined();
        expect(serviceFile.getImportDeclaration('../utils/content-encoder')).toBeDefined();
        expect(serviceFile.getImportDeclaration('../tokens/extensions.token')).toBeDefined();
    });

    it('should emit contentEncoderConfig for encoded query parameters', () => {
        const spec = {
            openapi: '3.2.0',
            info: { title: 'Encoded', version: '1.0' },
            paths: {
                '/encoded': {
                    get: {
                        tags: ['Encoded'],
                        operationId: 'getEncoded',
                        parameters: [
                            { name: 'bin', in: 'query', schema: { type: 'string', contentEncoding: 'base64' } },
                            {
                                name: 'payload',
                                in: 'query',
                                schema: { type: 'string', contentMediaType: 'application/json' },
                            },
                        ],
                        responses: { '200': { description: 'ok' } },
                    },
                },
            },
        };

        const project = createTestEnvironment(spec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/encoded.service.ts');
        const method = serviceFile.getClassOrThrow('EncodedService').getMethodOrThrow('getEncoded');
        const body = method.getBodyText() ?? '';
        const normalizedBody = body.replace(/\s+/g, '');

        expect(serviceFile.getImportDeclaration('../utils/content-encoder')).toBeDefined();
        expect(normalizedBody).toContain('"contentEncoderConfig":{"contentEncoding":"base64"}');
        expect(normalizedBody).toContain(
            '"contentEncoderConfig":{"contentMediaType":"application/json","encode":true}',
        );
    });
});
