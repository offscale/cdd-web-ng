import { ModuleKind, ScriptTarget } from "ts-morph";
import { Path, Operation, Parameter as SwaggerOfficialParameter, Reference, Info, ExternalDocs, XML, Tag, Security, BodyParameter, QueryParameter } from 'swagger-schema-official';

// --- From swagger.types.ts ---

export interface DiscriminatorObject {
    propertyName: string;
    mapping?: { [key: string]: string };
}

export interface Parameter {
    name: string;
    in: "query" | "path" | "header" | "cookie";
    required?: boolean;
    schema?: SwaggerDefinition | { $ref: string };
    type?: string;
    format?: string;
    description?: string;
}

export interface PathInfo {
    path: string;
    method: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses?: Record<string, SwaggerResponse>;
}

export interface RequestBody {
    required?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
}

export interface SwaggerResponse {
    description?: string;
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
}

export interface SwaggerDefinition {
    type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null" | ("string" | "number" | "integer" | "boolean" | "object" | "array" | "null")[];
    format?: string;
    description?: string;
    default?: unknown;
    maximum?: number;
    minimum?: number;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    enum?: (string | number)[];
    items?: SwaggerDefinition | SwaggerDefinition[];
    $ref?: string;
    allOf?: SwaggerDefinition[];
    oneOf?: SwaggerDefinition[];
    anyOf?: SwaggerDefinition[];
    additionalProperties?: SwaggerDefinition | boolean;
    properties?: { [propertyName: string]: SwaggerDefinition };
    discriminator?: DiscriminatorObject;
    readOnly?: boolean;
    nullable?: boolean;
    required?: string[];
}

export interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    info: Info;
    paths: { [pathName: string]: Path };
    definitions?: { [definitionsName: string]: SwaggerDefinition };
    components?: {
        schemas?: Record<string, SwaggerDefinition>;
        securitySchemes?: Record<string, unknown>;
    };
    securityDefinitions?: { [securityDefinitionName: string]: Security };
}

// --- From config.types.ts ---

export interface GeneratorConfigOptions {
    dateType: "string" | "Date";
    enumStyle: "enum" | "union";
    generateServices?: boolean;
    customHeaders?: Record<string, string>;
    customizeMethodName?: (operationId: string) => string;
}

export interface GeneratorConfig {
    input: string;
    output: string;
    clientName?: string;
    validateInput?: (spec: SwaggerSpec) => boolean;
    options: GeneratorConfigOptions;
    compilerOptions?: {
        declaration?: boolean;
        target?: ScriptTarget;
        module?: ModuleKind;
        strict?: boolean;
    };
}
