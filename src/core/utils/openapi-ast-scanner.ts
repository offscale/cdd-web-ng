import path from 'node:path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import type { CallExpression, Expression, FunctionLikeDeclaration, SourceFile } from 'ts-morph';
import { camelCase } from './string.js';
import {
    InfoObject,
    Parameter,
    RequestBody,
    SwaggerDefinition,
    SwaggerResponse,
    SwaggerSpec,
} from '../types/index.js';
import { parseGeneratedModelSource, ReverseSchemaMap } from './openapi-reverse-models.js';
import { OAS_3_1_DIALECT } from '../constants.js';

const STANDARD_HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query']);
const EXTRA_HTTP_METHODS = new Set([
    'copy',
    'move',
    'lock',
    'unlock',
    'propfind',
    'proppatch',
    'mkcol',
    'report',
]);
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
export type CodeScanParamLocation = 'path' | 'query' | 'header' | 'cookie';

/** Describes a parameter reconstructed from an AST scan. */
export interface CodeScanParam {
    name: string;
    in: CodeScanParamLocation;
    required?: boolean;
    description?: string;
    schema?: SwaggerDefinition | boolean;
}

/** Describes a reconstructed request body. */
export interface CodeScanRequestBody {
    required?: boolean;
    contentTypes: string[];
}

/** Describes a reconstructed response. */
export interface CodeScanResponse {
    status: string;
    description?: string;
    contentTypes: string[];
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
}

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

        if (op.tags && op.tags.length > 0) {
            op.tags.forEach(tag => {
                if (!tagSet.has(tag)) {
                    tagSet.add(tag);
                    tagNames.push(tag);
                }
            });
        }
    }

    const spec: SwaggerSpec = {
        openapi: '3.2.0',
        info,
        paths,
        jsonSchemaDialect: OAS_3_1_DIALECT,
    };

    if (tagNames.length > 0) {
        spec.tags = tagNames.map(name => ({ name }));
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
                const statusCode = extractHttpCode(method) ?? '200';

                operations.push({
                    operationId: method.getName(),
                    method: entry.method,
                    path: fullPath,
                    filePath: sourceFile.getFilePath(),
                    params: Array.from(paramMap.values()),
                    requestBody: buildRequestBodyFromDecoratorParams(method),
                    responses: [{ status: statusCode, description: 'Response', contentTypes: ['application/json'] }],
                    ...docMeta,
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

    const analysis = handler
        ? analyzeExpressHandler(handler, paramMap)
        : {
              requestBody: undefined,
              responses: [{ status: '200', description: 'Response', contentTypes: [] }],
          };

    return {
        operationId,
        method,
        path: pathValue,
        filePath,
        params: Array.from(paramMap.values()),
        requestBody: analysis.requestBody,
        responses: analysis.responses,
        ...docMeta,
    };
}

function analyzeExpressHandler(handler: FunctionLikeDeclaration, paramMap: Map<string, CodeScanParam>): {
    requestBody?: CodeScanRequestBody;
    responses: CodeScanResponse[];
} {
    const bindings = extractRequestBindings(handler);
    const body = getFunctionBody(handler);
    const requestContentTypes = new Set<string>();
    let bodyUsed = Boolean(bindings.bodyName);
    const responseIndex = new Map<string, Set<string>>();

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

    const responses = finalizeResponses(responseIndex, '200', false);

    const requestBody = bodyUsed
        ? {
              required: true,
              contentTypes: requestContentTypes.size > 0 ? Array.from(requestContentTypes) : ['application/json'],
          }
        : undefined;

    return { requestBody, responses };
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

function resolveRequestLocation(expression: Expression, bindings: RequestBindings): CodeScanParamLocation | 'body' | undefined {
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
}

function inferOperationId(
    handler: FunctionLikeDeclaration | undefined,
    method: string,
    pathValue: string,
): string {
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

function extractDecoratorParams(method: import('ts-morph').MethodDeclaration, paramMap: Map<string, CodeScanParam>): void {
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
                return {
                    required: !param.hasQuestionToken(),
                    contentTypes: ['application/json'],
                };
            }
        }
    }
    return undefined;
}

function extractHttpCode(method: import('ts-morph').MethodDeclaration): string | undefined {
    const decorator = method
        .getDecorators()
        .find(dec => ['HttpCode', 'Status', 'Code'].includes(dec.getName()));
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

    const tagNames = tags
        .filter(tag => tag.getTagName() === 'tag' || tag.getTagName() === 'tags')
        .flatMap(tag => parseTagList(normalizeDocComment(tag.getComment())));

    return {
        ...(summary ? { summary } : {}),
        ...(description ? { description } : {}),
        ...(deprecated ? { deprecated } : {}),
        ...(tagNames.length > 0 ? { tags: tagNames } : {}),
    };
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

function normalizeDocComment(comment: unknown): string {
    if (!comment) return '';
    if (typeof comment === 'string') return comment;
    if (Array.isArray(comment)) return comment.map(part => normalizeDocComment(part)).join('');
    if (Node.isNode(comment)) return comment.getText();
    return String(comment);
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

function buildParameters(params: CodeScanParam[]): Parameter[] {
    return params.map(param => ({
        name: param.name,
        in: param.in,
        required: param.in === 'path' ? true : param.required,
        description: param.description,
        schema: param.schema ?? { type: 'string' },
    }));
}

function buildRequestBody(requestBody?: CodeScanRequestBody): RequestBody | undefined {
    if (!requestBody) return undefined;
    if (requestBody.contentTypes.length === 0) return undefined;
    const content = Object.fromEntries(
        requestBody.contentTypes.map(contentType => [contentType, { schema: guessSchemaForContentType(contentType) }]),
    );
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
        const entry: SwaggerResponse = { description };
        if (response.contentTypes.length > 0) {
            entry.content = Object.fromEntries(
                response.contentTypes.map(contentType => [contentType, { schema: guessSchemaForContentType(contentType) }]),
            );
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
    if (normalized === 'multipart/form-data') {
        return { type: 'object' };
    }
    return { type: 'string' };
}
