import { describe, expect, it } from 'vitest';
import { SwaggerParser } from '@src/core/parser.js';
import { SpecSnapshotGenerator } from '@src/generators/shared/spec-snapshot.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types/index.js';

const snapshotSpec: SwaggerSpec = {
    openapi: '3.2.0',
    info: { title: 'Snapshot', version: '1.0' },
    paths: {},
};

describe('Emitter: SpecSnapshotGenerator', () => {
    it('should emit JSON and YAML snapshot files', async () => {
        const project = createTestProject();
        const config: GeneratorConfig = {
            input: '',
            output: '/out',
            options: { dateType: 'string', enumStyle: 'enum', generateServices: true },
        } as any;
        const parser = new SwaggerParser(snapshotSpec, config);

        new SpecSnapshotGenerator(parser, project).generate('/out');

        const fs = project.getFileSystem();
        const jsonPath = '/out/openapi.snapshot.json';
        const yamlPath = '/out/openapi.snapshot.yaml';

        expect(await fs.fileExists(jsonPath)).toBe(true);
        expect(await fs.fileExists(yamlPath)).toBe(true);

        const jsonPayload = fs.readFileSync(jsonPath);
        const parsed = JSON.parse(jsonPayload);
        expect(parsed.openapi).toBe('3.2.0');
        expect(parsed.info.title).toBe('Snapshot');
    });
});
