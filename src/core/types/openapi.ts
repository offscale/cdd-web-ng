// ===================================================================================
// OpenAPI / Swagger Specification Types
// ===================================================================================

export interface LicenseObject {
    name: string;
    url?: string;
    identifier?: string;

    [key: string]: unknown;
}

export interface ContactObject {
    name?: string;
    url?: string;
    email?: string;

    [key: string]: unknown;
}

export interface InfoObject {
    title: string;
    summary?: string;
    description?: string;
    termsOfService?: string;
    contact?: ContactObject;
    license?: LicenseObject;
    version: string;

    [key: string]: unknown;
}

export interface ExternalDocumentationObject {
    description?: string;
    url: string;

    [key: string]: unknown;
}

export interface ReferenceObject {
    $ref: string;
    summary?: string;
    description?: string;

    [key: string]: unknown;
}

export interface DynamicReferenceObject {
    $dynamicRef: string;
    summary?: string;
    description?: string;

    [key: string]: unknown;
}

export type ReferenceLike = ReferenceObject | DynamicReferenceObject;

export interface TagObject {
    name: string;
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
    parent?: string;
    kind?: string;

    [key: string]: unknown;
}

export interface ServerVariableObject {
    enum?: string[];
    default: string;
    description?: string;

    [key: string]: unknown;
}

export interface ServerObject {
    url: string;
    description?: string;
    name?: string;
    variables?: { [variable: string]: ServerVariableObject };

    [key: string]: unknown;
}

export interface DiscriminatorObject {
    propertyName: string;
    mapping?: { [key: string]: string };
    defaultMapping?: string;

    [key: string]: unknown;
}

export interface XmlObject {
    name?: string;
    namespace?: string;
    prefix?: string;
    attribute?: boolean;
    wrapped?: boolean;
    nodeType?: 'element' | 'attribute' | 'text' | 'cdata' | 'none' | string;

    [key: string]: unknown;
}

export interface LinkObject {
    operationRef?: string;
    operationId?: string;
    parameters?: { [name: string]: unknown | string };
    requestBody?: unknown;
    description?: string;
    server?: ServerObject;

    [key: string]: unknown;
}

export interface ExampleObject {
    summary?: string;
    description?: string;
    /**
     * Embedded literal example. The `value` field and `externalValue` field are mutually exclusive.
     * @deprecated for non-JSON serialization targets in OAS 3.2. Use `dataValue` and/or `serializedValue` instead.
     */
    value?: unknown;
    /**
     * A URI that identifies the literal example.
     */
    externalValue?: string;
    /**
     * An example of the data structure that MUST be valid according to the relevant Schema Object.
     * If this field is present, `value` MUST be absent.
     * (OAS 3.2)
     */
    dataValue?: unknown;
    /**
     * An example of the serialized form of the value.
     * If `dataValue` is present, then this field SHOULD contain the serialization of the given data.
     * (OAS 3.2)
     */
    serializedValue?: string;

    [key: string]: unknown;
}

export interface HeaderObject {
    description?: string;
    required?: boolean;
    deprecated?: boolean;
    schema?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array';
    format?: string;
    items?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    content?: Record<string, MediaTypeObject | ReferenceLike>;
    example?: unknown;
    examples?: Record<string, ExampleObject | ReferenceLike>;

    [key: string]: unknown;
}

export interface Parameter {
    name: string;
    in: 'query' | 'path' | 'header' | 'cookie' | 'formData' | 'querystring';
    required?: boolean;
    schema?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file';
    format?: string;
    description?: string;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    allowEmptyValue?: boolean;
    content?: Record<string, MediaTypeObject | ReferenceLike>;
    deprecated?: boolean;
    example?: unknown;
    examples?: Record<string, ExampleObject | ReferenceLike>;

    [key: string]: unknown;
}

export interface EncodingProperty {
    contentType?: string;
    headers?: Record<string, unknown>;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    encoding?: Record<string, EncodingProperty>;
    prefixEncoding?: EncodingProperty[];
    itemEncoding?: EncodingProperty;

    [key: string]: unknown;
}

export interface RequestBody {
    description?: string;
    required?: boolean;
    content?: Record<string, MediaTypeObject | ReferenceLike>;

    [key: string]: unknown;
}

export interface MediaTypeObject {
    schema?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    itemSchema?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    example?: unknown;
    examples?: Record<string, ExampleObject | ReferenceLike>;
    encoding?: Record<string, EncodingProperty>;
    prefixEncoding?: EncodingProperty[];
    itemEncoding?: EncodingProperty;

    [key: string]: unknown;
}

export interface SwaggerResponse {
    description?: string;
    summary?: string;
    content?: Record<string, MediaTypeObject | ReferenceLike>;
    links?: Record<string, LinkObject | ReferenceLike>;
    headers?: Record<string, HeaderObject | ReferenceLike>;

    [key: string]: unknown;
}

export interface SwaggerDefinition {
    type?:
        | 'string'
        | 'number'
        | 'integer'
        | 'boolean'
        | 'object'
        | 'array'
        | 'file'
        | 'null'
        | ('string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null')[];
    format?: string;
    description?: string;
    title?: string;
    default?: unknown;
    deprecated?: boolean;
    const?: unknown;
    maximum?: number;
    exclusiveMaximum?: boolean | number;
    minimum?: number;
    exclusiveMinimum?: boolean | number;
    maxLength?: number;
    minLength?: number;
    pattern?: string;
    maxItems?: number;
    minItems?: number;
    uniqueItems?: boolean;
    multipleOf?: number;
    minProperties?: number;
    maxProperties?: number;
    enum?: unknown[];
    items?: SwaggerDefinition | boolean | (SwaggerDefinition | boolean)[];
    prefixItems?: (SwaggerDefinition | boolean)[];
    contains?: SwaggerDefinition | boolean;
    minContains?: number;
    maxContains?: number;
    if?: SwaggerDefinition | boolean;
    then?: SwaggerDefinition | boolean;
    else?: SwaggerDefinition | boolean;
    not?: SwaggerDefinition | boolean;
    contentEncoding?: string;
    contentMediaType?: string;
    contentSchema?: SwaggerDefinition | boolean;
    unevaluatedProperties?: SwaggerDefinition | boolean;
    unevaluatedItems?: SwaggerDefinition | boolean;
    $schema?: string;
    $id?: string;
    $anchor?: string;
    $ref?: string;
    $dynamicRef?: string;
    $dynamicAnchor?: string;
    allOf?: (SwaggerDefinition | boolean)[];
    oneOf?: (SwaggerDefinition | boolean)[];
    anyOf?: (SwaggerDefinition | boolean)[];
    additionalProperties?: SwaggerDefinition | boolean;
    properties?: { [propertyName: string]: SwaggerDefinition | boolean };
    patternProperties?: { [pattern: string]: SwaggerDefinition | boolean };
    propertyNames?: SwaggerDefinition | boolean;
    dependentSchemas?: Record<string, SwaggerDefinition | boolean>;
    dependentRequired?: Record<string, string[]>;
    discriminator?: DiscriminatorObject;
    readOnly?: boolean;
    writeOnly?: boolean;
    nullable?: boolean;
    required?: string[];
    example?: unknown;
    examples?: unknown[];
    xml?: XmlObject;
    externalDocs?: ExternalDocumentationObject;

    [key: string]: unknown;
}

export interface SecurityScheme {
    type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect' | 'mutualTLS';
    description?: string;
    in?: 'header' | 'query' | 'cookie';
    name?: string;
    scheme?: 'bearer' | string;
    bearerFormat?: string;
    flows?: Record<string, unknown>;
    openIdConnectUrl?: string;
    oauth2MetadataUrl?: string;
    deprecated?: boolean;

    [key: string]: unknown;
}

export interface SpecOperation {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
    operationId?: string;
    consumes?: string[];
    produces?: string[];
    parameters?: unknown[];
    requestBody?: unknown;
    responses: Record<string, unknown>;
    schemes?: string[];
    deprecated?: boolean;
    security?: Record<string, string[]>[];
    servers?: ServerObject[];
    callbacks?: Record<string, PathItem | ReferenceLike>;

    [key: string]: unknown;
}

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
    query?: SpecOperation;
    additionalOperations?: Record<string, SpecOperation>;
    parameters?: unknown[];
    servers?: ServerObject[];

    [key: string]: unknown;
}

export interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    /** Swagger 2.0: Hostname (and optional port) serving the API. */
    host?: string;
    /** Swagger 2.0: Base path prefix for all API endpoints. */
    basePath?: string;
    /** Swagger 2.0: Transfer protocols (e.g., http, https). */
    schemes?: string[];
    /** Swagger 2.0: Default request body media types. */
    consumes?: string[];
    /** Swagger 2.0: Default response media types. */
    produces?: string[];
    $self?: string;
    info: InfoObject;
    externalDocs?: ExternalDocumentationObject;
    tags?: TagObject[];
    security?: Record<string, string[]>[];
    paths?: { [pathName: string]: PathItem };
    webhooks?: { [name: string]: PathItem };
    jsonSchemaDialect?: string;
    servers?: ServerObject[];
    definitions?: { [definitionsName: string]: SwaggerDefinition | boolean };
    components?: {
        schemas?: Record<string, SwaggerDefinition | boolean>;
        responses?: Record<string, SwaggerResponse | ReferenceLike>;
        securitySchemes?: Record<string, SecurityScheme | ReferenceLike>;
        pathItems?: Record<string, PathItem>;
        callbacks?: Record<string, PathItem | ReferenceLike>;
        links?: Record<string, LinkObject | ReferenceLike>;
        headers?: Record<string, HeaderObject | ReferenceLike>;
        parameters?: Record<string, Parameter | ReferenceLike>;
        requestBodies?: Record<string, RequestBody | ReferenceLike>;
        examples?: Record<string, ExampleObject | ReferenceLike>;
        mediaTypes?: Record<string, MediaTypeObject | ReferenceLike>;
        webhooks?: Record<string, PathItem | ReferenceLike>;
    };
    securityDefinitions?: { [securityDefinitionName: string]: SecurityScheme };

    [key: string]: unknown;
}
