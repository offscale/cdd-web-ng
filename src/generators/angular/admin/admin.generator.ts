import { Project } from 'ts-morph';
import * as path from 'node:path';

import { SwaggerParser } from '@src/core/parser.js';
import { discoverAdminResources } from '@src/generators/angular/admin/resource-discovery.js';
import { Resource } from '@src/core/types/index.js';

import { FormComponentGenerator } from './form-component.generator.js';
import { ListComponentGenerator } from './list-component.generator.js';
import { RoutingGenerator } from './routing.generator.js';
import { CustomValidatorsGenerator } from './custom-validators.generator.js';

/**
 * Main coordinator for generating the Angular Admin Interface.
 * It discovers admin-compatible resources and delegates to specific component generators.
 */
export class AdminGenerator {
    private allResources: Resource[] = [];

    constructor(
        private parser: SwaggerParser,
        private project: Project,
    ) {}

    /**
     * Executes the admin generation process.
     * @param outputRoot The root directory path for generation.
     */
    public async generate(outputRoot: string): Promise<void> {
        console.log('🚀 Generating Admin UI...');
        this.allResources = discoverAdminResources(this.parser);

        if (this.allResources.length === 0) {
            console.warn('⚠️ No resources suitable for admin UI generation were found. Skipping.');
            return;
        }

        // Use standard node path to respect OS separators, ensuring checks and creation work reliably.
        // Note: In ts-morph in-memory FS, consistent separators are preferred, but Node paths help with cross-OS test consistency.
        const adminDir = path.join(outputRoot, 'admin');

        // Ensure directory creation in the project filesystem
        if (!this.project.getFileSystem().directoryExists(adminDir)) {
            this.project.getFileSystem().mkdirSync(adminDir);
        }

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
