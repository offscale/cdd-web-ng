import * as path from 'path';
import { Project, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, PathInfo, SwaggerDefinition } from '../../../core/types.js';
import {
    camelCase,
    pascalCase,
    getBasePathTokenName,
    isDataTypeInterface,
    getTypeScriptType,
} from '../../../core/utils.js';
import { MockDataGenerator } from './mock-data.generator.js';

/**
 * Generates Angular service test files (`.spec.ts`) for each generated service.
 * This class creates a standard Angular testing setup with `TestBed`, mocks for `HttpClient`,
 * and generates `describe` and `it` blocks for each service method, covering both
 * success and error scenarios.
 */
export class ServiceTestGenerator {
    private mockDataGenerator: MockDataGenerator;

    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
        private readonly config: GeneratorConfig,
    ) {
        this.mockDataGenerator = new MockDataGenerator(parser);
    }

    /**
     * Generates a complete test file for a single service (controller).
     * @param controllerName The PascalCase name of the controller (e.g., 'Users').
     * @param operations The list of operations belonging to this controller.
     * @param outputDir The directory where the `services` folder is located.
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
     * Generates the `describe` and `it` blocks for each method in a service.
     * @param operations The operations to generate tests for.
     * @returns An array of strings, each representing a line in the generated test file.
     * @private
     */
    private generateMethodTests(operations: PathInfo[]): string[] {
        const tests: string[] = [];
        for (const op of operations) {
            if (!op.methodName) continue;

            const { responseModel, responseType, bodyModel } = this.getMethodTypes(op);
            const params = op.parameters?.map(p => {
                // FIX: Check the 'type' property safely by casting.
                const schema = p.schema as SwaggerDefinition;
                const isNumeric = schema?.type === 'number' || schema?.type === 'integer';
                return {
                    name: camelCase(p.name),
                    value: isNumeric ? '123' : `'test-${p.name}'`,
                };
            }) ?? [];
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
                const singleMock = this.mockDataGenerator.generate(responseModel);
                const isArray = responseType.endsWith('[]');
                const mockResponse = isArray ? `[${singleMock}]` : singleMock;
                tests.push(`      const mockResponse: ${responseType} = ${mockResponse};`);
            } else {
                tests.push(`      const mockResponse = null;`);
            }
            if (bodyParam?.model) {
                const mockBody = this.mockDataGenerator.generate(bodyParam.model);
                tests.push(`      const ${bodyParam.name}: ${bodyParam.model} = ${mockBody};`);
            } else if (bodyParam) {
                tests.push(`      const ${bodyParam.name} = { data: 'test-body' };`);
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
                tests.push(`      const ${bodyParam.name} = { data: 'test-body' };`);
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

    /**
     * Adds all necessary import statements to the test file.
     * @param sourceFile The ts-morph SourceFile object.
     * @param serviceName The name of the service class being tested.
     * @param modelImports A list of model names that need to be imported.
     */
    private addImports(sourceFile: SourceFile, serviceName: string, modelImports: string[]): void {
        sourceFile.addImportDeclarations([
            { moduleSpecifier: '@angular/core/testing', namedImports: ['TestBed'] },
            { moduleSpecifier: '@angular/common/http/testing', namedImports: ['HttpClientTestingModule', 'HttpTestingController'] },
            { moduleSpecifier: `./${camelCase(serviceName.replace(/Service$/, ''))}.service`, namedImports: [serviceName] },
            { moduleSpecifier: `../models`, namedImports: modelImports.length > 0 ? modelImports : [] },
            { moduleSpecifier: '../tokens', namedImports: [getBasePathTokenName(this.config.clientName)] },
        ]);
    }

    /**
     * Extracts the TypeScript type names for a method's response and request body.
     * @param op The operation to analyze.
     * @returns An object containing the model names for the response and body, if they are complex types.
     * @private
     */
    private getMethodTypes(op: PathInfo): { responseModel?: string, responseType: string, bodyModel?: string } {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const successResponseSchema = op.responses?.['200']?.content?.['application/json']?.schema;
        const responseType = successResponseSchema ? getTypeScriptType(successResponseSchema as any, this.config, knownTypes) : 'any';
        const responseModelType = responseType.replace(/\[\]| \| null/g, '');
        const responseModel = isDataTypeInterface(responseModelType) ? responseModelType : undefined;

        const requestBodySchema = op.requestBody?.content?.['application/json']?.schema;
        const bodyType = requestBodySchema ? getTypeScriptType(requestBodySchema as any, this.config, knownTypes) : 'any';
        const bodyModelType = bodyType.replace(/\[\]| \| null/g, '');
        const bodyModel = isDataTypeInterface(bodyModelType) ? bodyModelType : undefined;

        return { responseModel, responseType, bodyModel };
    }

    /**
     * Scans all operations for a service to collect a unique set of model names that need to be imported.
     * @param operations The list of operations for the service.
     * @returns A Set containing the names of all required model imports.
     * @private
     */
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
