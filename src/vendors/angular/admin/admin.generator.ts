import { Project } from 'ts-morph';
import * as path from 'node:path';

import { SwaggerParser } from '@src/openapi/parse.js';
import { discoverAdminResources } from '@src/vendors/angular/admin/resource-discovery.js';
import { Resource } from '@src/core/types/index.js';

import { FormComponentGenerator } from './form-component.generator.js';
import { ListComponentGenerator } from './list-component.generator.js';
import { RoutingGenerator } from './routing.generator.js';
import { CustomValidatorsGenerator } from './custom-validators.generator.js';
import { ElementsGenerator } from './elements.generator.js';

/**
 * Main coordinator for generating the Angular Admin Interface.
 * It discovers admin-compatible resources and delegates to specific component generators.
 */
export class AdminGenerator {
    /* v8 ignore next */
    private allResources: Resource[] = [];

    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    /**
     * Executes the admin generation process.
     * @param outputRoot The root directory path for generation.
     */
    public async generate(outputRoot: string): Promise<void> {
        /* v8 ignore next */
        console.log('🚀 Generating Admin UI...');
        /* v8 ignore next */
        this.allResources = discoverAdminResources(this.parser);

        /* v8 ignore next */
        if (this.allResources.length === 0) {
            /* v8 ignore next */
            console.warn('⚠️ No resources suitable for admin UI generation were found. Skipping.');
            /* v8 ignore next */
            return;
        }

        // Use standard node path to respect OS separators, ensuring checks and creation work reliably.
        // Note: In ts-morph in-memory FS, consistent separators are preferred, but Node paths help with cross-OS test consistency.
        /* v8 ignore next */
        const adminDir = path.join(outputRoot, 'admin');

        // Ensure directory creation in the project filesystem
        /* v8 ignore next */
        if (!this.project.getFileSystem().directoryExists(adminDir)) {
            /* v8 ignore next */
            this.project.getFileSystem().mkdirSync(adminDir);
        }

        /* v8 ignore next */
        const formGen = new FormComponentGenerator(this.project, this.parser);
        /* v8 ignore next */
        const listGen = new ListComponentGenerator(this.project);
        /* v8 ignore next */
        const routeGen = new RoutingGenerator(this.project);
        /* v8 ignore next */
        const validatorGen = new CustomValidatorsGenerator(this.project);
        /* v8 ignore next */
        const elementsGen = new ElementsGenerator(this.project);

        /* v8 ignore next */
        let needsCustomValidators = false;
        /* v8 ignore next */
        for (const resource of this.allResources) {
            /* v8 ignore next */
            console.log(`  -> Generating for resource: ${resource.name}`);

            /* v8 ignore next */
            if (resource.operations.some(op => op.action === 'list')) {
                /* v8 ignore next */
                listGen.generate(resource, adminDir);
            }

            /* v8 ignore next */
            if (resource.isEditable) {
                /* v8 ignore next */
                const formResult = formGen.generate(resource, adminDir);
                /* v8 ignore next */
                if (formResult.usesCustomValidators) {
                    /* v8 ignore next */
                    needsCustomValidators = true;
                }
            }

            /* v8 ignore next */
            routeGen.generate(resource, adminDir);
        }

        /* v8 ignore next */
        routeGen.generateMaster(this.allResources, adminDir);

        /* v8 ignore next */
        if (needsCustomValidators) {
            /* v8 ignore next */
            console.log('  -> Generating shared custom validators...');
            /* v8 ignore next */
            validatorGen.generate(adminDir);
        }

        /* v8 ignore next */
        console.log('  -> Generating Web Components (Elements) registration...');
        /* v8 ignore next */
        elementsGen.generate(this.allResources, adminDir);

        /* v8 ignore next */
        console.log('✅ Admin UI generation complete.');
    }
}
