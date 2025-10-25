import { Project, SourceFile } from "ts-morph";
import * as path from "node:path";
import { GeneratorConfig } from '../../../core/types.js';
import { MAIN_INDEX_GENERATOR_HEADER_COMMENT, SERVICE_INDEX_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";
import { SwaggerParser } from "../../../core/parser.js";

/**
 * Generates the main `index.ts` barrel file at the root of the output directory.
 * This file serves as the primary entry point for the generated client library.
 */
export class MainIndexGenerator {
    constructor(private project: Project, private config: GeneratorConfig, private parser: SwaggerParser) {}

    public generateMainIndex(outputRoot: string): void {
        const indexPath = path.join(outputRoot, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, MAIN_INDEX_GENERATOR_HEADER_COMMENT);

        // Always export models.
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./models",
            docs: ["Export all generated models (interfaces and enums)."]
        });

        // Conditionally export services and related utilities.
        if (this.config.options.generateServices !== false) {
            sourceFile.addExportDeclarations([
                {
                    moduleSpecifier: "./services",
                    docs: ["Export all generated services."]
                },
                {
                    moduleSpecifier: "./tokens",
                    docs: ["Export all dependency injection tokens."]
                },
                {
                    moduleSpecifier: "./providers",
                    docs: ["Export all provider functions for easy setup."]
                },
                {
                    moduleSpecifier: "./utils/file-download",
                    docs: ["Export file download utilities."]
                },
            ]);

            // Conditionally export the date transformer if it was generated.
            if (this.config.options.dateType === "Date") {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./utils/date-transformer",
                    docs: ["Export the date transformation interceptor and helpers."]
                });
            }

            // Conditionally export auth utilities if security schemes are present.
            if (Object.keys(this.parser.getSecuritySchemes()).length > 0) {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./auth/auth.tokens",
                    docs: ["Export authentication-related injection tokens."]
                });
            }
        }

        sourceFile.formatText();
    }
}

/**
 * Generates the `index.ts` barrel file within the `services` directory.
 * This file exports all generated service classes.
 */
export class ServiceIndexGenerator {
    constructor(private project: Project) {}

    public generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, "services");
        const indexPath = path.join(servicesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        const servicesDirectory = this.project.getDirectory(servicesDir);
        if (!servicesDirectory) {
            // If the directory doesn't exist, it means no services were generated.
            // We still create the empty index file for consistency.
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
