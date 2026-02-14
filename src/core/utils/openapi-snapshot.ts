import path from 'node:path';
import yaml from 'js-yaml';
import { SwaggerSpec } from '../types/index.js';

type SnapshotFileSystem = {
    existsSync?: (filePath: string) => boolean;
    mkdirSync: (dirPath: string, options?: { recursive?: boolean }) => void;
    writeFileSync: (filePath: string, data: string) => void;
    readFileSync: (filePath: string, encoding: string) => string;
    statSync: (filePath: string) => { isFile: () => boolean; isDirectory: () => boolean };
};

/** Supported snapshot serialization formats. */
export type SnapshotFormat = 'json' | 'yaml';

/** Result returned by snapshot reader functions. */
export type SnapshotReadResult = {
    spec: SwaggerSpec;
    sourcePath: string;
    format: SnapshotFormat;
};

const SNAPSHOT_JSON = 'openapi.snapshot.json';
const SNAPSHOT_YAML = 'openapi.snapshot.yaml';
const SNAPSHOT_YML = 'openapi.snapshot.yml';

function fileExists(fileSystem: SnapshotFileSystem, filePath: string): boolean {
    if (typeof fileSystem.existsSync === 'function') {
        return fileSystem.existsSync(filePath);
    }
    try {
        fileSystem.statSync(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * Parses a snapshot payload into a Swagger/OpenAPI spec object.
 */
function parseSnapshot(contents: string, format: SnapshotFormat): SwaggerSpec {
    if (format === 'json') {
        return JSON.parse(contents) as SwaggerSpec;
    }
    const parsed = yaml.load(contents);
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Parsed YAML snapshot did not produce an object.');
    }
    return parsed as SwaggerSpec;
}

/**
 * Resolves an input path (file or directory) to a concrete snapshot file path and format.
 */
function resolveSnapshotFile(
    inputPath: string,
    fileSystem: SnapshotFileSystem,
): { filePath: string; format: SnapshotFormat } {
    const stat = fileSystem.statSync(inputPath);
    if (stat.isFile()) {
        const ext = path.extname(inputPath).toLowerCase();
        if (ext === '.json') return { filePath: inputPath, format: 'json' };
        if (ext === '.yaml' || ext === '.yml') return { filePath: inputPath, format: 'yaml' };
        throw new Error(`Unsupported snapshot file extension: ${ext}`);
    }

    if (!stat.isDirectory()) {
        throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
    }

    const jsonPath = path.join(inputPath, SNAPSHOT_JSON);
    if (fileExists(fileSystem, jsonPath)) return { filePath: jsonPath, format: 'json' };

    const yamlPath = path.join(inputPath, SNAPSHOT_YAML);
    if (fileExists(fileSystem, yamlPath)) return { filePath: yamlPath, format: 'yaml' };

    const ymlPath = path.join(inputPath, SNAPSHOT_YML);
    if (fileExists(fileSystem, ymlPath)) return { filePath: ymlPath, format: 'yaml' };

    throw new Error(
        `No OpenAPI snapshot found in directory. Expected ${SNAPSHOT_JSON} or ${SNAPSHOT_YAML}. Path: ${inputPath}`,
    );
}

/**
 * Reads an OpenAPI snapshot from a file path or directory.
 * Accepts either a direct snapshot file or a directory containing snapshot files.
 */
export function readOpenApiSnapshot(inputPath: string, fileSystem: SnapshotFileSystem): SnapshotReadResult {
    const resolved = resolveSnapshotFile(inputPath, fileSystem);
    const contents = fileSystem.readFileSync(resolved.filePath, 'utf-8');
    const spec = parseSnapshot(contents, resolved.format);
    return { spec, sourcePath: resolved.filePath, format: resolved.format };
}

/**
 * Writes OpenAPI snapshot files (JSON and YAML) to an output directory.
 */
export function writeOpenApiSnapshot(
    spec: SwaggerSpec,
    outputDir: string,
    fileSystem: SnapshotFileSystem,
): { jsonPath: string; yamlPath: string } {
    if (!fileExists(fileSystem, outputDir)) {
        fileSystem.mkdirSync(outputDir, { recursive: true });
    }

    const jsonPath = path.join(outputDir, SNAPSHOT_JSON);
    const yamlPath = path.join(outputDir, SNAPSHOT_YAML);

    fileSystem.writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
    fileSystem.writeFileSync(yamlPath, yaml.dump(spec, { noRefs: true, lineWidth: 120 }));

    return { jsonPath, yamlPath };
}

/** Standard snapshot filenames used by the generator. */
export const SNAPSHOT_FILENAMES = {
    json: SNAPSHOT_JSON,
    yaml: SNAPSHOT_YAML,
    yml: SNAPSHOT_YML,
};
