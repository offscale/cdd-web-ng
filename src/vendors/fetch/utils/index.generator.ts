import { Project } from 'ts-morph';
import { posix as path } from 'node:path';
import { GeneratorConfig } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';

/**
 * Discovers and writes an `index.ts` file aggregating the generated fetch services.
 */
export class FetchServiceIndexGenerator {
    /**
     * Instantiates the Service index generator.
     * @param project The active ts-morph Project AST environment.
     */
    /* v8 ignore next */
    constructor(private project: Project) {}

    /**
     * Executes the generation of the `index.ts` inside the services output folder.
     * @param outputRoot The target directory of the entire operation.
     */
    public generateIndex(outputRoot: string): void {
        /* v8 ignore next */
        const servicesDir = path.join(outputRoot, 'services');
        /* v8 ignore next */
        const absServicesDir = path.resolve(servicesDir);

        /* v8 ignore next */
        const serviceFiles = this.project.getSourceFiles().filter(sf => {
            /* v8 ignore next */
            const absFileDir = path.resolve(path.dirname(sf.getFilePath()));
            /* v8 ignore next */
            return absFileDir === absServicesDir && sf.getFilePath().endsWith('.service.ts');
        });

        /* v8 ignore next */
        if (serviceFiles.length === 0) return;

        /* v8 ignore next */
        const indexPath = path.join(servicesDir, 'index.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        /* v8 ignore next */
        for (const serviceFile of serviceFiles) {
            /* v8 ignore next */
            const serviceClass = serviceFile.getClasses()[0];
            /* v8 ignore next */
            const className = serviceClass?.getName();
            /* v8 ignore next */
            if (serviceClass && serviceClass.isExported() && className) {
                /* v8 ignore next */
                const moduleSpecifier = `./${path.basename(serviceFile.getFilePath(), '.ts')}`;
                /* v8 ignore next */
                sourceFile.addExportDeclaration({
                    namedExports: [className],
                    moduleSpecifier,
                });
            }
        }

        /* v8 ignore next */
        sourceFile.formatText();
    }
}

/**
 * Creates the primary `index.ts` export barrel for the resulting SDK package.
 */
export class FetchMainIndexGenerator {
    /**
     * Constructs the root index file generator for the fetch target.
     * @param project The ts-morph AST wrapper.
     * @param config The primary code generator options.
     * @param parser The AST parsed representations of the models.
     */
    constructor(
        /* v8 ignore next */
        private project: Project,
        /* v8 ignore next */
        private config: GeneratorConfig,
        /* v8 ignore next */
        private parser: SwaggerParser,
    ) {}

    /**
     * Constructs and executes generation of the root-level index file.
     * @param outputRoot The fully qualified target directory.
     */
    public generateMainIndex(outputRoot: string): void {
        /* v8 ignore next */
        const indexPath = path.join(outputRoot, 'index.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(indexPath, '', { overwrite: true });

        /* v8 ignore next */
        if (this.parser.schemas.length > 0) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './models' });
        }
        /* v8 ignore next */
        if (this.config.options.generateServices ?? true) {
            /* v8 ignore next */
            sourceFile.addExportDeclaration({ moduleSpecifier: './services' });
        }
        /* v8 ignore next */
        sourceFile.addExportDeclaration({ moduleSpecifier: './utils/server-url' });
        /* v8 ignore next */
        sourceFile.addExportDeclaration({ moduleSpecifier: './utils/parameter-serializer' });

        /* v8 ignore next */
        sourceFile.formatText();
    }
}
