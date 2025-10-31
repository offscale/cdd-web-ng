import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { FormComponentGenerator } from './form-component.generator.js';
import { ListComponentGenerator } from './list-component.generator.js';
import { RoutingGenerator } from './routing.generator.js';
import { CustomValidatorsGenerator } from './custom-validators.generator.js'; // <-- Correctly import the standalone generator

/**
 * Main orchestrator for generating the entire Admin UI feature.
 * It discovers resources, then iterates through them, calling specialized generators
 * for list components, form components, and routing modules.
 */
export class AdminGenerator {
    private allResources: Resource[] = [];

    constructor(
        private parser: SwaggerParser,
        private project: Project,
        private config: GeneratorConfig
    ) {}

    public async generate(outputRoot: string): Promise<void> {
        console.log("🚀 Generating Admin UI...");
        this.allResources = discoverAdminResources(this.parser);

        if (this.allResources.length === 0) {
            console.warn("⚠️ No resources suitable for admin UI generation were found. Skipping.");
            return;
        }

        const adminDir = path.join(outputRoot, "admin");

        // Instantiate all necessary generators
        const formGen = new FormComponentGenerator(this.project);
        const listGen = new ListComponentGenerator(this.project);
        const routeGen = new RoutingGenerator(this.project);
        const validatorGen = new CustomValidatorsGenerator(this.project); // <-- Instantiate the imported generator

        let needsCustomValidators = false;
        for (const resource of this.allResources) {
            console.log(`  -> Generating for resource: ${resource.name}`);

            if (resource.operations.some(op => op.action === 'list')) {
                listGen.generate(resource, adminDir);
            }

            if (resource.operations.some(op => ['create', 'update'].includes(op.action))) {
                const formResult = formGen.generate(resource, adminDir);
                if (formResult.usesCustomValidators) {
                    needsCustomValidators = true;
                }
            }

            routeGen.generate(resource, adminDir);
        }

        // Generate the master routing file for the admin module
        routeGen.generateMaster(this.allResources, adminDir);

        // Conditionally generate the custom validators file only if needed
        if (needsCustomValidators) {
            console.log('  -> Generating shared custom validators...');
            validatorGen.generate(adminDir);
        }

        console.log('✅ Admin UI generation complete.');
    }
}
