// ./src/service/emit/admin/admin.generator.ts

import { Project } from 'ts-morph';
import { posix as path } from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, Resource } from '../../../core/types.js';
import { discoverAdminResources } from './resource-discovery.js';
import { FormComponentGenerator } from './form-component.generator.js';
import { ListComponentGenerator } from './list-component.generator.js';
import { pascalCase } from '../../../core/utils.js';
import customValidatorsTemplate from '../../templates/custom-validators.ts.template';
import { mapSchemaToFormControl, FormControlInfo } from './form-control.mapper.js';

class CustomValidatorsGenerator {
    constructor(private project: Project) { }
    generate(adminDir: string) { /* ... unchanged ... */ }
}

class RoutingGenerator {
    constructor(private project: Project) { }
    /* ... all methods unchanged ... */
}

export class AdminGenerator {
    private allResources: Resource[] = [];

    // *** FIX: Accept generator dependencies in the constructor ***
    constructor(
        private parser: SwaggerParser,
        private project: Project,
        private config: GeneratorConfig,
        private formGen: FormComponentGenerator,
        private listGen: ListComponentGenerator
    ) { }

    async generate(outputRoot: string): Promise<void> {
        console.log("🚀 Generating Admin UI...");
        this.allResources = discoverAdminResources(this.parser);
        if (this.allResources.length === 0) {
            console.warn("⚠️ No resources suitable for admin UI generation were found. Skipping.");
            return;
        }

        const adminDir = path.join(outputRoot, "admin");

        // *** FIX: Do NOT create new instances here. Use the injected ones. ***
        const routeGen = new RoutingGenerator(this.project);
        const validatorGen = new CustomValidatorsGenerator(this.project);

        let needsCustomValidators = false;
        for (const resource of this.allResources) {
            console.log(`  -> Generating for resource: ${resource.name}`);

            if (resource.operations.some(op => op.action === 'list')) {
                // Use the injected list generator
                this.listGen.generate(resource, adminDir);
            }

            if (resource.operations.some(op => ['create', 'update'].includes(op.action))) {
                const formControls = resource.formProperties
                    .map(prop => mapSchemaToFormControl(prop.name, prop.schema))
                    .filter((fc): fc is FormControlInfo => !!fc);

                // Use the injected form generator
                const formResult = this.formGen.generate(resource, formControls, (resource as any).discriminator, (resource as any).oneOfSchemas, adminDir);
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
    }
}
