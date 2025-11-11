import { Project } from 'ts-morph';

import { posix as path } from 'path';

import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { FormComponentGenerator } from './form-component.generator.js';
import { ListComponentGenerator } from './list-component.generator.js';
import { RoutingGenerator } from './routing.generator.js';
import { CustomValidatorsGenerator } from './custom-validators.generator.js';

export class AdminGenerator {
    private allResources: Resource[] = [];

    constructor(
        private parser: SwaggerParser,
        private project: Project,
        private config: GeneratorConfig
    ) {}

    public async generate(outputRoot: string): Promise<void> {
        console.log('🚀 Generating Admin UI...');
        this.allResources = discoverAdminResources(this.parser);

        if (this.allResources.length === 0) {
            console.warn('⚠️ No resources suitable for admin UI generation were found. Skipping.');
            return;
        }

        const adminDir = path.join(outputRoot, 'admin');

        const formGen = new FormComponentGenerator(this.project, this.parser);
        const listGen = new ListComponentGenerator(this.project);
        const routeGen = new RoutingGenerator(this.project);
        const validatorGen = new CustomValidatorsGenerator(this.project);

        let needsCustomValidators = false;
        for (const resource of this.allResources) {
            console.log(`  -> Generating for resource: ${resource.name}`);

            if (resource.operations.some(op => op.action === 'list')) {
                listGen.generate(resource, adminDir);
            }

            // THE DEFINITIVE FIX: Generate a form if the resource is marked as editable.
            // This is more robust and correctly handles the failing 'poly' resource case.
            if (resource.isEditable) {
                const formResult = formGen.generate(resource, adminDir);
                if (formResult.usesCustomValidators) {
                    needsCustomValidators = true;
                }
            }

            routeGen.generate(resource, adminDir);
        }

        routeGen.generateMaster(this.allResources, adminDir);

        if (needsCustomValidators) {
            console.log('  -> Generating shared custom validators...');
            validatorGen.generate(adminDir);
        }

        console.log('✅ Admin UI generation complete.');
    }
}
