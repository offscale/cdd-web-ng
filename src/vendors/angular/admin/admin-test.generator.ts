import { Project } from 'ts-morph';
import * as path from 'node:path';
import { Resource } from '@src/core/types/index.js';
import { camelCase, pascalCase } from '@src/functions/utils.js';

/**
 * Generates the Angular component tests for administrative resources.
 */
export class AdminTestGenerator {
    /**
     * Initializes a new instance of the AdminTestGenerator.
     * @param project The ts-morph project instance.
     */
    constructor(private readonly project: Project) {}

    /**
     * Generates a component test file.
     * @param resource The resource metadata.
     * @param adminDir The directory path where components are located.
     */
    public generate(resource: Resource, adminDir: string): void {
        const hasList = resource.operations.some(op => op.action === 'list');
        const hasForm = resource.isEditable;

        if (hasList) {
            this.generateTestFile(
                adminDir,
                `${camelCase(resource.name)}-list`,
                `${pascalCase(resource.name)}ListComponent`,
            );
        }

        if (hasForm) {
            this.generateTestFile(
                adminDir,
                `${camelCase(resource.name)}-form`,
                `${pascalCase(resource.name)}FormComponent`,
            );
        }
    }

    /**
     * Generates a specific component test file based on component name.
     * @param adminDir The output directory.
     * @param fileName The base file name (without extension).
     * @param componentName The Angular component class name.
     */
    private generateTestFile(adminDir: string, fileName: string, componentName: string): void {
        const testFilePath = path.join(adminDir, `${fileName}.component.spec.ts`);
        const sourceFile = this.project.createSourceFile(testFilePath, '', { overwrite: true });

        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/core/testing',
            namedImports: ['ComponentFixture', 'TestBed'],
        });
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http/testing',
            namedImports: ['HttpTestingController', 'provideHttpClientTesting'],
        });
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: ['provideHttpClient'],
        });
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/platform-browser/animations',
            namedImports: ['NoopAnimationsModule'],
        });
        sourceFile.addImportDeclaration({
            moduleSpecifier: `./${fileName}.component.js`,
            namedImports: [componentName],
        });

        sourceFile.addStatements([
            `describe('${componentName}', () => {`,
            `  let component: ${componentName};`,
            `  let fixture: ComponentFixture<${componentName}>;`,
            ``,
            `  beforeEach(async () => {`,
            `    await TestBed.configureTestingModule({`,
            `      imports: [${componentName}, NoopAnimationsModule],`,
            `      providers: [provideHttpClient(), provideHttpClientTesting()]`,
            `    }).compileComponents();`,
            ``,
            `    fixture = TestBed.createComponent(${componentName});`,
            `    component = fixture.componentInstance;`,
            `    fixture.detectChanges();`,
            `  });`,
            ``,
            `  it('should create', () => {`,
            `    expect(component).toBeTruthy();`,
            `  });`,
            `});`,
        ]);
        sourceFile.formatText();
    }
}
