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
    exclusiveMaximum?: boolean; // Added for advanced validation
    minimum?: number;
    exclusiveMinimum?: boolean; // Added for advanced validation
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    multipleOf?: number; // Added for advanced validation
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

export interface SecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
    in?: 'header' | 'query' | 'cookie';
    name?: string;
    scheme?: 'bearer' | string;
    flows?: Record<string, unknown>;
}

export interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    info: Info;
    paths: { [pathName: string]: Path };
    definitions?: { [definitionsName: string]: SwaggerDefinition };
    components?: {
        schemas?: Record<string, SwaggerDefinition>;
        securitySchemes?: Record<string, SecurityScheme>;
    };
    securityDefinitions?: { [securityDefinitionName: string]: SecurityScheme };
}

// --- From config.types.ts ---

export interface GeneratorConfigOptions {
    dateType: "string" | "Date";
    enumStyle: "enum" | "union";
    generateServices?: boolean;
    admin?: boolean; // Added admin option type
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

// --- For Admin UI Generation ---

export interface ResourceOperation {
    action: 'list' | 'create' | 'getById' | 'update' | 'delete' | string; // action can be a standard CRUD or a custom one (from operationId)
    path: string;
    method: string;
    operationId?: string;
}

export interface Resource {
    name: string; // e.g., 'users'
    modelName: string; // e.g., 'User'
    operations: ResourceOperation[];
    isEditable: boolean; // Has any of POST, PUT, DELETE, PATCH
    formProperties: FormProperty[]; // Properties processed for form generation
}

export interface FormProperty {
    name: string;
    schema: SwaggerDefinition;
    // Add more processed info here if needed for templates
    // e.g., controlType, validators, etc.
}
