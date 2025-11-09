import * as path from 'path';
import { Project, ClassDeclaration, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo } from '../../../core/types.js';
import {
    camelCase,
    pascalCase,
    getBasePathTokenName,
    isDataTypeInterface,
    getTypeScriptType,
} from '../../../core/utils.js';
import { MockDataGenerator } from './mock-data.generator.js';

export class ServiceTestGenerator {
    private mockDataGenerator: MockDataGenerator;

    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
        private readonly config: GeneratorConfig,
    ) {
        this.mockDataGenerator = new MockDataGenerator(parser);
    }

    public generateServiceTestFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        const serviceName = `${pascalCase(controllerName)}Service`;
        const testFileName = `${camelCase(controllerName)}.service.spec.ts`;
        const testFilePath = path.join(outputDir, testFileName);

        const sourceFile = this.project.createSourceFile(testFilePath, '', { overwrite: true });

        const modelImports = this.collectModelImports(operations);
        this.addImports(sourceFile, serviceName, Array.from(modelImports));

        sourceFile.addStatements([
            `describe('${serviceName}', () => {`,
            `  let service: ${serviceName};`,
            `  let httpMock: HttpTestingController;`,
            '',
            `  beforeEach(() => {`,
            `    TestBed.configureTestingModule({`,
            `      imports: [HttpClientTestingModule],`,
            `      providers: [`,
            `        ${serviceName},`,
            `        { provide: ${getBasePathTokenName(this.config.clientName)}, useValue: '/api/v1' }`,
            `      ]`,
            `    });`,
            `    service = TestBed.inject(${serviceName});`,
            `    httpMock = TestBed.inject(HttpTestingController);`,
            `  });`,
            '',
            `  afterEach(() => {`,
            `    httpMock.verify();`,
            `  });`,
            '',
            `  it('should be created', () => {`,
            `    expect(service).toBeTruthy();`,
            `  });`,
            ...this.generateMethodTests(operations),
            `});`,
        ]);

        sourceFile.formatText();
    }

    private generateMethodTests(operations: PathInfo[]): string[] {
        const tests: string[] = [];
        for (const op of operations) {
            if (!op.methodName) continue;

            const { responseModel, responseType, bodyModel } = this.getMethodTypes(op);
            const params = op.parameters?.map(p => ({
                name: camelCase(p.name),
                value: typeof p.schema?.type === 'number' ? '123' : `'test-${p.name}'`,
            })) ?? [];
            const bodyParam = op.requestBody?.content?.['application/json']
                ? { name: bodyModel ? camelCase(bodyModel) : 'body', model: bodyModel }
                : null;

            const allArgs = [
                ...params.map(p => p.name),
                ...(bodyParam ? [bodyParam.name] : [])
            ];

            tests.push(`\n  describe('${op.methodName}()', () => {`);

            // Happy Path Test
            tests.push(`    it('should return ${responseType} on success', () => {`);
            if (responseModel) {
                const mockResponse = this.mockDataGenerator.generate(responseModel);
                tests.push(`      const mockResponse: ${responseModel} = ${mockResponse};`);
            } else {
                tests.push(`      const mockResponse = null;`);
            }
            if (bodyParam?.model) {
                const mockBody = this.mockDataGenerator.generate(bodyParam.model);
                tests.push(`      const ${bodyParam.name}: ${bodyParam.model} = ${mockBody};`);
            } else if (bodyParam) {
                tests.push(`      const ${bodyParam.name} = 'test-body';`);
            }

            params.forEach(p => tests.push(`      const ${p.name} = ${p.value};`));

            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe(response => {`);
            tests.push(`        expect(response).toEqual(mockResponse);`);
            tests.push(`      });`);

            const url = op.path.replace(/{(\w+)}/g, (_, paramName) => `\${${camelCase(paramName)}}`);
            tests.push(`      const req = httpMock.expectOne(\`/api/v1${url}\`);`);
            tests.push(`      expect(req.request.method).toBe('${op.method}');`);

            if (bodyParam) {
                tests.push(`      expect(req.request.body).toEqual(${bodyParam.name});`);
            }

            tests.push(`      req.flush(mockResponse);`);
            tests.push(`    });`);

            // Error Path Test
            tests.push(`    it('should handle a 404 error', () => {`);
            if (bodyParam?.model) {
                const mockBody = this.mockDataGenerator.generate(bodyParam.model);
                tests.push(`      const ${bodyParam.name}: ${bodyParam.model} = ${mockBody};`);
            } else if (bodyParam) {
                tests.push(`      const ${bodyParam.name} = 'test-body';`);
            }
            params.forEach(p => tests.push(`      const ${p.name} = ${p.value};`));

            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe({`);
            tests.push(`        next: () => fail('should have failed with a 404 error'),`);
            tests.push(`        error: (error) => {`);
            tests.push(`          expect(error.status).toBe(404);`);
            tests.push(`        }`);
            tests.push(`      });`);

            tests.push(`      const req = httpMock.expectOne(\`/api/v1${url}\`);`);
            tests.push(`      req.flush('Not Found', { status: 404, statusText: 'Not Found' });`);
            tests.push(`    });`);

            tests.push(`  });`);
        }
        return tests;
    }

    private addImports(sourceFile: SourceFile, serviceName: string, modelImports: string[]): void {
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core/testing', namedImports: ['TestBed'] },
            { moduleSpecifier: '@angular/common/http/testing', namedImports: ['HttpClientTestingModule', 'HttpTestingController'] },
            { moduleSpecifier: `./${camelCase(serviceName.replace(/Service$/, ''))}.service`, namedImports: [serviceName] },
            { moduleSpecifier: `../models`, namedImports: modelImports.length > 0 ? modelImports : [] },
            { moduleSpecifier: '../tokens', namedImports: [getBasePathTokenName(this.config.clientName)] },
        ]);
    }

    private getMethodTypes(op: PathInfo): { responseModel?: string, responseType: string, bodyModel?: string } {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const successResponseSchema = op.responses?.['200']?.content?.['application/json']?.schema;
        const responseType = successResponseSchema ? getTypeScriptType(successResponseSchema as any, this.config, knownTypes) : 'any';
        const responseModel = isDataTypeInterface(responseType.replace(/\[\]| \| null/g, '')) ? responseType.replace(/\[\]| \| null/g, '') : undefined;

        const requestBodySchema = op.requestBody?.content?.['application/json']?.schema;
        const bodyType = requestBodySchema ? getTypeScriptType(requestBodySchema as any, this.config, knownTypes) : 'any';
        const bodyModel = isDataTypeInterface(bodyType.replace(/\[\]| \| null/g, '')) ? bodyType.replace(/\[\]| \| null/g, '') : undefined;

        return { responseModel, responseType, bodyModel };
    }

    private collectModelImports(operations: PathInfo[]): Set<string> {
        const modelImports = new Set<string>();
        for (const op of operations) {
            const { responseModel, bodyModel } = this.getMethodTypes(op);
            if (responseModel) modelImports.add(responseModel);
            if (bodyModel) modelImports.add(bodyModel);

            (op.parameters ?? []).forEach(param => {
                const schemaObject = param.schema ? param.schema : param;
                const paramType = getTypeScriptType(schemaObject as any, this.config, this.parser.schemas.map(s => s.name)).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(paramType)) {
                    modelImports.add(paramType);
                }
            });
        }
        return modelImports;
    }
}
