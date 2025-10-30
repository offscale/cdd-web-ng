import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { FormComponentGenerator } from './form-component.generator.ts';
import { ListComponentGenerator } from './list-component.generator.js';
import { RoutingGenerator } from './routing.generator.js'; // <-- FIX: Import the correct generator
import customValidatorsTemplate from '../../templates/custom-validators.ts.template';

class CustomValidatorsGenerator {
    constructor(private project: Project) { }
    generate(adminDir: string) {
        const sharedDir = path.join(adminDir, 'shared');
        this.project.createSourceFile(path.join(sharedDir, 'custom-validators.ts'), customValidatorsTemplate, { overwrite: true });
    }
}

// FIX: The old, inline RoutingGenerator class has been removed.

export class AdminGenerator {
    private allResources: Resource[] = [];

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) { }

    async generate(outputRoot: string): Promise<void> {
        console.log("🚀 Generating Admin UI...");
        this.allResources = discoverAdminResources(this.parser);
        if (this.allResources.length === 0) {
            console.warn("⚠️ No resources suitable for admin UI generation were found. Skipping.");
            return;
        }

        const adminDir = path.join(outputRoot, "admin");

        const formGen = new FormComponentGenerator(this.project);
        const listGen = new ListComponentGenerator(this.project);
        // FIX: This now correctly instantiates the imported RoutingGenerator
        const routeGen = new RoutingGenerator(this.project);
        const validatorGen = new CustomValidatorsGenerator(this.project);

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
            // This now calls the correct generator method
            routeGen.generate(resource, adminDir);
        }

        routeGen.generateMaster(this.allResources, adminDir);

        if (needsCustomValidators) {
            console.log('  -> Generating shared custom validators...');
            validatorGen.generate(adminDir);
        }
    }
}
