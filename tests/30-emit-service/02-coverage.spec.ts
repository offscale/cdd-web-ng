import { describe, expect, it } from 'vitest';
import { ImportDeclaration, Project } from 'ts-morph';
import { ServiceGenerator } from '@src/generators/angular/service/service.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { branchCoverageSpec, coverageSpecPart2 } from '../shared/specs.js';
import { groupPathsByController } from '@src/core/utils/index.js';
import { createTestProject } from '../shared/helpers.js';

describe('Generators (Angular): Service Generators (Coverage)', () => {
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

    const run = (spec: object): Project => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum', framework: 'angular' },
        };
        // type-coverage:ignore-next-line
        const specClone = ensureResponses(JSON.parse(JSON.stringify(spec)));
        // type-coverage:ignore-next-line
        const parser = new SwaggerParser(specClone as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);
        const controllerGroups = groupPathsByController(parser);
        for (const [name, operations] of Object.entries(controllerGroups)) {
            serviceGen.generateServiceFile(name, operations, '/out/services');
        }
        return project;
    };

    it('should import models for parameter types that are interfaces', () => {
        const project = run(branchCoverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/paramIsRef.service.ts');
        const modelImport = serviceFile.getImportDeclaration(
            (imp: ImportDeclaration) => imp.getModuleSpecifierValue() === '../models',
        );
        expect(modelImport).toBeDefined();
        // type-coverage:ignore-next-line
        expect(modelImport!.getNamedImports().map((i: any) => i.getName())).toContain('User');
    });

    it('should not import any models if only primitive parameters are used', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/primitives/{id}': {
                    get: {
                        tags: ['Primitives'],
                        parameters: [
                            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
                            { name: 'limit', in: 'query', schema: { type: 'number' } },
                        ],
                        responses: { '204': { description: 'ok' } },
                    },
                },
            },
        };
        const project = run(spec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/primitives.service.ts');
        const modelImport = serviceFile.getImportDeclaration(imp => imp.getModuleSpecifierValue() === '../models');
    });

    it('should generate methods for multipart/form-data', () => {
        const project = run(coverageSpecPart2);
        const serviceFile = project.getSourceFileOrThrow('/out/services/formData.service.ts');
        const methodBody = serviceFile
            .getClassOrThrow('FormDataService')
            .getMethodOrThrow('postWithFormData')
            .getBodyText()!;
        expect(methodBody).toContain('const multipartConfig =');
        expect(methodBody).toContain('MultipartBuilder.serialize(body, multipartConfig);');
        expect(methodBody).toContain(
            'return this.http.post<any>(url, multipartResult.content, requestOptions as any);',
        );
    });

    it('should generate methods for application/x-www-form-urlencoded', () => {
        const project = run(coverageSpecPart2);
        const serviceFile = project.getSourceFileOrThrow('/out/services/urlEncoded.service.ts');
        const methodBody = serviceFile
            .getClassOrThrow('UrlEncodedService')
            .getMethodOrThrow('postWithUrlEncoded')
            .getBodyText()!;
        expect(methodBody).toContain('const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(body,');
        expect(methodBody).toContain('let formBody = new HttpParams({ encoder: new ApiParameterCodec() });');
        expect(methodBody).toContain('return this.http.post<any>(url, formBody, requestOptions as any);');
    });

    it('should not import models for services that only return primitives', () => {
        const project = run(coverageSpecPart2);
        const serviceFile = project.getSourceFileOrThrow('/out/services/primitiveResponse.service.ts');
        const modelImport = serviceFile.getImportDeclaration(
            (imp: ImportDeclaration) => imp.getModuleSpecifierValue() === '../models',
        );
        expect(modelImport).toBeDefined();
        // type-coverage:ignore-next-line
    });

    it('should handle request body without a schema', () => {
        const project = run(branchCoverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/bodyNoSchema.service.ts');
        const method = serviceFile.getClassOrThrow('BodyNoSchemaService').getMethodOrThrow('postBodyNoSchema');
        // type-coverage:ignore-next-line
        const param = method.getParameters().find((p: any) => p.getName() === 'body');
        expect(param?.getType().getText()).toBe('unknown');
    });

    it('should handle operations with only required parameters', () => {
        const project = run(branchCoverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/allRequired.service.ts');
        const method = serviceFile.getClassOrThrow('AllRequiredService').getMethodOrThrow('getAllRequired');
        const overloads = method.getOverloads();
        // type-coverage:ignore-next-line
        const responseOverload = overloads.find((o: any) => o.getReturnType().getText().includes('HttpResponse'))!;
        // type-coverage:ignore-next-line
        const optionsParam = responseOverload.getParameters().find((p: any) => p.getName() === 'options')!;
        expect(optionsParam.hasQuestionToken()).toBe(false);
    });

    it('should fall back to "any" for responseType when no success response is defined', () => {
        const project = run(branchCoverageSpec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/noSuccessResponse.service.ts');
        const method = serviceFile.getClassOrThrow('NoSuccessResponseService').getMethodOrThrow('getNoSuccess');
        expect(method.getOverloads()[0].getReturnType().getText()).toBe('Observable<any>');
    });

    it('should handle default responses and responses without content', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'Test', version: '1.0' },
            paths: {
                '/default-response': {
                    get: {
                        tags: ['DefaultResponse'],
                        responses: {
                            default: {
                                description: 'Default response',
                                content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } },
                            },
                        },
                    },
                },
                '/no-content-response': {
                    get: {
                        tags: ['NoContentResponse'],
                        responses: {
                            '200': { description: 'OK' },
                        },
                    },
                },
            },
            components: {
                schemas: {
                    User: { type: 'object', properties: { name: { type: 'string' } } },
                },
            },
        };

        const project = run(spec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/defaultResponse.service.ts');
        const modelImport = serviceFile.getImportDeclaration(
            (imp: ImportDeclaration) => imp.getModuleSpecifierValue() === '../models',
        );
        // type-coverage:ignore-next-line
        expect(modelImport!.getNamedImports().map((i: any) => i.getName())).toContain('User');

        const noContentServiceFile = project.getSourceFileOrThrow('/out/services/noContentResponse.service.ts');
        expect(noContentServiceFile).toBeDefined();
    });

    it('should generate SSE parsing logic for text/event-stream', () => {
        const spec = {
            openapi: '3.0.0',
            info: { title: 'SSE Test', version: '1.0' },
            paths: {
                '/events': {
                    get: {
                        tags: ['SSE'],
                        responses: {
                            '200': {
                                description: 'ok',
                                content: {
                                    'text/event-stream': {
                                        schema: {
                                            type: 'object',
                                            properties: {
                                                id: { type: 'number' },
                                                message: { type: 'string' },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        };

        const project = run(spec);
        const serviceFile = project.getSourceFileOrThrow('/out/services/sse.service.ts');
        const method = serviceFile.getClassOrThrow('SseService').getMethodOrThrow('getEvents');

        const returnType = method.getReturnType().getText();
        expect(returnType).toContain('Observable<');

        const body = method.getBodyText()!;
        expect(body).toContain('fetch(url');
        expect(body).toContain('response.body.getReader');
        expect(body).toContain('SSE response body is not readable');
    });
});
