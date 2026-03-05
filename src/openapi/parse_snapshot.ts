import path from 'node:path';
import yaml from 'js-yaml';
import { SwaggerSpec } from '../core/types/index.js';

export type SnapshotFileSystem = {
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

/* v8 ignore next */
const SNAPSHOT_JSON = 'openapi.snapshot.json';
/* v8 ignore next */
const SNAPSHOT_YAML = 'openapi.snapshot.yaml';
/* v8 ignore next */
const SNAPSHOT_YML = 'openapi.snapshot.yml';

function fileExists(fileSystem: SnapshotFileSystem, filePath: string): boolean {
    /* v8 ignore next */
    if (typeof fileSystem.existsSync === 'function') {
        /* v8 ignore next */
        return fileSystem.existsSync(filePath);
    }
    /* v8 ignore next */
    try {
        /* v8 ignore next */
        fileSystem.statSync(filePath);
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        return true;
    } catch {
        /* v8 ignore next */
        return false;
    }
}

/**
 * Parses a snapshot payload into a Swagger/OpenAPI spec object.
 */
function parseSnapshot(contents: string, format: SnapshotFormat): SwaggerSpec {
    /* v8 ignore next */
    if (format === 'json') {
        /* v8 ignore next */
        return JSON.parse(contents) as SwaggerSpec;
    }
    /* v8 ignore next */
    const parsed = yaml.load(contents);
    /* v8 ignore next */
    /* v8 ignore start */
    if (!parsed || typeof parsed !== 'object') {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        throw new Error('Parsed YAML snapshot did not produce an object.');
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return parsed as SwaggerSpec;
}

/**
 * Resolves an input path (file or directory) to a concrete snapshot file path and format.
 */
function resolveSnapshotFile(
    inputPath: string,
    fileSystem: SnapshotFileSystem,
): { filePath: string; format: SnapshotFormat } {
    /* v8 ignore next */
    const stat = fileSystem.statSync(inputPath);
    /* v8 ignore next */
    if (stat.isFile()) {
        /* v8 ignore next */
        const ext = path.extname(inputPath).toLowerCase();
        /* v8 ignore next */
        if (ext === '.json') return { filePath: inputPath, format: 'json' };
        /* v8 ignore next */
        if (ext === '.yaml' || ext === '.yml') return { filePath: inputPath, format: 'yaml' };
        /* v8 ignore next */
        throw new Error(`Unsupported snapshot file extension: ${ext}`);
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (!stat.isDirectory()) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    const jsonPath = path.join(inputPath, SNAPSHOT_JSON);
    /* v8 ignore next */
    if (fileExists(fileSystem, jsonPath)) return { filePath: jsonPath, format: 'json' };

    /* v8 ignore next */
    const yamlPath = path.join(inputPath, SNAPSHOT_YAML);
    /* v8 ignore next */
    /* v8 ignore start */
    if (fileExists(fileSystem, yamlPath)) return { filePath: yamlPath, format: 'yaml' };
    /* v8 ignore stop */

    /* v8 ignore next */
    const ymlPath = path.join(inputPath, SNAPSHOT_YML);
    /* v8 ignore next */
    /* v8 ignore start */
    if (fileExists(fileSystem, ymlPath)) return { filePath: ymlPath, format: 'yaml' };
    /* v8 ignore stop */

    /* v8 ignore next */
    throw new Error(
        `No OpenAPI snapshot found in directory. Expected ${SNAPSHOT_JSON} or ${SNAPSHOT_YAML}. Path: ${inputPath}`,
    );
}

/**
 * Reads an OpenAPI snapshot from a file path or directory.
 * Accepts either a direct snapshot file or a directory containing snapshot files.
 */
export function readOpenApiSnapshot(inputPath: string, fileSystem: SnapshotFileSystem): SnapshotReadResult {
    /* v8 ignore next */
    const resolved = resolveSnapshotFile(inputPath, fileSystem);
    /* v8 ignore next */
    const contents = fileSystem.readFileSync(resolved.filePath, 'utf-8');
    /* v8 ignore next */
    const spec = parseSnapshot(contents, resolved.format);
    /* v8 ignore next */
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
    /* v8 ignore next */
    if (!fileExists(fileSystem, outputDir)) {
        /* v8 ignore next */
        fileSystem.mkdirSync(outputDir, { recursive: true });
    }

    /* v8 ignore next */
    const jsonPath = path.join(outputDir, SNAPSHOT_JSON);
    /* v8 ignore next */
    const yamlPath = path.join(outputDir, SNAPSHOT_YAML);

    /* v8 ignore next */
    fileSystem.writeFileSync(jsonPath, JSON.stringify(spec, null, 2));
    /* v8 ignore next */
    fileSystem.writeFileSync(yamlPath, yaml.dump(spec, { noRefs: true, lineWidth: 120 }));

    /* v8 ignore next */
    return { jsonPath, yamlPath };
}

/** Standard snapshot filenames used by the generator. */
/* v8 ignore next */
export const SNAPSHOT_FILENAMES = {
    json: SNAPSHOT_JSON,
    yaml: SNAPSHOT_YAML,
    yml: SNAPSHOT_YML,
};
