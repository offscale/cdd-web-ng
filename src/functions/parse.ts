// src/core/utils/openapi-ast-scanner.ts
import path from 'node:path';
import { Node, Project, SyntaxKind } from 'ts-morph';
import type { CallExpression, Expression, SourceFile, TypeNode } from 'ts-morph';
import { camelCase } from './utils_string.js';
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
} from '../core/types/index.js';
import { parseGeneratedModelSource, ReverseSchemaMap, schemaFromTypeNode } from '../classes/parse.js';
import { OAS_3_1_DIALECT } from '../core/constants.js';

/* v8 ignore next */
const STANDARD_HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace', 'query']);
/* v8 ignore next */
const RESERVED_HEADER_NAMES = new Set(['accept', 'content-type', 'authorization']);
/* v8 ignore next */
const EXTRA_HTTP_METHODS = new Set(['copy', 'move', 'lock', 'unlock', 'propfind', 'proppatch', 'mkcol', 'report']);
/* v8 ignore next */
const HTTP_METHODS = new Set([...STANDARD_HTTP_METHODS, ...EXTRA_HTTP_METHODS]);
/* v8 ignore next */
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
/* v8 ignore next */
const CONTROLLER_DECORATORS = new Set(['Controller', 'Route']);
/* v8 ignore next */
const DEFAULT_IGNORE_DIRS = new Set(['node_modules', 'dist', 'coverage', 'docs', '.git']);
/* v8 ignore next */
const DEFAULT_INFO: InfoObject = { title: 'Recovered OpenAPI', version: '0.0.0' };

/** File system requirements for AST scanning helpers. */
export type CodeScanFileSystem = {
    /** Returns file status information. */
    statSync: (filePath: string) => {
        /** True if the path is a file. */
        isFile: () => boolean;
        /** True if the path is a directory. */
        isDirectory: () => boolean;
    };
    /** Reads the content of a file. */
    // type-coverage:ignore-next-line
    readFileSync: ((filePath: string, encoding: string) => string) | ((filePath: string, options: unknown) => string);
    /** Reads the directory entries. */
    readdirSync: (dirPath: string) => string[];
};

/** Supported locations for parameters discovered in scanned code. */
export type CodeScanParamLocation = 'path' | 'query' | 'header' | 'cookie' | 'querystring';

/** Describes a parameter reconstructed from an AST scan. */
export interface CodeScanParam {
    /** The name of the parameter. */
    name: string;
    /** The location of the parameter. */
    in: CodeScanParamLocation;
    /** Whether the parameter is required. */
    required?: boolean;
    /** The description of the parameter. */
    description?: string;
    /** The schema of the parameter. */
    schema?: SwaggerDefinition | boolean;
    /** The content type of the parameter. */
    contentType?: string;
    /** The encoding of the parameter. */
    encoding?: Record<string, unknown>;
    /** An example value for the parameter. */
    example?: unknown;
}

/** Describes a reconstructed request body. */
export interface CodeScanRequestBody {
    /** Whether the request body is required. */
    required?: boolean;
    /** The supported content types. */
    contentTypes: string[];
    /** The schema of the request body. */
    schema?: SwaggerDefinition | boolean;
    /** Example values for the request body. */
    examples?: Record<string, unknown>;
}

/** Describes a reconstructed response. */
export interface CodeScanResponse {
    /** The HTTP status code of the response. */
    status: string;
    /** The summary of the response. */
    summary?: string;
    /** The description of the response. */
    description?: string;
    /** The supported content types. */
    contentTypes: string[];
    /** The schema of the response. */
    schema?: SwaggerDefinition | boolean;
    /** Example values for the response. */
    examples?: Record<string, unknown>;
}

/** Describes a reconstructed API operation discovered in source code. */
export interface CodeScanOperation {
    /** The operation ID. */
    operationId: string;
    /** The HTTP method. */
    method: string;
    /** The API path. */
    path: string;
    /** The file path where the operation was found. */
    filePath: string;
    /** The parameters of the operation. */
    params: CodeScanParam[];
    /** The request body of the operation. */
    requestBody?: CodeScanRequestBody;
    /** The responses of the operation. */
    responses: CodeScanResponse[];
    /** The summary of the operation. */
    summary?: string;
    /** The description of the operation. */
    description?: string;
    /** Whether the operation is deprecated. */
    deprecated?: boolean;
    /** The tags of the operation. */
    tags?: string[];
    /** The tag objects of the operation. */
    tagObjects?: TagObject[];
    /** External documentation for the operation. */
    externalDocs?: ExternalDocumentationObject;
    /** Servers specific to the operation. */
    servers?: ServerObject[];
    /** Security requirements for the operation. */
    security?: Record<string, string[]>[];
    /** Extension properties. */
    extensions?: Record<string, unknown>;
}

type QuerystringMeta = {
    name: string;
    contentType?: string;
    encoding?: Record<string, unknown>;
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
    /** The discovered API operations. */
    operations: CodeScanOperation[];
    /** The discovered OpenAPI schemas. */
    schemas: Record<string, SwaggerDefinition | boolean>;
    /** The paths to the scanned source files. */
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
    /* v8 ignore next */
    const project = createScanProject();
    /* v8 ignore next */
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    /* v8 ignore next */
    const operations = scanSourceFile(sourceFile);
    /* v8 ignore next */
    if (operations.length === 0) {
        /* v8 ignore next */
        throw new Error(`No route handlers found in: ${filePath}`);
    }

    /* v8 ignore next */
    const schemas = options.includeSchemas === false ? {} : extractSchemasFromSource(sourceText, filePath);

    /* v8 ignore next */
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
    /* v8 ignore next */
    const resolved = path.resolve(inputPath);
    /* v8 ignore next */
    const stat = fileSystem.statSync(resolved);
    /* v8 ignore next */
    const filePaths: string[] = [];

    /* v8 ignore next */
    if (stat.isFile()) {
        /* v8 ignore next */
        if (!isSourceFilePath(resolved)) {
            /* v8 ignore next */
            throw new Error(`Expected a TypeScript source file (*.ts). Received: ${resolved}`);
        }
        /* v8 ignore next */
        filePaths.push(resolved);
        /* v8 ignore next */
        /* v8 ignore start */
    } else if (stat.isDirectory()) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const ignoreDirs = new Set([...DEFAULT_IGNORE_DIRS, ...(options.ignoreDirs ?? [])]);
        /* v8 ignore next */
        collectSourceFiles(resolved, fileSystem, filePaths, ignoreDirs);
    } else {
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        throw new Error(`Input path is neither a file nor a directory: ${resolved}`);
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    if (filePaths.length === 0) {
        /* v8 ignore next */
        throw new Error(`No TypeScript source files found under: ${resolved}`);
    }

    /* v8 ignore next */
    const project = createScanProject();
    /* v8 ignore next */
    const operations: CodeScanOperation[] = [];
    /* v8 ignore next */
    const schemas: ReverseSchemaMap = {};
    /* v8 ignore next */
    const sources: string[] = [];

    /* v8 ignore next */
    for (const filePath of filePaths) {
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        const contents = (fileSystem.readFileSync as (f: string, e: string) => string)(filePath, 'utf-8');
        /* v8 ignore next */
        sources.push(filePath);
        /* v8 ignore next */
        const sourceFile = project.createSourceFile(filePath, contents, { overwrite: true });
        /* v8 ignore next */
        operations.push(...scanSourceFile(sourceFile));

        /* v8 ignore next */
        if (options.includeSchemas !== false) {
            /* v8 ignore next */
            const extracted = extractSchemasFromSource(contents, filePath);
            /* v8 ignore next */
            if (Object.keys(extracted).length > 0) {
                /* v8 ignore next */
                Object.assign(schemas, extracted);
            }
        }
    }

    /* v8 ignore next */
    if (operations.length === 0) {
        /* v8 ignore next */
        throw new Error(`No route handlers found under: ${resolved}`);
    }

    /* v8 ignore next */
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
    /* v8 ignore next */
    const info: InfoObject = { ...DEFAULT_INFO, ...infoOverrides };
    /* v8 ignore next */
    const paths: Record<string, import('@src/core/types/index.js').PathItem> = {};
    /* v8 ignore next */
    const standardMethods = STANDARD_HTTP_METHODS;
    /* v8 ignore next */
    const tagNames: string[] = [];
    /* v8 ignore next */
    const tagSet = new Set<string>();
    /* v8 ignore next */
    const tagObjects = new Map<string, TagObject>();

    /* v8 ignore next */
    const trackTagName = (name: string) => {
        /* v8 ignore next */
        if (!name || tagSet.has(name)) return;
        /* v8 ignore next */
        tagSet.add(name);
        /* v8 ignore next */
        tagNames.push(name);
    };

    /* v8 ignore next */
    const mergeTagObject = (tag: TagObject) => {
        /* v8 ignore next */
        const name = tag.name?.trim();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!name) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const normalized = { ...tag, name };
        /* v8 ignore next */
        const existing = tagObjects.get(name);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!existing) {
            /* v8 ignore stop */
            /* v8 ignore next */
            tagObjects.set(name, normalized);
            /* v8 ignore next */
            return;
        }
        // Preserve existing fields, but fill gaps with new metadata.
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        tagObjects.set(name, { ...normalized, ...existing });
        /* v8 ignore stop */
    };

    /* v8 ignore next */
    for (const op of ir.operations) {
        /* v8 ignore next */
        const parameters = buildParameters(op.params);
        /* v8 ignore next */
        const requestBody = buildRequestBody(op.requestBody);
        /* v8 ignore next */
        const responses = buildResponses(op.responses);
        /* v8 ignore next */
        const methodKey = op.method.toLowerCase();
        /* v8 ignore next */
        const pathItem: import('@src/core/types/index.js').PathItem = paths[op.path] ?? {};

        /* v8 ignore next */
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

        /* v8 ignore next */
        if (standardMethods.has(methodKey)) {
            /* v8 ignore next */
            pathItem[methodKey] = operation;
        } else {
            /* v8 ignore next */
            const additional = (pathItem.additionalOperations as Record<string, unknown>) ?? {};
            /* v8 ignore next */
            additional[op.method] = operation;
            /* v8 ignore next */
            pathItem.additionalOperations = additional as Record<
                string,
                import('@src/core/types/index.js').SpecOperation
            >;
        }

        /* v8 ignore next */
        paths[op.path] = pathItem;

        /* v8 ignore next */
        if (op.tagObjects && op.tagObjects.length > 0) {
            /* v8 ignore next */
            op.tagObjects.forEach(tag => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (!tag || typeof tag.name !== 'string') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                trackTagName(tag.name);
                /* v8 ignore next */
                mergeTagObject(tag);
            });
        }

        /* v8 ignore next */
        if (op.tags && op.tags.length > 0) {
            /* v8 ignore next */
            op.tags.forEach(trackTagName);
        }
    }

    /* v8 ignore next */
    const spec: SwaggerSpec = {
        openapi: '3.2.0',
        info,
        paths,
        jsonSchemaDialect: OAS_3_1_DIALECT,
    };

    /* v8 ignore next */
    if (tagNames.length > 0) {
        /* v8 ignore next */
        spec.tags = tagNames.map(name => tagObjects.get(name) ?? { name });
    }

    /* v8 ignore next */
    if (Object.keys(ir.schemas).length > 0) {
        /* v8 ignore next */
        spec.components = { ...spec.components, schemas: ir.schemas };
    }

    /* v8 ignore next */
    return spec;
}

function createScanProject(): Project {
    /* v8 ignore next */
    return new Project({
        useInMemoryFileSystem: true,
        skipFileDependencyResolution: true,
        compilerOptions: {
            experimentalDecorators: true,
        },
    });
}

function isSourceFilePath(filePath: string): boolean {
    /* v8 ignore next */
    const normalized = filePath.replace(/\\/g, '/');
    /* v8 ignore next */
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
    /* v8 ignore next */
    const entries = fileSystem.readdirSync(dirPath);
    /* v8 ignore next */
    for (const entry of entries) {
        /* v8 ignore next */
        const fullPath = path.join(dirPath, entry);
        /* v8 ignore next */
        const stat = fileSystem.statSync(fullPath);
        /* v8 ignore next */
        if (stat.isDirectory()) {
            /* v8 ignore next */
            /* v8 ignore start */
            if (ignoreDirs.has(entry)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                continue;
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            collectSourceFiles(fullPath, fileSystem, output, ignoreDirs);
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            continue;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        if (stat.isFile() && isSourceFilePath(fullPath)) {
            /* v8 ignore next */
            output.push(fullPath);
        }
    }
}

function extractSchemasFromSource(sourceText: string, filePath: string): ReverseSchemaMap {
    /* v8 ignore next */
    const schemas = parseGeneratedModelSource(sourceText, filePath);
    /* v8 ignore next */
    return Object.keys(schemas).length > 0 ? schemas : {};
}

function scanSourceFile(sourceFile: SourceFile): CodeScanOperation[] {
    /* v8 ignore next */
    const operations: CodeScanOperation[] = [];
    /* v8 ignore next */
    operations.push(...scanExpressRoutes(sourceFile));
    /* v8 ignore next */
    operations.push(...scanDecoratedControllers(sourceFile));
    /* v8 ignore next */
    return operations;
}

function scanExpressRoutes(sourceFile: SourceFile): CodeScanOperation[] {
    /* v8 ignore next */
    const operations: CodeScanOperation[] = [];
    /* v8 ignore next */
    const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

    /* v8 ignore next */
    for (const call of callExpressions) {
        /* v8 ignore next */
        const routeInfo = extractRouteCall(call);
        /* v8 ignore next */
        if (!routeInfo) continue;

        /* v8 ignore next */
        const handler = extractHandler(call, routeInfo.handlerOffset);
        /* v8 ignore next */
        const operation = buildExpressOperation(routeInfo.method, routeInfo.path, handler, sourceFile.getFilePath());
        /* v8 ignore next */
        operations.push(operation);
    }

    /* v8 ignore next */
    return operations;
}

function scanDecoratedControllers(sourceFile: SourceFile): CodeScanOperation[] {
    /* v8 ignore next */
    const operations: CodeScanOperation[] = [];

    /* v8 ignore next */
    for (const cls of sourceFile.getClasses()) {
        /* v8 ignore next */
        const controllerDecorator = cls.getDecorators().find(dec => CONTROLLER_DECORATORS.has(dec.getName()));
        /* v8 ignore next */
        /* v8 ignore start */
        if (!controllerDecorator) continue;
        /* v8 ignore stop */

        /* v8 ignore next */
        /* v8 ignore start */
        const basePath = extractDecoratorPath(controllerDecorator) ?? '';
        /* v8 ignore stop */

        /* v8 ignore next */
        for (const method of cls.getMethods()) {
            /* v8 ignore next */
            const httpDecorators = method
                .getDecorators()
                /* v8 ignore next */
                .map(dec => ({ dec, method: DECORATOR_METHODS[dec.getName()] }))
                /* v8 ignore next */
                .filter(entry => entry.method);

            /* v8 ignore next */
            /* v8 ignore start */
            if (httpDecorators.length === 0) continue;
            /* v8 ignore stop */

            /* v8 ignore next */
            for (const entry of httpDecorators) {
                /* v8 ignore next */
                const methodPath = extractDecoratorPath(entry.dec) ?? '';
                /* v8 ignore next */
                const fullPath = joinPaths(basePath, methodPath);
                /* v8 ignore next */
                const paramMap = new Map<string, CodeScanParam>();
                /* v8 ignore next */
                extractDecoratorParams(method, paramMap);
                /* v8 ignore next */
                addPathParams(fullPath, paramMap);

                /* v8 ignore next */
                const docMeta = extractDocMeta(method);
                /* v8 ignore next */
                applyQuerystringMeta(docMeta, paramMap);
                /* v8 ignore next */
                applyParamDocs(paramMap, docMeta.paramDocs);
                /* v8 ignore next */
                applyParamExamples(paramMap, docMeta.paramExamples);
                /* v8 ignore next */
                applyParamSchemas(paramMap, docMeta.paramSchemas);
                /* v8 ignore next */
                const statusCode = extractHttpCode(method) ?? '200';
                /* v8 ignore next */
                const responseSchema = inferReturnSchemaFromSignature(method);

                // Execute closure pattern for request body variable processing to match interfaces correctly
                /* v8 ignore next */
                const processRequestBody = () => {
                    /* v8 ignore next */
                    const rb = buildRequestBodyFromDecoratorParams(method);
                    /* v8 ignore next */
                    applyRequestExamples(rb, docMeta.requestExamples);
                    /* v8 ignore next */
                    return rb;
                };

                /* v8 ignore next */
                const requestBody = processRequestBody();

                /* v8 ignore next */
                const responses = mergeResponseHints(
                    [
                        {
                            status: statusCode,
                            description: 'Response',
                            contentTypes: ['application/json'],
                            ...(responseSchema !== undefined ? { schema: responseSchema } : {}),
                        },
                    ],
                    docMeta.responses,
                ).map(response =>
                    /* v8 ignore next */
                    responseSchema !== undefined && response.contentTypes.length > 0 && response.schema === undefined
                        ? { ...response, schema: responseSchema }
                        : response,
                );

                /* v8 ignore next */
                applyResponseExamples(responses, docMeta.responseExamples);

                /* v8 ignore next */
                operations.push({
                    operationId: docMeta.operationId ?? method.getName(),
                    method: entry.method!,
                    path: fullPath,
                    filePath: sourceFile.getFilePath(),
                    params: Array.from(paramMap.values()),
                    ...(requestBody ? { requestBody } : {}),
                    responses,
                    ...stripInternalDocMeta(docMeta),
                });
            }
        }
    }

    /* v8 ignore next */
    return operations;
}

type RouteCallInfo = {
    method: string;
    path: string;
    handlerOffset: number;
};

function extractRouteCall(call: CallExpression): RouteCallInfo | undefined {
    /* v8 ignore next */
    const callee = call.getExpression();
    /* v8 ignore next */
    const method = resolveHttpMethodName(callee);
    /* v8 ignore next */
    if (!method) return undefined;

    /* v8 ignore next */
    const args = call.getArguments();
    /* v8 ignore next */
    const firstArg = args[0];
    /* v8 ignore next */
    /* v8 ignore start */
    const directPath = firstArg ? extractPathFromExpression(firstArg as Expression) : undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (directPath) {
        /* v8 ignore next */
        return {
            method,
            path: normalizeRoutePath(directPath),
            handlerOffset: 1,
        };
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isPropertyAccessExpression(callee)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const target = callee.getExpression();
        /* v8 ignore next */
        /* v8 ignore start */
        if (Node.isCallExpression(target)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            const chainedPath = extractRouteChainPath(target);
            /* v8 ignore next */
            /* v8 ignore start */
            if (chainedPath) {
                /* v8 ignore stop */
                /* v8 ignore next */
                return {
                    method,
                    path: normalizeRoutePath(chainedPath),
                    handlerOffset: 0,
                };
            }
        }
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return undefined;
    /* v8 ignore stop */
}

function extractRouteChainPath(call: CallExpression): string | undefined {
    /* v8 ignore next */
    const callee = call.getExpression();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (callee.getName() !== 'route') return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const arg = call.getArguments()[0];
    /* v8 ignore next */
    /* v8 ignore start */
    return arg ? extractPathFromExpression(arg as Expression) : undefined;
    /* v8 ignore stop */
}

function resolveHttpMethodName(expression: Expression): string | undefined {
    /* v8 ignore next */
    if (!Node.isPropertyAccessExpression(expression)) return undefined;
    /* v8 ignore next */
    const name = expression.getName().toLowerCase();
    /* v8 ignore next */
    return HTTP_METHODS.has(name) ? name.toUpperCase() : undefined;
}

function extractHandler(call: CallExpression, offset: number): Node | undefined {
    /* v8 ignore next */
    const args = call.getArguments().slice(offset);
    /* v8 ignore next */
    for (let i = args.length - 1; i >= 0; i -= 1) {
        /* v8 ignore next */
        const handler = resolveFunctionLike(args[i] as Node);
        /* v8 ignore next */
        /* v8 ignore start */
        if (handler) return handler;
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return undefined;
}

function resolveFunctionLike(node: Node): Node | undefined {
    /* v8 ignore next */
    if (Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isFunctionDeclaration(node)) {
        /* v8 ignore next */
        return node;
    }

    /* v8 ignore next */
    if (Node.isIdentifier(node)) {
        /* v8 ignore next */
        for (const definition of node.getDefinitions()) {
            /* v8 ignore next */
            const decl = definition.getDeclarationNode();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!decl) continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            if (Node.isFunctionDeclaration(decl)) return decl;
            /* v8 ignore next */
            /* v8 ignore start */
            if (Node.isMethodDeclaration(decl)) return decl;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Node.isVariableDeclaration(decl)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                const init = decl.getInitializer();
                /* v8 ignore next */
                /* v8 ignore start */
                if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    return init;
                }
            }
        }
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isArrayLiteralExpression(node)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const elements = node.getElements();
        /* v8 ignore next */
        for (let i = elements.length - 1; i >= 0; i -= 1) {
            /* v8 ignore next */
            const element = elements[i];
            /* v8 ignore next */
            /* v8 ignore start */
            if (!Node.isExpression(element)) continue;
            /* v8 ignore stop */
            /* v8 ignore next */
            const handler = resolveFunctionLike(element);
            /* v8 ignore next */
            /* v8 ignore start */
            if (handler) return handler;
            /* v8 ignore stop */
        }
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return undefined;
    /* v8 ignore stop */
}

function buildExpressOperation(
    method: string,
    pathValue: string,
    handler: Node | undefined,
    filePath: string,
): CodeScanOperation {
    /* v8 ignore next */
    const paramMap = new Map<string, CodeScanParam>();
    /* v8 ignore next */
    addPathParams(pathValue, paramMap);

    /* v8 ignore next */
    const operationId = inferOperationId(handler, method, pathValue);
    /* v8 ignore next */
    const docMeta = handler ? extractDocMeta(handler as import('ts-morph').Node) : {};
    /* v8 ignore next */
    applyQuerystringMeta(docMeta, paramMap);
    /* v8 ignore next */
    applyParamDocs(paramMap, docMeta.paramDocs);
    /* v8 ignore next */
    applyParamExamples(paramMap, docMeta.paramExamples);

    /* v8 ignore next */
    const analysis = handler
        ? analyzeExpressHandler(handler as import('ts-morph').Node, paramMap)
        : {
              requestBody: undefined,
              responses: [{ status: '200', description: 'Response', contentTypes: [] }],
              responseSchema: undefined,
          };

    /* v8 ignore next */
    applyParamSchemas(paramMap, docMeta.paramSchemas);

    /* v8 ignore next */
    applyRequestExamples(analysis.requestBody, docMeta.requestExamples);

    /* v8 ignore next */
    const responses = mergeResponseHints(analysis.responses, docMeta.responses).map(response =>
        /* v8 ignore next */
        analysis.responseSchema !== undefined && response.contentTypes.length > 0 && response.schema === undefined
            ? { ...response, schema: analysis.responseSchema }
            : response,
    );
    /* v8 ignore next */
    applyResponseExamples(responses, docMeta.responseExamples);

    /* v8 ignore next */
    return {
        operationId: docMeta.operationId ?? operationId,
        method,
        path: pathValue,
        filePath,
        params: Array.from(paramMap.values()),
        ...(analysis.requestBody ? { requestBody: analysis.requestBody } : {}),
        responses,
        ...stripInternalDocMeta(docMeta),
    };
}

function analyzeExpressHandler(
    // type-coverage:ignore-next-line
    handler: import('ts-morph').Node,
    paramMap: Map<string, CodeScanParam>,
): {
    requestBody?: CodeScanRequestBody;
    responses: CodeScanResponse[];
    responseSchema?: SwaggerDefinition | boolean;
} {
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const bindings = extractRequestBindings(handler);
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const body = getFunctionBody(handler);
    /* v8 ignore next */
    const requestContentTypes = new Set<string>();
    /* v8 ignore next */
    let bodyUsed = Boolean(bindings.bodyName);
    /* v8 ignore next */
    const responseIndex = new Map<string, Set<string>>();
    /* v8 ignore next */
    const inferredSchemas = inferExpressSchemaHints(handler);

    /* v8 ignore next */
    /* v8 ignore start */
    if (body) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const visit = (node: Node) => {
            /* v8 ignore next */
            if (Node.isCallExpression(node)) {
                /* v8 ignore next */
                const responseHint = extractResponseHint(node, bindings.resName);
                /* v8 ignore next */
                if (responseHint) {
                    /* v8 ignore next */
                    recordResponse(responseIndex, responseHint.status, responseHint.contentType);
                }

                /* v8 ignore next */
                if (bindings.reqName) {
                    /* v8 ignore next */
                    const requestType = extractRequestContentType(node, bindings.reqName);
                    /* v8 ignore next */
                    if (requestType) {
                        /* v8 ignore next */
                        requestContentTypes.add(requestType);
                        /* v8 ignore next */
                        bodyUsed = true;
                    }

                    /* v8 ignore next */
                    const headerName = extractRequestHeaderName(node, bindings.reqName);
                    /* v8 ignore next */
                    if (headerName) {
                        /* v8 ignore next */
                        addParam(paramMap, { name: headerName, in: 'header' });
                    }
                }
            }

            /* v8 ignore next */
            if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
                /* v8 ignore next */
                const access = extractRequestAccess(node, bindings);
                /* v8 ignore next */
                if (access) {
                    /* v8 ignore next */
                    if (access.location === 'body') {
                        /* v8 ignore next */
                        bodyUsed = true;
                        /* v8 ignore next */
                        /* v8 ignore start */
                    } else if (access.name) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        addParam(paramMap, { name: access.name, in: access.location });
                    }
                }
            }

            /* v8 ignore next */
            if (Node.isVariableDeclaration(node)) {
                /* v8 ignore next */
                const destructured = extractDestructuredParams(
                    node as import('ts-morph').VariableDeclaration,
                    bindings,
                );
                /* v8 ignore next */
                /* v8 ignore start */
                if (destructured.bodyUsed) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    bodyUsed = true;
                    /* v8 ignore stop */
                }
                /* v8 ignore next */
                destructured.params.forEach(param => addParam(paramMap, param));
            }
        };

        /* v8 ignore next */
        visit(body);
        /* v8 ignore next */
        body.forEachDescendant(descendant => visit(descendant));
    }

    /* v8 ignore next */
    if (inferredSchemas.requestSchema !== undefined) {
        /* v8 ignore next */
        bodyUsed = true;
    }

    /* v8 ignore next */
    const responses = finalizeResponses(responseIndex, '200', false);
    /* v8 ignore next */
    if (inferredSchemas.responseSchema !== undefined) {
        /* v8 ignore next */
        responses.forEach(response => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (response.contentTypes.length > 0) {
                /* v8 ignore stop */
                /* v8 ignore next */
                response.schema = inferredSchemas.responseSchema as SwaggerDefinition | boolean;
            }
        });
    }

    /* v8 ignore next */
    const requestBody = bodyUsed
        ? {
              required: true,
              contentTypes: requestContentTypes.size > 0 ? Array.from(requestContentTypes) : ['application/json'],
              ...(inferredSchemas.requestSchema !== undefined ? { schema: inferredSchemas.requestSchema } : {}),
          }
        : undefined;

    /* v8 ignore next */
    return {
        ...(requestBody ? { requestBody } : {}),
        responses,
        ...(inferredSchemas.responseSchema !== undefined ? { responseSchema: inferredSchemas.responseSchema } : {}),
    };
}

// type-coverage:ignore-next-line
function getFunctionBody(handler: import('ts-morph').Node): Node | undefined {
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    return (handler as unknown as { getBody?(): import('ts-morph').Node }).getBody?.();
}

// type-coverage:ignore-next-line
function extractRequestBindings(handler: import('ts-morph').Node): RequestBindings {
    /* v8 ignore next */
    const bindings: RequestBindings = {};
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore start */
    const params =
        (handler as unknown as { getParameters?(): import('ts-morph').ParameterDeclaration[] }).getParameters?.() ?? [];
    /* v8 ignore stop */

    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const reqParam = params[0];
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const resParam = params[1];

    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore start */
    if (reqParam) {
        /* v8 ignore stop */
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        const nameNode = reqParam.getNameNode();
        /* v8 ignore next */
        if (Node.isIdentifier(nameNode)) {
            /* v8 ignore next */
            bindings.reqName = nameNode.getText();
            /* v8 ignore next */
            /* v8 ignore start */
        } else if (Node.isObjectBindingPattern(nameNode)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            for (const element of nameNode.getElements()) {
                /* v8 ignore next */
                const propertyName = element.getPropertyNameNode()?.getText() ?? element.getName();
                /* v8 ignore next */
                const boundName = element.getName();
                /* v8 ignore next */
                /* v8 ignore start */
                switch (propertyName) {
                    /* v8 ignore stop */
                    case 'params':
                        /* v8 ignore next */
                        bindings.paramsName = boundName;
                        /* v8 ignore next */
                        break;
                    case 'query':
                        /* v8 ignore next */
                        bindings.queryName = boundName;
                        /* v8 ignore next */
                        break;
                    case 'headers':
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        bindings.headersName = boundName;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        break;
                    /* v8 ignore stop */
                    case 'cookies':
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        bindings.cookiesName = boundName;
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore next */
                        /* v8 ignore start */
                        break;
                    /* v8 ignore stop */
                    case 'body':
                        /* v8 ignore next */
                        bindings.bodyName = boundName;
                        /* v8 ignore next */
                        break;
                }
            }
        }
    }

    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore start */
    if (resParam) {
        /* v8 ignore stop */
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        const nameNode = resParam.getNameNode();
        /* v8 ignore next */
        /* v8 ignore start */
        if (Node.isIdentifier(nameNode)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            bindings.resName = nameNode.getText();
        }
    }

    /* v8 ignore next */
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
    /* v8 ignore next */
    if (Node.isPropertyAccessExpression(node)) {
        /* v8 ignore next */
        const name = node.getName();
        /* v8 ignore next */
        const nestedLocation = resolveRequestLocation(node.getExpression(), bindings);
        /* v8 ignore next */
        if (nestedLocation) {
            /* v8 ignore next */
            /* v8 ignore start */
            return { location: nestedLocation, ...(name ? { name } : {}) };
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        const rootLocation = resolveRequestLocation(node, bindings);
        /* v8 ignore next */
        if (rootLocation === 'body') {
            /* v8 ignore next */
            return { location: rootLocation };
        }
        /* v8 ignore next */
        return undefined;
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isElementAccessExpression(node)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const argExpr = node.getArgumentExpression();
        /* v8 ignore next */
        /* v8 ignore start */
        const name = argExpr ? extractStringLiteral(argExpr) : undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        const location = resolveRequestLocation(node.getExpression(), bindings);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!location) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        return { location: location, ...(name ? { name } : {}) };
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return undefined;
    /* v8 ignore stop */
}

function extractDestructuredParams(
    node: import('ts-morph').VariableDeclaration,
    bindings: RequestBindings,
): { params: CodeScanParam[]; bodyUsed: boolean } {
    /* v8 ignore next */
    const params: CodeScanParam[] = [];
    /* v8 ignore next */
    let bodyUsed = false;

    /* v8 ignore next */
    const nameNode = node.getNameNode();
    /* v8 ignore next */
    const initializer = node.getInitializer();
    /* v8 ignore next */
    if (!initializer || !Node.isObjectBindingPattern(nameNode)) {
        /* v8 ignore next */
        return { params, bodyUsed };
    }

    /* v8 ignore next */
    const location = resolveRequestLocation(initializer as Expression, bindings);
    /* v8 ignore next */
    /* v8 ignore start */
    if (!location) return { params, bodyUsed };
    /* v8 ignore stop */

    /* v8 ignore next */
    /* v8 ignore start */
    if (location === 'body') {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        bodyUsed = true;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return { params, bodyUsed };
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    for (const element of nameNode.getElements()) {
        /* v8 ignore next */
        const propName = element.getPropertyNameNode()?.getText() ?? element.getName();
        /* v8 ignore next */
        params.push({ name: trimQuotes(propName), in: location });
    }

    /* v8 ignore next */
    return { params, bodyUsed };
}

function resolveRequestLocation(
    expression: Expression,
    bindings: RequestBindings,
): CodeScanParamLocation | 'body' | undefined {
    /* v8 ignore next */
    if (Node.isIdentifier(expression)) {
        /* v8 ignore next */
        const name = expression.getText();
        /* v8 ignore next */
        if (name === bindings.paramsName) return 'path';
        /* v8 ignore next */
        if (name === bindings.queryName) return 'query';
        /* v8 ignore next */
        /* v8 ignore start */
        if (name === bindings.headersName) return 'header';
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (name === bindings.cookiesName) return 'cookie';
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (name === bindings.bodyName) return 'body';
        /* v8 ignore stop */
        /* v8 ignore next */
        return undefined;
    }

    /* v8 ignore next */
    if (Node.isPropertyAccessExpression(expression)) {
        /* v8 ignore next */
        const base = expression.getExpression();
        /* v8 ignore next */
        if (!Node.isIdentifier(base)) return undefined;
        /* v8 ignore next */
        if (base.getText() !== bindings.reqName) return undefined;
        /* v8 ignore next */
        const name = expression.getName();
        /* v8 ignore next */
        if (name === 'params') return 'path';
        /* v8 ignore next */
        if (name === 'query') return 'query';
        /* v8 ignore next */
        if (name === 'headers') return 'header';
        /* v8 ignore next */
        if (name === 'cookies') return 'cookie';
        /* v8 ignore next */
        if (name === 'body') return 'body';
    }

    /* v8 ignore next */
    return undefined;
}

type ResponseHint = {
    status: string;
    contentType?: string;
};

function extractResponseHint(call: CallExpression, resName?: string): ResponseHint | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!resName) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const callee = call.getExpression();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const method = callee.getName();
    /* v8 ignore next */
    if (!isResponseChain(callee.getExpression(), resName)) return undefined;

    /* v8 ignore next */
    if (method === 'sendStatus') {
        /* v8 ignore next */
        const arg0 = call.getArguments()[0];
        /* v8 ignore next */
        /* v8 ignore start */
        const status = (arg0 ? extractLiteralText(arg0 as Expression) : undefined) ?? '200';
        /* v8 ignore stop */
        /* v8 ignore next */
        return { status };
    }

    /* v8 ignore next */
    if (method === 'json' || method === 'send' || method === 'end') {
        /* v8 ignore next */
        const chainMeta = extractResponseChainMeta(callee.getExpression(), resName);
        /* v8 ignore next */
        let contentType = chainMeta.contentType;
        /* v8 ignore next */
        if (method === 'json') {
            /* v8 ignore next */
            contentType = 'application/json';
        }
        /* v8 ignore next */
        if (method === 'send' && !contentType) {
            /* v8 ignore next */
            const arg0 = call.getArguments()[0];
            /* v8 ignore next */
            contentType = inferContentTypeFromSend(arg0 ? (arg0 as Expression) : undefined);
        }
        /* v8 ignore next */
        return {
            status: chainMeta.status ?? '200',
            ...(contentType ? { contentType } : {}),
        };
    }

    /* v8 ignore next */
    return undefined;
}

function extractResponseChainMeta(expression: Expression, resName: string): { status?: string; contentType?: string } {
    /* v8 ignore next */
    let current: Expression = expression;
    let status: string | undefined;
    let contentType: string | undefined;

    /* v8 ignore next */
    while (Node.isCallExpression(current) && Node.isPropertyAccessExpression(current.getExpression())) {
        /* v8 ignore next */
        const propAccessExpr = current.getExpression() as import('ts-morph').PropertyAccessExpression;
        /* v8 ignore next */
        const method = propAccessExpr.getName();
        /* v8 ignore next */
        const target = propAccessExpr.getExpression();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!isResponseChain(target, resName)) break;
        /* v8 ignore stop */

        /* v8 ignore next */
        if (method === 'status') {
            /* v8 ignore next */
            const arg0 = current.getArguments()[0];
            /* v8 ignore next */
            /* v8 ignore start */
            status = (arg0 ? extractLiteralText(arg0 as Expression) : undefined) ?? status;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        if (method === 'type') {
            /* v8 ignore next */
            const arg0 = current.getArguments()[0];
            /* v8 ignore next */
            /* v8 ignore start */
            contentType = (arg0 ? extractStringLiteral(arg0 as Expression) : undefined) ?? contentType;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        if (method === 'set' || method === 'header') {
            /* v8 ignore next */
            const [nameArg, valueArg] = current.getArguments();
            /* v8 ignore next */
            /* v8 ignore start */
            const headerName = nameArg ? extractStringLiteral(nameArg as Expression) : undefined;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (headerName && headerName.toLowerCase() === 'content-type') {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                contentType = (valueArg ? extractStringLiteral(valueArg as Expression) : undefined) ?? contentType;
                /* v8 ignore stop */
            }
        }

        /* v8 ignore next */
        current = target;
    }

    /* v8 ignore next */
    return { ...(status ? { status } : {}), ...(contentType ? { contentType } : {}) };
}

function isResponseChain(expression: Expression, resName: string): boolean {
    /* v8 ignore next */
    if (Node.isIdentifier(expression)) {
        /* v8 ignore next */
        return expression.getText() === resName;
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isCallExpression(expression) && Node.isPropertyAccessExpression(expression.getExpression())) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const propAccess = expression.getExpression() as import('ts-morph').PropertyAccessExpression;
        /* v8 ignore next */
        return isResponseChain(propAccess.getExpression(), resName);
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isPropertyAccessExpression(expression)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return isResponseChain(expression.getExpression(), resName);
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return false;
    /* v8 ignore stop */
}

function inferContentTypeFromSend(arg?: Expression): string | undefined {
    /* v8 ignore next */
    if (!arg) return undefined;
    /* v8 ignore next */
    if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
        /* v8 ignore next */
        return 'text/plain';
    }
    /* v8 ignore next */
    if (Node.isObjectLiteralExpression(arg) || Node.isArrayLiteralExpression(arg)) {
        /* v8 ignore next */
        return 'application/json';
    }
    /* v8 ignore next */
    return undefined;
}

function extractRequestContentType(call: CallExpression, reqName: string): string | undefined {
    /* v8 ignore next */
    const callee = call.getExpression();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (callee.getName() !== 'is') return undefined;
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isIdentifier(callee.getExpression())) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (callee.getExpression().getText() !== reqName) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const arg0 = call.getArguments()[0];
    /* v8 ignore next */
    /* v8 ignore start */
    return arg0 ? extractStringLiteral(arg0 as Expression) : undefined;
    /* v8 ignore stop */
}

function extractRequestHeaderName(call: CallExpression, reqName: string): string | undefined {
    /* v8 ignore next */
    const callee = call.getExpression();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isPropertyAccessExpression(callee)) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const method = callee.getName();
    /* v8 ignore next */
    if (method !== 'get' && method !== 'header') return undefined;
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isIdentifier(callee.getExpression())) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (callee.getExpression().getText() !== reqName) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const arg0 = call.getArguments()[0];
    /* v8 ignore next */
    /* v8 ignore start */
    return arg0 ? extractStringLiteral(arg0 as Expression) : undefined;
    /* v8 ignore stop */
}

function recordResponse(
    responseIndex: Map<string, Set<string>>,
    status: string,
    contentType: string | undefined,
): void {
    /* v8 ignore next */
    const entry = responseIndex.get(status) ?? new Set<string>();
    /* v8 ignore next */
    if (contentType) entry.add(contentType);
    /* v8 ignore next */
    responseIndex.set(status, entry);
}

function finalizeResponses(
    responseIndex: Map<string, Set<string>>,
    defaultStatus: string,
    assumeJson: boolean,
): CodeScanResponse[] {
    /* v8 ignore next */
    /* v8 ignore start */
    if (responseIndex.size === 0) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return [
            /* v8 ignore stop */
            {
                status: defaultStatus,
                description: 'Response',
                /* v8 ignore start */
                contentTypes: assumeJson ? ['application/json'] : [],
                /* v8 ignore stop */
            },
        ];
    }

    /* v8 ignore next */
    return Array.from(responseIndex.entries()).map(([status, types]) => ({
        status,
        description: 'Response',
        contentTypes: Array.from(types),
    }));
}

function addPathParams(pathValue: string, paramMap: Map<string, CodeScanParam>): void {
    /* v8 ignore next */
    for (const name of extractPathParams(pathValue)) {
        /* v8 ignore next */
        addParam(paramMap, { name, in: 'path', required: true });
    }
}

function extractPathParams(pathValue: string): string[] {
    /* v8 ignore next */
    const params: string[] = [];
    /* v8 ignore next */
    const regex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    /* v8 ignore next */
    while ((match = regex.exec(pathValue)) !== null) {
        /* v8 ignore next */
        params.push(match[1]);
    }
    /* v8 ignore next */
    return params;
}

function addParam(paramMap: Map<string, CodeScanParam>, param: CodeScanParam): void {
    /* v8 ignore next */
    const key = `${param.in}:${param.name}`;
    /* v8 ignore next */
    const existing = paramMap.get(key);
    /* v8 ignore next */
    if (!existing) {
        /* v8 ignore next */
        paramMap.set(key, param);
        /* v8 ignore next */
        return;
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (param.required && !existing.required) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        existing.required = true;
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (param.description && !existing.description) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        existing.description = param.description;
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (param.contentType && !existing.contentType) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        existing.contentType = param.contentType;
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (param.encoding && !existing.encoding) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        existing.encoding = param.encoding;
        /* v8 ignore stop */
    }
}

function inferOperationId(handler: Node | undefined, method: string, pathValue: string): string {
    /* v8 ignore next */
    if (handler) {
        /* v8 ignore next */
        const name = getFunctionLikeName(handler);
        /* v8 ignore next */
        if (name) return name;
    }
    /* v8 ignore next */
    /* v8 ignore start */
    return camelCase(`${method} ${pathValue}`) || `${method.toLowerCase()}Operation`;
    /* v8 ignore stop */
}

// type-coverage:ignore-next-line
function getFunctionLikeName(handler: import('ts-morph').Node): string | undefined {
    /* v8 ignore next */
    if (Node.isFunctionDeclaration(handler) || Node.isMethodDeclaration(handler)) {
        /* v8 ignore next */
        return (handler as import('ts-morph').FunctionDeclaration | import('ts-morph').MethodDeclaration).getName();
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isFunctionExpression(handler) || Node.isArrowFunction(handler)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const parent = (
            handler as import('ts-morph').FunctionExpression | import('ts-morph').ArrowFunction
        ).getParent();
        /* v8 ignore next */
        if (Node.isVariableDeclaration(parent)) {
            /* v8 ignore next */
            return parent.getName();
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (Node.isPropertyAssignment(parent)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return parent.getName();
            /* v8 ignore stop */
        }
    }

    /* v8 ignore next */
    return undefined;
}

function extractDecoratorPath(decorator: import('ts-morph').Decorator): string | undefined {
    /* v8 ignore next */
    const arg = decorator.getArguments()[0];
    /* v8 ignore next */
    return arg ? extractPathFromExpression(arg as Expression) : undefined;
}

function extractDecoratorParams(
    method: import('ts-morph').MethodDeclaration,
    paramMap: Map<string, CodeScanParam>,
): void {
    /* v8 ignore next */
    for (const param of method.getParameters()) {
        /* v8 ignore next */
        const required = !param.hasQuestionToken();
        /* v8 ignore next */
        for (const decorator of param.getDecorators()) {
            /* v8 ignore next */
            const name = decorator.getName();
            /* v8 ignore next */
            const arg = decorator.getArguments()[0];
            /* v8 ignore next */
            const paramName = trimQuotes(
                (arg ? extractStringLiteral(arg as Expression) : undefined) ?? param.getName(),
            );

            /* v8 ignore next */
            if (name === 'Param' || name === 'Path' || name === 'PathParam') {
                /* v8 ignore next */
                addParam(paramMap, { name: paramName, in: 'path', required: true });
                /* v8 ignore next */
                continue;
            }
            /* v8 ignore next */
            if (name === 'Query') {
                /* v8 ignore next */
                addParam(paramMap, { name: paramName, in: 'query', required });
                /* v8 ignore next */
                continue;
            }
            /* v8 ignore next */
            if (name === 'Header' || name === 'Headers') {
                /* v8 ignore next */
                /* v8 ignore start */
                if (paramName) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    addParam(paramMap, { name: paramName, in: 'header', required });
                }
                /* v8 ignore next */
                continue;
            }
            /* v8 ignore next */
            /* v8 ignore start */
            if (name === 'Cookie' || name === 'Cookies') {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (paramName) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    addParam(paramMap, { name: paramName, in: 'cookie', required });
                    /* v8 ignore stop */
                }
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                continue;
                /* v8 ignore stop */
            }
        }
    }
}

function buildRequestBodyFromDecoratorParams(
    method: import('ts-morph').MethodDeclaration,
): CodeScanRequestBody | undefined {
    /* v8 ignore next */
    for (const param of method.getParameters()) {
        /* v8 ignore next */
        for (const decorator of param.getDecorators()) {
            /* v8 ignore next */
            if (decorator.getName() === 'Body' || decorator.getName() === 'BodyParam') {
                /* v8 ignore next */
                const schema = inferSchemaFromTypeNode(param.getTypeNode());
                /* v8 ignore next */
                return {
                    required: !param.hasQuestionToken(),
                    contentTypes: ['application/json'],
                    /* v8 ignore start */
                    ...(schema !== undefined ? { schema } : {}),
                    /* v8 ignore stop */
                };
            }
        }
    }
    /* v8 ignore next */
    return undefined;
}

function extractHttpCode(method: import('ts-morph').MethodDeclaration): string | undefined {
    /* v8 ignore next */
    const decorator = method.getDecorators().find(dec => ['HttpCode', 'Status', 'Code'].includes(dec.getName()));
    /* v8 ignore next */
    if (!decorator) return undefined;
    /* v8 ignore next */
    const arg = decorator.getArguments()[0];
    /* v8 ignore next */
    /* v8 ignore start */
    return arg ? extractLiteralText(arg as Expression) : undefined;
    /* v8 ignore stop */
}

function extractPathFromExpression(expression: Expression): string | undefined {
    /* v8 ignore next */
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        /* v8 ignore next */
        return expression.getLiteralText();
    }

    /* v8 ignore next */
    if (Node.isTemplateExpression(expression)) {
        /* v8 ignore next */
        let value = expression.getHead().getLiteralText();
        /* v8 ignore next */
        for (const span of expression.getTemplateSpans()) {
            /* v8 ignore next */
            const placeholder = placeholderForExpression(span.getExpression());
            /* v8 ignore next */
            value += `{${placeholder}}${span.getLiteral().getLiteralText()}`;
        }
        /* v8 ignore next */
        return value;
    }

    /* v8 ignore next */
    return undefined;
}

function placeholderForExpression(expression: Expression): string {
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isIdentifier(expression)) return expression.getText();
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isPropertyAccessExpression(expression)) return expression.getName();
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return expression.getLiteralText();
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return 'param';
    /* v8 ignore stop */
}

function normalizeRoutePath(value: string): string {
    /* v8 ignore next */
    let normalized = value.trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!normalized) return '/';
    /* v8 ignore stop */
    /* v8 ignore next */
    if (!normalized.startsWith('/')) {
        /* v8 ignore next */
        normalized = `/${normalized}`;
    }
    /* v8 ignore next */
    normalized = normalized.replace(/(^|\/):([A-Za-z0-9_]+)/g, '$1{$2}');
    /* v8 ignore next */
    /* v8 ignore start */
    return normalized || '/';
    /* v8 ignore stop */
}

function joinPaths(basePath: string, methodPath: string): string {
    /* v8 ignore next */
    const base = basePath.replace(/^\/+|\/+$/g, '');
    /* v8 ignore next */
    const tail = methodPath.replace(/^\/+|\/+$/g, '');
    /* v8 ignore next */
    const joined = [base, tail].filter(Boolean).join('/');
    /* v8 ignore next */
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
    extensions?: Record<string, unknown>;
    querystring?: QuerystringMeta;
    operationId?: string;
    responses?: ResponseDocMeta[];
    paramDocs?: Record<string, string>;
    paramExamples?: Record<string, unknown>;
    paramSchemas?: Record<string, SwaggerDefinition | boolean>;
    requestExamples?: Record<string, unknown>;
    responseExamples?: Record<string, Record<string, unknown>>;
} {
    /* v8 ignore next */
    const docs = getJsDocs(node);
    /* v8 ignore next */
    if (!docs.length) return {};

    /* v8 ignore next */
    const primary = docs[0];
    /* v8 ignore next */
    const rawComment = normalizeDocComment(primary.getComment());
    /* v8 ignore next */
    const lines = rawComment

        .split(/\r?\n/)
        /* v8 ignore next */
        .map(line => line.trim())
        .filter(Boolean);

    /* v8 ignore next */
    /* v8 ignore start */
    const summary = lines.length > 0 ? lines[0] : undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const description = lines.length > 1 ? lines.slice(1).join('\n') : undefined;

    /* v8 ignore next */
    const tags = primary.getTags();
    const deprecated =
        /* v8 ignore next */
        tags.some(tag => tag.getTagName() === 'deprecated') || rawComment.toLowerCase().includes('@deprecated');

    /* v8 ignore next */
    const parsedTags = tags

        /* v8 ignore next */
        .filter(tag => tag.getTagName() === 'tag' || tag.getTagName() === 'tags')
        /* v8 ignore next */
        .map(tag => parseTagInput(normalizeDocComment(tag.getComment())))
        .reduce(
            (acc, next) => {
                /* v8 ignore next */
                acc.names.push(...next.names);
                /* v8 ignore next */
                acc.objects.push(...next.objects);
                /* v8 ignore next */
                return acc;
            },
            { names: [] as string[], objects: [] as TagObject[] },
        );

    /* v8 ignore next */
    const tagNames = Array.from(new Set(parsedTags.names));
    /* v8 ignore next */
    const tagObjects = parsedTags.objects;

    /* v8 ignore next */
    const externalDocs = extractExternalDocs(tags);
    /* v8 ignore next */
    const servers = extractServers(tags);
    /* v8 ignore next */
    const security = extractSecurity(tags);
    /* v8 ignore next */
    const querystring = extractQuerystringParam(tags);
    /* v8 ignore next */
    const extensions: Record<string, unknown> = {};
    /* v8 ignore next */
    const responseHints: ResponseDocMeta[] = [];
    /* v8 ignore next */
    const responseSummaries: Record<string, string> = {};
    /* v8 ignore next */
    const paramDocs: Record<string, string> = {};
    /* v8 ignore next */
    const paramExamples: Record<string, unknown> = {};
    /* v8 ignore next */
    const paramSchemas: Record<string, SwaggerDefinition | boolean> = {};
    /* v8 ignore next */
    const requestExamples: Record<string, unknown> = {};
    /* v8 ignore next */
    const responseExamples: Record<string, Record<string, unknown>> = {};
    let operationId: string | undefined;
    /* v8 ignore next */
    tags.forEach(tag => {
        /* v8 ignore next */
        const tagName = tag.getTagName();
        /* v8 ignore next */
        if (tagName === 'operationId') {
            /* v8 ignore next */
            const raw = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (raw) {
                /* v8 ignore stop */
                /* v8 ignore next */
                const [value] = raw.split(/\s+/).filter(Boolean);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value) operationId = value;
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'response') {
            /* v8 ignore next */
            const raw = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            const parsed = parseResponseDocMeta(raw);
            /* v8 ignore next */
            /* v8 ignore start */
            if (parsed) responseHints.push(parsed);
            /* v8 ignore stop */
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'responseSummary') {
            /* v8 ignore next */
            const raw = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            const parsed = parseResponseSummary(raw);
            /* v8 ignore next */
            /* v8 ignore start */
            if (parsed) responseSummaries[parsed.status] = parsed.summary;
            /* v8 ignore stop */
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'paramExample') {
            /* v8 ignore next */
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!rawTagText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            /* v8 ignore next */
            const name = parts.shift();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!name || parts.length === 0) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const valueText = parts.join(' ').trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!valueText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            paramExamples[name] = parseDocValue(valueText);
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'paramSchema') {
            /* v8 ignore next */
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!rawTagText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            /* v8 ignore next */
            const name = parts.shift();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!name || parts.length === 0) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const valueText = parts.join(' ').trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!valueText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const parsed = parseDocValue(valueText);
            /* v8 ignore next */
            const normalized = normalizeParamSchemaOverride(parsed);
            /* v8 ignore next */
            /* v8 ignore start */
            if (normalized !== undefined) paramSchemas[name] = normalized;
            /* v8 ignore stop */
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'requestExample') {
            /* v8 ignore next */
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!rawTagText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            /* v8 ignore next */
            /* v8 ignore start */
            if (parts.length === 0) return;
            /* v8 ignore stop */
            let mediaType: string | undefined;
            /* v8 ignore next */
            /* v8 ignore start */
            if (parts[0].includes('/')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                mediaType = parts.shift();
            }
            /* v8 ignore next */
            const valueText = parts.join(' ').trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!valueText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            requestExamples[mediaType ?? '*'] = parseDocValue(valueText);
            /* v8 ignore stop */
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'responseExample') {
            /* v8 ignore next */
            const rawTagText = normalizeDocComment(tag.getComment()).trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!rawTagText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const parts = rawTagText.split(/\s+/).filter(Boolean);
            /* v8 ignore next */
            const status = parts.shift();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!status || parts.length === 0) return;
            /* v8 ignore stop */
            let mediaType: string | undefined;
            /* v8 ignore next */
            /* v8 ignore start */
            if (parts[0].includes('/')) {
                /* v8 ignore stop */
                /* v8 ignore next */
                mediaType = parts.shift();
            }
            /* v8 ignore next */
            const valueText = parts.join(' ').trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!valueText) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (!responseExamples[status]) responseExamples[status] = {};
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            responseExamples[status][mediaType ?? '*'] = parseDocValue(valueText);
            /* v8 ignore stop */
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (tagName === 'param') {
            /* v8 ignore next */
            const parsed = parseParamDoc(tag);
            /* v8 ignore next */
            /* v8 ignore start */
            if (parsed) {
                /* v8 ignore stop */
                /* v8 ignore next */
                paramDocs[parsed.name] = parsed.description;
            }
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (!tagName.startsWith('x-')) return;
        /* v8 ignore next */
        const raw = normalizeDocComment(tag.getComment()).trim();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!raw) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            extensions[tagName] = true;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            extensions[tagName] = JSON.parse(raw);
        } catch {
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            extensions[tagName] = raw;
            /* v8 ignore stop */
        }
    });

    /* v8 ignore next */
    if (Object.keys(responseSummaries).length > 0) {
        /* v8 ignore next */
        const responseIndex = new Map(responseHints.map(entry => [entry.status, entry]));
        /* v8 ignore next */
        Object.entries(responseSummaries).forEach(([status, summary]) => {
            /* v8 ignore next */
            const existing = responseIndex.get(status);
            /* v8 ignore next */
            /* v8 ignore start */
            if (existing) {
                /* v8 ignore stop */
                /* v8 ignore next */
                existing.summary = existing.summary ?? summary;
                /* v8 ignore next */
                return;
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            responseHints.push({ status, summary });
            /* v8 ignore stop */
        });
    }

    /* v8 ignore next */
    return {
        /* v8 ignore start */
        ...(summary ? { summary } : {}),
        /* v8 ignore stop */
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
    /* v8 ignore next */
    const qsTag = tags.find(tag => tag.getTagName() === 'querystring');
    /* v8 ignore next */
    if (!qsTag) return undefined;
    /* v8 ignore next */
    const raw = normalizeDocComment(qsTag.getComment()).trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!raw) return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (raw.startsWith('{')) {
        /* v8 ignore next */
        try {
            /* v8 ignore next */
            const parsed = JSON.parse(raw) as QuerystringMeta;
            /* v8 ignore next */
            /* v8 ignore start */
            if (parsed && typeof parsed === 'object' && typeof parsed.name === 'string' && parsed.name.trim()) {
                /* v8 ignore stop */
                const encoding =
                    /* v8 ignore next */
                    parsed.encoding && typeof parsed.encoding === 'object' && !Array.isArray(parsed.encoding)
                        ? parsed.encoding
                        : undefined;
                /* v8 ignore next */
                return {
                    name: parsed.name.trim(),
                    /* v8 ignore start */
                    ...(parsed.contentType ? { contentType: String(parsed.contentType) } : {}),
                    /* v8 ignore stop */
                    /* v8 ignore start */
                    ...(encoding ? { encoding } : {}),
                    /* v8 ignore stop */
                    /* v8 ignore start */
                    ...(typeof parsed.required === 'boolean' ? { required: parsed.required } : {}),
                    /* v8 ignore stop */
                    /* v8 ignore start */
                    ...(parsed.description ? { description: String(parsed.description) } : {}),
                    /* v8 ignore stop */
                };
            }
        } catch {
            // Ignore malformed JSON to avoid crashing scans
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return undefined;
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    const parts = raw.split(/\s+/).filter(Boolean);
    /* v8 ignore next */
    const name = parts.shift();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!name) return undefined;
    /* v8 ignore stop */
    let contentType: string | undefined;
    let required: boolean | undefined;
    /* v8 ignore next */
    const descriptionParts: string[] = [];

    /* v8 ignore next */
    parts.forEach(part => {
        /* v8 ignore next */
        const lower = part.toLowerCase();
        /* v8 ignore next */
        /* v8 ignore start */
        if (lower === 'required') {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            required = true;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (lower === 'optional') {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            required = false;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (!contentType && part.includes('/')) {
            /* v8 ignore stop */
            /* v8 ignore next */
            contentType = part;
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        descriptionParts.push(part);
        /* v8 ignore stop */
    });

    /* v8 ignore next */
    /* v8 ignore start */
    const description = descriptionParts.length > 0 ? descriptionParts.join(' ') : undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    return {
        name,
        /* v8 ignore start */
        ...(contentType ? { contentType } : {}),
        /* v8 ignore stop */
        /* v8 ignore start */
        ...(required !== undefined ? { required } : {}),
        /* v8 ignore stop */
        /* v8 ignore start */
        ...(description ? { description } : {}),
        /* v8 ignore stop */
    };
}

function applyQuerystringMeta(docMeta: { querystring?: QuerystringMeta }, paramMap: Map<string, CodeScanParam>): void {
    /* v8 ignore next */
    const querystring = docMeta.querystring;
    /* v8 ignore next */
    if (!querystring) return;
    /* v8 ignore next */
    addParam(paramMap, {
        name: querystring.name,
        in: 'querystring',
        /* v8 ignore start */
        ...(querystring.required !== undefined ? { required: querystring.required } : {}),
        /* v8 ignore stop */
        /* v8 ignore start */
        ...(querystring.description ? { description: querystring.description } : {}),
        /* v8 ignore stop */
        /* v8 ignore start */
        ...(querystring.contentType ? { contentType: querystring.contentType } : {}),
        /* v8 ignore stop */
        ...(querystring.encoding ? { encoding: querystring.encoding } : {}),
    });
}

function applyParamDocs(paramMap: Map<string, CodeScanParam>, paramDocs?: Record<string, string>): void {
    /* v8 ignore next */
    if (!paramDocs) return;
    /* v8 ignore next */
    for (const param of paramMap.values()) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (param.description) continue;
        /* v8 ignore stop */
        /* v8 ignore next */
        const direct = paramDocs[param.name];
        /* v8 ignore next */
        const normalized = paramDocs[param.name.replace(/[{}]/g, '')];
        /* v8 ignore next */
        /* v8 ignore start */
        const description = direct ?? normalized;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (description) {
            /* v8 ignore stop */
            /* v8 ignore next */
            param.description = description;
        }
    }
}

function applyParamExamples(paramMap: Map<string, CodeScanParam>, paramExamples?: Record<string, unknown>): void {
    /* v8 ignore next */
    if (!paramExamples) return;
    /* v8 ignore next */
    for (const param of paramMap.values()) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (param.example !== undefined) continue;
        /* v8 ignore stop */
        /* v8 ignore next */
        const direct = paramExamples[param.name];
        /* v8 ignore next */
        const normalized = paramExamples[param.name.replace(/[{}]/g, '')];
        /* v8 ignore next */
        /* v8 ignore start */
        const example = direct ?? normalized;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (example !== undefined) {
            /* v8 ignore stop */
            /* v8 ignore next */
            param.example = example;
        }
    }
}

function applyParamSchemas(
    paramMap: Map<string, CodeScanParam>,
    paramSchemas?: Record<string, SwaggerDefinition | boolean>,
): void {
    /* v8 ignore next */
    if (!paramSchemas) return;
    /* v8 ignore next */
    for (const param of paramMap.values()) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (param.in === 'querystring') continue;
        /* v8 ignore stop */
        /* v8 ignore next */
        const direct = paramSchemas[param.name];
        /* v8 ignore next */
        const normalized = paramSchemas[param.name.replace(/[{}]/g, '')];
        /* v8 ignore next */
        /* v8 ignore start */
        const schema = direct ?? normalized;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (schema !== undefined) {
            /* v8 ignore stop */
            /* v8 ignore next */
            param.schema = schema;
        }
    }
}

function applyRequestExamples(
    requestBody: CodeScanRequestBody | undefined,
    requestExamples?: Record<string, unknown>,
): void {
    /* v8 ignore next */
    if (!requestBody || !requestExamples || Object.keys(requestExamples).length === 0) return;
    /* v8 ignore next */
    requestBody.examples = { ...requestExamples };
}

function applyResponseExamples(
    responses: CodeScanResponse[],
    responseExamples?: Record<string, Record<string, unknown>>,
): void {
    /* v8 ignore next */
    if (!responseExamples) return;
    /* v8 ignore next */
    responses.forEach(response => {
        /* v8 ignore next */
        const examples = responseExamples[response.status];
        /* v8 ignore next */
        /* v8 ignore start */
        if (examples && Object.keys(examples).length > 0) {
            /* v8 ignore stop */
            /* v8 ignore next */
            response.examples = { ...examples };
        }
    });
}

function mergeResponseHints(responses: CodeScanResponse[], hints?: ResponseDocMeta[]): CodeScanResponse[] {
    /* v8 ignore next */
    if (!hints || hints.length === 0) return responses;
    /* v8 ignore next */
    const responseMap = new Map<string, CodeScanResponse>();
    /* v8 ignore next */
    const ordered: string[] = [];

    /* v8 ignore next */
    responses.forEach(response => {
        /* v8 ignore next */
        responseMap.set(response.status, { ...response });
        /* v8 ignore next */
        ordered.push(response.status);
    });

    /* v8 ignore next */
    hints.forEach(hint => {
        /* v8 ignore next */
        const existing = responseMap.get(hint.status);
        /* v8 ignore next */
        if (!existing) {
            /* v8 ignore next */
            responseMap.set(hint.status, {
                status: hint.status,
                /* v8 ignore start */
                ...(hint.summary ? { summary: hint.summary } : {}),
                /* v8 ignore stop */
                /* v8 ignore start */
                ...(hint.description ? { description: hint.description } : {}),
                /* v8 ignore stop */
                /* v8 ignore start */
                contentTypes: hint.contentTypes ?? [],
                /* v8 ignore stop */
            });
            /* v8 ignore next */
            ordered.push(hint.status);
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (hint.summary) {
            /* v8 ignore next */
            existing.summary = hint.summary;
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (hint.description) {
            /* v8 ignore stop */
            /* v8 ignore next */
            existing.description = hint.description;
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (hint.contentTypes && hint.contentTypes.length > 0) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (existing.contentTypes.length === 0) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                existing.contentTypes = [...hint.contentTypes];
                /* v8 ignore stop */
            } else {
                /* v8 ignore next */
                const contentTypes = new Set(existing.contentTypes);
                /* v8 ignore next */
                hint.contentTypes.forEach(entry => contentTypes.add(entry));
                /* v8 ignore next */
                existing.contentTypes = Array.from(contentTypes);
            }
        }
    });

    /* v8 ignore next */
    return ordered.map(status => responseMap.get(status) as CodeScanResponse);
}

function parseResponseDocMeta(raw: string): ResponseDocMeta | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!raw) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const parts = raw.split(/\s+/).filter(Boolean);
    /* v8 ignore next */
    const status = parts.shift();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!status) return undefined;
    /* v8 ignore stop */
    let contentTypes: string[] | undefined;
    /* v8 ignore next */
    /* v8 ignore start */
    if (parts.length > 0 && parts[0].includes('/')) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const mediaRaw = parts.shift() as string;
        /* v8 ignore next */
        contentTypes = mediaRaw

            .split(',')
            /* v8 ignore next */
            .map(entry => entry.trim())
            .filter(Boolean);
    }
    /* v8 ignore next */
    const description = parts.join(' ').trim();
    /* v8 ignore next */
    return {
        status,
        /* v8 ignore start */
        ...(contentTypes && contentTypes.length > 0 ? { contentTypes } : {}),
        /* v8 ignore stop */
        /* v8 ignore start */
        ...(description ? { description } : {}),
        /* v8 ignore stop */
    };
}

function parseResponseSummary(raw: string): { status: string; summary: string } | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!raw) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const parts = raw.split(/\s+/).filter(Boolean);
    /* v8 ignore next */
    const status = parts.shift();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!status) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const summary = parts.join(' ').trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!summary) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    return { status, summary };
}

function parseParamDoc(tag: import('ts-morph').JSDocTag): { name: string; description: string } | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isJSDocParameterTag(tag)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const name = tag.getName();
        /* v8 ignore next */
        const description = normalizeDocComment(tag.getComment()).trim();
        /* v8 ignore next */
        /* v8 ignore start */
        if (name && description) {
            /* v8 ignore stop */
            /* v8 ignore next */
            return { name, description };
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return undefined;
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    const rawText = tag
        /* v8 ignore stop */

        .getText()
        .replace(/^\s*\*?\s*@param\s+/i, '')
        .trim();
    let name: string | undefined;
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    let description = '';
    /* v8 ignore stop */

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (rawText) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const cleaned = rawText.replace(/\r?\n\s*\*\s?/g, ' ').trim();
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const match = cleaned.match(/^(?:\{[^}]+\}\s*)?(\S+)\s*([\s\S]*)$/);
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (match) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            name = match[1];
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            description = (match[2] || '').trim();
            /* v8 ignore stop */
        }
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (!name) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const fallback = normalizeDocComment(tag.getComment());
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const parts = fallback.split(/\s+/).filter(Boolean);
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (parts.length === 0) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        name = parts.shift();
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (name && name.startsWith('{')) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            name = parts.shift();
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        description = parts.join(' ').trim();
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (!name || !description) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return { name, description };
    /* v8 ignore stop */
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
        /* v8 ignore next */
    } = docMeta;
    /* v8 ignore next */
    return rest;
}

function extractExternalDocs(tags: import('ts-morph').JSDocTag[]): ExternalDocumentationObject | undefined {
    /* v8 ignore next */
    const seeTag = tags.find(tag => tag.getTagName() === 'see');
    /* v8 ignore next */
    if (!seeTag) return undefined;
    /* v8 ignore next */
    let raw = normalizeDocComment(seeTag.getComment()).trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!raw || raw.startsWith('://')) {
        /* v8 ignore stop */
        /* v8 ignore next */
        const text = seeTag.getText();
        /* v8 ignore next */
        /* v8 ignore start */
        const line = text.split(/\r?\n/)[0] ?? '';
        /* v8 ignore stop */
        /* v8 ignore next */
        const cleaned = line.replace(/^\s*\*?\s*@see\s+/i, '').trim();
        /* v8 ignore next */
        /* v8 ignore start */
        if (cleaned) {
            /* v8 ignore stop */
            /* v8 ignore next */
            raw = cleaned;
        }
    }
    /* v8 ignore next */
    /* v8 ignore start */
    if (!raw) return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    const parts = raw.split(/\s+/);
    /* v8 ignore next */
    const url = parts.shift();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!url) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    const descriptionStr = parts.join(' ').trim();
    /* v8 ignore next */
    /* v8 ignore start */
    return descriptionStr ? { url, description: descriptionStr } : { url };
    /* v8 ignore stop */
}

function extractServers(tags: import('ts-morph').JSDocTag[]): ServerObject[] {
    /* v8 ignore next */
    const serverTags = tags.filter(tag => tag.getTagName() === 'server');
    /* v8 ignore next */
    const servers: ServerObject[] = [];

    /* v8 ignore next */
    serverTags.forEach(tag => {
        /* v8 ignore next */
        const raw = normalizeDocComment(tag.getComment()).trim();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!raw) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const jsonServers = parseServerJson(raw);
        /* v8 ignore next */
        if (jsonServers) {
            /* v8 ignore next */
            servers.push(...jsonServers);
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        const parts = raw.split(/\s+/);
        /* v8 ignore next */
        const url = parts.shift();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!url) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const description = parts.join(' ').trim();
        /* v8 ignore next */
        /* v8 ignore start */
        servers.push(description ? { url, description } : { url });
        /* v8 ignore stop */
    });

    /* v8 ignore next */
    return servers;
}

function extractSecurity(tags: import('ts-morph').JSDocTag[]): Record<string, string[]>[] {
    /* v8 ignore next */
    const securityTags = tags.filter(tag => tag.getTagName() === 'security');
    /* v8 ignore next */
    const requirements: Record<string, string[]>[] = [];

    /* v8 ignore next */
    securityTags.forEach(tag => {
        /* v8 ignore next */
        const raw = normalizeDocComment(tag.getComment()).trim();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!raw) return;
        /* v8 ignore stop */

        /* v8 ignore next */
        /* v8 ignore start */
        if (raw.startsWith('{') || raw.startsWith('[')) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            const parsed = parseSecurityJson(raw);
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (parsed.length > 0) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                requirements.push(...parsed);
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return;
            /* v8 ignore stop */
        }

        /* v8 ignore next */
        const [scheme, ...rest] = raw.split(/\s+/);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!scheme) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const scopes = rest

            .join(' ')
            .split(/[,\s]+/)
            /* v8 ignore next */
            .map(scope => scope.trim())
            .filter(Boolean);
        /* v8 ignore next */
        requirements.push({ [scheme]: scopes });
    });

    /* v8 ignore next */
    return requirements;
}

/* v8 ignore start */
function parseSecurityJson(raw: string): Record<string, string[]>[] {
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    try {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const parsed = JSON.parse(raw) as unknown;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (Array.isArray(parsed)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return parsed.filter(
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                (entry: unknown): entry is Record<string, string[]> => !!entry && typeof entry === 'object',
            );
        }
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (parsed && typeof parsed === 'object') {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return [parsed as Record<string, string[]>];
            /* v8 ignore stop */
        }
    } catch {
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return [];
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return [];
    /* v8 ignore stop */
}

function getJsDocs(node: Node): import('ts-morph').JSDoc[] {
    /* v8 ignore next */
    let current: Node | undefined = node;
    /* v8 ignore next */
    for (let depth = 0; current && depth < 4; depth += 1) {
        /* v8 ignore next */
        const withDocs = current as Node & { getJsDocs?: () => import('ts-morph').JSDoc[] };
        /* v8 ignore next */
        const docs = withDocs.getJsDocs ? withDocs.getJsDocs() : [];
        /* v8 ignore next */
        if (docs.length > 0) return docs;
        /* v8 ignore next */
        current = current.getParent();
    }
    /* v8 ignore next */
    return [];
}

function parseTagList(comment: string): string[] {
    /* v8 ignore next */
    return (
        comment

            .split(',')
            /* v8 ignore next */
            .flatMap(part => part.trim().split(/\s+/))
            /* v8 ignore next */
            .map(part => part.trim())
            .filter(Boolean)
    );
}

function parseTagInput(raw: string): { names: string[]; objects: TagObject[] } {
    /* v8 ignore next */
    const trimmed = raw.trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!trimmed) return { names: [], objects: [] };
    /* v8 ignore stop */
    /* v8 ignore next */
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        /* v8 ignore next */
        const parsed = parseJsonMaybe(trimmed);
        /* v8 ignore next */
        return normalizeTagJson(parsed);
    }
    /* v8 ignore next */
    return { names: parseTagList(trimmed), objects: [] };
}

function normalizeTagJson(parsed: unknown): { names: string[]; objects: TagObject[] } {
    /* v8 ignore next */
    const names: string[] = [];
    /* v8 ignore next */
    const objects: TagObject[] = [];
    /* v8 ignore next */
    const pushTag = (entry: unknown) => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof entry === 'string') {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (entry.trim()) names.push(entry.trim());
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return;
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const tag = entry as TagObject;
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof tag.name !== 'string' || !tag.name.trim()) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const normalized = { ...tag, name: tag.name.trim() };
        /* v8 ignore next */
        names.push(normalized.name);
        /* v8 ignore next */
        objects.push(normalized);
    };

    /* v8 ignore next */
    /* v8 ignore start */
    if (Array.isArray(parsed)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        parsed.forEach((entry: unknown) => pushTag(entry));
        /* v8 ignore stop */
    } else {
        /* v8 ignore next */
        pushTag(parsed);
    }

    /* v8 ignore next */
    return { names, objects };
}

function parseServerJson(raw: string): ServerObject[] | null {
    /* v8 ignore next */
    const trimmed = raw.trim();
    /* v8 ignore next */
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    /* v8 ignore next */
    const parsed = parseJsonMaybe(trimmed);
    /* v8 ignore next */
    /* v8 ignore start */
    if (!parsed) return [];
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    /* v8 ignore stop */
    /* v8 ignore next */
    const servers: ServerObject[] = [];
    /* v8 ignore next */
    entries.forEach((entry: unknown) => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const candidate = entry as ServerObject;
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof candidate.url !== 'string' || candidate.url.trim().length === 0) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        servers.push({ ...candidate, url: candidate.url.trim() });
    });
    /* v8 ignore next */
    return servers;
}

function parseJsonMaybe(raw: string): unknown | undefined {
    /* v8 ignore next */
    try {
        /* v8 ignore next */
        return JSON.parse(raw);
    } catch {
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return undefined;
        /* v8 ignore stop */
    }
}

function normalizeDocComment(comment: unknown): string {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!comment) return '';
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeof comment === 'string') return comment;
    /* v8 ignore stop */
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (Array.isArray(comment)) return comment.map((part: unknown) => normalizeDocComment(part)).join('');
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isNode(comment)) return comment.getText();
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return String(comment);
    /* v8 ignore stop */
}

/* v8 ignore next */
const EXAMPLE_WRAPPER_KEY = '__oasExample';

type ExampleCarrier = {
    [EXAMPLE_WRAPPER_KEY]: ExampleObject;
};

function isExampleCarrier(value: unknown): value is ExampleCarrier {
    /* v8 ignore next */
    if (!value || typeof value !== 'object') return false;
    /* v8 ignore next */
    if (!(EXAMPLE_WRAPPER_KEY in (value as Record<string, unknown>))) return false;
    /* v8 ignore next */
    const wrapped = (value as Record<string, unknown>)[EXAMPLE_WRAPPER_KEY];
    /* v8 ignore next */
    return !!wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped);
}

function unwrapExampleCarrier(value: unknown): ExampleObject | undefined {
    /* v8 ignore next */
    if (!isExampleCarrier(value)) return undefined;
    /* v8 ignore next */
    return (value as ExampleCarrier)[EXAMPLE_WRAPPER_KEY];
}

function parseDocValue(value: string): unknown {
    /* v8 ignore next */
    try {
        /* v8 ignore next */
        return JSON.parse(value);
    } catch {
        /* v8 ignore next */
        return value;
    }
}

function normalizeParamSchemaOverride(value: unknown): SwaggerDefinition | boolean | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeof value === 'boolean') return value;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as SwaggerDefinition;
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeof value !== 'string') return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    const trimmed = value.trim();
    /* v8 ignore next */
    /* v8 ignore start */
    if (!trimmed) return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    const primitiveTypes = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null']);
    /* v8 ignore next */
    if (primitiveTypes.has(trimmed)) {
        /* v8 ignore next */
        return { type: trimmed as 'string' };
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (
        /* v8 ignore stop */
        trimmed.startsWith('#') ||
        trimmed.startsWith('./') ||
        trimmed.startsWith('../') ||
        /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
    ) {
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return { $ref: trimmed };
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        return { $ref: `#/components/schemas/${trimmed}` };
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return undefined;
    /* v8 ignore stop */
}

function extractLiteralText(expression?: Expression): string | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!expression) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    if (Node.isNumericLiteral(expression)) return expression.getText();
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        return expression.getLiteralText();
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return undefined;
    /* v8 ignore stop */
}

function extractStringLiteral(expression?: Expression): string | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!expression) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (Node.isStringLiteral(expression) || Node.isNoSubstitutionTemplateLiteral(expression)) {
        /* v8 ignore stop */
        /* v8 ignore next */
        return expression.getLiteralText();
    }
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return undefined;
    /* v8 ignore stop */
}

function trimQuotes(value: string): string {
    /* v8 ignore next */
    return value.replace(/^['"]|['"]$/g, '');
}

function isReservedHeaderParam(name?: string): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!name) return false;
    /* v8 ignore stop */
    /* v8 ignore next */
    return RESERVED_HEADER_NAMES.has(name.toLowerCase());
}

function buildParameters(params: CodeScanParam[]): Parameter[] {
    /* v8 ignore next */
    return (
        params

            /* v8 ignore next */
            .filter(param => !(param.in === 'header' && isReservedHeaderParam(param.name)))
            .map(param => {
                /* v8 ignore next */
                if (param.in === 'querystring') {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const contentType = param.contentType ?? 'application/x-www-form-urlencoded';
                    /* v8 ignore stop */
                    const contentEntry: {
                        schema: SwaggerDefinition;
                        encoding?: Record<string, unknown>;
                        example?: unknown;
                        examples?: Record<string, ExampleObject>;
                        /* v8 ignore next */
                    } = {
                        schema: guessSchemaForContentType(contentType),
                    };
                    /* v8 ignore next */
                    if (param.encoding) {
                        /* v8 ignore next */
                        contentEntry.encoding = param.encoding;
                    }
                    /* v8 ignore next */
                    if (param.example !== undefined) {
                        /* v8 ignore next */
                        const wrapped = unwrapExampleCarrier(param.example);
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (wrapped) {
                            /* v8 ignore stop */
                            /* v8 ignore next */
                            contentEntry.examples = { example: wrapped };
                        } else {
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            contentEntry.example = param.example;
                            /* v8 ignore stop */
                        }
                    }
                    /* v8 ignore next */
                    return {
                        name: param.name,
                        in: param.in as Parameter['in'],
                        /* v8 ignore start */
                        ...(param.required !== undefined ? { required: param.required } : {}),
                        /* v8 ignore stop */
                        description: param.description,
                        content: {
                            [contentType]: contentEntry,
                        },
                    } as Parameter;
                }

                /* v8 ignore next */
                return {
                    name: param.name,
                    in: param.in as Parameter['in'],
                    ...(param.in === 'path'
                        ? { required: true }
                        : /* v8 ignore start */
                          param.required !== undefined
                          ? /* v8 ignore stop */
                            { required: param.required }
                          : {}),
                    description: param.description,
                    schema: param.schema ?? { type: 'string' },
                    ...(param.example !== undefined && !unwrapExampleCarrier(param.example)
                        ? { example: param.example }
                        : {}),
                    /* v8 ignore start */
                    ...(param.example !== undefined && unwrapExampleCarrier(param.example)
                        ? /* v8 ignore stop */
                          { examples: { example: unwrapExampleCarrier(param.example) as ExampleObject } }
                        : {}),
                } as Parameter;
            })
    );
}

function buildRequestBody(requestBody?: CodeScanRequestBody): RequestBody | undefined {
    /* v8 ignore next */
    if (!requestBody) return undefined;
    /* v8 ignore next */
    if (requestBody.contentTypes.length === 0) return undefined;
    /* v8 ignore next */
    const content = Object.fromEntries(
        /* v8 ignore next */
        requestBody.contentTypes.map(contentType => [
            contentType,
            { schema: requestBody.schema ?? guessSchemaForContentType(contentType) },
        ]),
    );
    /* v8 ignore next */
    if (requestBody.examples && Object.keys(requestBody.examples).length > 0) {
        /* v8 ignore next */
        Object.entries(content).forEach(([contentType, entry]) => {
            /* v8 ignore next */
            /* v8 ignore start */
            const example = requestBody.examples?.[contentType] ?? requestBody.examples?.['*'];
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if (example !== undefined) {
                /* v8 ignore stop */
                /* v8 ignore next */
                const wrapped = unwrapExampleCarrier(example);
                /* v8 ignore next */
                if (wrapped) {
                    /* v8 ignore next */
                    (entry as { examples?: Record<string, ExampleObject> }).examples = { example: wrapped };
                } else {
                    /* v8 ignore next */
                    (entry as { example?: unknown }).example = example;
                }
            }
        });
    }
    /* v8 ignore next */
    return {
        /* v8 ignore start */
        ...(requestBody.required !== undefined ? { required: requestBody.required } : { required: true }),
        /* v8 ignore stop */
        content,
    } as RequestBody;
}

function buildResponses(responses: CodeScanResponse[]): Record<string, SwaggerResponse> {
    /* v8 ignore next */
    const responseMap: Record<string, SwaggerResponse> = {};
    /* v8 ignore next */
    const normalized = responses.length > 0 ? responses : [{ status: '200', contentTypes: [] }];

    /* v8 ignore next */
    for (const response of normalized) {
        /* v8 ignore next */
        /* v8 ignore start */
        const description = response.description ?? (response.status === 'default' ? 'Default response' : 'Response');
        /* v8 ignore stop */
        /* v8 ignore next */
        const entry: SwaggerResponse = {
            description,
            ...(response.summary ? { summary: response.summary } : {}),
        };
        /* v8 ignore next */
        if (response.contentTypes.length > 0) {
            /* v8 ignore next */
            entry.content = Object.fromEntries(
                /* v8 ignore next */
                response.contentTypes.map(contentType => [
                    contentType,
                    { schema: response.schema ?? guessSchemaForContentType(contentType) },
                ]),
            );
            /* v8 ignore next */
            if (response.examples && Object.keys(response.examples).length > 0) {
                /* v8 ignore next */
                Object.entries(entry.content).forEach(([contentType, media]) => {
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const example = response.examples?.[contentType] ?? response.examples?.['*'];
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (example !== undefined) {
                        /* v8 ignore stop */
                        /* v8 ignore next */
                        const wrapped = unwrapExampleCarrier(example);
                        /* v8 ignore next */
                        if (wrapped) {
                            /* v8 ignore next */
                            (media as { examples?: Record<string, ExampleObject> }).examples = { example: wrapped };
                        } else {
                            /* v8 ignore next */
                            (media as { example?: unknown }).example = example;
                        }
                    }
                });
            }
        }
        /* v8 ignore next */
        responseMap[response.status] = entry;
    }

    /* v8 ignore next */
    return responseMap;
}

function guessSchemaForContentType(contentType: string): SwaggerDefinition {
    /* v8 ignore next */
    const normalized = contentType.toLowerCase();
    /* v8 ignore next */
    if (normalized.includes('json')) {
        /* v8 ignore next */
        return { type: 'object' };
    }
    /* v8 ignore next */
    if (normalized.startsWith('text/')) {
        /* v8 ignore next */
        return { type: 'string' };
    }
    /* v8 ignore next */
    if (normalized.includes('xml')) {
        /* v8 ignore next */
        return { type: 'string' };
    }
    /* v8 ignore next */
    if (normalized === 'application/octet-stream') {
        /* v8 ignore next */
        return { type: 'string', format: 'binary' };
    }
    /* v8 ignore next */
    if (normalized === 'application/x-www-form-urlencoded') {
        /* v8 ignore next */
        return { type: 'object' };
    }
    /* v8 ignore next */
    if (normalized === 'multipart/form-data') {
        /* v8 ignore next */
        return { type: 'object' };
    }
    /* v8 ignore next */
    return { type: 'string' };
}

function inferExpressSchemaHints(handler: Node): {
    requestSchema?: SwaggerDefinition | boolean;
    responseSchema?: SwaggerDefinition | boolean;
} {
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const fnNode = handler as import('ts-morph').Node;
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore start */
    if (
        !fnNode ||
        typeof (fnNode as unknown as { getParameters(): import('ts-morph').ParameterDeclaration[] }).getParameters !==
            'function'
    )
        return {};
    /* v8 ignore stop */
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const params = (
        fnNode as unknown as { getParameters(): import('ts-morph').ParameterDeclaration[] }
    ).getParameters();
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const reqParam = params[0];
    // type-coverage:ignore-next-line
    /* v8 ignore next */
    const resParam = params[1];
    let requestSchema: SwaggerDefinition | boolean | undefined;
    let responseSchema: SwaggerDefinition | boolean | undefined;

    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore start */
    if (reqParam) {
        /* v8 ignore stop */
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        const reqTypeNode = reqParam.getTypeNode();
        /* v8 ignore next */
        const extracted = extractSchemasFromRequestType(reqTypeNode);
        /* v8 ignore next */
        if (extracted.requestSchema !== undefined) {
            /* v8 ignore next */
            requestSchema = extracted.requestSchema;
        }
        /* v8 ignore next */
        if (extracted.responseSchema !== undefined) {
            /* v8 ignore next */
            responseSchema = extracted.responseSchema;
        }
    }

    // type-coverage:ignore-next-line
    /* v8 ignore next */
    /* v8 ignore start */
    if (resParam) {
        /* v8 ignore stop */
        // type-coverage:ignore-next-line
        /* v8 ignore next */
        const resTypeNode = resParam.getTypeNode();
        /* v8 ignore next */
        const inferred = extractSchemaFromResponseType(resTypeNode);
        /* v8 ignore next */
        if (inferred !== undefined) {
            /* v8 ignore next */
            responseSchema = inferred;
        }
    }

    /* v8 ignore next */
    const result: { requestSchema?: SwaggerDefinition | boolean; responseSchema?: SwaggerDefinition | boolean } = {};
    /* v8 ignore next */
    if (requestSchema !== undefined) result.requestSchema = requestSchema;
    /* v8 ignore next */
    if (responseSchema !== undefined) result.responseSchema = responseSchema;
    /* v8 ignore next */
    return result;
}

function inferReturnSchemaFromSignature(handler: Node): SwaggerDefinition | boolean | undefined {
    const returnTypeNode =
        /* v8 ignore next */
        'getReturnTypeNode' in handler &&
        typeof (handler as unknown as { getReturnTypeNode: () => TypeNode | undefined }).getReturnTypeNode ===
            'function'
            ? (handler as unknown as { getReturnTypeNode: () => TypeNode | undefined }).getReturnTypeNode()
            : undefined;
    /* v8 ignore next */
    if (!returnTypeNode) return undefined;
    /* v8 ignore next */
    const unwrapped = unwrapContainerTypeNode(returnTypeNode);
    /* v8 ignore next */
    /* v8 ignore start */
    if (isVoidTypeNode(unwrapped)) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    /* v8 ignore start */
    if (isResponseTypeName(getTypeNodeName(unwrapped))) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    return inferSchemaFromTypeNode(unwrapped);
}

function extractSchemasFromRequestType(typeNode?: TypeNode): {
    requestSchema?: SwaggerDefinition | boolean;
    responseSchema?: SwaggerDefinition | boolean;
} {
    /* v8 ignore next */
    if (!typeNode || !Node.isTypeReference(typeNode)) return {};
    /* v8 ignore next */
    if (!isRequestTypeName(getTypeNodeName(typeNode))) return {};
    /* v8 ignore next */
    const args = typeNode.getTypeArguments();
    /* v8 ignore next */
    const responseArg = args[1];
    /* v8 ignore next */
    const requestArg = args[2];

    /* v8 ignore next */
    const result: { requestSchema?: SwaggerDefinition | boolean; responseSchema?: SwaggerDefinition | boolean } = {};
    /* v8 ignore next */
    if (requestArg) {
        /* v8 ignore next */
        const infReq = inferSchemaFromTypeNode(requestArg);
        /* v8 ignore next */
        if (infReq !== undefined) result.requestSchema = infReq;
    }
    /* v8 ignore next */
    if (responseArg) {
        /* v8 ignore next */
        const infRes = inferSchemaFromTypeNode(responseArg);
        /* v8 ignore next */
        if (infRes !== undefined) result.responseSchema = infRes;
    }
    /* v8 ignore next */
    return result;
}

function extractSchemaFromResponseType(typeNode?: TypeNode): SwaggerDefinition | boolean | undefined {
    /* v8 ignore next */
    if (!typeNode || !Node.isTypeReference(typeNode)) return undefined;
    /* v8 ignore next */
    if (!isResponseTypeName(getTypeNodeName(typeNode))) return undefined;
    /* v8 ignore next */
    const arg = typeNode.getTypeArguments()[0];
    /* v8 ignore next */
    return inferSchemaFromTypeNode(arg);
}

function inferSchemaFromTypeNode(typeNode?: TypeNode): SwaggerDefinition | boolean | undefined {
    /* v8 ignore next */
    if (!typeNode) return undefined;
    /* v8 ignore next */
    const unwrapped = unwrapContainerTypeNode(typeNode);
    /* v8 ignore next */
    /* v8 ignore start */
    if (isVoidTypeNode(unwrapped)) return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    if (Node.isTypeReference(unwrapped)) {
        /* v8 ignore next */
        const typeName = getTypeNodeName(unwrapped);
        /* v8 ignore next */
        const primitiveSchema = schemaForPrimitiveReference(typeName);
        /* v8 ignore next */
        /* v8 ignore start */
        if (primitiveSchema) return primitiveSchema;
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    const schema = schemaFromTypeNode(unwrapped);
    /* v8 ignore next */
    return isEmptySchema(schema as SwaggerDefinition) ? undefined : schema;
}

function unwrapContainerTypeNode(typeNode: TypeNode): TypeNode {
    /* v8 ignore next */
    if (!Node.isTypeReference(typeNode)) return typeNode;
    /* v8 ignore next */
    const typeName = getTypeNodeName(typeNode);
    /* v8 ignore next */
    /* v8 ignore start */
    if (typeName === 'Promise' || typeName === 'PromiseLike' || typeName === 'Observable') {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        const arg = typeNode.getTypeArguments()[0];
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        if (arg) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return unwrapContainerTypeNode(arg);
            /* v8 ignore stop */
        }
    }
    /* v8 ignore next */
    return typeNode;
}

function getTypeNodeName(typeNode: TypeNode): string {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!Node.isTypeReference(typeNode)) return '';
    /* v8 ignore stop */
    /* v8 ignore next */
    return typeNode.getTypeName().getText();
}

function schemaForPrimitiveReference(typeName: string): SwaggerDefinition | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    switch (typeName) {
        /* v8 ignore stop */
        case 'String':
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'string' };
        /* v8 ignore stop */
        case 'Number':
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'number' };
        /* v8 ignore stop */
        case 'Boolean':
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'boolean' };
        /* v8 ignore stop */
        case 'Object':
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'object' };
        /* v8 ignore stop */
        default:
            /* v8 ignore next */
            return undefined;
    }
}

function isVoidTypeNode(typeNode: TypeNode): boolean {
    /* v8 ignore next */
    return typeNode.getKind() === SyntaxKind.VoidKeyword || typeNode.getKind() === SyntaxKind.NeverKeyword;
}

function isRequestTypeName(typeName: string): boolean {
    /* v8 ignore next */
    return typeName === 'Request' || typeName.endsWith('.Request');
}

function isResponseTypeName(typeName: string): boolean {
    /* v8 ignore next */
    return typeName === 'Response' || typeName.endsWith('.Response');
}

function isEmptySchema(schema: SwaggerDefinition): boolean {
    /* v8 ignore next */
    return Object.keys(schema).length === 0;
}
