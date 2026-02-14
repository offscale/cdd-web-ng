import path from 'node:path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import type { CallExpression, Expression, FunctionLikeDeclaration, SourceFile, TypeNode } from 'ts-morph';
import { camelCase } from './string.js';
import {
    ExternalDocumentationObject,
    ExampleObject,
    InfoObject,
    Parameter,
    RequestBody,
    ServerObject,
    SwaggerDefinition,
    SwaggerResponse,
    SwaggerSpec,
    TagObject,
} from '../types/index.js';
import { parseGeneratedModelSource, ReverseSchemaMap, schemaFromTypeNode } from './openapi-reverse-models.js';
import { OAS_3_1_DIALECT } from '../constants.js';

const STANDARD_HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query']);
const RESERVED_HEADER_NAMES = new Set(['accept', 'content-type', 'authorization']);
const EXTRA_HTTP_METHODS = new Set(['copy', 'move', 'lock', 'unlock', 'propfind', 'proppatch', 'mkcol', 'report']);
const HTTP_METHODS = new Set([...STANDARD_HTTP_METHODS, ...EXTRA_HTTP_METHODS]);
const DECORATOR_METHODS: Record<string, string> = {
    Get: 'GET',
    Post: 'POST',
    Put: 'PUT',
    Patch: 'PATCH',
    Delete: 'DELETE',
    Options: 'OPTIONS',
    Head: 'HEAD',
    Trace: 'TRACE',
    Query: 'QUERY',
};
const CONTROLLER_DECORATORS = new Set(['Controller', 'Route']);
const DEFAULT_IGNORE_DIRS = new Set(['node_modules', 'dist', 'coverage', 'docs', '.git']);
const DEFAULT_INFO: InfoObject = { title: 'Recovered OpenAPI', version: '0.0.0' };

/** File system requirements for AST scanning helpers. */
export type CodeScanFileSystem = {
    statSync: (filePath: string) => { isFile: () => boolean; isDirectory: () => boolean };
    readFileSync: (filePath: string, encoding: string) => string;
    readdirSync: (dirPath: string) => string[];
};

/** Supported locations for parameters discovered in scanned code. */
export type CodeScanParamLocation = 'path' | 'query' | 'header' | 'cookie' | 'querystring';

/** Describes a parameter reconstructed from an AST scan. */
export interface CodeScanParam {
    name: string;
    in: CodeScanParamLocation;
    required?: boolean;
    description?: string;
    schema?: SwaggerDefinition | boolean;
    contentType?: string;
    encoding?: Record<string, any>;
    example?: unknown;
}

/** Describes a reconstructed request body. */
export interface CodeScanRequestBody {
    required?: boolean;
    contentTypes: string[];
    schema?: SwaggerDefinition | boolean;
    examples?: Record<string, unknown>;
}

/** Describes a reconstructed response. */
export interface CodeScanResponse {
    status: string;
    summary?: string;
    description?: string;
    contentTypes: string[];
    schema?: SwaggerDefinition | boolean;
    examples?: Record<string, unknown>;
}

/** Describes a reconstructed API operation discovered in source code. */
export interface CodeScanOperation {
    operationId: string;
    method: string;
    path: string;
    filePath: string;
    params: CodeScanParam[];
    requestBody?: CodeScanRequestBody;
    responses: CodeScanResponse[];
    summary?: string;
    description?: string;
    deprecated?: boolean;
    tags?: string[];
    tagObjects?: TagObject[];
    externalDocs?: ExternalDocumentationObject;
    servers?: ServerObject[];
    security?: Record<string, string[]>[];
    extensions?: Record<string, any>;
}

type QuerystringMeta = {
    name: string;
    contentType?: string;
    encoding?: Record<string, any>;
    required?: boolean;
    description?: string;
};

type ResponseDocMeta = {
    status: string;
    summary?: string;
    description?: string;
    contentTypes?: string[];
};

/** Intermediate representation produced by the AST scanner. */
export interface CodeScanIr {
    operations: CodeScanOperation[];
    schemas: Record<string, SwaggerDefinition | boolean>;
    sources: string[];
}

/** Options for controlling the AST-based scan. */
export interface CodeScanOptions {
    /** Extra directory names to ignore when scanning a directory. */
    ignoreDirs?: string[];
    /** Toggle extracting exported TypeScript types into OpenAPI schemas. */
    includeSchemas?: boolean;
}

/**
 * Scans a TypeScript source string and produces an intermediate representation of API operations.
 * @param sourceText The TypeScript source text to scan.
 * @param filePath Virtual path used for diagnostics and operation metadata.
 * @param options Scanner options.
 */
export function scanTypeScriptSource(
    sourceText: string,
    filePath = 'source.ts',
    options: CodeScanOptions = {},
): CodeScanIr {
    const project = createScanProject();
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    const operations = scanSourceFile(sourceFile);
    if (operations.length === 0) {
        throw new Error(`No route handlers found in: ${filePath}`);
    }

    const schemas = options.includeSchemas === false ? {} : extractSchemasFromSource(sourceText, filePath);

    return {
        operations,
        schemas,
        sources: [filePath],
    };
}

/**
 * Scans a file or directory of TypeScript sources and produces an intermediate representation.
 * @param inputPath A file path or directory containing TypeScript sources.
 * @param fileSystem File system implementation for reading files.
 * @param options Scanner options.
 */
export function scanTypeScriptProject(
    inputPath: string,
    fileSystem: CodeScanFileSystem,
    options: CodeScanOptions = {},
): CodeScanIr {
    const resolved = path.resolve(inputPath);
    const stat = fileSystem.statSync(resolved);
    const filePaths: string[] = [];

    if (stat.isFile()) {
        if (!isSourceFilePath(resolved)) {
            throw new Error(`Expected a TypeScript source file (*.ts). Received: ${resolved}`);
        }
        filePaths.push(resolved);
    } else if (stat.isDirectory()) {
        const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(options.ignoreDirs ?? [])]);
        collectSourceFiles(resolved, fileSystem, filePaths, ignoreDirs);
    } else {
        throw new Error(`Input path is neither a file nor a directory: ${resolved}`);
    }

    if (filePaths.length === 0) {
        throw new Error(`No TypeScript source files found under: ${resolved}`);
    }

    const project = createScanProject();
    const operations: CodeScanOperation[] = [];
    const schemas: ReverseSchemaMap = {};
    const sources: string[] = [];

    for (const filePath of filePaths) {
        const contents = fileSystem.readFileSync(filePath, 'utf-8');
        sources.push(filePath);
        const sourceFile = project.createSourceFile(filePath, contents, { overwrite: true });
        operations.push(...scanSourceFile(sourceFile));

        if (options.includeSchemas !== false) {
            const extracted = extractSchemasFromSource(contents, filePath);
            if (Object.keys(extracted).length > 0) {
                Object.assign(schemas, extracted);
            }
        }
    }

    if (operations.length === 0) {
        throw new Error(`No route handlers found under: ${resolved}`);
    }

    return {
        operations,
        schemas: options.includeSchemas === false ? {} : schemas,
        sources,
    };
}

/**
 * Builds an OpenAPI 3.2 specification from a scanned intermediate representation.
 * @param ir The intermediate representation from the AST scanner.
 * @param infoOverrides Optional OpenAPI info overrides.
 */
export function buildOpenApiSpecFromScan(ir: CodeScanIr, infoOverrides: Partial<InfoObject> = {}): SwaggerSpec {
    const info: InfoObject = { ...DEFAULT_INFO, ...infoOverrides };
    const paths: Record<string, any> = {};
    const standardMethods = STANDARD_HTTP_METHODS;
    const tagNames: string[] = [];
    const tagSet = new Set<string>();
    const tagObjects = new Map<string, TagObject>();

    const trackTagName = (name: string) => {
        if (!name || tagSet.has(name)) return;
        tagSet.add(name);
        tagNames.push(name);
    };

    const mergeTagObject = (tag: TagObject) => {
        const name = tag.name?.trim();
        if (!name) return;
        const normalized = { ...tag, name };
        const existing = tagObjects.get(name);
        if (!existing) {
            tagObjects.set(name, normalized);
            return;
        }
        // Preserve existing fields, but fill gaps with new metadata.
        tagObjects.set(name, { ...normalized, ...existing });
    };

    for (const op of ir.operations) {
        const parameters = buildParameters(op.params);
        const requestBody = buildRequestBody(op.requestBody);
        const responses = buildResponses(op.responses);
        const methodKey = op.method.toLowerCase();
        const pathItem = paths[op.path] ?? {};

        const operation = {
            operationId: op.operationId,
            ...(op.summary ? { summary: op.summary } : {}),
            ...(op.description ? { description: op.description } : {}),
            ...(op.deprecated ? { deprecated: op.deprecated } : {}),
            ...(op.tags && op.tags.length > 0 ? { tags: op.tags } : {}),
            ...(op.externalDocs ? { externalDocs: op.externalDocs } : {}),
            ...(op.servers && op.servers.length > 0 ? { servers: op.servers } : {}),
            ...(op.security && op.security.length > 0 ? { security: op.security } : {}),
            ...(op.extensions ? op.extensions : {}),
            ...(parameters.length > 0 ? { parameters } : {}),
            ...(requestBody ? { requestBody } : {}),
            responses,
        };

        if (standardMethods.has(methodKey)) {
            pathItem[methodKey] = operation;
        } else {
            const additional = pathItem.additionalOperations ?? {};
            additional[op.method] = operation;
            pathItem.additionalOperations = additional;
        }

        paths[op.path] = pathItem;

        if (op.tagObjects && op.tagObjects.length > 0) {
            op.tagObjects.forEach(tag => {
                if (!tag || typeof tag.name !== 'string') return;
                trackTagName(tag.name);
                mergeTagObject(tag);
            });
        }

        if (op.tags && op.tags.length > 0) {
            op.tags.forEach(trackTagName);
        }
    }

    const spec: SwaggerSpec = {
        openapi: '3.2.0',
        info,
        paths,
        jsonSchemaDialect: OAS_3_1_DIALECT,
    };

    if (tagNames.length > 0) {
        spec.tags = tagNames.map(name => tagObjects.get(name) ?? { name });
    }

    if (Object.keys(ir.schemas).length > 0) {
        spec.components = { ...spec.components, schemas: ir.schemas };
    }

    return spec;
}

function createScanProject(): Project {
    return new Project({
        useInMemoryFileSystem: true,
        skipFileDependencyResolution: true,
        compilerOptions: {
            experimentalDecorators: true,
        },
    });
}

function isSourceFilePath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
        normalized.endsWith('.ts') &&
        !normalized.endsWith('.d.ts') &&
        !normalized.endsWith('.spec.ts') &&
        !normalized.endsWith('.test.ts')
    );
}

function collectSourceFiles(
    dirPath: string,
    fileSystem: CodeScanFileSystem,
    output: string[],
    ignoreDirs: Set<string>,
): void {
    const entries = fileSystem.readdirSync(dirPath);
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fileSystem.statSync(fullPath);
        if (stat.isDirectory()) {
            if (ignoreDirs.has(entry)) {
                continue;
            }
            collectSourceFiles(fullPath, fileSystem, output, ignoreDirs);
            continue;
        }
        if (stat.isFile() && isSourceFilePath(fullPath)) {
            output.push(fullPath);
        }
    }
}

function extractSchemasFromSource(sourceText: string, filePath: string): ReverseSchemaMap {
    const schemas = parseGeneratedModelSource(sourceText, filePath);
    return Object.keys(schemas).length > 0 ? schemas : {};
}

function scanSourceFile(sourceFile: SourceFile): CodeScanOperation[] {
    const operations: CodeScanOperation[] = [];
    operations.push(...scanExpressRoutes(sourceFile));
    operations.push(...scanDecoratedControllers(sourceFile));
    return operations;
}

function scanExpressRoutes(sourceFile: SourceFile): CodeScanOperation[] {
    const operations: CodeScanOperation[] = [];
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    for (const call of callExpressions) {
        const routeInfo = extractRouteCall(call);
        if (!routeInfo) continue;

        const handler = extractHandler(call, routeInfo.handlerOffset);
        const operation = buildExpressOperation(routeInfo.method, routeInfo.path, handler, sourceFile.getFilePath());
        operations.push(operation);
    }

    return operations;
}

function scanDecoratedControllers(sourceFile: SourceFile): CodeScanOperation[] {
    const operations: CodeScanOperation[] = [];

    for (const cls of sourceFile.getClasses()) {
        const controllerDecorator = cls.getDecorators().find(dec => CONTROLLER_DECORATORS.has(dec.getName()));
        if (!controllerDecorator) continue;

        const basePath = extractDecoratorPath(controllerDecorator) ?? '';

        for (const method of cls.getMethods()) {
            const httpDecorators = method
                .getDecorators()
                .map(dec => ({ dec, method: DECORATOR_METHODS[dec.getName()] }))
                .filter(entry => entry.method);

            if (httpDecorators.length === 0) continue;

            for (const entry of httpDecorators) {
                const methodPath = extractDecoratorPath(entry.dec) ?? '';
                const fullPath = joinPaths(basePath, methodPath);
                const paramMap = new Map<string, CodeScanParam>();
                extractDecoratorParams(method, paramMap);
                addPathParams(fullPath, paramMap);

                const docMeta = extractDocMeta(method);
                applyQuerystringMeta(docMeta, paramMap);
                applyParamDocs(paramMap, docMeta.paramDocs);
                applyParamExamples(paramMap, docMeta.paramExamples);
                applyParamSchemas(paramMap, docMeta.paramSchemas);
                const statusCode = extractHttpCode(method) ?? '200';
                const responseSchema = inferReturnSchemaFromSignature(method);

                const responses = mergeResponseHints(
                    [
                        {
                            status: statusCode,
                            description: 'Response',
                            contentTypes: ['application/json'],
                            ...(responseSchema ? { schema: responseSchema } : {}),
                        },
                    ],
                    docMeta.responses,
                ).map(response =>
                    responseSchema && response.contentTypes.length > 0 && !response.schema
                        ? { ...response, schema: responseSchema }
                        : response,
                );

                applyResponseExamples(responses, docMeta.responseExamples);

                operations.push({
                    operationId: docMeta.operationId ?? method.getName(),
                    method: entry.method,
                    path: fullPath,
                    filePath: sourceFile.getFilePath(),
                    params: Array.from(paramMap.values()),
                    requestBody: (() => {
                        const requestBody = buildRequestBodyFromDecoratorParams(method);
                        applyRequestExamples(requestBody, docMeta.requestExamples);
                        return requestBody;
                    })(),
                    responses,
                    ...stripInternalDocMeta(docMeta),
                });
            }
        }
    }

    return operations;
}

type RouteCallInfo = {
    method: string;
    path: string;
    handlerOffset: number;
};

function extractRouteCall(call: CallExpression): RouteCallInfo | undefined {
    const callee = call.getExpression();
    const method = resolveHttpMethodName(callee);
    if (!method) return undefined;

    const args = call.getArguments();
    const directPath = args[0] ? extractPathFromExpression(args[0]) : undefined;
    if (directPath) {
        return {
            method,
            path: normalizeRoutePath(directPath),
            handlerOffset: 1,
        };
    }

    if (Node.isPropertyAccessExpression(callee)) {
        const target = callee.getExpression();
        if (Node.isCallExpression(target)) {
            const chainedPath = extractRouteChainPath(target);
            if (chainedPath) {
                return {
                    method,
                    path: normalizeRoutePath(chainedPath),
                    handlerOffset: 0,
                };
            }
        }
    }

    return undefined;
}

function extractRouteChainPath(call: CallExpression): string | undefined {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    if (callee.getName() !== 'route') return undefined;
    const arg = call.getArguments()[0];
    return arg ? extractPathFromExpression(arg) : undefined;
}

function resolveHttpMethodName(expression: Expression): string | undefined {
    if (!Node.isPropertyAccessExpression(expression)) return undefined;
    const name = expression.getName().toLowerCase();
    return HTTP_METHODS.has(name) ? name.toUpperCase() : undefined;
}

function extractHandler(call: CallExpression, offset: number): FunctionLikeDeclaration | undefined {
    const args = call.getArguments().slice(offset);
    for (let i = args.length - 1; i >= 0; i -= 1) {
        const handler = resolveFunctionLike(args[i]);
        if (handler) return handler;
    }
    return undefined;
}

function resolveFunctionLike(node: Node): FunctionLikeDeclaration | undefined {
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node)) {
        return node;
    }

    if (Node.isIdentifier(node)) {
        for (const definition of node.getDefinitions()) {
            const decl = definition.getDeclarationNode();
            if (!decl) continue;
            if (Node.isFunctionDeclaration(decl)) return decl;
            if (Node.isMethodDeclaration(decl)) return decl;
            if (Node.isVariableDeclaration(decl)) {
                const init = decl.getInitializer();
                if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                    return init;
                }
            }
        }
    }

    if (Node.isArrayLiteralExpression(node)) {
        const elements = node.getElements();
        for (let i = elements.length - 1; i >= 0; i -= 1) {
            const element = elements[i];
            if (!Node.isExpression(element)) continue;
            const handler = resolveFunctionLike(element);
            if (handler) return handler;
        }
    }

    return undefined;
}

function buildExpressOperation(
    method: string,
    pathValue: string,
    handler: FunctionLikeDeclaration | undefined,
    filePath: string,
): CodeScanOperation {
    const paramMap = new Map<string, CodeScanParam>();
    addPathParams(pathValue, paramMap);

    const operationId = inferOperationId(handler, method, pathValue);
    const docMeta = handler ? extractDocMeta(handler) : {};
    applyQuerystringMeta(docMeta, paramMap);
    applyParamDocs(paramMap, docMeta.paramDocs);
    applyParamExamples(paramMap, docMeta.paramExamples);

    const analysis = handler
        ? analyzeExpressHandler(handler, paramMap)
        : {
              requestBody: undefined,
              responses: [{ status: '200', description: 'Response', contentTypes: [] }],
              responseSchema: undefined,
          };

    applyParamSchemas(paramMap, docMeta.paramSchemas);

    applyRequestExamples(analysis.requestBody, docMeta.requestExamples);

    const responses = mergeResponseHints(analysis.responses, docMeta.responses).map(response =>
        analysis.responseSchema && response.contentTypes.length > 0 && !response.schema
            ? { ...response, schema: analysis.responseSchema }
            : response,
    );
    applyResponseExamples(responses, docMeta.responseExamples);

    return {
        operationId: docMeta.operationId ?? operationId,
        method,
        path: pathValue,
        filePath,
        params: Array.from(paramMap.values()),
        requestBody: analysis.requestBody,
        responses,
        ...stripInternalDocMeta(docMeta),
    };
}

function analyzeExpressHandler(
    handler: FunctionLikeDeclaration,
    paramMap: Map<string, CodeScanParam>,
): {
    requestBody?: CodeScanRequestBody;
    responses: CodeScanResponse[];
    responseSchema?: SwaggerDefinition | boolean;
} {
    const bindings = extractRequestBindings(handler);
    const body = getFunctionBody(handler);
    const requestContentTypes = new Set<string>();
    let bodyUsed = Boolean(bindings.bodyName);
    const responseIndex = new Map<string, Set<string>>();
    const inferredSchemas = inferExpressSchemaHints(handler);

    if (body) {
        const visit = (node: Node) => {
            if (Node.isCallExpression(node)) {
                const responseHint = extractResponseHint(node, bindings.resName);
                if (responseHint) {
                    recordResponse(responseIndex, responseHint.status, responseHint.contentType);
                }

                if (bindings.reqName) {
                    const requestType = extractRequestContentType(node, bindings.reqName);
                    if (requestType) {
                        requestContentTypes.add(requestType);
                        bodyUsed = true;
                    }

                    const headerName = extractRequestHeaderName(node, bindings.reqName);
                    if (headerName) {
                        addParam(paramMap, { name: headerName, in: 'header' });
                    }
                }
            }

            if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
                const access = extractRequestAccess(node, bindings);
                if (access) {
                    if (access.location === 'body') {
                        bodyUsed = true;
                    } else if (access.name) {
                        addParam(paramMap, { name: access.name, in: access.location });
                    }
                }
            }

            if (Node.isVariableDeclaration(node)) {
                const destructured = extractDestructuredParams(node, bindings);
                if (destructured.bodyUsed) {
                    bodyUsed = true;
                }
                destructured.params.forEach(param => addParam(paramMap, param));
            }
        };

        visit(body);
        body.forEachDescendant(descendant => visit(descendant));
    }

    if (inferredSchemas.requestSchema) {
        bodyUsed = true;
    }

    const responses = finalizeResponses(responseIndex, '200', false);
    if (inferredSchemas.responseSchema) {
        responses.forEach(response => {
            if (response.contentTypes.length > 0) {
                response.schema = inferredSchemas.responseSchema;
            }
        });
    }

    const requestBody = bodyUsed
        ? {
              required: true,
              contentTypes: requestContentTypes.size > 0 ? Array.from(requestContentTypes) : ['application/json'],
              ...(inferredSchemas.requestSchema ? { schema: inferredSchemas.requestSchema } : {}),
          }
        : undefined;

    return { requestBody, responses, responseSchema: inferredSchemas.responseSchema };
}

function getFunctionBody(handler: FunctionLikeDeclaration): Node | undefined {
    const bodyable = handler as FunctionLikeDeclaration & { getBody?: () => Node | undefined };
    return bodyable.getBody ? bodyable.getBody() : undefined;
}

function extractRequestBindings(handler: FunctionLikeDeclaration): RequestBindings {
    const bindings: RequestBindings = {};
    const params = handler.getParameters();

    const reqParam = params[0];
    const resParam = params[1];

    if (reqParam) {
        const nameNode = reqParam.getNameNode();
        if (Node.isIdentifier(nameNode)) {
            bindings.reqName = nameNode.getText();
        } else if (Node.isObjectBindingPattern(nameNode)) {
            for (const element of nameNode.getElements()) {
                const propertyName = element.getPropertyNameNode()?.getText() ?? element.getName();
                const boundName = element.getName();
                switch (propertyName) {
                    case 'params':
                        bindings.paramsName = boundName;
                        break;
                    case 'query':
                        bindings.queryName = boundName;
                        break;
                    case 'headers':
                        bindings.headersName = boundName;
                        break;
                    case 'cookies':
                        bindings.cookiesName = boundName;
                        break;
                    case 'body':
                        bindings.bodyName = boundName;
                        break;
                }
            }
        }
    }

    if (resParam) {
        const nameNode = resParam.getNameNode();
        if (Node.isIdentifier(nameNode)) {
            bindings.resName = nameNode.getText();
        }
    }

    return bindings;
}

type RequestBindings = {
    reqName?: string;
    resName?: string;
    paramsName?: string;
    queryName?: string;
    headersName?: string;
    cookiesName?: string;
    bodyName?: string;
};

type RequestAccess = {
    location: CodeScanParamLocation | 'body';
    name?: string;
};

function extractRequestAccess(node: Node, bindings: RequestBindings): RequestAccess | undefined {
    if (Node.isPropertyAccessExpression(node)) {
        const name = node.getName();
        const nestedLocation = resolveRequestLocation(node.getExpression(), bindings);
        if (nestedLocation) {
            return { location: nestedLocation, name };
        }
        const rootLocation = resolveRequestLocation(node, bindings);
        if (rootLocation === 'body') {
            return { location: rootLocation };
        }
        return undefined;
    }

    if (Node.isElementAccessExpression(node)) {
        const name = extractStringLiteral(node.getArgumentExpression());
        const location = resolveRequestLocation(node.getExpression(), bindings);
        if (!location) return undefined;
        return { location, name };
    }

    return undefined;
}

function extractDestructuredParams(
    node: import('ts-morph').VariableDeclaration,
    bindings: RequestBindings,
): { params: CodeScanParam[]; bodyUsed: boolean } {
    const params: CodeScanParam[] = [];
    let bodyUsed = false;

    const nameNode = node.getNameNode();
    const initializer = node.getInitializer();
    if (!initializer || !Node.isObjectBindingPattern(nameNode)) {
        return { params, bodyUsed };
    }

    const location = resolveRequestLocation(initializer, bindings);
    if (!location) return { params, bodyUsed };

    if (location === 'body') {
        bodyUsed = true;
        return { params, bodyUsed };
    }

    for (const element of nameNode.getElements()) {
        const propName = element.getPropertyNameNode()?.getText() ?? element.getName();
        params.push({ name: trimQuotes(propName), in: location });
    }

    return { params, bodyUsed };
}

function resolveRequestLocation(
    expression: Expression,
    bindings: RequestBindings,
): CodeScanParamLocation | 'body' | undefined {
    if (Node.isIdentifier(expression)) {
        const name = expression.getText();
        if (name === bindings.paramsName) return 'path';
        if (name === bindings.queryName) return 'query';
        if (name === bindings.headersName) return 'header';
        if (name === bindings.cookiesName) return 'cookie';
        if (name === bindings.bodyName) return 'body';
        return undefined;
    }

    if (Node.isPropertyAccessExpression(expression)) {
        const base = expression.getExpression();
        if (!Node.isIdentifier(base)) return undefined;
        if (base.getText() !== bindings.reqName) return undefined;
        const name = expression.getName();
        if (name === 'params') return 'path';
        if (name === 'query') return 'query';
        if (name === 'headers') return 'header';
        if (name === 'cookies') return 'cookie';
        if (name === 'body') return 'body';
    }

    return undefined;
}

type ResponseHint = {
    status: string;
    contentType?: string;
};

function extractResponseHint(call: CallExpression, resName?: string): ResponseHint | undefined {
    if (!resName) return undefined;
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    const method = callee.getName();
    if (!isResponseChain(callee.getExpression(), resName)) return undefined;

    if (method === 'sendStatus') {
        const status = extractLiteralText(call.getArguments()[0]) ?? '200';
        return { status, contentType: undefined };
    }

    if (method === 'json' || method === 'send' || method === 'end') {
        const chainMeta = extractResponseChainMeta(callee.getExpression(), resName);
        let contentType = chainMeta.contentType;
        if (method === 'json') {
            contentType = 'application/json';
        }
        if (method === 'send' && !contentType) {
            contentType = inferContentTypeFromSend(call.getArguments()[0]);
        }
        return {
            status: chainMeta.status ?? '200',
            contentType,
        };
    }

    return undefined;
}

function extractResponseChainMeta(expression: Expression, resName: string): { status?: string; contentType?: string } {
    let current = expression;
    let status: string | undefined;
    let contentType: string | undefined;

    while (Node.isCallExpression(current) && Node.isPropertyAccessExpression(current.getExpression())) {
        const method = current.getExpression().getName();
        const target = current.getExpression().getExpression();
        if (!isResponseChain(target, resName)) break;

        if (method === 'status') {
            status = extractLiteralText(current.getArguments()[0]) ?? status;
        }

        if (method === 'type') {
            contentType = extractStringLiteral(current.getArguments()[0]) ?? contentType;
        }

        if (method === 'set' || method === 'header') {
            const [nameArg, valueArg] = current.getArguments();
            const headerName = extractStringLiteral(nameArg);
            if (headerName && headerName.toLowerCase() === 'content-type') {
                contentType = extractStringLiteral(valueArg) ?? contentType;
            }
        }

        current = target;
    }

    return { status, contentType };
}

function isResponseChain(expression: Expression, resName: string): boolean {
    if (Node.isIdentifier(expression)) {
        return expression.getText() === resName;
    }
    if (Node.isCallExpression(expression) && Node.isPropertyAccessExpression(expression.getExpression())) {
        return isResponseChain(expression.getExpression().getExpression(), resName);
    }
    if (Node.isPropertyAccessExpression(expression)) {
        return isResponseChain(expression.getExpression(), resName);
    }
    return false;
}

function inferContentTypeFromSend(arg?: Expression): string | undefined {
    if (!arg) return undefined;
    if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
        return 'text/plain';
    }
    if (Node.isObjectLiteralExpression(arg) || Node.isArrayLiteralExpression(arg)) {
        return 'application/json';
    }
    return undefined;
}

function extractRequestContentType(call: CallExpression, reqName: string): string | undefined {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    if (callee.getName() !== 'is') return undefined;
    if (!Node.isIdentifier(callee.getExpression())) return undefined;
    if (callee.getExpression().getText() !== reqName) return undefined;
    return extractStringLiteral(call.getArguments()[0]);
}

function extractRequestHeaderName(call: CallExpression, reqName: string): string | undefined {
    const callee = call.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    const method = callee.getName();
    if (method !== 'get' && method !== 'header') return undefined;
    if (!Node.isIdentifier(callee.getExpression())) return undefined;
    if (callee.getExpression().getText() !== reqName) return undefined;
    return extractStringLiteral(call.getArguments()[0]);
}

function recordResponse(
    responseIndex: Map<string, Set<string>>,
    status: string,
    contentType: string | undefined,
): void {
    const entry = responseIndex.get(status) ?? new Set<string>();
    if (contentType) entry.add(contentType);
    responseIndex.set(status, entry);
}

function finalizeResponses(
    responseIndex: Map<string, Set<string>>,
    defaultStatus: string,
    assumeJson: boolean,
): CodeScanResponse[] {
    if (responseIndex.size === 0) {
        return [
            {
                status: defaultStatus,
                description: 'Response',
                contentTypes: assumeJson ? ['application/json'] : [],
            },
        ];
    }

    return Array.from(responseIndex.entries()).map(([status, types]) => ({
        status,
        description: 'Response',
        contentTypes: Array.from(types),
    }));
}

function addPathParams(pathValue: string, paramMap: Map<string, CodeScanParam>): void {
    for (const name of extractPathParams(pathValue)) {
        addParam(paramMap, { name, in: 'path', required: true });
    }
}

function extractPathParams(pathValue: string): string[] {
    const params: string[] = [];
    const regex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(pathValue)) !== null) {
        params.push(match[1]);
    }
    return params;
}

function addParam(paramMap: Map<string, CodeScanParam>, param: CodeScanParam): void {
    const key = `${param.in}:${param.name}`;
    const existing = paramMap.get(key);
    if (!existing) {
        paramMap.set(key, param);
        return;
    }
    if (param.required && !existing.required) {
        existing.required = true;
    }
    if (param.description && !existing.description) {
        existing.description = param.description;
    }
    if (param.contentType && !existing.contentType) {
        existing.contentType = param.contentType;
    }
    if (param.encoding && !existing.encoding) {
        existing.encoding = param.encoding;
    }
}

function inferOperationId(handler: FunctionLikeDeclaration | undefined, method: string, pathValue: string): string {
    if (handler) {
        const name = getFunctionLikeName(handler);
        if (name) return name;
    }
    return camelCase(`${method} ${pathValue}`) || `${method.toLowerCase()}Operation`;
}

function getFunctionLikeName(handler: FunctionLikeDeclaration): string | undefined {
    if (Node.isFunctionDeclaration(handler) || Node.isMethodDeclaration(handler)) {
        return handler.getName();
    }

    if (Node.isFunctionExpression(handler) || Node.isArrowFunction(handler)) {
        const parent = handler.getParent();
        if (Node.isVariableDeclaration(parent)) {
            return parent.getName();
        }
        if (Node.isPropertyAssignment(parent)) {
            return parent.getName();
        }
    }

    return undefined;
}

function extractDecoratorPath(decorator: import('ts-morph').Decorator): string | undefined {
    const arg = decorator.getArguments()[0];
    return arg ? extractPathFromExpression(arg) : undefined;
}

function extractDecoratorParams(
    method: import('ts-morph').MethodDeclaration,
    paramMap: Map<string, CodeScanParam>,
): void {
    for (const param of method.getParameters()) {
        const required = !param.hasQuestionToken();
        for (const decorator of param.getDecorators()) {
            const name = decorator.getName();
            const arg = decorator.getArguments()[0];
            const paramName = trimQuotes(extractStringLiteral(arg) ?? param.getName());

            if (name === 'Param' || name === 'Path' || name === 'PathParam') {
                addParam(paramMap, { name: paramName, in: 'path', required: true });
                continue;
            }
            if (name === 'Query') {
                addParam(paramMap, { name: paramName, in: 'query', required });
                continue;
            }
            if (name === 'Header' || name === 'Headers') {
                if (paramName) {
                    addParam(paramMap, { name: paramName, in: 'header', required });
                }
                continue;
            }
            if (name === 'Cookie' || name === 'Cookies') {
                if (paramName) {
                    addParam(paramMap, { name: paramName, in: 'cookie', required });
                }
                continue;
            }
        }
    }
}

function buildRequestBodyFromDecoratorParams(
    method: import('ts-morph').MethodDeclaration,
): CodeScanRequestBody | undefined {
    for (const param of method.getParameters()) {
        for (const decorator of param.getDecorators()) {
            if (decorator.getName() === 'Body' || decorator.getName() === 'BodyParam') {
                const schema = inferSchemaFromTypeNode(param.getTypeNode());
                return {
                    required: !param.hasQuestionToken(),
                    contentTypes: ['application/json'],
                    ...(schema ? { schema } : {}),
                };
            }
        }
    }
    return undefined;
}

function extractHttpCode(method: import('ts-morph').MethodDeclaration): string | undefined {
    const decorator = method.getDecorators().find(dec => ['HttpCode', 'Status', 'Code'].includes(dec.getName()));
    if (!decorator) return undefined;
    return extractLiteralText(decorator.getArguments()[0]);
}

function extractPathFromExpression(expression: Expression): string | undefined {
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.getLiteralText();
    }

    if (Node.isTemplateExpression(expression)) {
        let value = expression.getHead().getLiteralText();
        for (const span of expression.getTemplateSpans()) {
            const placeholder = placeholderForExpression(span.getExpression());
            value += `{${placeholder}}${span.getLiteral().getLiteralText()}`;
        }
        return value;
    }

    return undefined;
}

function placeholderForExpression(expression: Expression): string {
    if (Node.isIdentifier(expression)) return expression.getText();
    if (Node.isPropertyAccessExpression(expression)) return expression.getName();
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.getLiteralText();
    }
    return 'param';
}

function normalizeRoutePath(value: string): string {
    let normalized = value.trim();
    if (!normalized) return '/';
    if (!normalized.startsWith('/')) {
        normalized = `/${normalized}`;
    }
    normalized = normalized.replace(/(^|\/)\:([A-Za-z0-9_]+)/g, '$1{$2}');
    return normalized || '/';
}

function joinPaths(basePath: string, methodPath: string): string {
    const base = basePath.replace(/^\/+|\/+$/g, '');
    const tail = methodPath.replace(/^\/+|\/+$/g, '');
    const joined = [base, tail].filter(Boolean).join('/');
    return normalizeRoutePath(joined);
}

function extractDocMeta(node: Node): {
    summary?: string;
    description?: string;
    deprecated?: boolean;
    tags?: string[];
    tagObjects?: TagObject[];
    externalDocs?: ExternalDocumentationObject;
    servers?: ServerObject[];
    security?: Record<string, string[]>[];
    extensions?: Record<string, any>;
    querystring?: QuerystringMeta;
    operationId?: string;
    responses?: ResponseDocMeta[];
    paramDocs?: Record<string, string>;
    paramExamples?: Record<string, unknown>;
    paramSchemas?: Record<string, SwaggerDefinition | boolean>;
    requestExamples?: Record<string, unknown>;
    responseExamples?: Record<string, Record<string, unknown>>;
} {
    const docs = getJsDocs(node);
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

    const parsedTags = tags
        .filter(tag => tag.getTagName() === 'tag' || tag.getTagName() === 'tags')
        .map(tag => parseTagInput(normalizeDocComment(tag.getComment())))
        .reduce(
            (acc, next) => {
                acc.names.push(...next.names);
                acc.objects.push(...next.objects);
                return acc;
            },
            { names: [] as string[], objects: [] as TagObject[] },
        );

    const tagNames = Array.from(new Set(parsedTags.names));
    const tagObjects = parsedTags.objects;

    const externalDocs = extractExternalDocs(tags);
    const servers = extractServers(tags);
    const security = extractSecurity(tags);
    const querystring = extractQuerystringParam(tags);
    const extensions: Record<string, any> = {};
    const responseHints: ResponseDocMeta[] = [];
    const responseSummaries: Record<string, string> = {};
    const paramDocs: Record<string, string> = {};
    const paramExamples: Record<string, unknown> = {};
    const paramSchemas: Record<string, SwaggerDefinition | boolean> = {};
    const requestExamples: Record<string, unknown> = {};
    const responseExamples: Record<string, Record<string, unknown>> = {};
    let operationId: string | undefined;
    tags.forEach(tag => {
        const tagName = tag.getTagName();
        if (tagName === 'operationId') {
            const raw = normalizeDocComment(tag.getComment()).trim();
            if (raw) {
                const [value] = raw.split(/\s+/).filter(Boolean);
                if (value) operationId = value;
            }
            return;
        }
        if (tagName === 'response') {
            const raw = normalizeDocComment(tag.getComment()).trim();
            const parsed = parseResponseDocMeta(raw);
            if (parsed) responseHints.push(parsed);
            return;
        }
        if (tagName === 'responseSummary') {
            const raw = normalizeDocComment(tag.getComment()).trim();
            const parsed = parseResponseSummary(raw);
            if (parsed) responseSummaries[parsed.status] = parsed.summary;
            return;
        }
        if (tagName === 'paramExample') {
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            if (!rawTagText) return;
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            const name = parts.shift();
            if (!name || parts.length === 0) return;
            const valueText = parts.join(' ').trim();
            if (!valueText) return;
            paramExamples[name] = parseDocValue(valueText);
            return;
        }
        if (tagName === 'paramSchema') {
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            if (!rawTagText) return;
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            const name = parts.shift();
            if (!name || parts.length === 0) return;
            const valueText = parts.join(' ').trim();
            if (!valueText) return;
            const parsed = parseDocValue(valueText);
            const normalized = normalizeParamSchemaOverride(parsed);
            if (normalized !== undefined) paramSchemas[name] = normalized;
            return;
        }
        if (tagName === 'requestExample') {
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            if (!rawTagText) return;
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            if (parts.length === 0) return;
            let mediaType: string | undefined;
            if (parts[0].includes('/')) {
                mediaType = parts.shift();
            }
            const valueText = parts.join(' ').trim();
            if (!valueText) return;
            requestExamples[mediaType ?? '*'] = parseDocValue(valueText);
            return;
        }
        if (tagName === 'responseExample') {
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            if (!rawTagText) return;
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            const status = parts.shift();
            if (!status || parts.length === 0) return;
            let mediaType: string | undefined;
            if (parts[0].includes('/')) {
                mediaType = parts.shift();
            }
            const valueText = parts.join(' ').trim();
            if (!valueText) return;
            if (!responseExamples[status]) responseExamples[status] = {};
            responseExamples[status][mediaType ?? '*'] = parseDocValue(valueText);
            return;
        }
        if (tagName === 'param') {
            const parsed = parseParamDoc(tag);
            if (parsed) {
                paramDocs[parsed.name] = parsed.description;
            }
            return;
        }
        if (!tagName.startsWith('x-')) return;
        const raw = normalizeDocComment(tag.getComment()).trim();
        if (!raw) {
            extensions[tagName] = true;
            return;
        }
        try {
            extensions[tagName] = JSON.parse(raw);
        } catch {
            extensions[tagName] = raw;
        }
    });

    if (Object.keys(responseSummaries).length > 0) {
        const responseIndex = new Map(responseHints.map(entry => [entry.status, entry]));
        Object.entries(responseSummaries).forEach(([status, summary]) => {
            const existing = responseIndex.get(status);
            if (existing) {
                existing.summary = existing.summary ?? summary;
                return;
            }
            responseHints.push({ status, summary });
        });
    }

    return {
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        ...(deprecated ? { deprecated } : {}),
        ...(tagNames.length > 0 ? { tags: tagNames } : {}),
        ...(tagObjects.length > 0 ? { tagObjects } : {}),
        ...(externalDocs ? { externalDocs } : {}),
        ...(servers.length > 0 ? { servers } : {}),
        ...(security.length > 0 ? { security } : {}),
        ...(querystring ? { querystring } : {}),
        ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
        ...(operationId ? { operationId } : {}),
        ...(responseHints.length > 0 ? { responses: responseHints } : {}),
        ...(Object.keys(paramDocs).length > 0 ? { paramDocs } : {}),
        ...(Object.keys(paramExamples).length > 0 ? { paramExamples } : {}),
        ...(Object.keys(paramSchemas).length > 0 ? { paramSchemas } : {}),
        ...(Object.keys(requestExamples).length > 0 ? { requestExamples } : {}),
        ...(Object.keys(responseExamples).length > 0 ? { responseExamples } : {}),
    };
}

function extractQuerystringParam(tags: import('ts-morph').JSDocTag[]): QuerystringMeta | undefined {
    const qsTag = tags.find(tag => tag.getTagName() === 'querystring');
    if (!qsTag) return undefined;
    const raw = normalizeDocComment(qsTag.getComment()).trim();
    if (!raw) return undefined;

    if (raw.startsWith('{')) {
        try {
            const parsed = JSON.parse(raw) as QuerystringMeta;
            if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string' && parsed.name.trim()) {
                const encoding =
                    parsed.encoding && typeof parsed.encoding === 'object' && !Array.isArray(parsed.encoding)
                        ? parsed.encoding
                        : undefined;
                return {
                    name: parsed.name.trim(),
                    ...(parsed.contentType ? { contentType: String(parsed.contentType) } : {}),
                    ...(encoding ? { encoding } : {}),
                    ...(typeof parsed.required === 'boolean' ? { required: parsed.required } : {}),
                    ...(parsed.description ? { description: String(parsed.description) } : {}),
                };
            }
        } catch {
            // Ignore malformed JSON to avoid crashing scans
        }
        return undefined;
    }

    const parts = raw.split(/\s+/).filter(Boolean);
    const name = parts.shift();
    if (!name) return undefined;
    let contentType: string | undefined;
    let required: boolean | undefined;
    const descriptionParts: string[] = [];

    parts.forEach(part => {
        const lower = part.toLowerCase();
        if (lower === 'required') {
            required = true;
            return;
        }
        if (lower === 'optional') {
            required = false;
            return;
        }
        if (!contentType && part.includes('/')) {
            contentType = part;
            return;
        }
        descriptionParts.push(part);
    });

    const description = descriptionParts.length > 0 ? descriptionParts.join(' ') : undefined;
    return {
        name,
        ...(contentType ? { contentType } : {}),
        ...(required !== undefined ? { required } : {}),
        ...(description ? { description } : {}),
    };
}

function applyQuerystringMeta(docMeta: { querystring?: QuerystringMeta }, paramMap: Map<string, CodeScanParam>): void {
    const querystring = docMeta.querystring;
    if (!querystring) return;
    addParam(paramMap, {
        name: querystring.name,
        in: 'querystring',
        required: querystring.required,
        description: querystring.description,
        contentType: querystring.contentType,
        ...(querystring.encoding ? { encoding: querystring.encoding } : {}),
    });
}

function applyParamDocs(paramMap: Map<string, CodeScanParam>, paramDocs?: Record<string, string>): void {
    if (!paramDocs) return;
    for (const param of paramMap.values()) {
        if (param.description) continue;
        const direct = paramDocs[param.name];
        const normalized = paramDocs[param.name.replace(/[{}]/g, '')];
        const description = direct ?? normalized;
        if (description) {
            param.description = description;
        }
    }
}

function applyParamExamples(paramMap: Map<string, CodeScanParam>, paramExamples?: Record<string, unknown>): void {
    if (!paramExamples) return;
    for (const param of paramMap.values()) {
        if (param.example !== undefined) continue;
        const direct = paramExamples[param.name];
        const normalized = paramExamples[param.name.replace(/[{}]/g, '')];
        const example = direct ?? normalized;
        if (example !== undefined) {
            param.example = example;
        }
    }
}

function applyParamSchemas(
    paramMap: Map<string, CodeScanParam>,
    paramSchemas?: Record<string, SwaggerDefinition | boolean>,
): void {
    if (!paramSchemas) return;
    for (const param of paramMap.values()) {
        if (param.in === 'querystring') continue;
        const direct = paramSchemas[param.name];
        const normalized = paramSchemas[param.name.replace(/[{}]/g, '')];
        const schema = direct ?? normalized;
        if (schema !== undefined) {
            param.schema = schema;
        }
    }
}

function applyRequestExamples(
    requestBody: CodeScanRequestBody | undefined,
    requestExamples?: Record<string, unknown>,
): void {
    if (!requestBody || !requestExamples || Object.keys(requestExamples).length === 0) return;
    requestBody.examples = { ...requestExamples };
}

function applyResponseExamples(
    responses: CodeScanResponse[],
    responseExamples?: Record<string, Record<string, unknown>>,
): void {
    if (!responseExamples) return;
    responses.forEach(response => {
        const examples = responseExamples[response.status];
        if (examples && Object.keys(examples).length > 0) {
            response.examples = { ...examples };
        }
    });
}

function mergeResponseHints(responses: CodeScanResponse[], hints?: ResponseDocMeta[]): CodeScanResponse[] {
    if (!hints || hints.length === 0) return responses;
    const responseMap = new Map<string, CodeScanResponse>();
    const ordered: string[] = [];

    responses.forEach(response => {
        responseMap.set(response.status, { ...response });
        ordered.push(response.status);
    });

    hints.forEach(hint => {
        const existing = responseMap.get(hint.status);
        if (!existing) {
            responseMap.set(hint.status, {
                status: hint.status,
                ...(hint.summary ? { summary: hint.summary } : {}),
                ...(hint.description ? { description: hint.description } : {}),
                contentTypes: hint.contentTypes ?? [],
            });
            ordered.push(hint.status);
            return;
        }
        if (hint.summary) {
            existing.summary = hint.summary;
        }
        if (hint.description) {
            existing.description = hint.description;
        }
        if (hint.contentTypes && hint.contentTypes.length > 0) {
            if (existing.contentTypes.length === 0) {
                existing.contentTypes = [...hint.contentTypes];
            } else {
                const contentTypes = new Set(existing.contentTypes);
                hint.contentTypes.forEach(entry => contentTypes.add(entry));
                existing.contentTypes = Array.from(contentTypes);
            }
        }
    });

    return ordered.map(status => responseMap.get(status) as CodeScanResponse);
}

function parseResponseDocMeta(raw: string): ResponseDocMeta | undefined {
    if (!raw) return undefined;
    const parts = raw.split(/\s+/).filter(Boolean);
    const status = parts.shift();
    if (!status) return undefined;
    let contentTypes: string[] | undefined;
    if (parts.length > 0 && parts[0].includes('/')) {
        const mediaRaw = parts.shift() as string;
        contentTypes = mediaRaw
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean);
    }
    const description = parts.join(' ').trim();
    return {
        status,
        ...(contentTypes && contentTypes.length > 0 ? { contentTypes } : {}),
        ...(description ? { description } : {}),
    };
}

function parseResponseSummary(raw: string): { status: string; summary: string } | undefined {
    if (!raw) return undefined;
    const parts = raw.split(/\s+/).filter(Boolean);
    const status = parts.shift();
    if (!status) return undefined;
    const summary = parts.join(' ').trim();
    if (!summary) return undefined;
    return { status, summary };
}

function parseParamDoc(tag: import('ts-morph').JSDocTag): { name: string; description: string } | undefined {
    if (Node.isJSDocParameterTag(tag)) {
        const name = tag.getName();
        const description = normalizeDocComment(tag.getComment()).trim();
        if (name && description) {
            return { name, description };
        }
        return undefined;
    }

    const rawText = tag
        .getText()
        .replace(/^\s*\*?\s*@param\s+/i, '')
        .trim();
    let name: string | undefined;
    let description = '';

    if (rawText) {
        const cleaned = rawText.replace(/\r?\n\s*\*\s?/g, ' ').trim();
        const match = cleaned.match(/^(?:\{[^}]+\}\s*)?(\S+)\s*([\s\S]*)$/);
        if (match) {
            name = match[1];
            description = (match[2] || '').trim();
        }
    }

    if (!name) {
        const fallback = normalizeDocComment(tag.getComment());
        const parts = fallback.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return undefined;
        name = parts.shift();
        if (name && name.startsWith('{')) {
            name = parts.shift();
        }
        description = parts.join(' ').trim();
    }

    if (!name || !description) return undefined;
    return { name, description };
}

function stripInternalDocMeta<
    T extends {
        querystring?: QuerystringMeta;
        responses?: ResponseDocMeta[];
        paramDocs?: Record<string, string>;
        paramExamples?: Record<string, unknown>;
        paramSchemas?: Record<string, SwaggerDefinition | boolean>;
        requestExamples?: Record<string, unknown>;
        responseExamples?: Record<string, Record<string, unknown>>;
        operationId?: string;
    },
>(
    docMeta: T,
): Omit<
    T,
    | 'querystring'
    | 'responses'
    | 'paramDocs'
    | 'paramExamples'
    | 'paramSchemas'
    | 'requestExamples'
    | 'responseExamples'
    | 'operationId'
> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {
        querystring: _ignored,
        responses: _responses,
        paramDocs: _paramDocs,
        paramExamples: _paramExamples,
        paramSchemas: _paramSchemas,
        requestExamples: _requestExamples,
        responseExamples: _responseExamples,
        operationId: _operationId,
        ...rest
    } = docMeta;
    return rest;
}

function extractExternalDocs(tags: import('ts-morph').JSDocTag[]): ExternalDocumentationObject | undefined {
    const seeTag = tags.find(tag => tag.getTagName() === 'see');
    if (!seeTag) return undefined;
    let raw = normalizeDocComment(seeTag.getComment()).trim();
    if (!raw || raw.startsWith('://')) {
        const text = seeTag.getText();
        const line = text.split(/\r?\n/)[0] ?? '';
        const cleaned = line.replace(/^\s*\*?\s*@see\s+/i, '').trim();
        if (cleaned) {
            raw = cleaned;
        }
    }
    if (!raw) return undefined;

    const parts = raw.split(/\s+/);
    const url = parts.shift();
    if (!url) return undefined;
    const description = parts.join(' ').trim();
    return description ? { url, description } : { url };
}

function extractServers(tags: import('ts-morph').JSDocTag[]): ServerObject[] {
    const serverTags = tags.filter(tag => tag.getTagName() === 'server');
    const servers: ServerObject[] = [];

    serverTags.forEach(tag => {
        const raw = normalizeDocComment(tag.getComment()).trim();
        if (!raw) return;
        const jsonServers = parseServerJson(raw);
        if (jsonServers) {
            servers.push(...jsonServers);
            return;
        }
        const parts = raw.split(/\s+/);
        const url = parts.shift();
        if (!url) return;
        const description = parts.join(' ').trim();
        servers.push(description ? { url, description } : { url });
    });

    return servers;
}

function extractSecurity(tags: import('ts-morph').JSDocTag[]): Record<string, string[]>[] {
    const securityTags = tags.filter(tag => tag.getTagName() === 'security');
    const requirements: Record<string, string[]>[] = [];

    securityTags.forEach(tag => {
        const raw = normalizeDocComment(tag.getComment()).trim();
        if (!raw) return;

        if (raw.startsWith('{') || raw.startsWith('[')) {
            const parsed = parseSecurityJson(raw);
            if (parsed.length > 0) {
                requirements.push(...parsed);
            }
            return;
        }

        const [scheme, ...rest] = raw.split(/\s+/);
        if (!scheme) return;
        const scopes = rest
            .join(' ')
            .split(/[,\s]+/)
            .map(scope => scope.trim())
            .filter(Boolean);
        requirements.push({ [scheme]: scopes });
    });

    return requirements;
}

function parseSecurityJson(raw: string): Record<string, string[]>[] {
    try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
            return parsed.filter((entry): entry is Record<string, string[]> => !!entry && typeof entry === 'object');
        }
        if (parsed && typeof parsed === 'object') {
            return [parsed as Record<string, string[]>];
        }
    } catch {
        return [];
    }
    return [];
}

function getJsDocs(node: Node): import('ts-morph').JSDoc[] {
    let current: Node | undefined = node;
    for (let depth = 0; current && depth < 4; depth += 1) {
        const withDocs = current as Node & { getJsDocs?: () => import('ts-morph').JSDoc[] };
        const docs = withDocs.getJsDocs ? withDocs.getJsDocs() : [];
        if (docs.length > 0) return docs;
        current = current.getParent();
    }
    return [];
}

function parseTagList(comment: string): string[] {
    return comment
        .split(',')
        .flatMap(part => part.trim().split(/\s+/))
        .map(part => part.trim())
        .filter(Boolean);
}

function parseTagInput(raw: string): { names: string[]; objects: TagObject[] } {
    const trimmed = raw.trim();
    if (!trimmed) return { names: [], objects: [] };
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = parseJsonMaybe(trimmed);
        return normalizeTagJson(parsed);
    }
    return { names: parseTagList(trimmed), objects: [] };
}

function normalizeTagJson(parsed: unknown): { names: string[]; objects: TagObject[] } {
    const names: string[] = [];
    const objects: TagObject[] = [];
    const pushTag = (entry: unknown) => {
        if (typeof entry === 'string') {
            if (entry.trim()) names.push(entry.trim());
            return;
        }
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        const tag = entry as TagObject;
        if (typeof tag.name !== 'string' || !tag.name.trim()) return;
        const normalized = { ...tag, name: tag.name.trim() };
        names.push(normalized.name);
        objects.push(normalized);
    };

    if (Array.isArray(parsed)) {
        parsed.forEach(pushTag);
    } else {
        pushTag(parsed);
    }

    return { names, objects };
}

function parseServerJson(raw: string): ServerObject[] | null {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    const parsed = parseJsonMaybe(trimmed);
    if (!parsed) return [];
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    const servers: ServerObject[] = [];
    entries.forEach(entry => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        const candidate = entry as ServerObject;
        if (typeof candidate.url !== 'string' || candidate.url.trim().length === 0) return;
        servers.push({ ...candidate, url: candidate.url.trim() });
    });
    return servers;
}

function parseJsonMaybe(raw: string): unknown | undefined {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

function normalizeDocComment(comment: unknown): string {
    if (!comment) return '';
    if (typeof comment === 'string') return comment;
    if (Array.isArray(comment)) return comment.map(part => normalizeDocComment(part)).join('');
    if (Node.isNode(comment)) return comment.getText();
    return String(comment);
}

const EXAMPLE_WRAPPER_KEY = '__oasExample';

type ExampleCarrier = {
    [EXAMPLE_WRAPPER_KEY]: ExampleObject;
};

function isExampleCarrier(value: unknown): value is ExampleCarrier {
    if (!value || typeof value !== 'object') return false;
    if (!(EXAMPLE_WRAPPER_KEY in (value as Record<string, unknown>))) return false;
    const wrapped = (value as Record<string, unknown>)[EXAMPLE_WRAPPER_KEY];
    return !!wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped);
}

function unwrapExampleCarrier(value: unknown): ExampleObject | undefined {
    if (!isExampleCarrier(value)) return undefined;
    return (value as ExampleCarrier)[EXAMPLE_WRAPPER_KEY];
}

function parseDocValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function normalizeParamSchemaOverride(value: unknown): SwaggerDefinition | boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as SwaggerDefinition;
    if (typeof value !== 'string') return undefined;

    const trimmed = value.trim();
    if (!trimmed) return undefined;

    const primitiveTypes = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
    if (primitiveTypes.has(trimmed)) {
        return { type: trimmed as SwaggerDefinition['type'] };
    }

    if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('../') ||
        /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ) {
        return { $ref: trimmed };
    }

    if (/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
        return { $ref: `#/components/schemas/${trimmed}` };
    }

    return undefined;
}

function extractLiteralText(expression?: Expression): string | undefined {
    if (!expression) return undefined;
    if (Node.isNumericLiteral(expression)) return expression.getText();
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.getLiteralText();
    }
    return undefined;
}

function extractStringLiteral(expression?: Expression): string | undefined {
    if (!expression) return undefined;
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.getLiteralText();
    }
    return undefined;
}

function trimQuotes(value: string): string {
    return value.replace(/^['"]|['"]$/g, '');
}

function isReservedHeaderParam(name?: string): boolean {
    if (!name) return false;
    return RESERVED_HEADER_NAMES.has(name.toLowerCase());
}

function buildParameters(params: CodeScanParam[]): Parameter[] {
    return params
        .filter(param => !(param.in === 'header' && isReservedHeaderParam(param.name)))
        .map(param => {
            if (param.in === 'querystring') {
                const contentType = param.contentType ?? 'application/x-www-form-urlencoded';
                const contentEntry: {
                    schema: SwaggerDefinition;
                    encoding?: Record<string, any>;
                    example?: unknown;
                    examples?: Record<string, ExampleObject>;
                } = {
                    schema: guessSchemaForContentType(contentType),
                };
                if (param.encoding) {
                    contentEntry.encoding = param.encoding;
                }
                if (param.example !== undefined) {
                    const wrapped = unwrapExampleCarrier(param.example);
                    if (wrapped) {
                        contentEntry.examples = { example: wrapped };
                    } else {
                        contentEntry.example = param.example;
                    }
                }
                return {
                    name: param.name,
                    in: param.in,
                    required: param.required,
                    description: param.description,
                    content: {
                        [contentType]: contentEntry,
                    },
                };
            }

            return {
                name: param.name,
                in: param.in,
                required: param.in === 'path' ? true : param.required,
                description: param.description,
                schema: param.schema ?? { type: 'string' },
                ...(param.example !== undefined && !unwrapExampleCarrier(param.example)
                    ? { example: param.example }
                    : {}),
                ...(param.example !== undefined && unwrapExampleCarrier(param.example)
                    ? { examples: { example: unwrapExampleCarrier(param.example) as ExampleObject } }
                    : {}),
            };
        });
}

function buildRequestBody(requestBody?: CodeScanRequestBody): RequestBody | undefined {
    if (!requestBody) return undefined;
    if (requestBody.contentTypes.length === 0) return undefined;
    const content = Object.fromEntries(
        requestBody.contentTypes.map(contentType => [
            contentType,
            { schema: requestBody.schema ?? guessSchemaForContentType(contentType) },
        ]),
    );
    if (requestBody.examples && Object.keys(requestBody.examples).length > 0) {
        Object.entries(content).forEach(([contentType, entry]) => {
            const example = requestBody.examples?.[contentType] ?? requestBody.examples?.['*'];
            if (example !== undefined) {
                const wrapped = unwrapExampleCarrier(example);
                if (wrapped) {
                    (entry as { examples?: Record<string, ExampleObject> }).examples = { example: wrapped };
                } else {
                    (entry as { example?: unknown }).example = example;
                }
            }
        });
    }
    return {
        required: requestBody.required ?? true,
        content,
    };
}

function buildResponses(responses: CodeScanResponse[]): Record<string, SwaggerResponse> {
    const responseMap: Record<string, SwaggerResponse> = {};
    const normalized = responses.length > 0 ? responses : [{ status: '200', contentTypes: [] }];

    for (const response of normalized) {
        const description = response.description ?? (response.status === 'default' ? 'Default response' : 'Response');
        const entry: SwaggerResponse = {
            description,
            ...(response.summary ? { summary: response.summary } : {}),
        };
        if (response.contentTypes.length > 0) {
            entry.content = Object.fromEntries(
                response.contentTypes.map(contentType => [
                    contentType,
                    { schema: response.schema ?? guessSchemaForContentType(contentType) },
                ]),
            );
            if (response.examples && Object.keys(response.examples).length > 0) {
                Object.entries(entry.content).forEach(([contentType, media]) => {
                    const example = response.examples?.[contentType] ?? response.examples?.['*'];
                    if (example !== undefined) {
                        const wrapped = unwrapExampleCarrier(example);
                        if (wrapped) {
                            (media as { examples?: Record<string, ExampleObject> }).examples = { example: wrapped };
                        } else {
                            (media as { example?: unknown }).example = example;
                        }
                    }
                });
            }
        }
        responseMap[response.status] = entry;
    }

    return responseMap;
}

function guessSchemaForContentType(contentType: string): SwaggerDefinition {
    const normalized = contentType.toLowerCase();
    if (normalized.includes('json')) {
        return { type: 'object' };
    }
    if (normalized.startsWith('text/')) {
        return { type: 'string' };
    }
    if (normalized.includes('xml')) {
        return { type: 'string' };
    }
    if (normalized === 'application/octet-stream') {
        return { type: 'string', format: 'binary' };
    }
    if (normalized === 'application/x-www-form-urlencoded') {
        return { type: 'object' };
    }
    if (normalized === 'multipart/form-data') {
        return { type: 'object' };
    }
    return { type: 'string' };
}

function inferExpressSchemaHints(handler: FunctionLikeDeclaration): {
    requestSchema?: SwaggerDefinition | boolean;
    responseSchema?: SwaggerDefinition | boolean;
} {
    const params = handler.getParameters();
    const reqParam = params[0];
    const resParam = params[1];
    let requestSchema: SwaggerDefinition | boolean | undefined;
    let responseSchema: SwaggerDefinition | boolean | undefined;

    if (reqParam) {
        const reqTypeNode = reqParam.getTypeNode();
        const extracted = extractSchemasFromRequestType(reqTypeNode);
        if (extracted.requestSchema) {
            requestSchema = extracted.requestSchema;
        }
        if (extracted.responseSchema) {
            responseSchema = extracted.responseSchema;
        }
    }

    if (resParam) {
        const resTypeNode = resParam.getTypeNode();
        const inferred = extractSchemaFromResponseType(resTypeNode);
        if (inferred) {
            responseSchema = inferred;
        }
    }

    return { requestSchema, responseSchema };
}

function inferReturnSchemaFromSignature(handler: FunctionLikeDeclaration): SwaggerDefinition | boolean | undefined {
    const returnTypeNode =
        'getReturnTypeNode' in handler && typeof handler.getReturnTypeNode === 'function'
            ? handler.getReturnTypeNode()
            : undefined;
    if (!returnTypeNode) return undefined;
    const unwrapped = unwrapContainerTypeNode(returnTypeNode);
    if (isVoidTypeNode(unwrapped)) return undefined;
    if (isResponseTypeName(getTypeNodeName(unwrapped))) return undefined;
    return inferSchemaFromTypeNode(unwrapped);
}

function extractSchemasFromRequestType(typeNode?: TypeNode): {
    requestSchema?: SwaggerDefinition | boolean;
    responseSchema?: SwaggerDefinition | boolean;
} {
    if (!typeNode || !Node.isTypeReference(typeNode)) return {};
    if (!isRequestTypeName(getTypeNodeName(typeNode))) return {};
    const args = typeNode.getTypeArguments();
    const responseArg = args[1];
    const requestArg = args[2];
    return {
        ...(requestArg ? { requestSchema: inferSchemaFromTypeNode(requestArg) } : {}),
        ...(responseArg ? { responseSchema: inferSchemaFromTypeNode(responseArg) } : {}),
    };
}

function extractSchemaFromResponseType(typeNode?: TypeNode): SwaggerDefinition | boolean | undefined {
    if (!typeNode || !Node.isTypeReference(typeNode)) return undefined;
    if (!isResponseTypeName(getTypeNodeName(typeNode))) return undefined;
    const arg = typeNode.getTypeArguments()[0];
    return inferSchemaFromTypeNode(arg);
}

function inferSchemaFromTypeNode(typeNode?: TypeNode): SwaggerDefinition | boolean | undefined {
    if (!typeNode) return undefined;
    const unwrapped = unwrapContainerTypeNode(typeNode);
    if (isVoidTypeNode(unwrapped)) return undefined;

    if (Node.isTypeReference(unwrapped)) {
        const typeName = getTypeNodeName(unwrapped);
        const primitiveSchema = schemaForPrimitiveReference(typeName);
        if (primitiveSchema) return primitiveSchema;
    }

    const schema = schemaFromTypeNode(unwrapped);
    return isEmptySchema(schema) ? undefined : schema;
}

function unwrapContainerTypeNode(typeNode: TypeNode): TypeNode {
    if (!Node.isTypeReference(typeNode)) return typeNode;
    const typeName = getTypeNodeName(typeNode);
    if (typeName === 'Promise' || typeName === 'PromiseLike' || typeName === 'Observable') {
        const arg = typeNode.getTypeArguments()[0];
        if (arg) {
            return unwrapContainerTypeNode(arg);
        }
    }
    return typeNode;
}

function getTypeNodeName(typeNode: TypeNode): string {
    if (!Node.isTypeReference(typeNode)) return '';
    return typeNode.getTypeName().getText();
}

function schemaForPrimitiveReference(typeName: string): SwaggerDefinition | undefined {
    switch (typeName) {
        case 'String':
            return { type: 'string' };
        case 'Number':
            return { type: 'number' };
        case 'Boolean':
            return { type: 'boolean' };
        case 'Object':
            return { type: 'object' };
        default:
            return undefined;
    }
}

function isVoidTypeNode(typeNode: TypeNode): boolean {
    return typeNode.getKind() === SyntaxKind.VoidKeyword || typeNode.getKind() === SyntaxKind.NeverKeyword;
}

function isRequestTypeName(typeName: string): boolean {
    return typeName === 'Request' || typeName.endsWith('.Request');
}

function isResponseTypeName(typeName: string): boolean {
    return typeName === 'Response' || typeName.endsWith('.Response');
}

function isEmptySchema(schema: SwaggerDefinition): boolean {
    return Object.keys(schema).length === 0;
}
