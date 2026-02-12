import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
    applyReverseMetadata,
    buildOpenApiSpecFromServices,
    parseGeneratedMetadata,
    parseGeneratedServiceSource,
    parseGeneratedServices,
} from '@src/core/utils/openapi-reverse.js';
import { OAS_3_1_DIALECT } from '@src/core/constants.js';
import type { ReverseMetadata } from '@src/core/utils/openapi-reverse.js';

const tempDirs: string[] = [];

const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdd-web-ng-reverse-'));
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

const serviceSource = `
export class UsersService {
  /**
   * Get a user by id.
   *
   * Returns a user payload.
   *
   * @see https://example.com/users User docs
   * @tags users, admin
   * @response 200 application/json OK
   * @response 404 Not found
   * @deprecated
   */
  public getUser(id: string, search?: string, filter?: string, q?: string, headerVal?: string, cookieVal?: string, body?: any, options?: any) {
    const queryString = ParameterSerializer.serializeRawQuerystring(q, undefined, 'application/x-www-form-urlencoded', {"tags":{"style":"pipeDelimited","explode":false}});
    const url = \`\${basePath}/users/\${ParameterSerializer.serializePathParam('id', id, 'simple', false, false)}\${queryString ? '?' + queryString : ''}\`;
    let params = new HttpParams({ encoder: new ApiParameterCodec(), fromObject: options?.params ?? {} });
    const serialized_search = ParameterSerializer.serializeQueryParam({"name":"search","in":"query","style":"form","explode":true,"allowReserved":false,"allowEmptyValue":true}, search);
    const serialized_filter = ParameterSerializer.serializeQueryParam({"name":"filter","in":"query","style":"simple","explode":false,"allowReserved":true}, filter);
    serialized_search.forEach(entry => params = params.append(entry.key, entry.value));
    serialized_filter.forEach(entry => params = params.append(entry.key, entry.value));
    let headers = options?.headers instanceof HttpHeaders ? options.headers : new HttpHeaders(options?.headers ?? {});
    if (headerVal != null) { headers = headers.set('X-Test', ParameterSerializer.serializeHeaderParam(headerVal, false)); }
    const __cookies: string[] = [];
    if (cookieVal != null) { __cookies.push(ParameterSerializer.serializeCookieParam('session', cookieVal, 'form', true, false)); }
    if (__cookies.length > 0) { headers = headers.set('Cookie', __cookies.join('; ')); }
    if (body != null && !headers.has('Content-Type')) { headers = headers.set('Content-Type', 'application/json'); }
    let requestOptions: any = { headers, params, context: this.createContextWithClientId(options?.context).set(SECURITY_CONTEXT_TOKEN, [{"api_key":[]},{"petstore_auth":["read:pets"]}]) };
    return this.http.post<any>(url, body, requestOptions as any);
  }

  public submitEncoded(payload: any, options?: any) {
    const url = \`\${basePath}/encode\`;
    const urlParamEntries = ParameterSerializer.serializeUrlEncodedBody(payload, {"style":"form"});
    let formBody = new HttpParams({ encoder: new ApiParameterCodec() });
    urlParamEntries.forEach(entry => formBody = formBody.append(entry.key, entry.value));
    return this.http.post<any>(url, formBody, requestOptions as any);
  }

  public uploadAvatar(file: Blob, options?: any) {
    const url = \`\${basePath}/upload\`;
    const formData = new FormData();
    if (file != null) { formData.append('file', file); }
    return this.http.post<any>(url, formData, requestOptions as any);
  }

  public sendXml(payload: any, options?: any) {
    const url = \`\${basePath}/xml\`;
    const xmlBody = XmlBuilder.serialize(payload, 'root', {});
    return this.http.post<any>(url, xmlBody, requestOptions as any);
  }

  public contentTypeOnly(body: any, options?: any) {
    const url = \`\${basePath}/text\`;
    let headers = new HttpHeaders();
    if (body != null && !headers.has('Content-Type')) { headers = headers.set('Content-Type', 'text/plain'); }
    return this.http.post<any>(url, body, requestOptions as any);
  }

  public xmlResponse(options?: any) {
    const url = \`\${basePath}/xml-response\`;
    return this.http.get<any>(url, requestOptions as any).pipe(map(response => { return XmlParser.parse(response, {}); }));
  }

  public jsonSeqResponse(options?: any) {
    const url = \`\${basePath}/seq\`;
    return this.http.get<any>(url, requestOptions as any).pipe(map(response => { return response.split('\\\\x1e'); }));
  }

  public jsonLinesResponse(options?: any) {
    const url = \`\${basePath}/lines\`;
    return this.http.get<any>(url, requestOptions as any).pipe(map(response => { return response.split('\\\\n'); }));
  }

  public acceptVariants(options?: any) {
    const url = \`\${basePath}/accept\`;
    let headers = new HttpHeaders();
    const acceptHeader = headers.get('Accept');
    if (acceptHeader?.includes('application/xml')) { return this.http.get<any>(url, requestOptions as any); }
    if (acceptHeader?.includes('application/json-seq')) { return this.http.get<any>(url, requestOptions as any); }
    return this.http.get<any>(url, requestOptions as any);
  }

  public sseResponse(options?: any) {
    const url = \`\${basePath}/events\`;
    return new Observable<any>(observer => { const eventSource = new EventSource(url); return () => eventSource.close(); });
  }

  public requestWithBodyOption(payload: any, options?: any) {
    const url = \`\${basePath}/request-body\`;
    return this.http.request('PATCH', url, { ...requestOptions, body: payload } as any);
  }

  public requestWithBodyAssertion(payload: any, options?: any) {
    const url = \`\${basePath}/request-body-assertion\`;
    return this.http.request('PATCH', url, <any>{ body: payload });
  }

  public requestWithoutBody(options?: any) {
    const url = \`\${basePath}/request-without-body\`;
    return this.http.request('POST', url, requestOptions as any);
  }

  public listWithServer(options?: any) {
    const operationServers = [{"url":"https://api.example.com/v1","description":"primary"}];
    const basePath = resolveServerUrl(operationServers, options?.server ?? 0, options?.serverVariables ?? {});
    const url = \`\${basePath}/server-test\`;
    return this.http.get<any>(url, requestOptions as any);
  }

  public invalidRequest(method: string, options?: any) {
    const url = \`\${basePath}/invalid\`;
    return this.http.request(method, url, requestOptions as any);
  }

  private helper() {
    return null;
  }
}

export class OtherService {
  public getNoLeadingSlash(options?: any) {
    const url = \`\${basePath}status\`;
    return this.http.get<any>(url, requestOptions as any);
  }

  public getRoot(options?: any) {
    const url = \`\${basePath}\`;
    return this.http.get<any>(url, requestOptions as any);
  }
}
`;

const typedServiceSource = `
import { Observable } from 'rxjs';

export class TypedService {
  public createUser(payload: CreateUserRequest): Observable<User> {
    const url = \`\${basePath}/users\`;
    return this.http.post<User>(url, payload, requestOptions as any);
  }

  public streamUsers(): Observable<User[]> {
    const url = \`\${basePath}/users/stream\`;
    return this.http.get<any>(url, requestOptions as any).pipe(map(response => response.split('\\\\n')));
  }
}
`;

describe('Core Utils: OpenAPI Reverse', () => {
    it('should parse generated service source and extract params', () => {
        const services = parseGeneratedServiceSource(serviceSource, '/users.service.ts');
        const spec = buildOpenApiSpecFromServices(services, { title: 'Recovered', version: '1.0.0' });
        const userService = services.find(s => s.serviceName === 'UsersService');
        expect(userService).toBeDefined();

        const getUser = userService!.operations.find(op => op.methodName === 'getUser')!;
        expect(getUser.httpMethod).toBe('POST');
        expect(getUser.path).toBe('/users/{id}');
        expect(getUser.requestMediaTypes).toEqual(['application/json']);
        expect(getUser.responseMediaTypes).toEqual(['application/json']);
        expect(getUser.summary).toBe('Get a user by id.');
        expect(getUser.description).toBe('Returns a user payload.');
        expect(getUser.deprecated).toBe(true);
        expect(getUser.externalDocs).toEqual({ url: 'https://example.com/users', description: 'User docs' });
        expect(getUser.tags).toEqual(['users', 'admin']);
        expect(getUser.tags).toEqual(['users', 'admin']);
        expect(getUser.responseHints).toEqual([
            { status: '200', mediaTypes: ['application/json'], description: 'OK' },
            { status: '404', description: 'Not found' },
        ]);

        const specOp = spec.paths['/users/{id}'].post;
        expect(Object.keys(specOp.responses || {})).toEqual(expect.arrayContaining(['200', '404']));
        expect(specOp.responses['200'].content?.['application/json']).toBeDefined();
        expect(specOp.responses['404'].description).toBe('Not found');

        const paramKeys = getUser.params.map(p => `${p.in}:${p.name}`);
        expect(paramKeys).toEqual(
            expect.arrayContaining([
                'path:id',
                'query:search',
                'query:filter',
                'querystring:q',
                'header:X-Test',
                'cookie:session',
                'body:body',
            ]),
        );

        const idParam = getUser.params.find(p => p.name === 'id');
        expect(idParam?.required).toBe(true);
        expect(idParam?.style).toBe('simple');
        expect(idParam?.explode).toBe(false);
        expect(idParam?.allowReserved).toBe(false);
        expect(getUser.security).toEqual([{ api_key: [] }, { petstore_auth: ['read:pets'] }]);

        const searchParam = getUser.params.find(p => p.name === 'search');
        expect(searchParam?.style).toBe('form');
        expect(searchParam?.explode).toBe(true);
        expect(searchParam?.allowReserved).toBe(false);
        expect(searchParam?.allowEmptyValue).toBe(true);

        const filterParam = getUser.params.find(p => p.name === 'filter');
        expect(filterParam?.style).toBe('simple');
        expect(filterParam?.explode).toBe(false);
        expect(filterParam?.allowReserved).toBe(true);

        const listWithServerSpec = (spec.paths as any)['/server-test'].get;
        expect(listWithServerSpec.servers).toEqual([
            { url: 'https://api.example.com/v1', description: 'primary' },
        ]);

        const cookieParam = getUser.params.find(p => p.name === 'session');
        expect(cookieParam?.style).toBe('form');
        expect(cookieParam?.explode).toBe(true);
        expect(cookieParam?.allowReserved).toBe(false);

        const listWithServerOp = userService!.operations.find(op => op.methodName === 'listWithServer')!;
        expect(listWithServerOp.servers).toEqual([
            { url: 'https://api.example.com/v1', description: 'primary' },
        ]);
    });

    it('should keep component webhooks scoped to components only', () => {
        const baseSpec: any = { openapi: '3.2.0', info: { title: 'T', version: '1' }, paths: {} };
        const metadata: ReverseMetadata = {
            webhooks: [
                {
                    name: 'ComponentHook',
                    method: 'post',
                    scope: 'component',
                    pathItem: {
                        post: { responses: { '200': { description: 'ok' } } },
                    },
                },
            ],
        };

        const next = applyReverseMetadata(baseSpec, metadata);
        expect(next.components?.webhooks?.ComponentHook).toBeDefined();
        expect(next.webhooks?.ComponentHook).toBeUndefined();
    });

    it('should apply root-scoped webhooks to the OpenAPI Object', () => {
        const baseSpec: any = { openapi: '3.2.0', info: { title: 'T', version: '1' }, paths: {} };
        const metadata: ReverseMetadata = {
            webhooks: [
                {
                    name: 'RootHook',
                    method: 'post',
                    scope: 'root',
                    pathItem: {
                        post: { responses: { '200': { description: 'ok' } } },
                    },
                },
            ],
        };

        const next = applyReverseMetadata(baseSpec, metadata);
        expect(next.webhooks?.RootHook).toBeDefined();
        expect(next.components?.webhooks?.RootHook).toBeDefined();
    });

    it('should detect media types and request bodies', () => {
        const services = parseGeneratedServiceSource(serviceSource, '/users.service.ts');
        const userService = services.find(s => s.serviceName === 'UsersService')!;

        const upload = userService.operations.find(op => op.methodName === 'uploadAvatar')!;
        expect(upload.requestMediaTypes).toEqual(['multipart/form-data']);
        expect(upload.params.some(p => p.in === 'formData' && p.name === 'file')).toBe(true);

        const encoded = userService.operations.find(op => op.methodName === 'submitEncoded')!;
        expect(encoded.requestMediaTypes).toEqual(['application/x-www-form-urlencoded']);

        const xml = userService.operations.find(op => op.methodName === 'sendXml')!;
        expect(xml.requestMediaTypes).toEqual(['application/xml']);

        const text = userService.operations.find(op => op.methodName === 'contentTypeOnly')!;
        expect(text.requestMediaTypes).toEqual(['text/plain']);

        const xmlResponse = userService.operations.find(op => op.methodName === 'xmlResponse')!;
        expect(xmlResponse.requestMediaTypes).toEqual([]);
        expect(xmlResponse.responseMediaTypes).toEqual(['application/xml']);

        const jsonSeq = userService.operations.find(op => op.methodName === 'jsonSeqResponse')!;
        expect(jsonSeq.responseMediaTypes).toEqual(['application/json-seq']);

        const jsonLines = userService.operations.find(op => op.methodName === 'jsonLinesResponse')!;
        expect(jsonLines.responseMediaTypes).toEqual(['application/jsonl']);

        const accept = userService.operations.find(op => op.methodName === 'acceptVariants')!;
        expect(accept.responseMediaTypes).toEqual(['application/xml', 'application/json-seq']);

        const sse = userService.operations.find(op => op.methodName === 'sseResponse')!;
        expect(sse.responseMediaTypes).toEqual(['text/event-stream']);

        const requestOption = userService.operations.find(op => op.methodName === 'requestWithBodyOption')!;
        expect(requestOption.params.some(p => p.in === 'body' && p.name === 'payload')).toBe(true);

        const requestAssertion = userService.operations.find(op => op.methodName === 'requestWithBodyAssertion')!;
        expect(requestAssertion.params.some(p => p.in === 'body' && p.name === 'payload')).toBe(true);

        const noBody = userService.operations.find(op => op.methodName === 'requestWithoutBody')!;
        expect(noBody.params.some(p => p.in === 'body')).toBe(false);

        expect(userService.operations.some(op => op.methodName === 'invalidRequest')).toBe(false);
    });

    it('should normalize paths without leading slashes', () => {
        const services = parseGeneratedServiceSource(serviceSource, '/users.service.ts');
        const otherService = services.find(s => s.serviceName === 'OtherService')!;
        const status = otherService.operations.find(op => op.methodName === 'getNoLeadingSlash')!;
        expect(status.path).toBe('/status');
        const root = otherService.operations.find(op => op.methodName === 'getRoot')!;
        expect(root.path).toBe('/');
    });

    it('should parse services from disk and handle errors', () => {
        const dir = makeTempDir();
        const nestedDir = path.join(dir, 'nested');
        fs.mkdirSync(nestedDir, { recursive: true });

        fs.writeFileSync(path.join(dir, 'users.service.ts'), serviceSource);
        fs.writeFileSync(path.join(dir, 'users.service.spec.ts'), 'ignored');
        fs.writeFileSync(path.join(dir, 'users.service.d.ts'), 'ignored');

        const nestedSource = `
        export class NestedService {
          public ping(options?: any) {
            const url = \`\${basePath}/ping\`;
            return this.http.get<any>(url, requestOptions as any);
          }
        }
        `;
        fs.writeFileSync(path.join(nestedDir, 'nested.service.ts'), nestedSource);

        const services = parseGeneratedServices(dir, fs);
        expect(services.some(s => s.serviceName === 'NestedService')).toBe(true);

        const fileServices = parseGeneratedServices(path.join(dir, 'users.service.ts'), fs);
        expect(fileServices.length).toBeGreaterThan(0);

        const emptyDir = makeTempDir();
        expect(() => parseGeneratedServices(emptyDir, fs)).toThrow(/No generated service files/);

        const badFile = path.join(dir, 'not-service.ts');
        fs.writeFileSync(badFile, 'export const x = 1;');
        expect(() => parseGeneratedServices(badFile, fs)).toThrow(/Expected a generated service file/);

        const noOpDir = makeTempDir();
        fs.writeFileSync(
            path.join(noOpDir, 'empty.service.ts'),
            `export class EmptyService { private helper() { return null; } }`,
        );
        expect(() => parseGeneratedServices(noOpDir, fs)).toThrow(/No operations could be reconstructed/);
    });

    it('should build a minimal OpenAPI spec from services', () => {
        const services = parseGeneratedServiceSource(serviceSource, '/users.service.ts');
        const spec = buildOpenApiSpecFromServices(services, { title: 'Recovered', version: '1.2.3' });

        expect(spec.openapi).toBe('3.2.0');
        expect(spec.jsonSchemaDialect).toBe(OAS_3_1_DIALECT);
        expect(spec.info.title).toBe('Recovered');
        expect(spec.info.version).toBe('1.2.3');
        expect(spec.tags?.map(tag => tag.name)).toEqual(['users', 'admin']);

        const getUser = (spec.paths as any)['/users/{id}'].post;
        const params = getUser.parameters as any[];
        expect(getUser.summary).toBe('Get a user by id.');
        expect(getUser.description).toBe('Returns a user payload.');
        expect(getUser.deprecated).toBe(true);
        expect(getUser.externalDocs).toEqual({ url: 'https://example.com/users', description: 'User docs' });
        expect(params.find(p => p.name === 'id')?.required).toBe(true);
        expect(params.find(p => p.name === 'id')?.style).toBe('simple');
        expect(getUser.security).toEqual([{ api_key: [] }, { petstore_auth: ['read:pets'] }]);
        const querystringParam = params.find(p => p.name === 'q');
        expect(querystringParam?.in).toBe('querystring');
        expect(querystringParam?.content?.['application/x-www-form-urlencoded']).toBeDefined();
        expect(querystringParam?.content?.['application/x-www-form-urlencoded']?.encoding).toEqual({
            tags: { style: 'pipeDelimited', explode: false },
        });
        const searchParam = params.find(p => p.name === 'search');
        expect(searchParam?.style).toBe('form');
        expect(searchParam?.explode).toBe(true);
        expect(searchParam?.allowReserved).toBe(false);
        expect(searchParam?.allowEmptyValue).toBe(true);
        const filterParam = params.find(p => p.name === 'filter');
        expect(filterParam?.style).toBe('simple');
        expect(filterParam?.explode).toBe(false);
        expect(filterParam?.allowReserved).toBe(true);

        const uploadBody = (spec.paths as any)['/upload'].post.requestBody;
        expect(uploadBody.content['multipart/form-data'].schema.type).toBe('object');
        expect(uploadBody.content['multipart/form-data'].schema.properties).toHaveProperty('file');

        const textBody = (spec.paths as any)['/text'].post.requestBody;
        expect(textBody.required).toBe(true);
        expect(textBody.content['text/plain']).toBeDefined();

        const noContentSpec = buildOpenApiSpecFromServices([
            {
                serviceName: 'Empty',
                filePath: '/empty.service.ts',
                operations: [
                    {
                        methodName: 'ping',
                        httpMethod: 'GET',
                        path: '/ping',
                        params: [],
                        requestMediaTypes: [],
                        responseMediaTypes: [],
                    },
                ],
            },
        ]);

        const pingResponse = (noContentSpec.paths as any)['/ping'].get.responses['200'];
        expect(pingResponse.content).toBeUndefined();
    });

    it('should apply schema refs when type hints and schemas are available', () => {
        const services = parseGeneratedServiceSource(typedServiceSource, '/typed.service.ts');
        const schemas = {
            User: { type: 'object' },
            CreateUserRequest: { type: 'object' },
        };
        const spec = buildOpenApiSpecFromServices(services, {}, schemas);

        const createUser = (spec.paths as any)['/users'].post;
        expect(createUser.requestBody.content['application/json'].schema).toEqual({
            $ref: '#/components/schemas/CreateUserRequest',
        });
        expect(createUser.responses['200'].content['application/json'].schema).toEqual({
            $ref: '#/components/schemas/User',
        });

        const streamUsers = (spec.paths as any)['/users/stream'].get;
        expect(streamUsers.responses['200'].content['application/jsonl'].itemSchema).toEqual({
            $ref: '#/components/schemas/User',
        });
    });

    it('should parse generated metadata and apply it to the recovered spec', () => {
        const dir = makeTempDir();
        const nestedDir = path.join(dir, 'services');
        fs.mkdirSync(nestedDir, { recursive: true });

        fs.writeFileSync(
            path.join(dir, 'info.ts'),
            `export const API_INFO: ApiInfo = {\"title\":\"Meta API\",\"version\":\"9.9.9\",\"summary\":\"Meta\"};\n` +
                `export const API_TAGS: ApiTag[] = [{\"name\":\"meta\"}];\n` +
                `export const API_EXTERNAL_DOCS: { description?: string; url: string; } | undefined = {\"description\":\"Docs\",\"url\":\"https://example.com/docs\"};\n`,
        );

        fs.writeFileSync(
            path.join(dir, 'security.ts'),
            `export const API_SECURITY_SCHEMES = {\"api_key\":{\"type\":\"apiKey\",\"name\":\"X-API-KEY\",\"in\":\"header\"}};\n` +
                `export const API_SECURITY_REQUIREMENTS = [{\"api_key\":[]}];`,
        );

        fs.writeFileSync(
            path.join(dir, 'servers.ts'),
            `export const API_SERVERS = [{\"url\":\"https://api.example.com\",\"name\":\"prod\"}];`,
        );

        fs.writeFileSync(
            path.join(dir, 'response-headers.ts'),
            `export const API_RESPONSE_HEADERS = {\"ping\":{\"200\":{\"X-Rate-Limit\":\"number\",\"Link\":\"linkset\"}}};\n` +
                `export const API_HEADER_XML_CONFIGS = {};`,
        );

        fs.writeFileSync(
            path.join(dir, 'links.ts'),
            `export const API_LINKS = {\"ping\":{\"200\":{\"next\":{\"operationId\":\"listThings\"}}}};`,
        );

        const callbackMeta = [
            {
                name: 'onPing',
                method: 'POST',
                interfaceName: 'OnPingPostPayload',
                expression: '{$request.body#/callbackUrl}',
                pathItem: {
                    post: {
                        requestBody: {
                            content: { 'application/json': { schema: { type: 'string' } } },
                        },
                        responses: {
                            '204': {
                                description: 'Ack',
                                content: { 'application/json': { schema: { type: 'string' } } },
                            },
                        },
                    },
                },
            },
        ];

        const webhookMeta = [
            {
                name: 'pinged',
                method: 'POST',
                interfaceName: 'PingedPostPayload',
                pathItem: {
                    post: {
                        requestBody: {
                            content: { 'application/json': { schema: { type: 'object' } } },
                        },
                        responses: {
                            '201': {
                                description: 'Created',
                                content: { 'application/json': { schema: { type: 'object' } } },
                            },
                        },
                    },
                },
            },
        ];

        fs.writeFileSync(
            path.join(dir, 'callbacks.ts'),
            `export const API_CALLBACKS = ${JSON.stringify(callbackMeta)};`,
        );

        fs.writeFileSync(
            path.join(dir, 'webhooks.ts'),
            `export const API_WEBHOOKS = ${JSON.stringify(webhookMeta)};`,
        );

        fs.writeFileSync(
            path.join(dir, 'examples.ts'),
            `export const API_EXAMPLES = ${JSON.stringify({
                ExampleOne: { summary: 'Example', dataValue: { foo: 'bar' } },
            })};`,
        );

        fs.writeFileSync(
            path.join(dir, 'media-types.ts'),
            `export const API_MEDIA_TYPES = ${JSON.stringify({
                EventStream: { schema: { type: 'string' } },
            })};`,
        );

        fs.writeFileSync(
            path.join(dir, 'path-items.ts'),
            `export const API_PATH_ITEMS = ${JSON.stringify({
                PingItem: { get: { responses: { '200': { description: 'pong' } } } },
            })};`,
        );

        fs.writeFileSync(
            path.join(dir, 'parameters.ts'),
            `export const API_PARAMETERS = ${JSON.stringify({
                LimitParam: { name: 'limit', in: 'query', schema: { type: 'integer' } },
            })};`,
        );

        fs.writeFileSync(
            path.join(dir, 'request-bodies.ts'),
            `export const API_REQUEST_BODIES = ${JSON.stringify({
                CreateUser: {
                    description: 'Create payload',
                    content: { 'application/json': { schema: { type: 'object' } } },
                },
            })};`,
        );

        fs.writeFileSync(
            path.join(dir, 'responses.ts'),
            `export const API_RESPONSES = ${JSON.stringify({
                NotFound: { description: 'Not found' },
            })};`,
        );

        fs.writeFileSync(
            path.join(dir, 'document.ts'),
            `export const API_DOCUMENT_META = ${JSON.stringify({
                openapi: '3.1.2',
                $self: 'https://example.com/openapi',
                jsonSchemaDialect: 'https://example.com/dialect',
            })};`,
        );

        fs.writeFileSync(
            path.join(nestedDir, 'dummy.service.ts'),
            'export class DummyService { public ping() { const url = `\\${basePath}/ping`; return this.http.get<any>(url, requestOptions as any); } }',
        );

        const metadata = parseGeneratedMetadata(dir, fs);
        expect(metadata.info?.title).toBe('Meta API');
        expect(metadata.tags?.[0].name).toBe('meta');
        expect(metadata.externalDocs?.url).toBe('https://example.com/docs');
        expect(metadata.securitySchemes?.api_key?.type).toBe('apiKey');
        expect(metadata.securityRequirements?.[0]?.api_key).toEqual([]);
        expect(metadata.servers?.[0].url).toBe('https://api.example.com');
        expect(metadata.documentMeta?.openapi).toBe('3.1.2');
        expect(metadata.documentMeta?.$self).toBe('https://example.com/openapi');
        expect(metadata.documentMeta?.jsonSchemaDialect).toBe('https://example.com/dialect');
        expect(metadata.parameters?.LimitParam?.in).toBe('query');
        expect(metadata.requestBodies?.CreateUser?.description).toBe('Create payload');
        expect(metadata.responses?.NotFound?.description).toBe('Not found');

        const spec = buildOpenApiSpecFromServices([
            {
                serviceName: 'DummyService',
                filePath: '/dummy.service.ts',
                operations: [
                    {
                        methodName: 'ping',
                        httpMethod: 'GET',
                        path: '/ping',
                        params: [],
                        requestMediaTypes: [],
                        responseMediaTypes: [],
                    },
                ],
            },
        ]);

        const merged = applyReverseMetadata(spec, metadata);
        expect(merged.openapi).toBe('3.1.2');
        expect(merged.$self).toBe('https://example.com/openapi');
        expect(merged.jsonSchemaDialect).toBe('https://example.com/dialect');
        expect(merged.info.title).toBe('Meta API');
        expect(merged.tags?.length).toBe(1);
        expect(merged.security).toEqual([{ api_key: [] }]);
        expect(merged.servers?.length).toBe(1);
        expect(merged.components?.securitySchemes).toBeDefined();
        expect((merged.paths as any)['/ping'].get.responses['200'].headers['X-Rate-Limit']).toBeDefined();
        expect((merged.paths as any)['/ping'].get.responses['200'].links.next.operationId).toBe('listThings');
        expect(merged.components?.headers).toBeDefined();
        expect(merged.components?.links).toBeDefined();
        expect(merged.components?.examples?.ExampleOne?.summary).toBe('Example');
        expect(merged.components?.mediaTypes?.EventStream?.schema?.type).toBe('string');
        expect(merged.components?.pathItems?.PingItem?.get?.responses?.['200']).toBeDefined();
        expect(merged.components?.parameters?.LimitParam?.name).toBe('limit');
        expect(merged.components?.requestBodies?.CreateUser?.content?.['application/json']).toBeDefined();
        expect(merged.components?.responses?.NotFound?.description).toBe('Not found');
        const callbacks = merged.components?.callbacks as any;
        expect(callbacks?.onPing?.['{$request.body#/callbackUrl}']?.post?.requestBody?.content?.['application/json']).toBeDefined();
        expect(callbacks?.onPing?.['{$request.body#/callbackUrl}']?.post?.responses?.['204']).toBeDefined();
        const webhooks = merged.components?.webhooks as any;
        expect(webhooks?.pinged?.post?.requestBody?.content?.['application/json']).toBeDefined();
        expect(webhooks?.pinged?.post?.responses?.['201']).toBeDefined();
        expect(merged.webhooks?.pinged?.post?.requestBody?.content?.['application/json']).toBeDefined();
    });

    it('should place non-standard HTTP methods in additionalOperations', () => {
        const spec = buildOpenApiSpecFromServices([
            {
                serviceName: 'CustomService',
                filePath: '/custom.service.ts',
                operations: [
                    {
                        methodName: 'copyThing',
                        httpMethod: 'COPY',
                        path: '/things/{id}',
                        params: [{ name: 'id', in: 'path', required: true }],
                        requestMediaTypes: [],
                        responseMediaTypes: ['application/json'],
                    },
                ],
            },
        ]);

        const pathItem = (spec.paths as any)['/things/{id}'];
        expect(pathItem.additionalOperations?.COPY).toBeDefined();
        expect(pathItem.copy).toBeUndefined();
    });
});
