import { Project, SourceFile } from 'ts-morph';

import * as path from 'node:path';

import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig, Parameter, PathInfo, SwaggerDefinition } from '@src/core/types/index.js';
import {
    camelCase,
    getBasePathTokenName,
    getTypeScriptType,
    isDataTypeInterface,
    pascalCase,
} from "@src/core/utils/index.js";

import { MockDataGenerator } from './mock-data.generator.js';

/**
 * Generates Angular unit tests (*.spec.ts) for the generated API services.
 *
 * This generator creates a suite of tests for each service that:
 * 1. Sets up the Angular TestBed with HttpClientTestingModule.
 * 2. Injects the service and HttpTestingController.
 * 3. Verifies that the service is created.
 * 4. Generates a test case for every operation (method) in the service.
 *    - Mocks the HTTP request.
 *    - Verifies the HTTP method and URL.
 *    - Returns mock data generated from the OpenAPI schema.
 *    - Verifies error handling (404 case).
 */
export class ServiceTestGenerator {
    private mockDataGenerator: MockDataGenerator;

    /**
     * Initializes a new instance of the ServiceTestGenerator.
     * @param parser The parsed OpenAPI specification.
     * @param project The ts-morph Project to write files to.
     * @param config The generation configuration.
     */
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
        private readonly config: GeneratorConfig,
    ) {
        this.mockDataGenerator = new MockDataGenerator(parser);
    }

    /**
     * Generates a single service test file (e.g., `users.service.spec.ts`).
     *
     * @param controllerName The name of the controller/tag (e.g., 'Users').
     * @param operations The list of operations belonging to this controller.
     * @param outputDir The directory to save the file in.
     */
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

    /**
     * Generates individual `describe` and `it` blocks for every operation in the service.
     *
     * @param operations The operations to test.
     * @returns An array of string statements representing the test code.
     * @private
     */
    private generateMethodTests(operations: PathInfo[]): string[] {
        const tests: string[] = [];
        const knownTypes = this.parser.schemas.map(s => s.name);

        for (const op of operations) {
            if (!op.methodName) continue;
            const { responseModel, responseType, bodyModel, isPrimitiveBody } = this.getMethodTypes(op);

            // Prepare mock parameters
            const params = (op.parameters ?? []).map(p => {
                const name = camelCase(p.name);
                const type = getTypeScriptType(p.schema, this.config, knownTypes);
                // Check if the parameter type is a generated model interface
                const modelName = isDataTypeInterface(type.replace(/\[\]| \| null/g, '')) ? type.replace(/\[\]| \| null/g, '') : undefined;
                let value: string;

                if (modelName) {
                    // Generate a full JSON object string for the model
                    value = this.mockDataGenerator.generate(modelName);
                } else {
                    // Use example if available, otherwise fallback to default primitive
                    value = this.getParameterExampleValue(p) ?? this.generateDefaultPrimitiveValue(p.schema);
                }
                return { name, value, type, modelName };
            });

            // Prepare mock request body
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

            // SCENARIO 1: Success
            tests.push(`    it('should return ${responseType} on success', () => {`);

            // Generate mock response data
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
                mockResponseValue = "123";
            } else if (responseType === 'boolean') {
                mockResponseValue = "true";
            }

            tests.push(`      const mockResponse${responseModel ? `: ${responseType}` : ''} = ${mockResponseValue};`);
            tests.push(...declareParams());

            // Use explicit object syntax for subscribe to match stricter test expectations and RxJS best practices
            tests.push(`      service.${op.methodName}(${allArgs.join(', ')}).subscribe({`);
            tests.push(`        next: response => expect(response).toEqual(mockResponse),`);
            tests.push(`        error: err => fail(err)`);
            tests.push(`      });`);

            // Expect HTTP call
            tests.push(`      const req = httpMock.expectOne(\`/api/v1${url}\`);`);
            tests.push(`      expect(req.request.method).toBe('${op.method.toUpperCase()}');`);

            if (bodyParam) {
                // Determine if we match exact body or just truthy
                tests.push(`      expect(req.request.body).toEqual(${bodyParam.name});`);
            }

            tests.push(`      req.flush(mockResponse);`);
            tests.push(`    });`);

            // SCENARIO 2: Error (404)
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

    private generateDefaultPrimitiveValue(schema: SwaggerDefinition | { $ref: string } | undefined): string {
        const resolvedSchema = this.parser.resolve<SwaggerDefinition>(schema);
        if (resolvedSchema && (resolvedSchema.type === 'number' || resolvedSchema.type === 'integer')) {
            return '123';
        } else if (resolvedSchema && resolvedSchema.type === 'boolean') {
            return 'true';
        } else {
            return `'test-value'`;
        }
    }

    // Helper to extract examples from parameters, handling nested OAS structures
    private getParameterExampleValue(param: Parameter): string | undefined {
        let potentialValue: any = undefined;

        // 1. Direct Example (OAS 3.x / Swagger 2.0)
        if (param.example !== undefined) {
            potentialValue = param.example;
        }
        // 2. Examples Map (OAS 3.x) - pick first
        else if (param.examples && typeof param.examples === 'object') {
            const keys = Object.keys(param.examples);
            if (keys.length > 0) {
                const firstExample = param.examples[keys[0]];
                if (firstExample && typeof firstExample === 'object') {
                    // Check if it's an Example Object with a 'value' field
                    if ('value' in firstExample) {
                        potentialValue = firstExample.value;
                    } else if ('$ref' in firstExample) {
                        // Basic Ref resolution if needed, though normally resolved by extractPaths if structure matched
                        // We fallback to just processing it as 'any' if parser resolve fails or isn't deep enough
                        const resolved = this.parser.resolveReference<any>(firstExample.$ref);
                        if (resolved && 'value' in resolved) {
                            potentialValue = resolved.value;
                        }
                    }
                } else {
                    // Literal value fallback (Swagger 2.0 allowed looser maps in some vendor extensions)
                    potentialValue = firstExample;
                }
            }
        }
        // 3. Schema Example (OAS 3.x)
        else if (param.schema && !('$ref' in param.schema)) {
            const schema = param.schema as SwaggerDefinition;
            if (schema.example !== undefined) {
                potentialValue = schema.example;
            } else if (schema.examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
                potentialValue = schema.examples[0];
            }
        }

        // 4. Check Content Map (OAS 3.x Parameter Content)
        if (potentialValue === undefined && param.content) {
            const contentType = Object.keys(param.content)[0];
            if (contentType) {
                const media = param.content[contentType];
                if (media.example !== undefined) {
                    potentialValue = media.example;
                } else if (media.examples) {
                    const keys = Object.keys(media.examples);
                    if (keys.length > 0) {
                        const ex = media.examples[keys[0]];
                        if (ex && typeof ex === 'object' && 'value' in ex) {
                            potentialValue = ex.value;
                        }
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

    /**
     * Adds the necessary import declarations to the test file.
     *
     * @param sourceFile The ts-morph SourceFile object.
     * @param serviceName The name of the service class being tested.
     * @param modelImports A list of model names required by the test.
     * @private
     */
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

    /**
     * Analyzing the operation to determine input/output types and models.
     *
     * @param op The path operation info.
     * @returns Object containing type descriptors for response and body.
     * @private
     */
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

        return {
            responseType,
            isPrimitiveBody,
            ...(responseModel && { responseModel }),
            ...(bodyModel && { bodyModel }),
        };
    }

    /**
     * Scans all operations to find which models need to be imported.
     *
     * @param operations List of operations.
     * @returns A Set of model names.
     * @private
     */
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
