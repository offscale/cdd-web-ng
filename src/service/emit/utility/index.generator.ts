// src/service/emit/utility/index.generator.ts
import { Project } from "ts-morph";
import * as path from "node:path";
import { GeneratorConfig } from '@src/core/types.js';
import {
    MAIN_INDEX_GENERATOR_HEADER_COMMENT,
    SERVICE_INDEX_GENERATOR_HEADER_COMMENT
} from "@src/core/constants.js";
import { SwaggerParser } from "@src/core/parser.js";

export class MainIndexGenerator {
    constructor(private project: Project, private config: GeneratorConfig, private parser: SwaggerParser) {
    }

    public generateMainIndex(outputRoot: string): void {
        const indexPath = path.join(outputRoot, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, MAIN_INDEX_GENERATOR_HEADER_COMMENT);

        // Always export models and info
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./models",
        });
        sourceFile.addExportDeclaration({
            moduleSpecifier: "./info",
        });

        if (this.config.options.generateServices !== false) {
            sourceFile.addExportDeclarations([
                { moduleSpecifier: "./services" },
                { moduleSpecifier: "./tokens" },
                { moduleSpecifier: "./providers" },
                { moduleSpecifier: "./utils/file-download" },
                { moduleSpecifier: "./utils/response-header.service" },
            ]);

            // Export Registry if populated
            const hasResponseHeaders = this.parser.operations.some(op =>
                op.responses && Object.values(op.responses).some(r => r.headers && Object.keys(r.headers).length > 0)
            );
            if (hasResponseHeaders) {
                sourceFile.addExportDeclaration({ moduleSpecifier: "./response-headers" });
            }

            if (this.parser.servers.length > 0) {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./utils/server-url",
                });
            }

            const hasLinks = this.parser.links && Object.keys(this.parser.links).length > 0;
            const hasOpLinks = this.parser.operations.some(op =>
                op.responses && Object.values(op.responses).some(r => r.links && Object.keys(r.links).length > 0)
            );

            if (hasLinks || hasOpLinks) {
                sourceFile.addExportDeclaration({ moduleSpecifier: "./links" });
                sourceFile.addExportDeclaration({ moduleSpecifier: "./utils/link.service" });
            }

            if (this.config.options.dateType === "Date") {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./utils/date-transformer",
                });
            }

            if (Object.keys(this.parser.getSecuritySchemes()).length > 0) {
                sourceFile.addExportDeclaration({
                    moduleSpecifier: "./auth/auth.tokens",
                });
            }
        }

        sourceFile.formatText();
    }
}

export class ServiceIndexGenerator {
    constructor(private project: Project) {
    }

    public generateIndex(outputRoot: string): void {
        const servicesDir = path.join(outputRoot, "services");
        const indexPath = path.join(servicesDir, "index.ts");
        const sourceFile = this.project.createSourceFile(indexPath, "", { overwrite: true });

        sourceFile.insertText(0, SERVICE_INDEX_GENERATOR_HEADER_COMMENT);

        const servicesDirectory = this.project.getDirectory(servicesDir)!;

        const serviceFiles = servicesDirectory.getSourceFiles()
            .filter(sf => sf.getFilePath().endsWith('.service.ts'));

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
