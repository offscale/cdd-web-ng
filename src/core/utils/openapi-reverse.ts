import path from 'node:path';
import { MethodDeclaration, Node, Project, Scope, SyntaxKind } from 'ts-morph';
import {
    ExampleObject,
    ExternalDocumentationObject,
    HeaderObject,
    InfoObject,
    LinkObject,
    MediaTypeObject,
    Parameter,
    PathItem,
    RequestBody,
    SecurityScheme,
    ServerObject,
    SwaggerDefinition,
    SwaggerResponse,
    SwaggerSpec,
    TagObject,
} from '../types/index.js';
import { OAS_3_1_DIALECT } from '../constants.js';
import type { ReverseSchemaMap } from './openapi-reverse-models.js';

/** Supported parameter locations extracted from generated service code. */
export type ReverseParamLocation =
    | 'path'
    | 'query'
    | 'header'
    | 'cookie'
    | 'formData'
    | 'querystring'
    | 'body';

/** Describes a parameter extracted from a generated service method. */
export interface ReverseParam {
    name: string;
    in: ReverseParamLocation;
    required?: boolean;
    contentType?: string;
    serialization?: 'json';
    encoding?: Record<string, any>;
    /** OAS serialization style hint reconstructed from generated code. */
    style?: string;
    /** OAS explode hint reconstructed from generated code. */
    explode?: boolean;
    /** OAS allowReserved hint reconstructed from generated code. */
    allowReserved?: boolean;
    /** OAS allowEmptyValue hint reconstructed from generated code. */
    allowEmptyValue?: boolean;
    /** Type hint reconstructed from the TypeScript signature (when available). */
    typeHint?: string;
}

/** Describes a reconstructed operation extracted from a generated service method. */
export interface ReverseOperation {
    methodName: string;
    httpMethod: string;
    path: string;
    params: ReverseParam[];
    requestMediaTypes: string[];
    responseMediaTypes: string[];
    /** Response type hint reconstructed from the TypeScript signature (when available). */
    responseTypeHint?: string;
    /** Response metadata reconstructed from JSDoc @response tags. */
    responseHints?: ReverseResponseHint[];
    security?: Record<string, string[]>[];
    /** Tags reconstructed from JSDoc when available. */
    tags?: string[];
    /** Operation-level servers reconstructed from generated method bodies. */
    servers?: ServerObject[];
    /** Summary reconstructed from JSDoc when available. */
    summary?: string;
    /** Description reconstructed from JSDoc when available. */
    description?: string;
    /** Deprecated flag reconstructed from JSDoc when available. */
    deprecated?: boolean;
    /** External docs reconstructed from JSDoc @see tag when available. */
    externalDocs?: ExternalDocumentationObject;
}

/** Describes a reconstructed service and its operations. */
export interface ReverseService {
    serviceName: string;
    filePath: string;
    operations: ReverseOperation[];
}

/** JSDoc response hint reconstructed from generated service docs. */
export interface ReverseResponseHint {
    status: string;
    mediaTypes?: string[];
    description?: string;
}

/** Metadata registry entry for callbacks reconstructed from generated files. */
export interface ReverseCallbackMeta {
    name: string;
    method: string;
    interfaceName?: string;
    expression?: string;
    pathItem?: PathItem;
    /**
     * Source scope for this callback metadata.
     * - component: declared under components.callbacks
     * - operation: declared under an operation callbacks map
     */
    scope?: 'component' | 'operation';
}

/** Metadata registry entry for webhooks reconstructed from generated files. */
export interface ReverseWebhookMeta {
    name: string;
    method: string;
    interfaceName?: string;
    pathItem?: PathItem;
    /**
     * Source scope for this webhook metadata.
     * - root: declared under the OpenAPI Object webhooks field
     * - component: declared under components.webhooks
     */
    scope?: 'root' | 'component';
}

/** Metadata reconstructed from generated helper files (info, servers, security). */
export interface ReverseMetadata {
    info?: InfoObject;
    tags?: TagObject[];
    externalDocs?: ExternalDocumentationObject;
    documentMeta?: {
        openapi?: string;
        swagger?: string;
        $self?: string;
        jsonSchemaDialect?: string;
    };
    servers?: ServerObject[];
    securitySchemes?: Record<string, SecurityScheme>;
    securityRequirements?: Record<string, string[]>[];
    responseHeaders?: Record<string, Record<string, Record<string, string>>>;
    responseHeaderXmlConfigs?: Record<string, any>;
    links?: Record<string, Record<string, Record<string, LinkObject>>>;
    callbacks?: ReverseCallbackMeta[];
    webhooks?: ReverseWebhookMeta[];
    examples?: Record<string, ExampleObject | { $ref: string }>;
    mediaTypes?: Record<string, MediaTypeObject | { $ref: string }>;
    pathItems?: Record<string, PathItem | { $ref: string }>;
    parameters?: Record<string, Parameter | { $ref: string }>;
    requestBodies?: Record<string, RequestBody | { $ref: string }>;
    responses?: Record<string, SwaggerResponse | { $ref: string }>;
}

/** File system requirements for reverse parsing helpers. */
export type ReverseFileSystem = {
    statSync: (filePath: string) => { isFile: () => boolean; isDirectory: () => boolean };
    readFileSync: (filePath: string, encoding: string) => string;
    readdirSync: (dirPath: string) => string[];
};

const SERVICE_FILE_SUFFIX = '.service.ts';
const SERVICE_SPEC_SUFFIX = '.service.spec.ts';
const SERVICE_DECL_SUFFIX = '.service.d.ts';

type ParsedPathInfo = {
    path: string;
    pathParams: {
        name: string;
        variableName?: string;
        style?: string;
        explode?: boolean;
        allowReserved?: boolean;
        serialization?: 'json';
    }[];
};

/**
 * Parses a generated Angular service source file and returns all reconstructed services found within it.
 */
export function parseGeneratedServiceSource(sourceText: string, filePath = 'service.ts'): ReverseService[] {
    const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    const services: ReverseService[] = [];

    for (const cls of sourceFile.getClasses()) {
        const serviceName = cls.getName() ?? 'UnnamedService';
        const operations: ReverseOperation[] = [];

        for (const method of cls.getMethods()) {
            if (method.getScope() === Scope.Private || method.getScope() === Scope.Protected) continue;
            if (!method.getBodyText()) continue;

            const bodyText = method.getBodyText() ?? '';
            const urlInfo = extractUrlTemplate(bodyText);
            if (!urlInfo) continue;

            const httpCall = findHttpCall(method);
            const isSse = bodyText.includes('new EventSource');
            const httpMethod = httpCall?.httpMethod ?? (isSse ? 'GET' : undefined);
            if (!httpMethod) continue;

            const docMeta = extractMethodDocs(method);
            const paramMeta = buildParamMeta(method);
            const params: ReverseParam[] = [];
            const responseTypeHint = extractReturnTypeHint(method);

            const registerParam = (param: ReverseParam) => {
                const key = `${param.in}:${param.name}`;
                const existing = params.find(p => `${p.in}:${p.name}` === key);
                if (existing) {
                    Object.assign(existing, param);
                    return;
                }
                params.push(param);
            };

            urlInfo.pathParams.forEach(p =>
                registerParam({
                    name: p.name,
                    in: 'path',
                    required: true,
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    serialization: p.serialization,
                    typeHint: extractParamTypeHint(method, p.variableName ?? p.name),
                }),
            );

            extractQueryParams(bodyText).forEach(p =>
                registerParam({
                    name: p.name,
                    in: 'query',
                    required: paramMeta.get(p.variableName ?? p.name),
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    allowEmptyValue: p.allowEmptyValue,
                    serialization: p.serialization,
                    typeHint: extractParamTypeHint(method, p.variableName ?? p.name),
                }),
            );

            extractRawQuerystringParams(bodyText).forEach(p =>
                registerParam({
                    name: p.name,
                    in: 'querystring',
                    required: paramMeta.get(p.variableName ?? p.name),
                    contentType: p.contentType,
                    serialization: p.serialization,
                    encoding: p.encoding,
                    typeHint: extractParamTypeHint(method, p.variableName ?? p.name),
                }),
            );

            extractHeaderParams(bodyText).forEach(p =>
                registerParam({
                    name: p.name,
                    in: 'header',
                    required: paramMeta.get(p.variableName ?? p.name),
                    explode: p.explode,
                    serialization: p.serialization,
                    typeHint: extractParamTypeHint(method, p.variableName ?? p.name),
                }),
            );

            extractCookieParams(bodyText).forEach(p =>
                registerParam({
                    name: p.name,
                    in: 'cookie',
                    required: paramMeta.get(p.variableName ?? p.name),
                    style: p.style,
                    explode: p.explode,
                    allowReserved: p.allowReserved,
                    serialization: p.serialization,
                    typeHint: extractParamTypeHint(method, p.variableName ?? p.name),
                }),
            );

            const formDataParams = extractFormDataParams(bodyText);
            formDataParams.forEach(p =>
                registerParam({
                    name: p.name,
                    in: 'formData',
                    required: paramMeta.get(p.variableName ?? p.name),
                    typeHint: extractParamTypeHint(method, p.variableName ?? p.name),
                }),
            );

            const bodyParamName = detectBodyParamName(bodyText, httpCall?.bodyArg, paramMeta);
            const bodyTypeHint = bodyParamName ? extractParamTypeHint(method, bodyParamName) : undefined;
            if (bodyParamName) {
                registerParam({
                    name: bodyParamName,
                    in: 'body',
                    required: paramMeta.get(bodyParamName),
                    typeHint: bodyTypeHint,
                });
            }

            const requestMediaTypes = detectRequestMediaTypes(bodyText, {
                hasBodyParam: !!bodyParamName,
                formDataParams,
            });
            const responseMediaTypes = detectResponseMediaTypes(bodyText);
            const security = extractSecurityRequirements(bodyText);
            const servers = extractOperationServers(bodyText);

            operations.push({
                methodName: method.getName(),
                httpMethod,
                path: urlInfo.path,
                params,
                requestMediaTypes,
                responseMediaTypes,
                ...(security ? { security } : {}),
                ...(docMeta.responses && docMeta.responses.length > 0 ? { responseHints: docMeta.responses } : {}),
                ...(docMeta.tags && docMeta.tags.length > 0 ? { tags: docMeta.tags } : {}),
                ...(servers ? { servers } : {}),
                ...(docMeta.summary ? { summary: docMeta.summary } : {}),
                ...(docMeta.description ? { description: docMeta.description } : {}),
                ...(docMeta.externalDocs ? { externalDocs: docMeta.externalDocs } : {}),
                ...(docMeta.deprecated ? { deprecated: docMeta.deprecated } : {}),
                ...(responseTypeHint ? { responseTypeHint } : {}),
            });
        }

        if (operations.length > 0) {
            services.push({ serviceName, filePath, operations });
        }
    }

    return services;
}

/**
 * Parses generated service files from a file path or directory, returning reconstructed services.
 */
export function parseGeneratedServices(inputPath: string, fileSystem: ReverseFileSystem): ReverseService[] {
    const stat = fileSystem.statSync(inputPath);
    const serviceFiles: string[] = [];

    if (stat.isFile()) {
        if (!isServiceFilePath(inputPath)) {
            throw new Error(`Expected a generated service file (*.service.ts). Received: ${inputPath}`);
        }
        serviceFiles.push(inputPath);
    } else if (stat.isDirectory()) {
        collectServiceFiles(inputPath, fileSystem, serviceFiles);
    } else {
        throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
    }

    if (serviceFiles.length === 0) {
        throw new Error(`No generated service files found under: ${inputPath}`);
    }

    const services = serviceFiles
        .flatMap(filePath => {
            const contents = fileSystem.readFileSync(filePath, 'utf-8');
            return parseGeneratedServiceSource(contents, filePath);
        })
        .filter(service => service.operations.length > 0);

    if (services.length === 0) {
        throw new Error(`No operations could be reconstructed from services under: ${inputPath}`);
    }

    return services;
}

/**
 * Builds a minimal OpenAPI specification from reconstructed service operations.
 */
export function buildOpenApiSpecFromServices(
    services: ReverseService[],
    infoOverrides: Partial<InfoObject> = {},
    schemas?: ReverseSchemaMap,
): SwaggerSpec {
    const info: InfoObject = {
        title: infoOverrides.title ?? 'Recovered OpenAPI',
        version: infoOverrides.version ?? '0.0.0',
        ...infoOverrides,
    };

    const paths: Record<string, any> = {};
    const fixedMethods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query']);
    const schemaNames = schemas ? new Set(Object.keys(schemas)) : undefined;
    const tagNames: string[] = [];
    const tagSet = new Set<string>();

    for (const service of services) {
        for (const op of service.operations) {
            const parameters = buildParameters(op.params, schemaNames);
            const requestBody = buildRequestBody(op, schemaNames);
            const responses = buildResponses(op.responseMediaTypes, op.responseTypeHint, schemaNames, op.responseHints);
            const methodKey = op.httpMethod.toLowerCase();
            const pathItem = paths[op.path] ?? {};
            const operation = {
                operationId: op.methodName,
                ...(op.summary ? { summary: op.summary } : {}),
                ...(op.description ? { description: op.description } : {}),
                ...(op.externalDocs ? { externalDocs: op.externalDocs } : {}),
                ...(op.deprecated ? { deprecated: op.deprecated } : {}),
                ...(op.tags && op.tags.length > 0 ? { tags: op.tags } : {}),
                ...(parameters.length > 0 ? { parameters } : {}),
                ...(requestBody ? { requestBody } : {}),
                responses,
                ...(op.security ? { security: op.security } : {}),
                ...(op.servers && op.servers.length > 0 ? { servers: op.servers } : {}),
            };

            if (fixedMethods.has(methodKey)) {
                pathItem[methodKey] = operation;
            } else {
                const additionalOperations = pathItem.additionalOperations ?? {};
                additionalOperations[op.httpMethod] = operation;
                pathItem.additionalOperations = additionalOperations;
            }

            paths[op.path] = pathItem;

            if (op.tags && op.tags.length > 0) {
                op.tags.forEach(tag => {
                    if (!tagSet.has(tag)) {
                        tagSet.add(tag);
                        tagNames.push(tag);
                    }
                });
            }
        }
    }

    const spec: SwaggerSpec = {
        openapi: '3.2.0',
        info,
        paths,
        jsonSchemaDialect: OAS_3_1_DIALECT,
    } as SwaggerSpec;

    if (tagNames.length > 0) {
        spec.tags = tagNames.map(name => ({ name }));
    }

    if (schemas && Object.keys(schemas).length > 0) {
        spec.components = { ...(spec.components ?? {}), schemas };
    }

    return spec;
}

/**
 * Parses generated metadata files (info, servers, security) from a codegen output directory.
 * This is used by the to_openapi fallback when no snapshot is found.
 */
export function parseGeneratedMetadata(inputPath: string, fileSystem: ReverseFileSystem): ReverseMetadata {
    const rootDir = resolveReverseRoot(inputPath, fileSystem);
    const metadata: ReverseMetadata = {};

    const infoPath = findUpFile(rootDir, 'info.ts', fileSystem) ?? path.resolve(rootDir, 'info.ts');
    const infoText = readTextIfExists(infoPath, fileSystem);
    if (infoText) {
        const info = extractConstInitializer<InfoObject>(infoText, 'API_INFO');
        const tags = extractConstInitializer<TagObject[]>(infoText, 'API_TAGS');
        const externalDocs = extractConstInitializer<ExternalDocumentationObject | undefined>(
            infoText,
            'API_EXTERNAL_DOCS',
        );
        if (info && Object.keys(info).length > 0) metadata.info = info;
        if (tags && tags.length > 0) metadata.tags = tags;
        if (externalDocs !== undefined) metadata.externalDocs = externalDocs;
    }

    const documentMetaPath =
        findUpFile(rootDir, 'document.ts', fileSystem) ?? path.resolve(rootDir, 'document.ts');
    const documentMetaText = readTextIfExists(documentMetaPath, fileSystem);
    if (documentMetaText) {
        const documentMeta = extractConstInitializer<ReverseMetadata['documentMeta']>(
            documentMetaText,
            'API_DOCUMENT_META',
        );
        if (documentMeta && Object.keys(documentMeta).length > 0) metadata.documentMeta = documentMeta;
    }

    const securityPath = findUpFile(rootDir, 'security.ts', fileSystem) ?? path.resolve(rootDir, 'security.ts');
    const securityText = readTextIfExists(securityPath, fileSystem);
    if (securityText) {
        const schemes = extractConstInitializer<Record<string, SecurityScheme>>(
            securityText,
            'API_SECURITY_SCHEMES',
        );
        if (schemes && Object.keys(schemes).length > 0) metadata.securitySchemes = schemes;
        const requirements = extractConstInitializer<Record<string, string[]>[]>(
            securityText,
            'API_SECURITY_REQUIREMENTS',
        );
        if (requirements) metadata.securityRequirements = requirements;
    }

    const serversPath =
        findUpFile(rootDir, 'servers.ts', fileSystem) ??
        findUpFile(rootDir, path.join('utils', 'server-url.ts'), fileSystem) ??
        path.resolve(rootDir, 'servers.ts');
    const serversText = readTextIfExists(serversPath, fileSystem);
    if (serversText) {
        const servers = extractConstInitializer<ServerObject[]>(serversText, 'API_SERVERS');
        if (servers && servers.length > 0) metadata.servers = servers;
    }

    const responseHeadersPath =
        findUpFile(rootDir, 'response-headers.ts', fileSystem) ?? path.resolve(rootDir, 'response-headers.ts');
    const responseHeadersText = readTextIfExists(responseHeadersPath, fileSystem);
    if (responseHeadersText) {
        const registry = extractConstInitializer<Record<string, Record<string, Record<string, string>>>>(
            responseHeadersText,
            'API_RESPONSE_HEADERS',
        );
        const xmlConfigs = extractConstInitializer<Record<string, any>>(responseHeadersText, 'API_HEADER_XML_CONFIGS');
        if (registry && Object.keys(registry).length > 0) metadata.responseHeaders = registry;
        if (xmlConfigs && Object.keys(xmlConfigs).length > 0) metadata.responseHeaderXmlConfigs = xmlConfigs;
    }

    const linksPath = findUpFile(rootDir, 'links.ts', fileSystem) ?? path.resolve(rootDir, 'links.ts');
    const linksText = readTextIfExists(linksPath, fileSystem);
    if (linksText) {
        const links = extractConstInitializer<Record<string, Record<string, Record<string, LinkObject>>>>(
            linksText,
            'API_LINKS',
        );
        if (links && Object.keys(links).length > 0) metadata.links = links;
    }

    const callbacksPath = findUpFile(rootDir, 'callbacks.ts', fileSystem) ?? path.resolve(rootDir, 'callbacks.ts');
    const callbacksText = readTextIfExists(callbacksPath, fileSystem);
    if (callbacksText) {
        const callbacks = extractConstInitializer<ReverseCallbackMeta[]>(callbacksText, 'API_CALLBACKS');
        if (callbacks && callbacks.length > 0) metadata.callbacks = callbacks;
    }

    const webhooksPath = findUpFile(rootDir, 'webhooks.ts', fileSystem) ?? path.resolve(rootDir, 'webhooks.ts');
    const webhooksText = readTextIfExists(webhooksPath, fileSystem);
    if (webhooksText) {
        const webhooks = extractConstInitializer<ReverseWebhookMeta[]>(webhooksText, 'API_WEBHOOKS');
        if (webhooks && webhooks.length > 0) metadata.webhooks = webhooks;
    }

    const examplesPath =
        findUpFile(rootDir, 'examples.ts', fileSystem) ?? path.resolve(rootDir, 'examples.ts');
    const examplesText = readTextIfExists(examplesPath, fileSystem);
    if (examplesText) {
        const examples = extractConstInitializer<Record<string, ExampleObject | { $ref: string }>>(
            examplesText,
            'API_EXAMPLES',
        );
        if (examples && Object.keys(examples).length > 0) metadata.examples = examples;
    }

    const mediaTypesPath =
        findUpFile(rootDir, 'media-types.ts', fileSystem) ?? path.resolve(rootDir, 'media-types.ts');
    const mediaTypesText = readTextIfExists(mediaTypesPath, fileSystem);
    if (mediaTypesText) {
        const mediaTypes = extractConstInitializer<Record<string, MediaTypeObject | { $ref: string }>>(
            mediaTypesText,
            'API_MEDIA_TYPES',
        );
        if (mediaTypes && Object.keys(mediaTypes).length > 0) metadata.mediaTypes = mediaTypes;
    }

    const pathItemsPath =
        findUpFile(rootDir, 'path-items.ts', fileSystem) ?? path.resolve(rootDir, 'path-items.ts');
    const pathItemsText = readTextIfExists(pathItemsPath, fileSystem);
    if (pathItemsText) {
        const pathItems = extractConstInitializer<Record<string, PathItem | { $ref: string }>>(
            pathItemsText,
            'API_PATH_ITEMS',
        );
        if (pathItems && Object.keys(pathItems).length > 0) metadata.pathItems = pathItems;
    }

    const parametersPath =
        findUpFile(rootDir, 'parameters.ts', fileSystem) ?? path.resolve(rootDir, 'parameters.ts');
    const parametersText = readTextIfExists(parametersPath, fileSystem);
    if (parametersText) {
        const parameters = extractConstInitializer<Record<string, Parameter | { $ref: string }>>(
            parametersText,
            'API_PARAMETERS',
        );
        if (parameters && Object.keys(parameters).length > 0) metadata.parameters = parameters;
    }

    const requestBodiesPath =
        findUpFile(rootDir, 'request-bodies.ts', fileSystem) ?? path.resolve(rootDir, 'request-bodies.ts');
    const requestBodiesText = readTextIfExists(requestBodiesPath, fileSystem);
    if (requestBodiesText) {
        const requestBodies = extractConstInitializer<Record<string, RequestBody | { $ref: string }>>(
            requestBodiesText,
            'API_REQUEST_BODIES',
        );
        if (requestBodies && Object.keys(requestBodies).length > 0) metadata.requestBodies = requestBodies;
    }

    const responsesPath =
        findUpFile(rootDir, 'responses.ts', fileSystem) ?? path.resolve(rootDir, 'responses.ts');
    const responsesText = readTextIfExists(responsesPath, fileSystem);
    if (responsesText) {
        const responses = extractConstInitializer<Record<string, SwaggerResponse | { $ref: string }>>(
            responsesText,
            'API_RESPONSES',
        );
        if (responses && Object.keys(responses).length > 0) metadata.responses = responses;
    }

    return metadata;
}

/**
 * Applies reconstructed metadata to a minimal spec built from services.
 */
export function applyReverseMetadata(spec: SwaggerSpec, metadata: ReverseMetadata): SwaggerSpec {
    const nextSpec: SwaggerSpec = { ...spec };

    if (metadata.info) {
        nextSpec.info = { ...nextSpec.info, ...metadata.info };
    }
    if (metadata.tags) {
        nextSpec.tags = metadata.tags;
    }
    if (metadata.externalDocs !== undefined) {
        nextSpec.externalDocs = metadata.externalDocs;
    }
    if (metadata.documentMeta) {
        if (metadata.documentMeta.openapi) {
            nextSpec.openapi = metadata.documentMeta.openapi;
        }
        if (metadata.documentMeta.swagger) {
            nextSpec.swagger = metadata.documentMeta.swagger;
            delete nextSpec.openapi;
            delete nextSpec.jsonSchemaDialect;
        }
        if (metadata.documentMeta.$self !== undefined) {
            nextSpec.$self = metadata.documentMeta.$self;
        }
        if (metadata.documentMeta.jsonSchemaDialect !== undefined) {
            nextSpec.jsonSchemaDialect = metadata.documentMeta.jsonSchemaDialect;
        } else if (metadata.documentMeta.openapi && /^3\\.0\\./.test(metadata.documentMeta.openapi)) {
            delete nextSpec.jsonSchemaDialect;
        }
    }
    if (metadata.servers) {
        nextSpec.servers = metadata.servers;
    }
    if (metadata.securitySchemes) {
        nextSpec.components = { ...nextSpec.components, securitySchemes: metadata.securitySchemes };
    }
    if (metadata.securityRequirements) {
        nextSpec.security = metadata.securityRequirements;
    }

    applyResponseArtifacts(nextSpec, metadata);
    applyComponentArtifacts(nextSpec, metadata);

    return nextSpec;
}

type OperationIndexEntry = {
    operationId: string;
    operation: Record<string, any>;
    path: string;
    method: string;
};

function applyResponseArtifacts(spec: SwaggerSpec, metadata: ReverseMetadata): void {
    const responseHeaders = metadata.responseHeaders || {};
    const linksRegistry = metadata.links || {};
    if (Object.keys(responseHeaders).length === 0 && Object.keys(linksRegistry).length === 0) return;

    const operationIndex = buildOperationIndex(spec);

    const operationIds = new Set<string>([
        ...Object.keys(responseHeaders),
        ...Object.keys(linksRegistry),
    ]);

    operationIds.forEach(operationId => {
        const entry = operationIndex.get(operationId);
        if (!entry) return;
        const operation = entry.operation;
        const existingResponses = (operation.responses || {}) as Record<string, SwaggerResponse>;

        const headerStatuses = Object.keys(responseHeaders[operationId] || {});
        const linkStatuses = Object.keys(linksRegistry[operationId] || {});
        const statusCodes = new Set<string>([
            ...Object.keys(existingResponses),
            ...headerStatuses,
            ...linkStatuses,
        ]);

        if (statusCodes.size === 0) {
            statusCodes.add('200');
        }

        const baseContent = findBaseResponseContent(existingResponses);

        statusCodes.forEach(status => {
            const response = { ...(existingResponses[status] || {}) } as SwaggerResponse;

            if (!response.description) {
                response.description = status === 'default' ? 'Default response' : 'Response';
            }

            if (!response.content && baseContent) {
                response.content = baseContent;
            }

            const headerHints = responseHeaders[operationId]?.[status];
            if (headerHints) {
                const resolvedHeaders: Record<string, HeaderObject> = response.headers
                    ? { ...(response.headers as Record<string, HeaderObject>) }
                    : {};

                Object.entries(headerHints).forEach(([headerName, hint]) => {
                    if (!resolvedHeaders[headerName]) {
                        resolvedHeaders[headerName] = buildHeaderObjectFromHint(hint);
                    }
                });

                if (Object.keys(resolvedHeaders).length > 0) {
                    response.headers = resolvedHeaders;
                }
            }

            const statusLinks = linksRegistry[operationId]?.[status];
            if (statusLinks) {
                response.links = {
                    ...(response.links || {}),
                    ...statusLinks,
                };
            }

            existingResponses[status] = response;
        });

        operation.responses = existingResponses;
    });
}

function findBaseResponseContent(responses: Record<string, SwaggerResponse>): SwaggerResponse['content'] | undefined {
    for (const response of Object.values(responses)) {
        if (response && response.content) return response.content;
    }
    return undefined;
}

function buildHeaderObjectFromHint(hint: string): HeaderObject {
    switch (hint) {
        case 'set-cookie':
            return { schema: { type: 'string' } };
        case 'linkset':
            return { content: { 'application/linkset': { schema: {} } } };
        case 'json':
            return { content: { 'application/json': { schema: {} } } };
        case 'xml':
            return { content: { 'application/xml': { schema: {} } } };
        case 'array':
            return { schema: { type: 'array', items: {} } };
        case 'number':
            return { schema: { type: 'number' } };
        case 'boolean':
            return { schema: { type: 'boolean' } };
        case 'date':
            return { schema: { type: 'string', format: 'date-time' } };
        default:
            return { schema: { type: 'string' } };
    }
}

function applyComponentArtifacts(spec: SwaggerSpec, metadata: ReverseMetadata): void {
    const components = { ...(spec.components || {}) } as NonNullable<SwaggerSpec['components']>;

    const operationIndex = buildOperationIndex(spec);

    const parameters: Record<string, Parameter> = { ...(components.parameters || {}) };
    const requestBodies: Record<string, RequestBody> = { ...(components.requestBodies || {}) };
    const responses: Record<string, SwaggerResponse> = { ...(components.responses || {}) };
    const headers: Record<string, HeaderObject> = { ...(components.headers || {}) };
    const links: Record<string, LinkObject> = { ...(components.links || {}) };
    const callbacks: Record<string, PathItem | { $ref: string }> = { ...(components.callbacks || {}) };
    const webhooks: Record<string, PathItem | { $ref: string }> = { ...(components.webhooks || {}) };
    const examples: Record<string, ExampleObject | { $ref: string }> = { ...(components.examples || {}) };
    const mediaTypes: Record<string, MediaTypeObject | { $ref: string }> = { ...(components.mediaTypes || {}) };
    const pathItems: Record<string, PathItem | { $ref: string }> = { ...(components.pathItems || {}) };

    operationIndex.forEach(entry => {
        const operation = entry.operation;
        const operationId = entry.operationId;

        if (Array.isArray(operation.parameters)) {
            operation.parameters.forEach((param: Parameter) => {
                if (!param || !param.name || !param.in) return;
                const key = sanitizeComponentKey(`${operationId}_${param.in}_${param.name}`);
                if (!parameters[key]) parameters[key] = param;
            });
        }

        if (operation.requestBody) {
            const key = sanitizeComponentKey(`${operationId}_RequestBody`);
            if (!requestBodies[key]) requestBodies[key] = operation.requestBody as RequestBody;
        }

        if (operation.responses) {
            Object.entries(operation.responses as Record<string, SwaggerResponse>).forEach(([status, response]) => {
                const key = sanitizeComponentKey(`${operationId}_${status}_Response`);
                if (!responses[key]) responses[key] = response;

                if (response.headers) {
                    Object.entries(response.headers).forEach(([headerName, headerObj]) => {
                        const headerKey = sanitizeComponentKey(`${operationId}_${status}_${headerName}`);
                        if (!headers[headerKey]) headers[headerKey] = headerObj as HeaderObject;
                    });
                }

                if (response.links) {
                    Object.entries(response.links).forEach(([linkName, linkObj]) => {
                        const linkKey = sanitizeComponentKey(`${operationId}_${status}_${linkName}`);
                        if (!links[linkKey]) links[linkKey] = linkObj as LinkObject;
                    });
                }
            });
        }
    });

    if (metadata.links) {
        Object.entries(metadata.links).forEach(([operationId, statusMap]) => {
            Object.entries(statusMap).forEach(([status, linkMap]) => {
                Object.entries(linkMap).forEach(([linkName, linkObj]) => {
                    const key = sanitizeComponentKey(`${operationId}_${status}_${linkName}`);
                    if (!links[key]) links[key] = linkObj;
                });
            });
        });
    }

    if (metadata.responseHeaders) {
        Object.entries(metadata.responseHeaders).forEach(([operationId, statusMap]) => {
            Object.entries(statusMap).forEach(([status, headerMap]) => {
                Object.entries(headerMap).forEach(([headerName, hint]) => {
                    const key = sanitizeComponentKey(`${operationId}_${status}_${headerName}`);
                    if (!headers[key]) headers[key] = buildHeaderObjectFromHint(hint);
                });
            });
        });
    }

    if (metadata.examples) {
        Object.entries(metadata.examples).forEach(([name, example]) => {
            if (!examples[name]) examples[name] = example;
        });
    }

    if (metadata.mediaTypes) {
        Object.entries(metadata.mediaTypes).forEach(([name, mediaType]) => {
            if (!mediaTypes[name]) mediaTypes[name] = mediaType;
        });
    }

    if (metadata.pathItems) {
        Object.entries(metadata.pathItems).forEach(([name, pathItem]) => {
            if (!pathItems[name]) pathItems[name] = pathItem;
        });
    }

    if (metadata.parameters) {
        Object.entries(metadata.parameters).forEach(([name, param]) => {
            if (!parameters[name]) parameters[name] = param as Parameter;
        });
    }

    if (metadata.requestBodies) {
        Object.entries(metadata.requestBodies).forEach(([name, body]) => {
            if (!requestBodies[name]) requestBodies[name] = body as RequestBody;
        });
    }

    if (metadata.responses) {
        Object.entries(metadata.responses).forEach(([name, response]) => {
            if (!responses[name]) responses[name] = response as SwaggerResponse;
        });
    }

    if (metadata.callbacks) {
        metadata.callbacks.forEach(callback => {
            const method = callback.method.toLowerCase();
            const key = sanitizeComponentKey(callback.name);
            const expression = callback.expression ?? '{$request.body}';
            const existing = callbacks[key];
            const existingIsRef = !!existing && typeof existing === 'object' && '$ref' in existing;

            if (callback.pathItem) {
                const callbackMap: Record<string, PathItem> = existingIsRef
                    ? {}
                    : { ...((existing as Record<string, PathItem>) ?? {}) };
                const priorPathItem = callbackMap[expression];
                callbackMap[expression] = mergePathItem(priorPathItem, callback.pathItem);
                callbacks[key] = callbackMap;
                return;
            }

            if (existingIsRef) {
                return;
            }

            const callbackMap: Record<string, PathItem> = {
                ...((existing as Record<string, PathItem>) ?? {}),
            };
            const entry = callbackMap[expression] ?? {};
            if (!(entry as any)[method]) {
                (entry as any)[method] = {
                    responses: { '200': { description: 'Callback response' } },
                };
            }
            callbackMap[expression] = entry;
            callbacks[key] = callbackMap;
        });
    }

    if (metadata.webhooks) {
        metadata.webhooks.forEach(webhook => {
            const method = webhook.method.toLowerCase();
            const key = sanitizeComponentKey(webhook.name);
            const incoming = webhook.pathItem ?? {
                [method]: { responses: { '200': { description: 'Webhook response' } } },
            };
            const existingComponent = webhooks[key];
            const existingIsRef = !!existingComponent && typeof existingComponent === 'object' && '$ref' in existingComponent;

            if (!existingIsRef || webhook.pathItem) {
                const mergedComponent = mergePathItem(
                    existingIsRef ? undefined : (existingComponent as PathItem | undefined),
                    incoming,
                );
                webhooks[key] = mergedComponent;
            }

            const scope = webhook.scope ?? 'root';
            if (scope !== 'component') {
                spec.webhooks = spec.webhooks ?? {};
                const existingWebhook = spec.webhooks[webhook.name];
                spec.webhooks[webhook.name] = existingWebhook
                    ? mergePathItem(existingWebhook, incoming)
                    : incoming;
            }
        });
    }

    components.parameters = parameters;
    components.requestBodies = requestBodies;
    components.responses = responses;
    components.headers = headers;
    components.links = links;
    components.callbacks = callbacks;
    components.webhooks = webhooks;
    components.examples = examples;
    components.mediaTypes = mediaTypes;
    components.pathItems = pathItems;

    spec.components = components;
}

function mergePathItem(base: PathItem | undefined, incoming: PathItem): PathItem {
    if (!base) return { ...incoming };
    if (incoming.$ref) return { $ref: incoming.$ref };

    const merged: PathItem = { ...base, ...incoming };
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

    methods.forEach(method => {
        const nextOp = (incoming as any)[method];
        const prevOp = (base as any)[method];
        if (nextOp) {
            (merged as any)[method] = prevOp ? { ...prevOp, ...nextOp } : nextOp;
        } else if (prevOp) {
            (merged as any)[method] = prevOp;
        }
    });

    if (base.additionalOperations || incoming.additionalOperations) {
        merged.additionalOperations = {
            ...(base.additionalOperations ?? {}),
            ...(incoming.additionalOperations ?? {}),
        };
    }

    return merged;
}

function buildOperationIndex(spec: SwaggerSpec): Map<string, OperationIndexEntry> {
    const index = new Map<string, OperationIndexEntry>();
    const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'query'];

    if (!spec.paths) return index;

    Object.entries(spec.paths).forEach(([pathKey, pathItem]) => {
        if (!pathItem || typeof pathItem !== 'object') return;

        methods.forEach(method => {
            const op = (pathItem as any)[method];
            if (op && typeof op.operationId === 'string') {
                index.set(op.operationId, {
                    operationId: op.operationId,
                    operation: op,
                    path: pathKey,
                    method,
                });
            }
        });

        if ((pathItem as any).additionalOperations) {
            Object.entries((pathItem as any).additionalOperations).forEach(([method, op]) => {
                if (op && typeof (op as any).operationId === 'string') {
                    index.set((op as any).operationId, {
                        operationId: (op as any).operationId,
                        operation: op as Record<string, any>,
                        path: pathKey,
                        method,
                    });
                }
            });
        }
    });

    return index;
}

function sanitizeComponentKey(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isServiceFilePath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
        normalized.endsWith(SERVICE_FILE_SUFFIX) &&
        !normalized.endsWith(SERVICE_SPEC_SUFFIX) &&
        !normalized.endsWith(SERVICE_DECL_SUFFIX)
    );
}

function collectServiceFiles(dirPath: string, fileSystem: ReverseFileSystem, output: string[]): void {
    const entries = fileSystem.readdirSync(dirPath);
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fileSystem.statSync(fullPath);
        if (stat.isDirectory()) {
            collectServiceFiles(fullPath, fileSystem, output);
            continue;
        }
        if (stat.isFile() && isServiceFilePath(fullPath)) {
            output.push(fullPath);
        }
    }
}

function buildParamMeta(method: MethodDeclaration): Map<string, boolean> {
    const map = new Map<string, boolean>();
    for (const param of method.getParameters()) {
        const name = param.getName();
        if (name === 'options') continue;
        map.set(name, !param.isOptional());
    }
    return map;
}

function extractReturnTypeHint(method: MethodDeclaration): string | undefined {
    const returnNode = method.getReturnTypeNode();
    if (!returnNode) return undefined;
    const typeText = returnNode.getText().trim();
    return typeText.length > 0 ? typeText : undefined;
}

function extractParamTypeHint(method: MethodDeclaration, paramName: string): string | undefined {
    const param = method.getParameters().find(p => p.getName() === paramName);
    if (!param) return undefined;
    const typeNode = param.getTypeNode();
    if (!typeNode) return undefined;
    const typeText = typeNode.getText().trim();
    return typeText.length > 0 ? typeText : undefined;
}

function findHttpCall(method: MethodDeclaration): { httpMethod: string; bodyArg?: string } | null {
    const calls = method.getDescendantsOfKind(SyntaxKind.CallExpression);
    for (const call of calls) {
        const expr = call.getExpression();
        if (!Node.isPropertyAccessExpression(expr)) continue;
        const target = expr.getExpression().getText();
        if (target !== 'this.http') continue;

        const propName = expr.getName();
        if (propName !== 'request') {
            const args = call.getArguments();
            const bodyArg = args.length > 1 ? extractIdentifier(args[1].getText()) : undefined;
            return { httpMethod: propName.toUpperCase(), bodyArg };
        }

        const args = call.getArguments();
        const methodArg = args[0];
        if (!methodArg || (!Node.isStringLiteral(methodArg) && !Node.isNoSubstitutionTemplateLiteral(methodArg))) {
            return null;
        }
        const httpMethod = methodArg.getLiteralText().toUpperCase();
        const bodyArg = extractBodyFromRequestOptions(args);
        return { httpMethod, bodyArg };
    }
    return null;
}

function extractBodyFromRequestOptions(args: Node[]): string | undefined {
    for (const arg of args) {
        let target = arg;
        if (Node.isAsExpression(target)) target = target.getExpression();
        if (Node.isTypeAssertion(target)) target = target.getExpression();
        if (!Node.isObjectLiteralExpression(target)) continue;

        const bodyProp = target.getProperty('body');
        if (!bodyProp || !Node.isPropertyAssignment(bodyProp)) continue;
        const initializer = bodyProp.getInitializer();
        if (!initializer) return undefined;
        return extractIdentifier(initializer.getText());
    }
    return undefined;
}

function extractUrlTemplate(bodyText: string): ParsedPathInfo | null {
    const match = bodyText.match(/const url = `([\s\S]*?)`;/);
    if (!match) return null;

    let template = match[1];
    template = template.replace(/\$\{basePath\}/g, '');
    template = template.replace(/\$\{queryString[^}]*\}/g, '');

    const pathParams: {
        name: string;
        variableName?: string;
        style?: string;
        explode?: boolean;
        allowReserved?: boolean;
        serialization?: 'json';
    }[] = [];

    const calls = extractFunctionCallArgs(template, 'ParameterSerializer.serializePathParam');
    calls.forEach(args => {
        const name = parseStringLiteral(args[0]);
        if (!name) return;
        const variableName = extractIdentifier(args[1]);
        const style = parseStringLiteral(args[2]);
        const explode = parseBooleanLiteral(args[3]);
        const allowReserved = parseBooleanLiteral(args[4]);
        const serialization = parseStringLiteral(args[5]) === 'json' ? 'json' : undefined;

        pathParams.push({
            name,
            ...(variableName ? { variableName } : {}),
            ...(style ? { style } : {}),
            ...(explode !== undefined ? { explode } : {}),
            ...(allowReserved !== undefined ? { allowReserved } : {}),
            ...(serialization ? { serialization } : {}),
        });
    });

    let pathIndex = 0;
    template = template.replace(/\$\{ParameterSerializer\.serializePathParam\([^\}]*\)\}/g, () => {
        const param = pathParams[pathIndex++];
        if (!param) return '';
        return `{${param.name}}`;
    });

    const path = template.trim() || '/';
    return { path: path.startsWith('/') ? path : `/${path}`, pathParams };
}

function extractQueryParams(bodyText: string): {
    name: string;
    variableName?: string;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    allowEmptyValue?: boolean;
    serialization?: 'json';
    contentType?: string;
    encoding?: Record<string, any>;
}[] {
    const results: {
        name: string;
        variableName?: string;
        style?: string;
        explode?: boolean;
        allowReserved?: boolean;
        allowEmptyValue?: boolean;
        serialization?: 'json';
        contentType?: string;
        encoding?: Record<string, any>;
    }[] = [];

    const calls = extractFunctionCallArgs(bodyText, 'ParameterSerializer.serializeQueryParam');
    calls.forEach(args => {
        const configText = args[0];
        const variableName = extractIdentifier(args[1]);
        const config = parseJsonLiteral<{
            name?: string;
            style?: string;
            explode?: boolean;
            allowReserved?: boolean;
            allowEmptyValue?: boolean;
            serialization?: string | null;
            contentType?: string;
            encoding?: Record<string, any>;
        }>(configText);

        const name = config?.name ?? parseConfigName(configText);
        if (!name) return;

        results.push({
            name,
            ...(variableName ? { variableName } : {}),
            ...(config?.style ? { style: config.style } : {}),
            ...(config?.explode !== undefined ? { explode: config.explode } : {}),
            ...(config?.allowReserved !== undefined ? { allowReserved: config.allowReserved } : {}),
            ...(config?.allowEmptyValue !== undefined ? { allowEmptyValue: config.allowEmptyValue } : {}),
            ...(config?.serialization === 'json' ? { serialization: 'json' } : {}),
            ...(config?.contentType ? { contentType: config.contentType } : {}),
            ...(config?.encoding ? { encoding: config.encoding } : {}),
        });
    });

    return results;
}

function parseStringLiteral(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    const match = trimmed.match(/^['"]([^'"]+)['"]$/);
    return match ? match[1] : undefined;
}

function parseBooleanLiteral(value: string | undefined): boolean | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    return undefined;
}

function parseJsonLiteral<T = any>(value: string | undefined): T | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (trimmed === 'undefined') return undefined;
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined;
    try {
        return JSON.parse(trimmed) as T;
    } catch {
        return undefined;
    }
}

function parseArgsFromString(argText: string): string[] | undefined {
    const wrapper = `fn(${argText})`;
    const parsed = parseCallArguments(wrapper, wrapper.indexOf('(') + 1);
    return parsed?.args;
}

function normalizeDocComment(comment: unknown): string {
    if (!comment) return '';
    if (typeof comment === 'string') return comment;
    if (Array.isArray(comment)) return comment.map(part => normalizeDocComment(part)).join('');
    if (Node.isNode(comment)) return comment.getText();
    return String(comment);
}

function extractMethodDocs(method: MethodDeclaration): {
    summary?: string;
    description?: string;
    deprecated?: boolean;
    externalDocs?: ExternalDocumentationObject;
    tags?: string[];
    responses?: ReverseResponseHint[];
} {
    const docs = method.getJsDocs();
    if (!docs.length) return {};

    const primary = docs[0];
    const rawComment = normalizeDocComment(primary.getComment());
    const lines = rawComment
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
    const summary = lines.length > 0 ? lines[0] : undefined;
    const description = lines.length > 1 ? lines.slice(1).join('\n') : undefined;

    const tags = primary.getTags();
    const deprecated =
        tags.some(tag => tag.getTagName() === 'deprecated') || rawComment.toLowerCase().includes('@deprecated');
    const tagNames: string[] = [];
    const responseHints: ReverseResponseHint[] = [];
    tags.forEach(tag => {
        const tagName = tag.getTagName();
        if (tagName === 'tag' || tagName === 'tags') {
            const rawTagText = normalizeDocComment(tag.getComment());
            if (rawTagText) {
                rawTagText
                    .split(',')
                    .map(entry => entry.trim())
                    .flatMap(entry => entry.split(/\s+/))
                    .forEach(entry => {
                        if (entry) tagNames.push(entry);
                    });
            }
            return;
        }

        if (tagName === 'response') {
            const rawTagText = normalizeDocComment(tag.getComment());
            if (!rawTagText) return;
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            const status = parts.shift();
            if (!status) return;

            let mediaTypes: string[] | undefined;
            if (parts.length > 0 && parts[0].includes('/')) {
                const mediaRaw = parts.shift() as string;
                mediaTypes = mediaRaw
                    .split(',')
                    .map(entry => entry.trim())
                    .filter(Boolean);
            }

            const description = parts.join(' ').trim();
            responseHints.push({
                status,
                ...(mediaTypes && mediaTypes.length > 0 ? { mediaTypes } : {}),
                ...(description ? { description } : {}),
            });
        }
    });
    const uniqueTags = Array.from(new Set(tagNames));

    const seeTag = tags.find(tag => tag.getTagName() === 'see');
    const seeComment = seeTag ? normalizeDocComment(seeTag.getComment()) : '';
    let externalDocs: ExternalDocumentationObject | undefined;
    if (seeComment) {
        const parts = seeComment.trim().split(/\s+/);
        let url = parts.shift();
        let descriptionText = parts.join(' ').trim();

        if (url && url.startsWith('://') && seeTag) {
            const rawTagText = seeTag
                .getText()
                .split(/\r?\n/)
                .map(line => line.replace(/^\s*\*\s?/, '').trim())
                .join(' ')
                .trim()
                .replace(/^@see\s+/i, '')
                .trim();
            const fallbackParts = rawTagText.split(/\s+/);
            const fallbackUrl = fallbackParts.shift();
            if (fallbackUrl) {
                url = fallbackUrl;
                if (!descriptionText) {
                    descriptionText = fallbackParts.join(' ').trim();
                }
            }
        }

        if (url) {
            externalDocs = descriptionText ? { url, description: descriptionText } : { url };
        }
    }

    return {
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        ...(deprecated ? { deprecated } : {}),
        ...(externalDocs ? { externalDocs } : {}),
        ...(uniqueTags.length > 0 ? { tags: uniqueTags } : {}),
        ...(responseHints.length > 0 ? { responses: responseHints } : {}),
    };
}

function extractFunctionCallArgs(bodyText: string, functionName: string): string[][] {
    const results: string[][] = [];
    const token = `${functionName}(`;
    let index = 0;

    while ((index = bodyText.indexOf(token, index)) !== -1) {
        const start = index + token.length;
        const parsed = parseCallArguments(bodyText, start);
        if (parsed) {
            results.push(parsed.args);
            index = parsed.endIndex + 1;
        } else {
            index = start;
        }
    }

    return results;
}

function parseCallArguments(
    bodyText: string,
    startIndex: number,
): { args: string[]; endIndex: number } | undefined {
    const args: string[] = [];
    let current = '';
    let depth = 0;
    let inString = false;
    let quoteChar: '"' | "'" | null = null;
    let escaping = false;

    for (let i = startIndex; i < bodyText.length; i++) {
        const ch = bodyText[i];

        if (inString) {
            current += ch;
            if (escaping) {
                escaping = false;
                continue;
            }
            if (ch === '\\\\') {
                escaping = true;
                continue;
            }
            if (quoteChar && ch === quoteChar) {
                inString = false;
                quoteChar = null;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = true;
            quoteChar = ch as '"' | "'";
            current += ch;
            continue;
        }

        if (ch === '(' || ch === '[' || ch === '{') {
            depth += 1;
            current += ch;
            continue;
        }

        if (ch === ')' && depth === 0) {
            if (current.trim().length > 0) args.push(current.trim());
            return { args, endIndex: i };
        }

        if (ch === ')' || ch === ']' || ch === '}') {
            depth = Math.max(0, depth - 1);
            current += ch;
            continue;
        }

        if (ch === ',' && depth === 0) {
            args.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    return undefined;
}

function extractRawQuerystringParams(
    bodyText: string,
): { name: string; variableName?: string; contentType?: string; serialization?: 'json'; encoding?: Record<string, any> }[] {
    const results: {
        name: string;
        variableName?: string;
        contentType?: string;
        serialization?: 'json';
        encoding?: Record<string, any>;
    }[] = [];

    const calls = extractFunctionCallArgs(bodyText, 'serializeRawQuerystring');
    calls.forEach(args => {
        const expression = args[0]?.trim();
        const arg2 = args[1]?.trim();
        const arg3 = args[2]?.trim();
        const arg4 = args[3]?.trim();
        const variableName = extractIdentifier(expression);

        const arg2Literal = parseStringLiteral(arg2);
        const arg3Literal = parseStringLiteral(arg3);

        let serialization: 'json' | undefined;
        let contentType: string | undefined;
        const encoding = parseJsonLiteral<Record<string, any>>(arg4);

        if (arg2Literal === 'json') {
            serialization = 'json';
            contentType = 'application/json';
        } else if (arg2Literal && arg2Literal !== 'undefined') {
            contentType = arg2Literal;
        }

        if (arg3Literal && arg3Literal !== 'undefined') {
            contentType = arg3Literal;
        }

        if (variableName) {
            results.push({ name: variableName, variableName, contentType, serialization, encoding });
        }
    });
    return results;
}

function extractHeaderParams(bodyText: string): {
    name: string;
    variableName?: string;
    explode?: boolean;
    serialization?: 'json';
    contentType?: string;
    encoding?: Record<string, any>;
}[] {
    const results: {
        name: string;
        variableName?: string;
        explode?: boolean;
        serialization?: 'json';
        contentType?: string;
        encoding?: Record<string, any>;
    }[] = [];
    const regex = /headers\.set\(['"]([^'"]+)['"]\s*,\s*ParameterSerializer\.serializeHeaderParam\(([^)]*)\)\)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(bodyText)) !== null) {
        const name = match[1];
        const args = parseArgsFromString(match[2]) ?? [];
        const variableName = extractIdentifier(args[0]);
        const explode = parseBooleanLiteral(args[1]);
        const serialization = parseStringLiteral(args[2]) === 'json' ? 'json' : undefined;
        const contentType = parseStringLiteral(args[3]);
        const encoding = parseJsonLiteral<Record<string, any>>(args[4]);
        results.push({
            name,
            ...(variableName ? { variableName } : {}),
            ...(explode !== undefined ? { explode } : {}),
            ...(serialization ? { serialization } : {}),
            ...(contentType ? { contentType } : {}),
            ...(encoding ? { encoding } : {}),
        });
    }
    return results;
}

function extractCookieParams(bodyText: string): {
    name: string;
    variableName?: string;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    serialization?: 'json';
}[] {
    const results: {
        name: string;
        variableName?: string;
        style?: string;
        explode?: boolean;
        allowReserved?: boolean;
        serialization?: 'json';
    }[] = [];

    const calls = extractFunctionCallArgs(bodyText, 'ParameterSerializer.serializeCookieParam');
    calls.forEach(args => {
        const name = parseStringLiteral(args[0]);
        if (!name) return;
        const variableName = extractIdentifier(args[1]);
        const style = parseStringLiteral(args[2]);
        const explode = parseBooleanLiteral(args[3]);
        const allowReserved = parseBooleanLiteral(args[4]);
        const serialization = parseStringLiteral(args[5]) === 'json' ? 'json' : undefined;

        results.push({
            name,
            ...(variableName ? { variableName } : {}),
            ...(style ? { style } : {}),
            ...(explode !== undefined ? { explode } : {}),
            ...(allowReserved !== undefined ? { allowReserved } : {}),
            ...(serialization ? { serialization } : {}),
        });
    });
    return results;
}

function extractFormDataParams(bodyText: string): { name: string; variableName?: string; kind: 'multipart' | 'urlencoded' }[] {
    const results: { name: string; variableName?: string; kind: 'multipart' | 'urlencoded' }[] = [];

    const formDataRegex = /formData\.append\(['"]([^'"]+)['"]\s*,\s*([^\)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = formDataRegex.exec(bodyText)) !== null) {
        results.push({
            name: match[1],
            variableName: extractIdentifier(match[2]),
            kind: 'multipart',
        });
    }

    const urlEncodedRegex = /formBody(?:\s*=\s*formBody)?\.append\(['"]([^'"]+)['"]\s*,\s*([^\)]+)\)/g;
    while ((match = urlEncodedRegex.exec(bodyText)) !== null) {
        results.push({
            name: match[1],
            variableName: extractIdentifier(match[2]),
            kind: 'urlencoded',
        });
    }

    return results;
}

function detectBodyParamName(
    bodyText: string,
    httpBodyArg: string | undefined,
    paramMeta: Map<string, boolean>,
): string | undefined {
    if (httpBodyArg && paramMeta.has(httpBodyArg)) {
        return httpBodyArg;
    }

    const candidates = [
        extractFirstArgument(bodyText, 'MultipartBuilder.serialize'),
        extractFirstArgument(bodyText, 'ParameterSerializer.serializeUrlEncodedBody'),
        extractFirstArgument(bodyText, 'XmlBuilder.serialize'),
    ];

    for (const candidate of candidates) {
        if (candidate && paramMeta.has(candidate)) return candidate;
    }

    return undefined;
}

function detectRequestMediaTypes(
    bodyText: string,
    options: { hasBodyParam: boolean; formDataParams: { kind: 'multipart' | 'urlencoded' }[] },
): string[] {
    const mediaTypes = new Set<string>();

    const contentTypeRegex = /headers\.set\(['"]Content-Type['"]\s*,\s*['"]([^'"]+)['"]\)/g;
    let match: RegExpExecArray | null;
    while ((match = contentTypeRegex.exec(bodyText)) !== null) {
        mediaTypes.add(match[1]);
    }

    if (mediaTypes.size > 0) return Array.from(mediaTypes);

    const hasMultipartBuilder = bodyText.includes('MultipartBuilder.serialize');
    const hasFormData = options.formDataParams.some(p => p.kind === 'multipart');
    const hasUrlEncodedBody = bodyText.includes('ParameterSerializer.serializeUrlEncodedBody');
    const hasLegacyUrlEncoded = options.formDataParams.some(p => p.kind === 'urlencoded');
    const hasXmlBody = bodyText.includes('XmlBuilder.serialize');

    if (hasMultipartBuilder || hasFormData) mediaTypes.add('multipart/form-data');
    else if (hasUrlEncodedBody || hasLegacyUrlEncoded) mediaTypes.add('application/x-www-form-urlencoded');
    else if (hasXmlBody) mediaTypes.add('application/xml');
    else if (options.hasBodyParam || options.formDataParams.length > 0) mediaTypes.add('application/json');

    return Array.from(mediaTypes);
}

function detectResponseMediaTypes(bodyText: string): string[] {
    const mediaTypes = new Set<string>();

    const acceptRegex = /acceptHeader\??\.includes\(['"]([^'"]+)['"]\)/g;
    let match: RegExpExecArray | null;
    while ((match = acceptRegex.exec(bodyText)) !== null) {
        mediaTypes.add(match[1]);
    }

    if (mediaTypes.size > 0) return Array.from(mediaTypes);

    if (bodyText.includes('new EventSource')) return ['text/event-stream'];
    if (bodyText.includes('XmlParser.parse')) return ['application/xml'];
    if (
        bodyText.includes("response.split('\\\\x1e')") ||
        /response\.split\('\u001e'\)/.test(bodyText)
    ) {
        return ['application/json-seq'];
    }
    if (bodyText.includes("response.split('\\\\n')") || /response\.split\('\n'\)/.test(bodyText)) {
        return ['application/jsonl'];
    }
    return ['application/json'];
}

function extractSecurityRequirements(bodyText: string): Record<string, string[]>[] | undefined {
    const tokenIndex = bodyText.indexOf('SECURITY_CONTEXT_TOKEN');
    if (tokenIndex === -1) return undefined;

    const bracketIndex = bodyText.indexOf('[', tokenIndex);
    if (bracketIndex === -1) return undefined;

    const jsonArray = extractJsonArray(bodyText, bracketIndex);
    if (!jsonArray) return undefined;

    try {
        const parsed = JSON.parse(jsonArray);
        if (Array.isArray(parsed)) {
            return parsed as Record<string, string[]>[];
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function extractOperationServers(bodyText: string): ServerObject[] | undefined {
    const tokenIndex = bodyText.indexOf('const operationServers');
    if (tokenIndex === -1) return undefined;

    const bracketIndex = bodyText.indexOf('[', tokenIndex);
    if (bracketIndex === -1) return undefined;

    const jsonArray = extractJsonArray(bodyText, bracketIndex);
    if (!jsonArray) return undefined;

    try {
        const parsed = JSON.parse(jsonArray);
        if (Array.isArray(parsed)) {
            return parsed as ServerObject[];
        }
    } catch {
        return undefined;
    }

    return undefined;
}

function extractJsonArray(text: string, startIndex: number): string | undefined {
    let depth = 0;
    let inString = false;
    let escaping = false;
    let arrayStart = -1;

    for (let i = startIndex; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escaping) {
                escaping = false;
                continue;
            }
            if (ch === '\\\\') {
                escaping = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '[') {
            if (depth === 0) arrayStart = i;
            depth += 1;
            continue;
        }

        if (ch === ']') {
            depth -= 1;
            if (depth === 0 && arrayStart >= 0) {
                return text.slice(arrayStart, i + 1);
            }
        }
    }

    return undefined;
}

function buildParameters(params: ReverseParam[], schemaNames?: Set<string>): Parameter[] {
    return params
        .filter(p => p.in !== 'body' && p.in !== 'formData')
        .map(p => {
            if (p.in === 'querystring') {
                const contentType =
                    p.contentType ?? (p.serialization === 'json' ? 'application/json' : 'application/x-www-form-urlencoded');
                const contentEntry: { schema: SwaggerDefinition; encoding?: Record<string, any> } = {
                    schema: typeHintToSchema(p.typeHint, schemaNames) ?? {},
                };
                if (p.encoding) {
                    contentEntry.encoding = p.encoding;
                }
                return {
                    name: p.name,
                    in: 'querystring' as Parameter['in'],
                    required: p.required,
                    content: {
                        [contentType]: contentEntry,
                    },
                };
            }

            if (p.contentType) {
                const contentEntry: { schema: SwaggerDefinition; encoding?: Record<string, any> } = {
                    schema: typeHintToSchema(p.typeHint, schemaNames) ?? {},
                };
                if (p.encoding) {
                    contentEntry.encoding = p.encoding;
                }
                return {
                    name: p.name,
                    in: p.in as Parameter['in'],
                    required: p.in === 'path' ? true : p.required,
                    content: {
                        [p.contentType]: contentEntry,
                    },
                };
            }

            const param: Parameter = {
                name: p.name,
                in: p.in as Parameter['in'],
                required: p.in === 'path' ? true : p.required,
                schema: typeHintToSchema(p.typeHint, schemaNames) ?? {},
            };
            if (p.style !== undefined) param.style = p.style;
            if (p.explode !== undefined) param.explode = p.explode;
            if (p.allowReserved !== undefined) param.allowReserved = p.allowReserved;
            if (p.allowEmptyValue !== undefined) param.allowEmptyValue = p.allowEmptyValue;
            return param;
        });
}

function buildRequestBody(operation: ReverseOperation, schemaNames?: Set<string>): RequestBody | undefined {
    const bodyParams = operation.params.filter(p => p.in === 'body');
    const formDataParams = operation.params.filter(p => p.in === 'formData');
    if (bodyParams.length === 0 && formDataParams.length === 0) return undefined;

    const requiredNames = [...bodyParams, ...formDataParams].filter(p => p.required).map(p => p.name);
    const schema: SwaggerDefinition = buildRequestSchema(bodyParams, formDataParams, schemaNames);

    const mediaTypes = operation.requestMediaTypes.length > 0 ? operation.requestMediaTypes : ['application/json'];
    const content: Record<string, { schema?: SwaggerDefinition; itemSchema?: SwaggerDefinition }> = {};
    mediaTypes.forEach(mt => {
        if (isSequentialMediaType(mt)) {
            content[mt] = { itemSchema: normalizeSequentialSchema(schema) };
        } else {
            content[mt] = { schema };
        }
    });

    return {
        required: requiredNames.length > 0 ? true : undefined,
        content,
    };
}

function buildRequestSchema(
    bodyParams: ReverseParam[],
    formDataParams: ReverseParam[],
    schemaNames?: Set<string>,
): SwaggerDefinition {
    if (formDataParams.length > 0 || bodyParams.length > 1) {
        const properties: Record<string, SwaggerDefinition> = {};
        const required: string[] = [];

        [...bodyParams, ...formDataParams].forEach(param => {
            properties[param.name] = typeHintToSchema(param.typeHint, schemaNames) ?? {};
            if (param.required) required.push(param.name);
        });

        const schema: SwaggerDefinition = { type: 'object', properties };
        if (required.length > 0) schema.required = required;
        return schema;
    }

    if (bodyParams.length === 1) {
        return typeHintToSchema(bodyParams[0].typeHint, schemaNames) ?? {};
    }

    return {};
}

function buildResponses(
    mediaTypes: string[],
    responseTypeHint?: string,
    schemaNames?: Set<string>,
    responseHints?: ReverseResponseHint[],
): Record<string, SwaggerResponse> {
    const schema = typeHintToSchema(responseTypeHint, schemaNames);

    if (responseHints && responseHints.length > 0) {
        const responses: Record<string, SwaggerResponse> = {};
        responseHints.forEach(hint => {
            const status = hint.status;
            if (!status) return;

            const response: SwaggerResponse = {
                description:
                    hint.description ??
                    (status === 'default' ? 'Default response' : /^2\d{2}$/.test(status) ? 'Success' : 'Response'),
            };

            const types = hint.mediaTypes && hint.mediaTypes.length > 0 ? hint.mediaTypes : mediaTypes;
            if (types.length > 0) {
                response.content = {};
                types.forEach(mt => {
                    if (schema && isSequentialMediaType(mt)) {
                        response.content![mt] = { itemSchema: normalizeSequentialSchema(schema) } as any;
                        return;
                    }
                    response.content![mt] = { schema: schema ?? {} };
                });
            }

            responses[status] = response;
        });

        if (Object.keys(responses).length > 0) return responses;
    }

    const response: SwaggerResponse = { description: 'Success' };

    if (mediaTypes.length > 0) {
        response.content = {};
        mediaTypes.forEach(mt => {
            if (schema && isSequentialMediaType(mt)) {
                response.content![mt] = { itemSchema: normalizeSequentialSchema(schema) } as any;
                return;
            }
            response.content![mt] = { schema: schema ?? {} };
        });
    }

    return { '200': response };
}

function typeHintToSchema(
    typeHint: string | undefined,
    schemaNames?: Set<string>,
    depth = 0,
): SwaggerDefinition | undefined {
    if (!typeHint) return undefined;
    if (depth > 6) return undefined;

    let cleaned = stripOuterParens(typeHint.trim());
    if (!cleaned) return undefined;

    cleaned = unwrapKnownWrappers(cleaned);

    const unionParts = splitTopLevelUnion(cleaned);
    if (unionParts.length > 1) {
        const schemas = unionParts
            .filter(part => part !== 'undefined')
            .map(part => typeHintToSchema(part, schemaNames, depth + 1))
            .filter((schema): schema is SwaggerDefinition => !!schema);
        if (schemas.length === 0) return undefined;
        if (schemas.length === 1) return schemas[0];
        return { oneOf: schemas };
    }

    if (cleaned.endsWith('[]')) {
        const inner = cleaned.slice(0, -2).trim();
        const itemSchema = typeHintToSchema(inner, schemaNames, depth + 1) ?? {};
        return { type: 'array', items: itemSchema };
    }

    const arrayInner =
        extractGenericArg(cleaned, 'Array') || extractGenericArg(cleaned, 'ReadonlyArray');
    if (arrayInner) {
        const itemSchema = typeHintToSchema(arrayInner, schemaNames, depth + 1) ?? {};
        return { type: 'array', items: itemSchema };
    }

    const primitive = mapPrimitiveType(cleaned);
    if (primitive) return primitive;

    if (schemaNames && schemaNames.has(cleaned)) {
        return { $ref: `#/components/schemas/${cleaned}` };
    }

    return undefined;
}

function mapPrimitiveType(typeName: string): SwaggerDefinition | undefined {
    switch (typeName) {
        case 'string':
            return { type: 'string' };
        case 'number':
            return { type: 'number' };
        case 'integer':
            return { type: 'integer' };
        case 'boolean':
            return { type: 'boolean' };
        case 'null':
            return { type: 'null' };
        case 'object':
            return { type: 'object' };
        case 'any':
        case 'unknown':
            return {};
        case 'Date':
            return { type: 'string', format: 'date-time' };
        default:
            return undefined;
    }
}

function stripOuterParens(typeText: string): string {
    let cleaned = typeText.trim();
    if (!cleaned.startsWith('(') || !cleaned.endsWith(')')) return cleaned;

    let depth = 0;
    for (let i = 0; i < cleaned.length; i += 1) {
        const char = cleaned[i];
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (depth === 0 && i < cleaned.length - 1) {
            return cleaned;
        }
    }

    return cleaned.slice(1, -1).trim();
}

function unwrapKnownWrappers(typeText: string): string {
    const wrappers = ['Observable', 'Promise', 'HttpResponse', 'HttpEvent', 'Partial', 'Readonly', 'Required', 'NonNullable'];
    let current = typeText.trim();
    let changed = true;

    while (changed) {
        changed = false;
        for (const wrapper of wrappers) {
            const inner = extractGenericArg(current, wrapper);
            if (inner) {
                current = inner.trim();
                changed = true;
                break;
            }
        }
    }

    return current;
}

function extractGenericArg(typeText: string, wrapper: string): string | undefined {
    const prefix = `${wrapper}<`;
    if (!typeText.startsWith(prefix)) return undefined;

    let depth = 0;
    let start = prefix.length;
    for (let i = start; i < typeText.length; i += 1) {
        const char = typeText[i];
        if (char === '<') depth += 1;
        if (char === '>') {
            if (depth === 0) {
                const inner = typeText.slice(start, i);
                const tail = typeText.slice(i + 1).trim();
                if (tail.length === 0) return inner;
                return undefined;
            }
            depth -= 1;
        }
    }
    return undefined;
}

function splitTopLevelUnion(typeText: string): string[] {
    const parts: string[] = [];
    let current = '';
    let depth = 0;

    const flush = () => {
        const trimmed = current.trim();
        if (trimmed.length > 0) parts.push(trimmed);
        current = '';
    };

    for (let i = 0; i < typeText.length; i += 1) {
        const char = typeText[i];
        if (char === '<' || char === '(' || char === '[') depth += 1;
        if (char === '>' || char === ')' || char === ']') depth = Math.max(0, depth - 1);

        if (char === '|' && depth === 0) {
            flush();
            continue;
        }

        current += char;
    }

    flush();
    return parts;
}

function isSequentialMediaType(mediaType: string): boolean {
    const normalized = mediaType.split(';')[0]?.trim().toLowerCase();
    return (
        normalized === 'application/jsonl' ||
        normalized === 'application/x-ndjson' ||
        normalized === 'application/json-seq' ||
        normalized === 'application/geo+json-seq' ||
        normalized === 'text/event-stream' ||
        normalized === 'multipart/mixed'
    );
}

function normalizeSequentialSchema(schema: SwaggerDefinition): SwaggerDefinition {
    if (schema.type === 'array' && schema.items && !Array.isArray(schema.items) && typeof schema.items === 'object') {
        return schema.items as SwaggerDefinition;
    }
    return schema;
}

function parseConfigName(config: string): string | undefined {
    try {
        const parsed = JSON.parse(config) as { name?: string };
        if (parsed && typeof parsed.name === 'string') return parsed.name;
    } catch {
        // Fallback to regex parsing below
    }

    const match = config.match(/"name"\s*:\s*"([^"]+)"/);
    return match ? match[1] : undefined;
}

function resolveReverseRoot(inputPath: string, fileSystem: ReverseFileSystem): string {
    const stat = fileSystem.statSync(inputPath);
    if (stat.isDirectory()) return inputPath;
    if (stat.isFile()) return path.dirname(inputPath);
    throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
}

function findUpFile(startDir: string, relativePath: string, fileSystem: ReverseFileSystem): string | undefined {
    let current = path.resolve(startDir);
    while (true) {
        const candidate = path.resolve(current, relativePath);
        if (fileExists(candidate, fileSystem)) return candidate;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return undefined;
}

function fileExists(filePath: string, fileSystem: ReverseFileSystem): boolean {
    try {
        return fileSystem.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

function readTextIfExists(filePath: string | undefined, fileSystem: ReverseFileSystem): string | undefined {
    if (!filePath) return undefined;
    try {
        return fileSystem.readFileSync(filePath, 'utf-8');
    } catch {
        return undefined;
    }
}

function extractConstInitializer<T>(sourceText: string, constName: string): T | undefined {
    const pattern = new RegExp(`(?:export\\s+)?const\\s+${constName}[^=]*=\\s*([\\s\\S]*?);`, 'm');
    const match = sourceText.match(pattern);
    if (!match) return undefined;

    const raw = match[1].trim();
    if (raw === 'undefined') return undefined;
    if (raw === 'null') return null as T;

    try {
        return JSON.parse(raw) as T;
    } catch {
        try {
            // eslint-disable-next-line no-new-func
            return new Function(`\"use strict\"; return (${raw});`)() as T;
        } catch {
            return undefined;
        }
    }
}

function extractFirstArgument(bodyText: string, functionName: string): string | undefined {
    const regex = new RegExp(`${functionName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\(([^,]+),`);
    const match = bodyText.match(regex);
    if (!match) return undefined;
    return extractIdentifier(match[1]);
}

function extractIdentifier(expression: string): string | undefined {
    const trimmed = expression.trim();
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(\b|\.)/);
    return match ? match[1] : undefined;
}
