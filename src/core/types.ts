/**
 * @fileoverview
 * This file serves as the central repository for all custom TypeScript types and interfaces
 * used throughout the generator. It consolidates types related to the OpenAPI specification,
 * generator configuration, and the derived structures used for code generation.
 */

import { ModuleKind, ScriptTarget } from "ts-morph";
import { Path, Operation, Parameter as SwaggerOfficialParameter, Reference, Info, ExternalDocs, XML, Tag, Security, BodyParameter, QueryParameter } from 'swagger-schema-official';

// ===================================================================================
// SECTION: OpenAPI / Swagger Specification Types
// These interfaces model the structure of a parsed OpenAPI/Swagger specification,
// normalizing differences between versions and providing a consistent API.
// ===================================================================================

/** Represents the `discriminator` object used for polymorphism in OpenAPI schemas. */
export interface DiscriminatorObject {
    /** The name of the property in the payload that determines the schema to use. */
    propertyName: string;
    /** An optional map from a value to a schema reference. */
    mapping?: { [key: string]: string };
}

/** A simplified, normalized representation of an operation parameter. */
export interface Parameter {
    /** The name of the parameter. */
    name: string;
    /** The location of the parameter. */
    in: "query" | "path" | "header" | "cookie";
    /** Determines whether this parameter is mandatory. */
    required?: boolean;
    /** The schema defining the type of the parameter. */
    schema?: SwaggerDefinition | { $ref: string };
    /** The primitive type of the parameter (used in Swagger 2.0). */
    type?: string;
    /** The specific format of the parameter's type. */
    format?: string;
    /** A brief description of the parameter. */
    description?: string;
}

/** A processed, unified representation of a single API operation (e.g., GET /users/{id}). */
export interface PathInfo {
    /** The URL path template for the operation. */
    path: string;
    /** The HTTP method for the operation (e.g., 'get', 'post'). */
    method: string;
    /** The unique identifier for the operation. */
    operationId?: string;
    /** A short summary of what the operation does. */
    summary?: string;
    /** A verbose explanation of the operation behavior. */
    description?: string;
    /** A list of tags for API documentation control. */
    tags?: string[];
    /** The media types consumed by the operation. */
    consumes?: string[];
    /** A list of parameters that are applicable for this operation. */
    parameters?: Parameter[];
    /** The request body applicable for this operation. */
    requestBody?: RequestBody;
    /** A map of possible responses from this operation. */
    responses?: Record<string, SwaggerResponse>;
    /** The generator-derived, safe method name for this operation. */
    methodName?: string;
}

/** Represents the request body of an operation. */
export interface RequestBody {
    /** Determines if the request body is required. */
    required?: boolean;
    /** A map of media types to their corresponding schemas for the request body. */
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
}

/** Represents a single response from an API Operation. */
export interface SwaggerResponse {
    /** A short description of the response. */
    description?: string;
    /** A map of media types to their corresponding schemas for the response. */
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
}

/**
 * A normalized and extended interface representing an OpenAPI Schema Object.
 * This is the core structure for defining data models.
 */
export interface SwaggerDefinition {
    type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "file" | "null" | ("string" | "number" | "integer" | "boolean" | "object" | "array" | "null")[];
    format?: string;
    description?: string;
    default?: unknown;
    maximum?: number;
    /** If true, the `maximum` is exclusive. */
    exclusiveMaximum?: boolean;
    minimum?: number;
    /** If true, the `minimum` is exclusive. */
    exclusiveMinimum?: boolean;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    multipleOf?: number;
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
    writeOnly?: boolean;
    nullable?: boolean;
    required?: string[];
    /** An example of the schema representation. */
    example?: unknown; // FIX: Added the 'example' property.
}

/** Represents a security scheme recognized by the API. */
export interface SecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect';
    in?: 'header' | 'query' | 'cookie';
    name?: string;
    scheme?: 'bearer' | string;
    flows?: Record<string, unknown>;
}

/** The root object of a parsed OpenAPI/Swagger specification. */
export interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    info: Info;
    paths: { [pathName: string]: Path };
    /** Schema definitions (Swagger 2.0). */
    definitions?: { [definitionsName: string]: SwaggerDefinition };
    /** Replaces `definitions` in OpenAPI 3.x. */
    components?: {
        schemas?: Record<string, SwaggerDefinition>;
        securitySchemes?: Record<string, SecurityScheme>;
    };
    /** Security definitions (Swagger 2.0). */
    securityDefinitions?: { [securityDefinitionName: string]: SecurityScheme };
}

// ===================================================================================
// SECTION: Generator Configuration Types
// These interfaces define the structure of the configuration object that controls
// the behavior of the code generator.
// ===================================================================================

/** Options that customize the output of the generated code. */
export interface GeneratorConfigOptions {
    /** The TypeScript type to use for properties with `format: "date"` or `"date-time"`. */
    dateType: 'string' | 'Date';
    /** How to generate types for schemas with an `enum` list. */
    enumStyle: 'enum' | 'union';
    /** If true, generates Angular services for API operations. */
    generateServices?: boolean;
    /** If true, generates a complete admin UI module. */
    admin?: boolean;
    /** If true, generates tests for the Angular services. Defaults to true. */
    generateServiceTests?: boolean;
    /** If true, generates tests for the admin UI. Defaults to true. */
    generateAdminTests?: boolean;
    /** A record of static headers to be added to every generated service request. */
    customHeaders?: Record<string, string>;
    /** A callback to provide a custom method name for an operation. */
    customizeMethodName?: (operationId: string) => string;
}

/** The main configuration object for the entire generation process. */
export interface GeneratorConfig {
    /** The local file path or remote URL of the OpenAPI specification. */
    input: string;
    /** The root directory where the generated code will be saved. */
    output: string;
    /** The name of the main Angular service client. */
    clientName?: string;
    /** An optional callback to validate the input specification before generation. */
    validateInput?: (spec: SwaggerSpec) => boolean;
    /** Fine-grained options for customizing the generated code. */
    options: GeneratorConfigOptions;
    /** ts-morph compiler options for the generated project. */
    compilerOptions?: {
        declaration?: boolean;
        target?: ScriptTarget;
        module?: ModuleKind;
        strict?: boolean;
    };
}

// ===================================================================================
// SECTION: Derived Types for Admin UI Generation
// These interfaces represent processed, generator-specific data structures
// created by analyzing the specification. They are tailored for generating
// the admin UI components.
// ===================================================================================

/** A processed representation of an API operation, classified for UI generation. */
export interface ResourceOperation {
    /** The classified action of the operation (e.g., 'list', 'create', or a custom action). */
    action: 'list' | 'create' | 'getById' | 'update' | 'delete' | string;
    path: string;
    method: string;
    operationId?: string;
    /** The safe, generated method name for the service. */
    methodName?: string;
    methodParameters?: Parameter[];
    /** True if this is a custom action on a single item (e.g., POST /users/{id}/reset-password). */
    isCustomItemAction?: boolean;
    /** True if this is a custom action on a collection (e.g., POST /users/export). */
    isCustomCollectionAction?: boolean;
}

/** Represents a logical API resource (e.g., "Users"), derived by grouping related paths. */
export interface Resource {
    /** The machine-friendly name of the resource (e.g., 'users'). */
    name: string;
    /** The human-friendly, singular, PascalCase name for the data model (e.g., 'User'). */
    modelName: string;
    /** All operations associated with this resource. */
    operations: ResourceOperation[];
    /** True if the resource has any operations that modify data (POST, PUT, PATCH, DELETE). */
    isEditable: boolean;
    /** All properties of the model, used for generating the create/edit form. */
    formProperties: FormProperty[];
    /** A subset of properties suitable for display in a list or table view. */
    listProperties: FormProperty[];
}

/** A simple wrapper for a property's name and its underlying schema, used for templating. */
export interface FormProperty {
    /** The name of the property. */
    name: string;
    /** The complete schema definition for the property. */
    schema: SwaggerDefinition;
}
