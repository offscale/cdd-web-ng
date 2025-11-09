import { describe, it, expect } from 'vitest';
import { ServiceGenerator } from '@src/service/emit/service/service.generator.js';
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';
import { coverageSpecPart2 } from '../shared/specs.js';
import { groupPathsByController } from '@src/service/parse.js';
import { createTestProject } from '../shared/helpers.js';

/**
 * @fileoverview
 * This file contains targeted tests for the service generators to cover specific
 * edge cases related to different `consumes` types (`formData`, `urlencoded`) and
 * primitive return types, ensuring correct method body generation and import handling.
 */
describe('Emitter: Service Generators (Coverage)', () => {

    const run = (spec: object): Project => {
        const project = createTestProject();
        const config: GeneratorConfig = { input: '', output: '/out', options: { dateType: 'string', enumStyle: 'enum' } };
        const parser = new SwaggerParser(spec as any, config);
        const serviceGen = new ServiceGenerator(parser, project, config);
        const controllerGroups = groupPathsByController(parser);
        for (const [name, operations] of Object.entries(controllerGroups)) {
            serviceGen.generateServiceFile(name, operations, '/out/services');
        }
        return project;
    };

    it('should generate methods for multipart/form-data', () => {
        const project = run(coverageSpecPart2);
        const serviceFile = project.getSourceFileOrThrow('/out/services/formData.service.ts');
        const methodBody = serviceFile.getClassOrThrow('FormDataService').getMethodOrThrow('postWithFormData').getBodyText()!;
        expect(methodBody).toContain('const formData = new FormData();');
        expect(methodBody).toContain("if (file != null) { formData.append('file', file); }");
        expect(methodBody).toContain('return this.http.post(url, formData, requestOptions);');
    });

    it('should generate methods for application/x-www-form-urlencoded', () => {
        const project = run(coverageSpecPart2);
        const serviceFile = project.getSourceFileOrThrow('/out/services/urlEncoded.service.ts');
        const methodBody = serviceFile.getClassOrThrow('UrlEncodedService').getMethodOrThrow('postWithUrlEncoded').getBodyText()!;
        expect(methodBody).toContain('let formBody = new HttpParams();');
        expect(methodBody).toContain("if (grantType != null) { formBody = formBody.append('grant_type', grantType); }");
        expect(methodBody).toContain('return this.http.post(url, formBody, requestOptions);');
    });

    it('should not import models for services that only return primitives', () => {
        const project = run(coverageSpecPart2);
        const serviceFile = project.getSourceFileOrThrow('/out/services/primitiveResponse.service.ts');
        const modelImport = serviceFile.getImportDeclaration(imp => imp.getModuleSpecifierValue() === '../models');
        // The import should exist (for RequestOptions), but it should not import any models beyond that.
        expect(modelImport).toBeDefined();
        expect(modelImport!.getNamedImports().map(i => i.getName())).toEqual(['RequestOptions']);
    });
});
