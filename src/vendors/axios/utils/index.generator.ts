import { Project, SourceFile } from 'ts-morph';
import { posix as path } from 'node:path';
import { GeneratorConfig } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Discovers and writes an `index.ts` file aggregating the generated axios services.
 */
export class AxiosServiceIndexGenerator {
    /**
     * Instantiates the Service index generator.
     * @param project The active ts-morph Project AST environment.
     */
    constructor(private project: Project) {}

    /**
     * Executes the generation of the `index.ts` inside the services output folder.
     * @param outputRoot The target directory of the entire operation.
     */
    public generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, 'services');
        const absServicesDir = path.resolve(servicesDir);

        const serviceFiles = this.project.getSourceFiles().filter(sf => {
            const absFileDir = path.resolve(path.dirname(sf.getFilePath()));
            return absFileDir === absServicesDir && sf.getFilePath().endsWith('.service.ts');
        });

        if (serviceFiles.length === 0) return;

        const indexPath = path.join(servicesDir, 'index.ts');
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        for (const serviceFile of serviceFiles) {
            const serviceClass = serviceFile.getClasses()[0];
            const className = serviceClass?.getName();
            if (serviceClass && serviceClass.isExported() && className) {
                const moduleSpecifier = `./${path.basename(serviceFile.getFilePath(), '.ts')}`;
                sourceFile.addExportDeclaration({
                    namedExports: [className],
                    moduleSpecifier,
                });
            }
        }

        sourceFile.formatText();
    }
}

/**
 * Creates the primary `index.ts` export barrel for the resulting SDK package.
 */
export class AxiosMainIndexGenerator {
    /**
     * Constructs the root index file generator for the axios target.
     * @param project The ts-morph AST wrapper.
     * @param config The primary code generator options.
     * @param parser The AST parsed representations of the models.
     */
    constructor(
        private project: Project,
        private config: GeneratorConfig,
        private parser: SwaggerParser,
    ) {}

    /**
     * Constructs and executes generation of the root-level index file.
     * @param outputRoot The fully qualified target directory.
     */
    public generateMainIndex(outputRoot: string): void {
        const indexPath = path.join(outputRoot, 'index.ts');
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        if (this.parser.schemas.length > 0) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './models' });
        }
        if (this.config.options.generateServices ?? true) {
            sourceFile.addExportDeclaration({ moduleSpecifier: './services' });
        }
        sourceFile.addExportDeclaration({ moduleSpecifier: './utils/server-url' });
        sourceFile.addExportDeclaration({ moduleSpecifier: './utils/parameter-serializer' });

        sourceFile.formatText();
    }
}
