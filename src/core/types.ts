// src/core/types.ts

/**
 * @fileoverview
 * This file serves as the central repository for all custom TypeScript types and interfaces
 * used throughout the generator. It consolidates types related to the OpenAPI specification,
 * generator configuration, and the derived structures used for code generation.
 */

import { ModuleKind, ScriptTarget } from "ts-morph";

// ===================================================================================
// SECTION: OpenAPI / Swagger Specification Types
// These interfaces model the structure of a parsed OpenAPI/Swagger specification,
// normalizing differences between versions and providing a consistent API.
// ===================================================================================

/**
 * License information for the exposed API.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#licenseObject
 */
export interface LicenseObject {
    /** The license name used for the API. */
    name: string;
    /** A URI for the license used for the API. */
    url?: string;
    /** An SPDX license identifier for the API. (OAS 3.1+) */
    identifier?: string;
}

/**
 * Contact information for the exposed API.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#contactObject
 */
export interface ContactObject {
    /** The identifying name of the contact person/organization. */
    name?: string;
    /** The URL pointing to the contact information. */
    url?: string;
    /** The email address of the contact person/organization. */
    email?: string;
}

/**
 * The object provides metadata about the API.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#infoObject
 */
export interface InfoObject {
    /** The title of the API. */
    title: string;
    /** A short summary of the API. (OAS 3.1+) */
    summary?: string;
    /** A description of the API. */
    description?: string;
    /** A URL to the Terms of Service for the API. */
    termsOfService?: string;
    /** The contact information for the exposed API. */
    contact?: ContactObject;
    /** The license information for the exposed API. */
    license?: LicenseObject;
    /** The version of the OpenAPI document. */
    version: string;
}

/**
 * Allows referencing an external resource for extended documentation.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#externalDocumentationObject
 */
export interface ExternalDocumentationObject {
    /** A description of the target documentation. */
    description?: string;
    /** The URL for the target documentation. */
    url: string;
}

/**
 * Adds metadata to a single tag that is used by the Operation Object.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#tagObject
 */
export interface TagObject {
    /** The name of the tag. */
    name: string;
    /** A short summary of the tag. (OAS 3.1+) */
    summary?: string;
    /** A description for the tag. */
    description?: string;
    /** Additional external documentation for this tag. */
    externalDocs?: ExternalDocumentationObject;
    /** The name of a tag that this tag is nested under. (OAS 3.2+) */
    parent?: string;
    /** A machine-readable string to categorize what sort of tag it is. (OAS 3.2+) */
    kind?: string;
}

/**
 * An object representing a Server Variable for server URL template substitution.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#server-variable-object
 */
export interface ServerVariableObject {
    /** An enumeration of string values to be used if the substitution options are from a limited set. */
    enum?: string[];
    /** The default value to use for substitution. */
    default: string;
    /** An optional description for the server variable. */
    description?: string;
}

/**
 * An object representing a Server.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#server-object
 */
export interface ServerObject {
    /** A URL to the target host. */
    url: string;
    /** An optional string describing the host designated by the URL. */
    description?: string;
    /** An optional unique string to refer to the host designated by the URL. (OAS 3.2) */
    name?: string;
    /** A map between a variable name and its value. */
    variables?: { [variable: string]: ServerVariableObject };
}

/** Represents the `discriminator` object used for polymorphism in OpenAPI schemas. */
export interface DiscriminatorObject {
    /** The name of the property in the payload that determines the schema to use. */
    propertyName: string;
    /** An optional map from a value to a schema reference. */
    mapping?: { [key: string]: string };
}

/**
 * Metadata object that allows for more fine-tuned XML model definitions.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#xmlObject
 */
export interface XmlObject {
    /** Replaces the name of the element/attribute used for the described schema property. */
    name?: string;
    /** The URI of the namespace definition. */
    namespace?: string;
    /** The prefix to be used for the name. */
    prefix?: string;
    /**
     * Declares whether the property definition translates to an attribute instead of an element.
     * @deprecated Use `nodeType: 'attribute'` instead.
     */
    attribute?: boolean;
    /**
     * MAY be used only for an array definition. Signifies whether the array is wrapped.
     * @deprecated Use `nodeType: 'element'` (on the array) for wrapping, partial/implicit 'none' for unwrapped.
     */
    wrapped?: boolean;
    /**
     * Node type for XML mapping (OpenAPI 3.2.0).
     * Values: 'element' | 'attribute' | 'text' | 'cdata' | 'none'.
     */
    nodeType?: 'element' | 'attribute' | 'text' | 'cdata' | 'none' | string;
}

/**
 * The Link Object represents a possible design-time link for a response.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#linkObject
 */
export interface LinkObject {
    /** A URI reference to an OAS operation. Mutually exclusive with operationId. */
    operationRef?: string;
    /** The name of an existing, resolvable OAS operation. Mutually exclusive with operationRef. */
    operationId?: string;
    /** A map representing parameters to pass to an operation. Keys are param names, values are expressions or constants. */
    parameters?: { [name: string]: any | string; };
    /** A literal value or expression to use as a request body when calling the target operation. */
    requestBody?: any | string;
    /** A description of the link. */
    description?: string;
    /** A server object to be used by the target operation. */
    server?: ServerObject;
}

/**
 * The Header Object follows the structure of the Parameter Object with the following changes:
 *   1. `name` MUST NOT be specified, it is given in the corresponding `headers` map.
 *   2. `in` MUST NOT be specified, it is implicitly in `header`.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#headerObject
 */
export interface HeaderObject {
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema?: SwaggerDefinition | { $ref: string };
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array';
    format?: string;
    items?: SwaggerDefinition | { $ref: string };
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
    example?: any;
    examples?: Record<string, any>;
}

/** A simplified, normalized representation of an operation parameter. */
export interface Parameter {
    /** The name of the parameter. */
    name: string;
    /** The location of the parameter. */
    in: "query" | "path" | "header" | "cookie" | "formData" | "querystring";
    /** Determines whether this parameter is mandatory. */
    required?: boolean;
    /** The schema defining the type of the parameter. */
    schema?: SwaggerDefinition | { $ref: string };
    /** The primitive type of the parameter (used in Swagger 2.0). */
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file';
    /** The specific format of the parameter's type. */
    format?: string;
    /** A brief description of the parameter. */
    description?: string;
    /** Describes how the parameter value will be serialized. */
    style?: string;
    /** When true, parameter values of type `array` or `object` generate separate parameters. */
    explode?: boolean;
    /** Allows sending reserved characters through. */
    allowReserved?: boolean;
    /**
     * If true, clients MAY pass a zero-length string value in place of parameters that would otherwise be omitted entirely.
     * @deprecated
     */
    allowEmptyValue?: boolean;
    /** A map containing the representations for the parameter. For complex serialization scenarios. */
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
    /** Specifies that a parameter is deprecated and SHOULD be transitioned out of usage. */
    deprecated?: boolean;
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
    /**
     * Declares this operation to be deprecated.
     * Consumers SHOULD refrain from usage of the declared operation.
     */
    deprecated?: boolean;
    /** External documentation link. */
    externalDocs?: ExternalDocumentationObject;
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
    /** Security requirements specific to this operation. keys are definitions, values are scopes. */
    security?: { [key: string]: string[] }[];
    /** An alternate server array to service this operation. (OAS 3+) */
    servers?: ServerObject[] | undefined;
    /** A map of possible out-of band callbacks related to the parent operation. (OAS 3+) */
    callbacks?: Record<string, PathItem | { $ref: string }>;
}

/** A single encoding definition for a multipart property. */
export interface EncodingProperty {
    /** The Content-Type for encoding a specific property. */
    contentType?: string;
    /** A map of headers that are to be encoded for the property. */
    headers?: Record<string, any>;
    /** serialization style */
    style?: string;
    /** whether to explode array/objects */
    explode?: boolean;
    /** allow reserved characters */
    allowReserved?: boolean;
}

/** Represents the request body of an operation. */
export interface RequestBody {
    /** Determines if the request body is required. */
    required?: boolean;
    /** A map of media types to their corresponding schemas for the request body. */
    content?: Record<string, {
        schema?: SwaggerDefinition | { $ref: string };
        /** Encoding object for multipart/form-data definitions */
        encoding?: Record<string, EncodingProperty>;
    }>;
}

/** Represents a single response from an API Operation. */
export interface SwaggerResponse {
    /** A short description of the response. */
    description?: string;
    /** A map of media types to their corresponding schemas for the response. */
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
    /** A map of operations links that can be followed from the response. */
    links?: Record<string, LinkObject | { $ref: string }>;
    /** Maps a header name to its definition. */
    headers?: Record<string, HeaderObject | { $ref: string }>;
}

/**
 * A normalized and extended interface representing an OpenAPI Schema Object.
 * This is the core structure for defining data models.
 *
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#schemaObject
 */
export interface SwaggerDefinition {
    type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "file" | "null" | ("string" | "number" | "integer" | "boolean" | "object" | "array" | "null")[];
    format?: string;
    description?: string;
    default?: unknown;
    /** Specifies that a parameter is deprecated and SHOULD be transitioned out of usage. */
    deprecated?: boolean;
    /** JSON Schema `const` keyword. (OAS 3.1 / JSON Schema 2020-12) */
    const?: unknown;
    maximum?: number;
    /**
     * If boolean (OAS 3.0/Swagger 2): If true, `maximum` is exclusive.
     * If number (OAS 3.1+/JSON Schema 2020-12): The exclusive maximum value.
     */
    exclusiveMaximum?: boolean | number;
    minimum?: number;
    /**
     * If boolean (OAS 3.0/Swagger 2): If true, `minimum` is exclusive.
     * If number (OAS 3.1+/JSON Schema 2020-12): The exclusive minimum value.
     */
    exclusiveMinimum?: boolean | number;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    multipleOf?: number;
    enum?: (string | number)[];
    items?: SwaggerDefinition | SwaggerDefinition[];

    // JSON Schema 2020-12 / OpenAPI 3.1 Additions
    prefixItems?: SwaggerDefinition[];
    if?: SwaggerDefinition;
    then?: SwaggerDefinition;
    else?: SwaggerDefinition;
    not?: SwaggerDefinition;
    contentEncoding?: string;
    contentMediaType?: string;

    $ref?: string;
    /** Dynamic Reference used in OpenAPI 3.1 (JSON Schema 2020-12) */
    $dynamicRef?: string;
    /** Dynamic Anchor used in OpenAPI 3.1 (JSON Schema 2020-12) */
    $dynamicAnchor?: string;

    allOf?: SwaggerDefinition[];
    oneOf?: SwaggerDefinition[];
    anyOf?: SwaggerDefinition[];
    additionalProperties?: SwaggerDefinition | boolean;
    properties?: { [propertyName: string]: SwaggerDefinition };
    /** A map of regex patterns to schemas for properties key validation. */
    patternProperties?: { [pattern: string]: SwaggerDefinition };
    dependentSchemas?: Record<string, SwaggerDefinition>;
    discriminator?: DiscriminatorObject;
    readOnly?: boolean;
    writeOnly?: boolean;
    nullable?: boolean;
    required?: string[];
    /**
     * An example of the schema representation.
     * @deprecated exist in OAS 3.2 in favor of `examples`
     */
    example?: unknown;
    /**
     * Free-form field to include examples of instances for this schema. (OAS 3.1+)
     */
    examples?: unknown[];

    xml?: XmlObject;
    externalDocs?: ExternalDocumentationObject;
}

/** Represents a security scheme recognized by the API. */
export interface SecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'mutualTLS';
    in?: 'header' | 'query' | 'cookie';
    name?: string;
    scheme?: 'bearer' | string;
    flows?: Record<string, unknown>;
    openIdConnectUrl?: string;
}

/**
 * Represents an Operation Object in OpenAPI (v2 or v3).
 */
export interface SpecOperation {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
    operationId?: string;
    consumes?: string[];
    produces?: string[];
    parameters?: any[]; // Raw parameters (Swagger 2 or OAS 3)
    requestBody?: any; // OAS 3
    responses: Record<string, any>;
    schemes?: string[];
    deprecated?: boolean;
    security?: Record<string, string[]>[];
    servers?: ServerObject[]; // OAS 3 (Operation-level override)
    callbacks?: Record<string, PathItem | { $ref: string }>; // OAS 3
    [key: string]: any;
}

/**
 * Represents a Path Item Object in OpenAPI (v2 or v3).
 */
export interface PathItem {
    $ref?: string;
    summary?: string;
    description?: string;
    get?: SpecOperation;
    put?: SpecOperation;
    post?: SpecOperation;
    delete?: SpecOperation;
    options?: SpecOperation;
    head?: SpecOperation;
    patch?: SpecOperation;
    trace?: SpecOperation;
    query?: SpecOperation; // OAS 3.2 draft
    /**
     * A map of additional operations on this path (OAS 3.2).
     * Keys are HTTP methods (e.g., COPY, LOCK).
     */
    additionalOperations?: Record<string, SpecOperation>;
    parameters?: any[];
    servers?: ServerObject[]; // OAS 3 (Path-level override)
    [key: string]: any;
}

/**
 * The root object of a parsed OpenAPI/Swagger specification.
 * @see https://github.com/OAI/OpenAPI-Specification/blob/main/versions/3.2.0.md#oasObject
 */
export interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    $self?: string;
    info: InfoObject;
    /** Additional external documentation. */
    externalDocs?: ExternalDocumentationObject;
    /** A list of tags used by the OpenAPI Description with additional metadata. */
    tags?: TagObject[];

    paths: { [pathName: string]: PathItem };
    /** The incoming webhooks that MAY be received as part of this API. */
    webhooks?: { [name: string]: PathItem };
    /** The default value for the $schema keyword within Schema Objects. */
    jsonSchemaDialect?: string;
    /** An array of Server Objects, which provide connectivity information to a target server. */
    servers?: ServerObject[];
    /** Schema definitions (Swagger 2.0). */
    definitions?: { [definitionsName: string]: SwaggerDefinition };
    /** Replaces `definitions` in OpenAPI 3.x. */
    components?: {
        schemas?: Record<string, SwaggerDefinition>;
        securitySchemes?: Record<string, SecurityScheme>;
        pathItems?: Record<string, PathItem>;
        callbacks?: Record<string, PathItem | { $ref: string }>;
        links?: Record<string, LinkObject | { $ref: string }>;
        headers?: Record<string, HeaderObject | { $ref: string }>;
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
    dateType?: 'string' | 'Date';
    /** How to generate types for schemas with an `enum` list. */
    enumStyle?: 'enum' | 'union';
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
    customizeMethodName?: ((operationId: string) => string);
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
