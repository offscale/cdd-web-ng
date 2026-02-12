import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    buildOpenApiSpecFromScan,
    scanTypeScriptProject,
    scanTypeScriptSource,
} from '@src/core/utils/openapi-ast-scanner.js';
import { OAS_3_1_DIALECT } from '@src/core/constants.js';

const tempDirs: string[] = [];

const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdd-web-ng-ast-'));
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

const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures/ast');
const expressFixture = path.join(fixturesDir, 'express.routes.ts');
const decoratedFixture = path.join(fixturesDir, 'decorated.controller.ts');
const ignoredFixture = path.join(fixturesDir, 'ignored.spec.ts');

const copyFixture = (src: string, destDir: string) => {
    const content = fs.readFileSync(src, 'utf-8');
    const dest = path.join(destDir, path.basename(src));
    fs.writeFileSync(dest, content);
};

describe('Core Utils: OpenAPI AST Scanner', () => {
    it('should scan express routes and infer params, tags, and schemas', () => {
        const sourceText = fs.readFileSync(expressFixture, 'utf-8');
        const ir = scanTypeScriptSource(sourceText, expressFixture);
        const noSchemaIr = scanTypeScriptSource(sourceText, expressFixture, { includeSchemas: false });
        expect(noSchemaIr.schemas).toEqual({});

        const getUser = ir.operations.find(op => op.operationId === 'getUser');
        expect(getUser).toBeDefined();
        expect(getUser?.method).toBe('GET');
        expect(getUser?.path).toBe('/users/{id}');
        expect(getUser?.summary).toBe('Get user by id.');
        expect(getUser?.description).toBe('Returns the user payload.');
        expect(getUser?.deprecated).toBe(true);
        expect(getUser?.tags).toEqual(['Users', 'Accounts']);

        const paramKeys = getUser?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(paramKeys).toEqual(
            expect.arrayContaining([
                'path:id',
                'query:search',
                'header:x-token',
                'header:X-Request-Id',
                'cookie:session',
            ]),
        );

        const patchProject = ir.operations.find(op => op.path === '/projects/{projectId}');
        expect(patchProject?.path).toBe('/projects/{projectId}');
        expect(patchProject?.responses[0].contentTypes).toContain('application/xml');

        const messages = ir.operations.find(op => op.path === '/messages');
        expect(messages?.requestBody?.contentTypes).toEqual(['application/json']);
        expect(messages?.responses[0].contentTypes).toEqual(['text/plain']);

        const templated = ir.operations.find(op => op.path === '/{version}/status');
        expect(templated).toBeDefined();

        const arrayOp = ir.operations.find(op => op.path === '/array');
        expect(arrayOp?.method).toBe('PUT');
        expect(arrayOp?.responses[0].contentTypes).toEqual(['text/csv']);

        const boundOp = ir.operations.find(op => op.path === '/bound/{id}');
        const boundParams = boundOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(boundParams).toEqual(expect.arrayContaining(['path:id', 'query:filter']));
        expect(boundOp?.responses[0].contentTypes).toEqual([]);

        const objectOp = ir.operations.find(op => op.path === '/object');
        expect(objectOp?.responses[0].contentTypes).toEqual(['application/json']);

        const removeOp = ir.operations.find(op => op.path === '/remove/{id}');
        expect(removeOp?.responses[0].status).toBe('204');

        const localOp = ir.operations.find(op => op.path === '/local');
        expect(localOp?.summary).toBe('Local handler summary.');
        expect(localOp?.description).toBe('Local handler description.');

        const stringStatusOp = ir.operations.find(op => op.path === '/string-status');
        expect(stringStatusOp?.responses[0].status).toBe('202');

        expect(ir.operations.some(op => op.path === '/literal')).toBe(true);

        const queryOp = ir.operations.find(op => op.path === '/search');
        expect(queryOp?.method).toBe('QUERY');
        const queryParams = queryOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(queryParams).toEqual(expect.arrayContaining(['query:q']));

        const copyOp = ir.operations.find(op => op.path === '/files/{id}');
        expect(copyOp?.method).toBe('COPY');
        const copyParams = copyOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(copyParams).toEqual(expect.arrayContaining(['path:id']));

        expect(ir.schemas).toHaveProperty('CreateMessage');
        expect(ir.schemas).toHaveProperty('MessageStatus');
    });

    it('should scan directories, ignore excluded folders, and allow schema toggle', () => {
        const dir = makeTempDir();
        copyFixture(expressFixture, dir);
        copyFixture(decoratedFixture, dir);
        copyFixture(ignoredFixture, dir);

        const nodeModulesDir = path.join(dir, 'node_modules');
        fs.mkdirSync(nodeModulesDir, { recursive: true });
        fs.writeFileSync(
            path.join(nodeModulesDir, 'ignored.ts'),
            "import express from 'express'; const app = express(); app.get('/node', () => null);",
        );

        const customIgnoreDir = path.join(dir, 'custom-ignore');
        fs.mkdirSync(customIgnoreDir, { recursive: true });
        fs.writeFileSync(
            path.join(customIgnoreDir, 'ignored.ts'),
            "import express from 'express'; const app = express(); app.get('/custom', () => null);",
        );

        const ir = scanTypeScriptProject(dir, fs, { ignoreDirs: ['custom-ignore'] });
        const createOp = ir.operations.find(op => op.operationId === 'create');
        expect(createOp).toBeDefined();
        expect(createOp?.responses[0].status).toBe('201');
        expect(createOp?.requestBody?.contentTypes).toEqual(['application/json']);
        const createParamKeys = createOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(createParamKeys).toEqual(
            expect.arrayContaining(['path:id', 'query:mode', 'header:X-Trace']),
        );
        expect(ir.operations.some(op => op.operationId === 'list')).toBe(true);
        expect(ir.operations.some(op => op.path === '/ignored')).toBe(false);
        expect(ir.operations.some(op => op.path === '/node')).toBe(false);
        expect(ir.operations.some(op => op.path === '/custom')).toBe(false);

        const fileIr = scanTypeScriptProject(path.join(dir, 'express.routes.ts'), fs, { includeSchemas: false });
        expect(fileIr.operations.length).toBeGreaterThan(0);
        expect(fileIr.schemas).toEqual({});
    });

    it('should build an OpenAPI spec from the scan output', () => {
        const sourceText = fs.readFileSync(expressFixture, 'utf-8');
        const ir = scanTypeScriptSource(sourceText, expressFixture);
        const spec = buildOpenApiSpecFromScan(ir, { title: 'AST Scan', version: '1.2.3' });

        expect(spec.openapi).toBe('3.2.0');
        expect(spec.jsonSchemaDialect).toBe(OAS_3_1_DIALECT);
        expect(spec.info.title).toBe('AST Scan');
        expect(spec.info.version).toBe('1.2.3');

        const getUser = (spec.paths as any)['/users/{id}'].get;
        expect(getUser.operationId).toBe('getUser');
        expect(getUser.parameters.some((param: any) => param.name === 'id' && param.in === 'path')).toBe(true);
        expect(getUser.tags).toEqual(['Users', 'Accounts']);
        expect(spec.tags?.map(tag => tag.name)).toEqual(['Users', 'Accounts']);

        const search = (spec.paths as any)['/search'].query;
        expect(search).toBeDefined();

        const copyPath = (spec.paths as any)['/files/{id}'];
        expect(copyPath.additionalOperations?.COPY).toBeDefined();

        const messages = (spec.paths as any)['/messages'].post;
        expect(messages.requestBody.content['application/json']).toBeDefined();
        expect(messages.responses['200'].content['text/plain']).toBeDefined();

        expect(spec.components?.schemas).toHaveProperty('CreateMessage');

        const customSpec = buildOpenApiSpecFromScan(
            {
                operations: [
                    {
                        operationId: 'copyThing',
                        method: 'COPY',
                        path: '/things/{id}',
                        filePath: '/tmp/copy.ts',
                        params: [{ name: 'id', in: 'path', required: true }],
                        requestBody: { required: false, contentTypes: [] },
                        responses: [],
                    },
                    {
                        operationId: 'uploadBinary',
                        method: 'POST',
                        path: '/upload',
                        filePath: '/tmp/upload.ts',
                        params: [],
                        requestBody: {
                            required: true,
                            contentTypes: ['multipart/form-data', 'application/octet-stream', 'application/unknown'],
                        },
                        responses: [{ status: '200', contentTypes: ['application/octet-stream'] }],
                    },
                ],
                schemas: {},
                sources: [],
            },
            { title: 'Custom', version: '0.1.0' },
        );

        const customPath = (customSpec.paths as any)['/things/{id}'];
        expect(customPath.additionalOperations?.COPY).toBeDefined();
        expect(customPath.additionalOperations.COPY.responses['200']).toBeDefined();

        const uploadPath = (customSpec.paths as any)['/upload'].post;
        expect(uploadPath.requestBody.content['multipart/form-data']).toBeDefined();
        expect(uploadPath.requestBody.content['application/octet-stream']).toBeDefined();
    });

    it('should throw when no routes are discovered', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'empty.ts'), 'export const x = 1;');
        expect(() => scanTypeScriptProject(dir, fs)).toThrow(/No route handlers found/);
        expect(() => scanTypeScriptSource('export const x = 1;', '/tmp/empty.ts')).toThrow(
            /No route handlers found/,
        );

        const emptyDir = makeTempDir();
        const ignoredDir = path.join(emptyDir, 'node_modules');
        fs.mkdirSync(ignoredDir, { recursive: true });
        fs.writeFileSync(path.join(ignoredDir, 'ignored.ts'), 'export const y = 2;');
        expect(() => scanTypeScriptProject(emptyDir, fs)).toThrow(/No TypeScript source files found/);

        const badFile = path.join(emptyDir, 'not-source.txt');
        fs.writeFileSync(badFile, 'noop');
        expect(() => scanTypeScriptProject(badFile, fs)).toThrow(/Expected a TypeScript source file/);
    });
});
