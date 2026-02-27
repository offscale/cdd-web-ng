import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildOpenApiSpecFromScan, scanTypeScriptProject, scanTypeScriptSource } from '@src/functions/parse.js';
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
const querystringExampleFixture = path.join(fixturesDir, 'querystring.examples.ts');

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

        const typedMessages = ir.operations.find(op => op.path === '/typed-messages');
        expect(typedMessages?.responses[0].status).toBe('201');
        expect(typedMessages?.requestBody?.schema).toEqual({
            $ref: '#/components/schemas/CreateMessageBody',
        });
        expect(typedMessages?.responses[0].schema).toEqual({
            $ref: '#/components/schemas/MessageReceipt',
        });

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

        const rawQueryOp = ir.operations.find(op => op.path === '/raw-query');
        const rawQueryParams = rawQueryOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(rawQueryParams).toEqual(expect.arrayContaining(['querystring:rawQuery']));

        const copyOp = ir.operations.find(op => op.path === '/files/{id}');
        expect(copyOp?.method).toBe('COPY');
        const copyParams = copyOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(copyParams).toEqual(expect.arrayContaining(['path:id']));

        const secureOp = ir.operations.find(op => op.path === '/secure');
        expect(secureOp?.externalDocs).toEqual({
            url: 'https://example.com/secure',
            description: 'Secure docs',
        });
        expect(secureOp?.servers).toEqual([
            {
                url: 'https://api.example.com/v2',
                description: 'Production',
                name: 'prod',
                variables: { version: { default: 'v2' } },
            },
            { url: 'https://staging.example.com/v2', description: 'Staging' },
        ]);
        expect(secureOp?.security).toEqual([{ ApiKey: [] }, { OAuth2: ['read:items', 'write:items'] }]);
        expect(secureOp?.extensions).toEqual({ 'x-feature-flag': 'beta' });

        const documentedOp = ir.operations.find(op => op.path === '/documented/{id}');
        expect(documentedOp?.operationId).toBe('fetchDocumented');
        const documentedId = documentedOp?.params.find(param => param.in === 'path' && param.name === 'id');
        expect(documentedId?.description).toBe('Documented id.');
        const documented202 = documentedOp?.responses.find(response => response.status === '202');
        expect(documented202?.summary).toBe('Accepted summary');
        expect(documented202?.description).toBe('Accepted payload');
        expect(documented202?.contentTypes).toEqual(expect.arrayContaining(['application/json']));
        const documented404 = documentedOp?.responses.find(response => response.status === '404');
        expect(documented404?.description).toBe('Not found');
        expect(documented404?.contentTypes).toEqual(expect.arrayContaining(['text/plain']));

        expect(ir.schemas).toHaveProperty('CreateMessage');
        expect(ir.schemas).toHaveProperty('MessageStatus');
    });

    it('should apply JSDoc example tags to params, request bodies, and responses', () => {
        const sourceText = `
const app = { post: (..._args: any[]) => { void _args; } };
/**
 * Create user.
 * @paramExample id 123
 * @requestExample application/json {"name":"Ada"}
 * @responseExample 200 application/json {"id":123,"name":"Ada"}
 */
function createUser(req: any, res: any) {
  const { id } = req.params;
  const body = req.body;
  res.status(200).json({ id, body });
}
app.post('/users/:id', createUser);
`;
        const ir = scanTypeScriptSource(sourceText, '/virtual.ts');
        const spec = buildOpenApiSpecFromScan(ir);
        // type-coverage:ignore-next-line
        const createUser = (spec.paths as any)['/users/{id}'].post;
        // type-coverage:ignore-next-line
        const idParam = createUser.parameters.find((param: any) => param.name === 'id');
        // type-coverage:ignore-next-line
        expect(idParam?.example).toBe(123);
        // type-coverage:ignore-next-line
        expect(createUser.requestBody.content['application/json'].example).toEqual({ name: 'Ada' });
        // type-coverage:ignore-next-line
        expect(createUser.responses['200'].content['application/json'].example).toEqual({ id: 123, name: 'Ada' });
    });

    it('should preserve wrapped serialized/external examples from JSDoc tags', () => {
        const sourceText = `
const app = { post: (..._args: any[]) => { void _args; }, get: (..._args: any[]) => { void _args; } };
/**
 * Return plain text.
 * @response 200 text/plain OK
 * @responseExample 200 text/plain {"__oasExample":{"serializedValue":"OK"}}
 */
function getPlain(req: any, res: any) {
  res.status(200).send('OK');
}
app.get('/plain', getPlain);

/**
 * Send plain text.
 * @requestExample text/plain {"__oasExample":{"externalValue":"./examples/request.txt"}}
 */
function postPlain(req: any, res: any) {
  if (req.is('text/plain')) { /* noop */ }
  const body = req.body;
  res.status(204).send();
}
app.post('/plain', postPlain);
`;
        const ir = scanTypeScriptSource(sourceText, '/virtual.ts');
        const spec = buildOpenApiSpecFromScan(ir);

        // type-coverage:ignore-next-line
        const getPlain = (spec.paths as any)['/plain'].get;
        // type-coverage:ignore-next-line
        const responseContent = getPlain.responses['200']?.content?.['text/plain'];
        // type-coverage:ignore-next-line
        expect(responseContent?.example).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(responseContent?.examples?.example?.serializedValue).toBe('OK');

        // type-coverage:ignore-next-line
        const postPlain = (spec.paths as any)['/plain'].post;
        // type-coverage:ignore-next-line
        const requestContent = postPlain.requestBody?.content?.['text/plain'];
        // type-coverage:ignore-next-line
        expect(requestContent?.example).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(requestContent?.examples?.example?.externalValue).toBe('./examples/request.txt');
    });

    it('should preserve wrapped examples for querystring content parameters (fixture)', () => {
        const sourceText = fs.readFileSync(querystringExampleFixture, 'utf-8');
        const ir = scanTypeScriptSource(sourceText, querystringExampleFixture);
        const spec = buildOpenApiSpecFromScan(ir);

        // type-coverage:ignore-next-line
        const rawQuery = (spec.paths as any)['/raw-query-example'].get;
        // type-coverage:ignore-next-line
        const param = rawQuery.parameters.find((entry: any) => entry.in === 'querystring');
        // type-coverage:ignore-next-line
        const content = param?.content?.['application/x-www-form-urlencoded'];
        // type-coverage:ignore-next-line
        expect(content?.example).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(content?.examples?.example?.serializedValue).toBe('foo=bar&baz=qux');
        // type-coverage:ignore-next-line
        expect(content?.encoding).toEqual({ tags: { style: 'pipeDelimited', explode: false } });
    });

    it('should apply JSDoc paramSchema overrides', () => {
        const sourceText = `
const app = { get: (..._args: any[]) => { void _args; } };
/**
 * Fetch a resource.
 * @paramSchema id {"type":"string","format":"uuid"}
 * @paramSchema search string
 * @paramSchema filter Filter
 */
function fetchResource(req: any, res: any) {
  const { id } = req.params;
  const search = req.query.search;
  const filter = req.query.filter;
  res.status(200).json({ id, search, filter });
}
app.get('/resources/:id', fetchResource);
`;
        const ir = scanTypeScriptSource(sourceText, '/virtual.ts');
        const spec = buildOpenApiSpecFromScan(ir);
        // type-coverage:ignore-next-line
        const op = (spec.paths as any)['/resources/{id}'].get;
        // type-coverage:ignore-next-line
        const idParam = op.parameters.find((param: any) => param.name === 'id');
        // type-coverage:ignore-next-line
        const searchParam = op.parameters.find((param: any) => param.name === 'search');
        // type-coverage:ignore-next-line
        const filterParam = op.parameters.find((param: any) => param.name === 'filter');

        // type-coverage:ignore-next-line
        expect(idParam?.schema).toEqual({ type: 'string', format: 'uuid' });
        // type-coverage:ignore-next-line
        expect(searchParam?.schema).toEqual({ type: 'string' });
        // type-coverage:ignore-next-line
        expect(filterParam?.schema).toEqual({ $ref: '#/components/schemas/Filter' });
    });

    it('should ignore reserved header parameters when building specs (OAS 3.2)', () => {
        const sourceText = `
const app = { get: (..._args: any[]) => { void _args; } };
function headerHandler(req: any, res: any) {
  const accept = req.headers['accept'];
  const contentType = req.headers['content-type'];
  const auth = req.get('Authorization');
  const custom = req.headers['x-custom'];
  res.status(200).send({ accept, contentType, auth, custom });
}
app.get('/headers', headerHandler);
`;
        const ir = scanTypeScriptSource(sourceText, '/virtual.ts');
        const spec = buildOpenApiSpecFromScan(ir);
        // type-coverage:ignore-next-line
        const op = (spec.paths as any)['/headers'].get;
        // type-coverage:ignore-next-line
        const headerParams = (op.parameters || []).filter((param: any) => param.in === 'header');
        // type-coverage:ignore-next-line
        const headerNames = headerParams.map((param: any) => String(param.name).toLowerCase());
        // type-coverage:ignore-next-line
        expect(headerNames).toEqual(['x-custom']);
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
        expect(createOp?.requestBody?.schema).toEqual({
            $ref: '#/components/schemas/CreateWidget',
        });
        expect(createOp?.responses[0].schema).toEqual({
            $ref: '#/components/schemas/Widget',
        });
        const createParamKeys = createOp?.params.map(param => `${param.in}:${param.name}`) ?? [];
        expect(createParamKeys).toEqual(expect.arrayContaining(['path:id', 'query:mode', 'header:X-Trace']));
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

        // type-coverage:ignore-next-line
        const getUser = (spec.paths as any)['/users/{id}'].get;
        // type-coverage:ignore-next-line
        expect(getUser.operationId).toBe('getUser');
        // type-coverage:ignore-next-line
        expect(getUser.parameters.some((param: any) => param.name === 'id' && param.in === 'path')).toBe(true);
        // type-coverage:ignore-next-line
        expect(getUser.tags).toEqual(['Users', 'Accounts']);
        expect(spec.tags?.map(tag => tag.name)).toEqual(['Users', 'Accounts']);
        const usersTag = spec.tags?.find(tag => tag.name === 'Users');
        expect(usersTag?.summary).toBe('User operations');
        expect(usersTag?.kind).toBe('nav');

        // type-coverage:ignore-next-line
        const search = (spec.paths as any)['/search'].query;
        // type-coverage:ignore-next-line
        expect(search).toBeDefined();

        // type-coverage:ignore-next-line
        const rawQuery = (spec.paths as any)['/raw-query'].get;
        // type-coverage:ignore-next-line
        expect(rawQuery.parameters).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'rawQuery',
                    in: 'querystring',
                    content: {
                        'application/x-www-form-urlencoded': { schema: { type: 'object' } },
                    },
                }),
            ]),
        );

        // type-coverage:ignore-next-line
        const copyPath = (spec.paths as any)['/files/{id}'];
        // type-coverage:ignore-next-line
        expect(copyPath.additionalOperations?.COPY).toBeDefined();

        // type-coverage:ignore-next-line
        const messages = (spec.paths as any)['/messages'].post;
        // type-coverage:ignore-next-line
        expect(messages.requestBody.content['application/json']).toBeDefined();
        // type-coverage:ignore-next-line
        expect(messages.responses['200'].content['text/plain']).toBeDefined();

        // type-coverage:ignore-next-line
        const typedMessages = (spec.paths as any)['/typed-messages'].post;
        // type-coverage:ignore-next-line
        expect(typedMessages.requestBody.content['application/json'].schema).toEqual({
            $ref: '#/components/schemas/CreateMessageBody',
        });
        // type-coverage:ignore-next-line
        expect(typedMessages.responses['201'].content['application/json'].schema).toEqual({
            $ref: '#/components/schemas/MessageReceipt',
        });

        // type-coverage:ignore-next-line
        const secure = (spec.paths as any)['/secure'].get;
        // type-coverage:ignore-next-line
        expect(secure.externalDocs).toEqual({
            url: 'https://example.com/secure',
            description: 'Secure docs',
        });
        // type-coverage:ignore-next-line
        expect(secure.servers).toEqual([
            {
                url: 'https://api.example.com/v2',
                description: 'Production',
                name: 'prod',
                variables: { version: { default: 'v2' } },
            },
            { url: 'https://staging.example.com/v2', description: 'Staging' },
        ]);
        // type-coverage:ignore-next-line
        expect(secure.security).toEqual([{ ApiKey: [] }, { OAuth2: ['read:items', 'write:items'] }]);
        // type-coverage:ignore-next-line
        expect(secure['x-feature-flag']).toBe('beta');

        // type-coverage:ignore-next-line
        const documented = (spec.paths as any)['/documented/{id}'].get;
        // type-coverage:ignore-next-line
        expect(documented.operationId).toBe('fetchDocumented');
        // type-coverage:ignore-next-line
        const documentedParam = documented.parameters.find((param: any) => param.name === 'id');
        // type-coverage:ignore-next-line
        expect(documentedParam.description).toBe('Documented id.');
        // type-coverage:ignore-next-line
        expect(documented.responses['202'].summary).toBe('Accepted summary');
        // type-coverage:ignore-next-line
        expect(documented.responses['202'].description).toBe('Accepted payload');
        // type-coverage:ignore-next-line
        expect(documented.responses['202'].content['application/json']).toBeDefined();
        // type-coverage:ignore-next-line
        expect(documented.responses['404'].content['text/plain']).toBeDefined();

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

        // type-coverage:ignore-next-line
        const customPath = (customSpec.paths as any)['/things/{id}'];
        // type-coverage:ignore-next-line
        expect(customPath.additionalOperations?.COPY).toBeDefined();
        // type-coverage:ignore-next-line
        expect(customPath.additionalOperations.COPY.responses['200']).toBeDefined();

        // type-coverage:ignore-next-line
        const uploadPath = (customSpec.paths as any)['/upload'].post;
        // type-coverage:ignore-next-line
        expect(uploadPath.requestBody.content['multipart/form-data']).toBeDefined();
        // type-coverage:ignore-next-line
        expect(uploadPath.requestBody.content['application/octet-stream']).toBeDefined();
    });

    it('should throw when no routes are discovered', () => {
        const dir = makeTempDir();
        fs.writeFileSync(path.join(dir, 'empty.ts'), 'export const x = 1;');
        expect(() => scanTypeScriptProject(dir, fs)).toThrow(/No route handlers found/);
        expect(() => scanTypeScriptSource('export const x = 1;', '/tmp/empty.ts')).toThrow(/No route handlers found/);

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
