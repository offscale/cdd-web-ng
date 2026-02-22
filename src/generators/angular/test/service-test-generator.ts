// src/generators/angular/test/service-test-generator.ts
import { Project, SourceFile } from 'ts-morph';

import * as path from 'node:path';

import { SwaggerParser } from '@src/core/parser.js';
import {
    GeneratorConfig,
    Parameter,
    PathInfo,
    SwaggerDefinition,
    ExampleObject,
    ReferenceLike,
} from '@src/core/types/index.js';
import {
    camelCase,
    getBasePathTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase,
} from '@src/core/utils/index.js';

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
        const knownTypes = this.parser.schemas.map(s => s.name);

        for (const op of operations) {
            if (!op.methodName) continue;
            const { responseModel, responseType, bodyModel, isPrimitiveBody } = this.getMethodTypes(op);

            const params = (op.parameters ?? []).map((p: Parameter) => {
                const name = camelCase(p.name);
                const type = getTypeScriptType(p.schema as SwaggerDefinition, this.config, knownTypes);
                const modelName = isDataTypeInterface(type.replace(/\[\]| \| null/g, ''))
                    ? type.replace(/\[\]| \| null/g, '')
                    : undefined;
                let value: string;

                if (modelName) {
                    value = this.mockDataGenerator.generate(modelName);
                } else {
                    value = this.getParameterExampleValue(p) ?? this.generateDefaultPrimitiveValue(p.schema);
                }
                return { name, value, type, modelName };
            });

            const bodyParam = op.requestBody?.content?.['application/json']
                ? {
                      name: isPrimitiveBody ? 'body' : bodyModel ? camelCase(bodyModel) : 'body',
                      model: bodyModel,
                      isPrimitive: isPrimitiveBody,
                  }
                : null;

            const allArgs = [...params.map(p => p.name), ...(bodyParam ? [bodyParam.name] : [])];

            const declareParams = (): string[] => {
                const lines: string[] = [];
                if (bodyParam?.model) {
                    lines.push(
                        `      const ${bodyParam.name}: ${bodyParam.model} = ${this.mockDataGenerator.generate(bodyParam.model)};`,
                    );
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

            let mockResponseValue = 'null';
            if (responseModel) {
                if (responseType.endsWith('[]')) {
                    mockResponseValue = `[${this.mockDataGenerator.generate(responseModel)}]`;
                } else {
                    mockResponseValue = this.mockDataGenerator.generate(responseModel);
                }
            } else if (responseType === 'string') {
                mockResponseValue = "'test-string'";
            } else if (responseType === 'number') {
                mockResponseValue = '123';
            } else if (responseType === 'boolean') {
                mockResponseValue = 'true';
            }

            tests.push(`      const mockResponse${responseModel ? `: ${responseType}` : ''} = ${mockResponseValue};`);
            tests.push(...declareParams());

            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe({`);
            tests.push(`        next: response => expect(response).toEqual(mockResponse),`);
            tests.push(`        error: err => fail(err)`);
            tests.push(`      });`);

            tests.push(`      const req = httpMock.expectOne(\`/api/v1${url}\`);`);
            tests.push(`      expect(req.request.method).toBe('${op.method.toUpperCase()}');`);

            if (bodyParam) {
                tests.push(`      expect(req.request.body).toEqual(${bodyParam.name});`);
            }

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

    private generateDefaultPrimitiveValue(schema: SwaggerDefinition | { $ref: string } | boolean | undefined): string {
        const resolvedSchema = this.parser.resolve<SwaggerDefinition>(schema as ReferenceLike);
        if (resolvedSchema && (resolvedSchema.type === 'number' || resolvedSchema.type === 'integer')) {
            return '123';
        } else if (resolvedSchema && resolvedSchema.type === 'boolean') {
            return 'true';
        } else {
            return `'test-value'`;
        }
    }

    private getParameterExampleValue(param: Parameter): string | undefined {
        let potentialValue: unknown = undefined;
        const pickExampleValue = (example: unknown): { found: boolean; value: unknown } => {
            if (!example || typeof example !== 'object') return { found: false, value: undefined };
            if (Object.prototype.hasOwnProperty.call(example, 'dataValue')) {
                return { found: true, value: (example as Record<string, unknown>).dataValue };
            }
            if (Object.prototype.hasOwnProperty.call(example, 'value')) {
                return { found: true, value: (example as Record<string, unknown>).value };
            }
            if (Object.prototype.hasOwnProperty.call(example, 'serializedValue')) {
                return { found: true, value: (example as Record<string, unknown>).serializedValue };
            }
            return { found: false, value: undefined };
        };

        if (param.example !== undefined) {
            potentialValue = param.example;
        } else if (param.examples && typeof param.examples === 'object') {
            const firstExample = Object.values(param.examples)[0];
            if (firstExample !== undefined) {
                const directValue = pickExampleValue(firstExample);
                if (directValue.found) {
                    potentialValue = directValue.value;
                } else if (
                    firstExample &&
                    typeof firstExample === 'object' &&
                    Object.prototype.hasOwnProperty.call(firstExample, '$ref')
                ) {
                    const resolved = this.parser.resolveReference<ExampleObject>((firstExample as ReferenceLike).$ref);
                    const resolvedValue = pickExampleValue(resolved);
                    if (resolvedValue.found) potentialValue = resolvedValue.value;
                } else if (firstExample === null || typeof firstExample !== 'object') {
                    potentialValue = firstExample;
                }
            }
        } else if (param.schema && typeof param.schema === 'object' && !('$ref' in param.schema)) {
            const schema = param.schema as Record<string, unknown>;
            if (schema.dataValue !== undefined) {
                potentialValue = schema.dataValue;
            } else if (schema.example !== undefined) {
                potentialValue = schema.example;
            } else if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
                potentialValue = schema.examples[0];
            }
        }

        if (potentialValue === undefined && param.content) {
            const contentType = Object.keys(param.content)[0];
            if (contentType) {
                const media = param.content[contentType];
                if (media && media.example !== undefined) {
                    potentialValue = media.example;
                } else if (media && media.examples) {
                    const keys = Object.keys(media.examples);
                    if (keys.length > 0) {
                        const ex = (media.examples as Record<string, unknown>)[keys[0]!];
                        const contentValue = pickExampleValue(ex);
                        if (contentValue.found) potentialValue = contentValue.value;
                    }
                }
            }
        }

        if (potentialValue !== undefined) {
            if (typeof potentialValue === 'string') return `'${potentialValue}'`;
            if (typeof potentialValue === 'object') return JSON.stringify(potentialValue);
            return String(potentialValue);
        }

        return undefined;
    }

    private addImports(sourceFile: SourceFile, serviceName: string, modelImports: string[]): void {
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core/testing', namedImports: ['TestBed', 'fail'] },
            {
                moduleSpecifier: '@angular/common/http/testing',
                namedImports: ['HttpClientTestingModule', 'HttpTestingController'],
            },
            {
                moduleSpecifier: `./${camelCase(serviceName.replace(/Service$/, ''))}.service`,
                namedImports: [serviceName],
            },
        ]);
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

    private getMethodTypes(op: PathInfo): {
        responseModel?: string;
        responseType: string;
        bodyModel?: string;
        isPrimitiveBody: boolean;
    } {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const successResponseSchema = op.responses?.['200']?.content?.['application/json']?.schema;
        const responseType = successResponseSchema
            ? getTypeScriptType(successResponseSchema as SwaggerDefinition, this.config, knownTypes)
            : 'any';
        const responseModelType = responseType.replace(/\[\]| \| null/g, '');
        const responseModel = isDataTypeInterface(responseModelType) ? responseModelType : undefined;

        const requestBodySchema = op.requestBody?.content?.['application/json']?.schema;
        const resolvedBodySchema = this.parser.resolve(requestBodySchema as SwaggerDefinition);
        const bodyType = requestBodySchema
            ? getTypeScriptType(requestBodySchema as SwaggerDefinition, this.config, knownTypes)
            : 'any';

        const bodyModelType = bodyType.replace(/\[\]| \| null/g, '');
        const bodyModel = isDataTypeInterface(bodyModelType) ? bodyModelType : undefined;
        const isPrimitiveBody =
            !!resolvedBodySchema &&
            !resolvedBodySchema.properties &&
            ['string', 'number', 'boolean'].includes(resolvedBodySchema.type as string);

        return {
            responseType,
            isPrimitiveBody,
            ...(responseModel !== undefined ? { responseModel } : {}),
            ...(bodyModel !== undefined ? { bodyModel } : {}),
        };
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

            (op.parameters ?? []).forEach((param: Parameter) => {
                const typeName = getTypeScriptType(param.schema as SwaggerDefinition, this.config, knownTypes).replace(
                    /\[\]| \| null/g,
                    '',
                );
                if (isDataTypeInterface(typeName)) {
                    modelImports.add(typeName);
                }
            });
        }
        return modelImports;
    }
}
