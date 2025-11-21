import { Project } from "ts-morph";
import { SwaggerParser } from "../core/parser.js";
import { GeneratorConfig, SwaggerSpec } from "../core/types.js";

// Utility Generators
import { CallbackGenerator } from "./emit/utility/callback.generator.js";
import { WebhookGenerator } from "./emit/utility/webhook.generator.js";
import { LinkGenerator } from "./emit/utility/link.generator.js";
import { DiscriminatorGenerator } from "./emit/utility/discriminator.generator.js";
import { SecurityGenerator } from "./emit/utility/security.generator.js";
import { ServerGenerator } from "./emit/utility/server.generator.js";
import { TagGenerator } from "./emit/utility/tag.generator.js";

// Core Generators
import { TypeGenerator } from "./emit/type/type.generator.js";
import { ServiceGenerator } from "./emit/service/service.generator.js";
import { groupPathsByController } from "./parse.js";
import { posix as path } from "node:path";

/**
 * The Main Orchestrator for the OpenAPI Generator.
 * Initializes the parser, project, and runs all sub-generators to produce the full output.
 */
export class OpenApiGenerator {
    private readonly parser: SwaggerParser;
    private readonly project: Project;

    constructor(
        spec: SwaggerSpec,
        private readonly config: GeneratorConfig
    ) {
        this.parser = new SwaggerParser(spec, config);
        this.project = new Project({
            compilerOptions: {
                target: 99, // ESNext
                module: 1, // CommonJS
                declaration: true,
                sourceMap: false,
                strict: true
            }
        });
    }

    /**
     * Executes the generation pipeline.
     */
    public async generate(): Promise<void> {
        const { output } = this.config;

        // 1. Core Entities
        // Generate Models (Types/Interfaces)
        await this.runSafe(new TypeGenerator(this.parser, this.project, this.config), output);

        // Generate Services
        // Note: ServiceGenerator requires grouping paths by controller first
        const servicesDir = path.join(output, 'services');
        const controllerGroups = groupPathsByController(this.parser);
        const serviceGen = new ServiceGenerator(this.parser, this.project, this.config);

        for (const [controllerName, operations] of Object.entries(controllerGroups)) {
            serviceGen.generateServiceFile(controllerName, operations, servicesDir);
        }

        // 2. Utility / Metadata Registries
        // These generators create standalone TS files used for runtime metadata
        new CallbackGenerator(this.parser, this.project).generate(output);
        new WebhookGenerator(this.parser, this.project).generate(output);
        new LinkGenerator(this.parser, this.project).generate(output);
        new DiscriminatorGenerator(this.parser, this.project).generate(output);
        new SecurityGenerator(this.parser, this.project).generate(output);
        new ServerGenerator(this.parser, this.project).generate(output);
        new TagGenerator(this.parser, this.project).generate(output);

        // 3. Finalize
        // Emits all creating source files to the file system
        await this.project.save();
    }

    /**
     * Helper to run a generator safely.
     * Detects if the generator supports sync or async execution.
     */
    private async runSafe(generator: any, output: string): Promise<void> {
        if (generator && typeof generator.generate === 'function') {
            const result = generator.generate(output);
            if (result instanceof Promise) {
                await result;
            }
        }
    }
}
