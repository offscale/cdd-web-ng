import { Project } from 'ts-morph';
import * as path from 'node:path';

import { SwaggerParser } from '@src/openapi/parse.js';
import { discoverAdminResources } from '@src/vendors/angular/admin/resource-discovery.js';
import { Resource } from '@src/core/types/index.js';

import { ListComponentGenerator } from './list-component.generator.js';
import { FormComponentGenerator } from './form-component.generator.js';
import { AppShellGenerator } from './app-shell.generator.js';

export class VanillaAdminGenerator {
    /* v8 ignore next */
    private allResources: Resource[] = [];

    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
    ) {}

    public async generate(outputRoot: string): Promise<void> {
        /* v8 ignore next */
        console.log('🚀 Generating Vanilla Web Components Admin UI...');
        /* v8 ignore next */
        this.allResources = discoverAdminResources(this.parser);

        /* v8 ignore next */
        if (this.allResources.length === 0) {
            /* v8 ignore next */
            console.warn('⚠️ No resources suitable for admin UI generation were found. Skipping.');
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const adminDir = path.join(outputRoot, 'admin');

        /* v8 ignore next */
        /* v8 ignore start */
        if (!this.project.getFileSystem().directoryExists(adminDir)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            this.project.getFileSystem().mkdirSync(adminDir);
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        const listGen = new ListComponentGenerator(this.project);
        /* v8 ignore next */
        const formGen = new FormComponentGenerator(this.project);
        /* v8 ignore next */
        const appShellGen = new AppShellGenerator(this.project);

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
                formGen.generate(resource, adminDir);
            }
        }

        /* v8 ignore next */
        console.log('  -> Generating App Shell (Router & Layout)...');
        /* v8 ignore next */
        appShellGen.generate(this.allResources, adminDir);

        /* v8 ignore next */
        console.log('✅ Vanilla Admin UI generation complete.');
    }
}
