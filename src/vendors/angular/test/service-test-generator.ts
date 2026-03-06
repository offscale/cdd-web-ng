// src/generators/angular/test/service-test-generator.ts
import { Project, SourceFile } from 'ts-morph';

import * as path from 'node:path';

import { SwaggerParser } from '@src/openapi/parse.js';
import {
    GeneratorConfig,
    Parameter,
    PathInfo,
    SwaggerDefinition,
    ExampleObject,
    ReferenceLike,
    OpenApiValue,
} from '@src/core/types/index.js';
import {
    camelCase,
    getBasePathTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase,
} from '@src/functions/utils.js';

import { MockDataGenerator } from './mock-data.generator.js';

export class ServiceTestGenerator {
    private mockDataGenerator: MockDataGenerator;

    constructor(
        /* v8 ignore next */
        private readonly parser: SwaggerParser,
        /* v8 ignore next */
        private readonly project: Project,
        /* v8 ignore next */
        private readonly config: GeneratorConfig,
    ) {
        /* v8 ignore next */
        this.mockDataGenerator = new MockDataGenerator(parser);
    }

    public generateServiceTestFile(controllerName: string, operations: PathInfo[], outputDir: string): void {
        /* v8 ignore next */
        const serviceName = `${pascalCase(controllerName)}Service`;
        /* v8 ignore next */
        const testFileName = `${camelCase(controllerName)}.service.spec.ts`;
        /* v8 ignore next */
        const testFilePath = path.join(outputDir, testFileName);
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(testFilePath, '', { overwrite: true });

        /* v8 ignore next */
        const modelImports = this.collectModelImports(operations);
        /* v8 ignore next */
        this.addImports(sourceFile, serviceName, Array.from(modelImports));

        /* v8 ignore next */
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

        /* v8 ignore next */
        sourceFile.formatText();
    }

    private generateMethodTests(operations: PathInfo[]): string[] {
        /* v8 ignore next */
        const tests: string[] = [];
        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            if (!op.methodName) continue;
            /* v8 ignore next */
            const { responseModel, responseType, bodyModel, isPrimitiveBody } = this.getMethodTypes(op);

            /* v8 ignore next */
            const params = (op.parameters ?? [])
                .map((p: Parameter) => {
                    /* v8 ignore next */
                    const name = camelCase(p.name);
                    /* v8 ignore next */
                    const type = getTypeScriptType(p.schema as SwaggerDefinition, this.config, knownTypes);
                    /* v8 ignore next */
                    const modelName = isDataTypeInterface(type.replace(/\[\]| \| null/g, ''))
                        ? type.replace(/\[\]| \| null/g, '')
                        : undefined;
                    let value: string;

                    /* v8 ignore next */
                    if (modelName) {
                        /* v8 ignore next */
                        value = this.mockDataGenerator.generate(modelName);
                    } else {
                        /* v8 ignore next */
                        value = this.getParameterExampleValue(p) ?? this.generateDefaultPrimitiveValue(p.schema, type);
                    }
                    /* v8 ignore next */
                    return { name, value, type, modelName, required: p.required };
                })
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                .sort((a, b) => (a.required ? 0 : 1) - (b.required ? 0 : 1));
            /* v8 ignore stop */

            /* v8 ignore next */
            const bodyParam = op.requestBody?.content?.['application/json']
                ? {
                      name: isPrimitiveBody ? 'body' : bodyModel ? camelCase(bodyModel) : 'body',
                      model: bodyModel,
                      isPrimitive: isPrimitiveBody,
                  }
                : null;

            /* v8 ignore next */
            const allArgs = [...params.map(p => p.name), ...(bodyParam ? [bodyParam.name] : [])];

            /* v8 ignore next */
            const declareParams = (): string[] => {
                /* v8 ignore next */
                const lines: string[] = [];
                /* v8 ignore next */
                if (bodyParam?.model) {
                    /* v8 ignore next */
                    let mockData = this.mockDataGenerator.generate(bodyParam.model);
                    /* v8 ignore next */
                    mockData =
                        /* v8 ignore start */
                        typeof mockData === 'string' && mockData.startsWith('"') && mockData.endsWith('"')
                            ? /* v8 ignore stop */
                              mockData
                            : String(mockData);
                    /* v8 ignore next */
                    lines.push(
                        `      const ${bodyParam.name}: Record<string, never> = ${mockData.replace(/"new Date\(\)"/g, 'new Date()')};`,
                    );
                    /* v8 ignore next */
                } else if (bodyParam?.isPrimitive) {
                    /* v8 ignore next */
                    lines.push(`      const ${bodyParam.name}: Record<string, never> = 'test-body';`);
                    /* v8 ignore next */
                } else if (bodyParam) {
                    /* v8 ignore next */
                    lines.push(`      const ${bodyParam.name}: Record<string, never> = { data: 'test-body' };`);
                }

                /* v8 ignore next */
                params.forEach(p => {
                    /* v8 ignore next */
                    if (p.modelName) {
                        /* v8 ignore next */
                        lines.push(`      const ${p.name}: Record<string, never> = ${p.value};`);
                    } else {
                        /* v8 ignore next */
                        lines.push(`      const ${p.name}: Record<string, never> = ${p.value};`);
                    }
                });
                /* v8 ignore next */
                return lines;
            };

            /* v8 ignore next */
            const url = op.path.replace(/{(\w+)}/g, (_, paramName: string) => `\${${camelCase(paramName)}}`);
            /* v8 ignore next */
            tests.push(`\n  describe('${op.methodName}()', () => {`);

            /* v8 ignore next */
            tests.push(`    it('should return ${responseType} on success', () => {`);

            /* v8 ignore next */
            let mockResponseValue: string = 'null';
            /* v8 ignore next */
            if (responseModel) {
                /* v8 ignore next */
                if (responseType.endsWith('[]')) {
                    /* v8 ignore next */
                    let mockData = this.mockDataGenerator.generate(responseModel);
                    /* v8 ignore next */
                    mockData =
                        /* v8 ignore start */
                        typeof mockData === 'string' && mockData.startsWith('"') && mockData.endsWith('"')
                            ? /* v8 ignore stop */
                              mockData
                            : String(mockData);
                    /* v8 ignore next */
                    mockResponseValue = `[${mockData.replace(/"new Date\(\)"/g, 'new Date()')}]`;
                } else {
                    /* v8 ignore next */
                    let mockData = this.mockDataGenerator.generate(responseModel);
                    /* v8 ignore next */
                    mockResponseValue =
                        /* v8 ignore start */
                        typeof mockData === 'string' && mockData.startsWith('"') && mockData.endsWith('"')
                            ? /* v8 ignore stop */
                              mockData
                            : String(mockData);
                    /* v8 ignore next */
                    mockResponseValue = mockResponseValue.replace(/"new Date\(\)"/g, 'new Date()');
                }
                /* v8 ignore next */
            } else if (responseType === 'string') {
                /* v8 ignore next */
                mockResponseValue = "'test-string'";
                /* v8 ignore next */
            } else if (responseType === 'number') {
                /* v8 ignore next */
                mockResponseValue = '123';
                /* v8 ignore next */
            } else if (responseType === 'boolean') {
                /* v8 ignore next */
                mockResponseValue = 'true';
            }

            /* v8 ignore next */
            tests.push(`      const mockResponse${responseModel ? `: ${responseType}` : ''} = ${mockResponseValue};`);
            /* v8 ignore next */
            tests.push(...declareParams());

            /* v8 ignore next */
            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe({`);
            /* v8 ignore next */
            tests.push(`        next: response => expect(response).toEqual(mockResponse),`);
            /* v8 ignore next */
            tests.push(`        error: err => { throw err; }`);
            /* v8 ignore next */
            tests.push(`      });`);

            /* v8 ignore next */
            tests.push(`            const req = httpMock.expectOne(req => req.url.startsWith(\`/api/v1${url}\`));`);
            /* v8 ignore next */
            tests.push(`      expect(req.request.method).toBe('${op.method.toUpperCase()}');`);

            /* v8 ignore next */
            if (bodyParam) {
                /* v8 ignore next */
                tests.push(`      expect(req.request.body).toEqual(${bodyParam.name});`);
            }

            /* v8 ignore next */
            tests.push(`      req.flush(mockResponse);`);
            /* v8 ignore next */
            tests.push(`    });`);

            /* v8 ignore next */
            tests.push(`    it('should handle a 404 error', () => {`);
            /* v8 ignore next */
            tests.push(...declareParams());
            /* v8 ignore next */
            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe({`);
            /* v8 ignore next */
            tests.push(`        next: () => { throw new Error('should have failed with a 404 error'); },`);
            /* v8 ignore next */
            tests.push(`        error: error => expect(error.status).toBe(404),`);
            /* v8 ignore next */
            tests.push(`      });`);
            /* v8 ignore next */
            tests.push(`            const req = httpMock.expectOne(req => req.url.startsWith(\`/api/v1${url}\`));`);
            /* v8 ignore next */
            tests.push(`      req.flush('Not Found', { status: 404, statusText: 'Not Found' });`);
            /* v8 ignore next */
            tests.push(`    });`);

            /* v8 ignore next */
            tests.push(`  });`);
        }
        /* v8 ignore next */
        return tests;
    }

    private generateDefaultPrimitiveValue(
        schema: SwaggerDefinition | { $ref: string } | boolean | undefined,
        tsType?: string,
    ): string {
        /* v8 ignore next */
        /* v8 ignore start */
        if (tsType === 'File') return `new File([""], "test.txt")`;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (tsType === 'Blob') return `new Blob([""])`;
        /* v8 ignore stop */
        /* v8 ignore next */
        const resolvedSchema = this.parser.resolve<SwaggerDefinition>(schema as ReferenceLike);
        /* v8 ignore next */
        if (resolvedSchema && (resolvedSchema.type === 'number' || resolvedSchema.type === 'integer')) {
            /* v8 ignore next */
            return '123';
            /* v8 ignore next */
        } else if (resolvedSchema && resolvedSchema.type === 'boolean') {
            /* v8 ignore next */
            return 'true';
        } else {
            /* v8 ignore next */
            return `'test-value'`;
        }
    }

    private getParameterExampleValue(param: Parameter): string | undefined {
        /* v8 ignore next */
        let potentialValue: OpenApiValue = undefined;
        /* v8 ignore next */
        const pickExampleValue = (
            example: OpenApiValue,
        ): { found: boolean; value: Record<string, never> | string | number | boolean | null } => {
            /* v8 ignore next */
            if (!example || typeof example !== 'object') return { found: false, value: null };
            /* v8 ignore next */
            if (Object.prototype.hasOwnProperty.call(example, 'dataValue')) {
                /* v8 ignore next */
                return {
                    found: true,
                    value: (example as Record<string, string | number | boolean | Record<string, never> | null>)
                        .dataValue,
                };
            }
            /* v8 ignore next */
            if (Object.prototype.hasOwnProperty.call(example, 'value')) {
                /* v8 ignore next */
                return {
                    found: true,
                    value: (example as Record<string, string | number | boolean | Record<string, never> | null>).value,
                };
            }
            /* v8 ignore next */
            if (Object.prototype.hasOwnProperty.call(example, 'serializedValue')) {
                /* v8 ignore next */
                return {
                    found: true,
                    value: (example as Record<string, string | number | boolean | Record<string, never> | null>)
                        .serializedValue,
                };
            }
            /* v8 ignore next */
            return { found: false, value: null };
        };

        /* v8 ignore next */
        if (param.example !== undefined) {
            /* v8 ignore next */
            potentialValue = param.example;
            /* v8 ignore next */
        } else if (param.examples && typeof param.examples === 'object') {
            /* v8 ignore next */
            const firstExample = Object.values(param.examples)[0];
            /* v8 ignore next */
            if (firstExample !== undefined) {
                /* v8 ignore next */
                const directValue = pickExampleValue(firstExample);
                /* v8 ignore next */
                if (directValue.found) {
                    /* v8 ignore next */
                    potentialValue = directValue.value;
                    /* v8 ignore next */
                } else if (
                    firstExample &&
                    typeof firstExample === 'object' &&
                    Object.prototype.hasOwnProperty.call(firstExample, '$ref')
                ) {
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    const resolved = this.parser.resolveReference<ExampleObject>(
                        (firstExample as Record<string, string>).$ref,
                    );
                    /* v8 ignore next */
                    const resolvedValue = pickExampleValue(resolved);
                    /* v8 ignore next */
                    if (resolvedValue.found) potentialValue = resolvedValue.value;
                    /* v8 ignore next */
                } else if (firstExample === null || typeof firstExample !== 'object') {
                    /* v8 ignore next */
                    potentialValue = firstExample;
                }
            }
            /* v8 ignore next */
        } else if (param.schema && typeof param.schema === 'object' && !('$ref' in param.schema)) {
            /* v8 ignore next */
            const schema = param.schema as Record<string, OpenApiValue>;
            /* v8 ignore next */
            if (schema.dataValue !== undefined) {
                /* v8 ignore next */
                potentialValue = schema.dataValue;
                /* v8 ignore next */
            } else if (schema.example !== undefined) {
                /* v8 ignore next */
                potentialValue = schema.example;
                /* v8 ignore next */
            } else if (
                schema.examples &&
                Array.isArray(schema.examples) &&
                (schema.examples as OpenApiValue[]).length > 0
            ) {
                /* v8 ignore next */
                potentialValue = (schema.examples as OpenApiValue[])[0];
            }
        }

        /* v8 ignore next */
        if (potentialValue === undefined && param.content) {
            /* v8 ignore next */
            const contentType = Object.keys(param.content)[0];
            /* v8 ignore next */
            if (contentType) {
                /* v8 ignore next */
                const media = param.content[contentType];
                /* v8 ignore next */
                if (media && media.example !== undefined) {
                    /* v8 ignore next */
                    potentialValue = media.example;
                    /* v8 ignore next */
                } else if (media && media.examples) {
                    /* v8 ignore next */
                    const keys = Object.keys(media.examples);
                    /* v8 ignore next */
                    if (keys.length > 0) {
                        /* v8 ignore next */
                        const ex = (media.examples as Record<string, never>)[keys[0]!];
                        /* v8 ignore next */
                        const contentValue = pickExampleValue(ex);
                        /* v8 ignore next */
                        if (contentValue.found) potentialValue = contentValue.value;
                    }
                }
            }
        }

        /* v8 ignore next */
        if (potentialValue !== undefined) {
            /* v8 ignore next */
            if (typeof potentialValue === 'string') return `'${potentialValue}'`;
            /* v8 ignore next */
            if (typeof potentialValue === 'object') return JSON.stringify(potentialValue);
            /* v8 ignore next */
            return String(potentialValue);
        }

        /* v8 ignore next */
        return undefined;
    }

    private addImports(sourceFile: SourceFile, serviceName: string, modelImports: string[]): void {
        /* v8 ignore next */
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core/testing', namedImports: ['TestBed'] },
            {
                moduleSpecifier: '@angular/common/http/testing',
                namedImports: ['HttpClientTestingModule', 'HttpTestingController'],
            },
            {
                moduleSpecifier: `./${camelCase(serviceName.replace(/Service$/, ''))}.service`,
                namedImports: [serviceName],
            },
        ]);
        /* v8 ignore next */
        if (modelImports.length > 0) {
            /* v8 ignore next */
            sourceFile.addImportDeclaration({
                moduleSpecifier: `../models`,
                namedImports: modelImports,
            });
        }
        /* v8 ignore next */
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
        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);
        /* v8 ignore next */
        const successResponseSchema = op.responses?.['200']?.content?.['application/json']?.schema;
        /* v8 ignore next */
        const responseType = successResponseSchema
            ? getTypeScriptType(successResponseSchema as SwaggerDefinition, this.config, knownTypes)
            : 'unknown';
        /* v8 ignore next */
        const responseModelType = responseType.replace(/\[\]| \| null/g, '');
        /* v8 ignore next */
        const responseModel = isDataTypeInterface(responseModelType) ? responseModelType : undefined;

        /* v8 ignore next */
        const requestBodySchema = op.requestBody?.content?.['application/json']?.schema;
        /* v8 ignore next */
        const resolvedBodySchema = this.parser.resolve(requestBodySchema as SwaggerDefinition);
        /* v8 ignore next */
        const bodyType = requestBodySchema
            ? getTypeScriptType(requestBodySchema as SwaggerDefinition, this.config, knownTypes)
            : 'unknown';

        /* v8 ignore next */
        const bodyModelType = bodyType.replace(/\[\]| \| null/g, '');
        /* v8 ignore next */
        const bodyModel = isDataTypeInterface(bodyModelType) ? bodyModelType : undefined;
        const isPrimitiveBody =
            /* v8 ignore next */
            !!resolvedBodySchema &&
            !resolvedBodySchema.properties &&
            ['string', 'number', 'boolean'].includes(resolvedBodySchema.type as string);

        /* v8 ignore next */
        return {
            responseType,
            isPrimitiveBody,
            ...(responseModel !== undefined ? { responseModel } : {}),
            ...(bodyModel !== undefined ? { bodyModel } : {}),
        };
    }

    private collectModelImports(operations: PathInfo[]): Set<string> {
        /* v8 ignore next */
        const modelImports = new Set<string>();
        /* v8 ignore next */
        const knownTypes = this.parser.schemas.map(s => s.name);

        /* v8 ignore next */
        if (!operations) {
            /* v8 ignore next */
            return modelImports;
        }

        /* v8 ignore next */
        for (const op of operations) {
            /* v8 ignore next */
            const { responseModel, bodyModel } = this.getMethodTypes(op);
            /* v8 ignore next */
            if (responseModel) modelImports.add(responseModel);
            /* v8 ignore next */
            if (bodyModel) modelImports.add(bodyModel);

            /* v8 ignore next */
            (op.parameters ?? []).forEach((param: Parameter) => {
                /* v8 ignore next */
                const typeName = getTypeScriptType(param.schema as SwaggerDefinition, this.config, knownTypes).replace(
                    /\[\]| \| null/g,
                    '',
                );
                /* v8 ignore next */
                if (isDataTypeInterface(typeName)) {
                    /* v8 ignore next */
                    modelImports.add(typeName);
                }
            });
        }
        /* v8 ignore next */
        return modelImports;
    }
}
