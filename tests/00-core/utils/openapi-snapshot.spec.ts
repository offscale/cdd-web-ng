import { describe, expect, it, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { readOpenApiSnapshot, writeOpenApiSnapshot, SNAPSHOT_FILENAMES } from '@src/core/utils/openapi-snapshot.js';
import { SwaggerSpec } from '@src/core/types/index.js';

const tempDirs: string[] = [];

const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdd-web-ng-snap-'));
    tempDirs.push(dir);
    return dir;
};

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
});

describe('Core Utils: OpenAPI Snapshot', () => {
    const baseSpec: SwaggerSpec = {
        openapi: '3.2.0',
        info: { title: 'Snapshot', version: '1.0' },
        paths: {},
    };

    it('should write JSON and YAML snapshot files', () => {
        const dir = makeTempDir();
        const { jsonPath, yamlPath } = writeOpenApiSnapshot(baseSpec, dir, fs);

        expect(fs.existsSync(jsonPath)).toBe(true);
        expect(fs.existsSync(yamlPath)).toBe(true);

        const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
        expect(jsonContent).toContain('"openapi"');
        expect(jsonContent).toContain('"3.2.0"');
    });

    it('should read a snapshot from a directory', () => {
        const dir = makeTempDir();
        writeOpenApiSnapshot(baseSpec, dir, fs);

        const result = readOpenApiSnapshot(dir, fs);
        expect(result.spec.openapi).toBe('3.2.0');
        expect(result.sourcePath).toContain(SNAPSHOT_FILENAMES.json);
    });

    it('should read a snapshot from an explicit JSON file', () => {
        const dir = makeTempDir();
        writeOpenApiSnapshot(baseSpec, dir, fs);

        const jsonPath = path.join(dir, SNAPSHOT_FILENAMES.json);
        const result = readOpenApiSnapshot(jsonPath, fs);
        expect(result.spec.info.version).toBe('1.0');
        expect(result.format).toBe('json');
    });

    it('should read a snapshot from an explicit YAML file', () => {
        const dir = makeTempDir();
        writeOpenApiSnapshot(baseSpec, dir, fs);

        const yamlPath = path.join(dir, SNAPSHOT_FILENAMES.yaml);
        const result = readOpenApiSnapshot(yamlPath, fs);
        expect(result.spec.info.title).toBe('Snapshot');
        expect(result.format).toBe('yaml');
    });

    it('should throw if no snapshot file exists in directory', () => {
        const dir = makeTempDir();
        expect(() => readOpenApiSnapshot(dir, fs)).toThrow(/No OpenAPI snapshot found/);
    });

    it('should throw on unsupported snapshot file extension', () => {
        const dir = makeTempDir();
        const filePath = path.join(dir, 'openapi.snapshot.txt');
        fs.writeFileSync(filePath, 'text');
        expect(() => readOpenApiSnapshot(filePath, fs)).toThrow(/Unsupported snapshot file extension/);
    });
});
