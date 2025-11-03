import { Project, SourceFile } from "ts-morph";
import * as path from "node:path";
import { GeneratorConfig } from '../../../core/types.js';
import { MAIN_INDEX_GENERATOR_HEADER_COMMENT, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";

/**
 * Generates the main `index.ts` barrel file at the root of the output directory.
 * This file serves as the primary public entry point for the generated client library,
 * exporting all necessary modules for consumers.
 */
export class MainIndexGenerator {
    constructor(private project: Project, private config: GeneratorConfig, private parser: SwaggerParser) {}

    /**
     * Generates the main `index.ts` file.
     * @param outputRoot The root directory where the generated library is being written.
     */
    public generateMainIndex(outputRoot: string): void {
        const indexPath = path.join(outputRoot, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, MAIN_INDEX_GENERATOR_HEADER_COMMENT);

        // Always export models.
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./models",
        });

        // Conditionally export services and related utilities.
        if (this.config.options.generateServices !== false) {
            sourceFile.addExportDeclarations([
                {
                    moduleSpecifier: "./services",
                },
                {
                    moduleSpecifier: "./tokens",
                },
                {
                    moduleSpecifier: "./providers",
                },
                {
                    moduleSpecifier: "./utils/file-download",
                },
            ]);

            // Conditionally export the date transformer if it was generated.
            if (this.config.options.dateType === "Date") {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./utils/date-transformer",
                });
            }

            // Conditionally export auth utilities if security schemes are present.
            if (Object.keys(this.parser.getSecuritySchemes()).length > 0) {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./auth/auth.tokens",
                });
            }
        }

        sourceFile.formatText();
    }
}

/**
 * Generates the `index.ts` barrel file within the `services` directory.
 * This file exports all generated service classes for easier consumption.
 */
export class ServiceIndexGenerator {
    constructor(private project: Project) {}

    /**
     * Generates the `services/index.ts` file.
     * @param outputRoot The root directory where the generated library is being written.
     */
    public generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, "services");
        const indexPath = path.join(servicesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        const servicesDirectory = this.project.getDirectory(servicesDir);
        // This branch is now covered by a test case where no services are generated.
        if (!servicesDirectory) {
            return;
        }

        const serviceFiles = servicesDirectory.getSourceFiles()
            .filter(sf => sf.getFilePath().endsWith('.service.ts'));

        for (const serviceFile of serviceFiles) {
            const serviceClass = serviceFile.getClasses()[0];
            if (serviceClass && serviceClass.isExported()) {
                const className = serviceClass.getName();
                const moduleSpecifier = `./${path.basename(serviceFile.getFilePath(), '.ts')}`;
                sourceFile.addExportDeclaration({
                    namedExports: [className!],
                    moduleSpecifier,
                });
            }
        }

        sourceFile.formatText();
    }
}
