// src/service/emit/test/service-test-generator.ts

import * as path from 'path';
import { Project, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '../../../core/types.js';
import {
    camelCase,
    getBasePathTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase,
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
        const knownTypes = this.parser.schemas.map(s => s.name); // FIX 3: Correct scoping

        for (const op of operations) {
            if (!op.methodName) continue;
            const { responseModel, responseType, bodyModel, isPrimitiveBody } = this.getMethodTypes(op); // FIX 2.1: Get isPrimitiveBody

            // FIX 1: Add null check before map
            const params = (op.parameters ?? []).map(p => {
                const name = camelCase(p.name);
                const type = getTypeScriptType(p.schema, this.config, knownTypes);
                const modelName = isDataTypeInterface(type.replace(/\[\]| \| null/g, '')) ? type.replace(/\[\]| \| null/g, '') : undefined;
                let value: string;
                if (modelName) {
                    value = this.mockDataGenerator.generate(modelName);
                } else {
                    const resolvedSchema = this.parser.resolve<SwaggerDefinition>(p.schema);
                    value = resolvedSchema?.type === 'number' || resolvedSchema?.type === 'integer' ? '123' : `'test-${p.name}'`;
                }
                return { name, value, type, modelName };
            });

            // FIX 2.2: Use isPrimitiveBody
            const bodyParam = op.requestBody?.content?.['application/json']
                ? {
                    name: isPrimitiveBody ? 'body' : (bodyModel ? camelCase(bodyModel) : 'body'),
                    model: bodyModel,
                    isPrimitive: isPrimitiveBody
                }
                : null;

            const allArgs = [...params.map(p => p.name), ...(bodyParam ? [bodyParam.name] : [])];

            const declareParams = (): string[] => {
                const lines: string[] = [];
                // FIX 2.3: Re-add correct logic for primitive body
                if (bodyParam?.model) {
                    lines.push(`      const ${bodyParam.name}: ${bodyParam.model} = ${this.mockDataGenerator.generate(bodyParam.model)};`);
                } else if (bodyParam?.isPrimitive) {
                    lines.push(`      const ${bodyParam.name} = 'test-body';`);
                } else if (bodyParam) {
                    lines.push(`      const ${bodyParam.name} = { data: 'test-body' };`);
                }

                params.forEach(p => {
                    if (p.modelName) {
                        lines.push(`      const ${p.name}: ${p.type} = ${p.value};`);
                    } else {
                        lines.push(`      const ${p.name} = ${p.value};`);
                    }
                });
                return lines;
            };

            const url = op.path.replace(/{(\w+)}/g, (_, paramName) => `\${${camelCase(paramName)}}`);
            tests.push(`\n  describe('${op.methodName}()', () => {`);

            tests.push(`    it('should return ${responseType} on success', () => {`);
            const mockResponseValue = responseModel ? (responseType.endsWith('[]') ? `[${this.mockDataGenerator.generate(responseModel)}]` : this.mockDataGenerator.generate(responseModel)) : 'null';
            tests.push(`      const mockResponse${responseModel ? `: ${responseType}` : ''} = ${mockResponseValue};`);
            tests.push(...declareParams());
            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe(response => expect(response).toEqual(mockResponse));`);
            tests.push(`      const req = httpMock.expectOne(\`/api/v1${url}\`);`);
            tests.push(`      expect(req.request.method).toBe('${op.method.toUpperCase()}');`);
            if (bodyParam) tests.push(`      expect(req.request.body).toEqual(${bodyParam.name});`);
            tests.push(`      req.flush(mockResponse);`);
            tests.push(`    });`);

            tests.push(`    it('should handle a 404 error', () => {`);
            tests.push(...declareParams());
            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe({`);
            tests.push(`        next: () => fail('should have failed with a 404 error'),`);
            tests.push(`        error: error => expect(error.status).toBe(404),`);
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
            { moduleSpecifier: '@angular/core/testing', namedImports: ['TestBed', 'fail'] },
            {
                moduleSpecifier: '@angular/common/http/testing',
                namedImports: ['HttpClientTestingModule', 'HttpTestingController']
            },
            {
                moduleSpecifier: `./${camelCase(serviceName.replace(/Service$/, ''))}.service`,
                namedImports: [serviceName]
            },
        ]);
        // Only add the models import if there are models to import.
        if (modelImports.length > 0) {
            sourceFile.addImportDeclaration({
                moduleSpecifier: `../models`,
                namedImports: modelImports,
            });
        }
        sourceFile.addImportDeclaration({
            moduleSpecifier: '../tokens',
            namedImports: [getBasePathTokenName(this.config.clientName)],
        });
    }

    // FIX 2.4: Ensure getMethodTypes includes isPrimitiveBody logic and return type
    private getMethodTypes(op: PathInfo): {
        responseModel?: string;
        responseType: string;
        bodyModel?: string;
        isPrimitiveBody: boolean
    } {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const successResponseSchema = op.responses?.['200']?.content?.['application/json']?.schema;
        const responseType = successResponseSchema ? getTypeScriptType(successResponseSchema, this.config, knownTypes) : 'any';
        const responseModelType = responseType.replace(/\[\]| \| null/g, '');
        const responseModel = isDataTypeInterface(responseModelType) ? responseModelType : undefined;

        const requestBodySchema = op.requestBody?.content?.['application/json']?.schema;
        const resolvedBodySchema = this.parser.resolve(requestBodySchema);
        const bodyType = requestBodySchema ? getTypeScriptType(requestBodySchema, this.config, knownTypes) : 'any';
        const bodyModelType = bodyType.replace(/\[\]| \| null/g, '');
        const bodyModel = isDataTypeInterface(bodyModelType) ? bodyModelType : undefined;
        const isPrimitiveBody = !!resolvedBodySchema && !resolvedBodySchema.properties && ['string', 'number', 'boolean'].includes(resolvedBodySchema.type as string);

        return { responseModel, responseType, bodyModel, isPrimitiveBody };
    }

    private collectModelImports(operations: PathInfo[]): Set<string> {
        const modelImports = new Set<string>();
        const knownTypes = this.parser.schemas.map(s => s.name);

        if (!operations) {
            return modelImports;
        }

        for (const op of operations) {
            const { responseModel, bodyModel } = this.getMethodTypes(op);
            if (responseModel) modelImports.add(responseModel);
            if (bodyModel) modelImports.add(bodyModel);

            (op.parameters ?? []).forEach(param => {
                const typeName = getTypeScriptType(param.schema, this.config, knownTypes).replace(/\[\]| \| null/g, '');
                if (isDataTypeInterface(typeName)) {
                    modelImports.add(typeName);
                }
            });
        }
        return modelImports;
    }
}
