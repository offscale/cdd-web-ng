// ===================================================================================
// OpenAPI / Swagger Specification Types
// ===================================================================================

export interface LicenseObject {
    name: string;
    url?: string;
    identifier?: string;

    [key: string]: any;
}

export interface ContactObject {
    name?: string;
    url?: string;
    email?: string;

    [key: string]: any;
}

export interface InfoObject {
    title: string;
    summary?: string;
    description?: string;
    termsOfService?: string;
    contact?: ContactObject;
    license?: LicenseObject;
    version: string;

    [key: string]: any;
}

export interface ExternalDocumentationObject {
    description?: string;
    url: string;

    [key: string]: any;
}

export interface TagObject {
    name: string;
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
    parent?: string;
    kind?: string;

    [key: string]: any;
}

export interface ServerVariableObject {
    enum?: string[];
    default: string;
    description?: string;

    [key: string]: any;
}

export interface ServerObject {
    url: string;
    description?: string;
    name?: string;
    variables?: { [variable: string]: ServerVariableObject };

    [key: string]: any;
}

export interface DiscriminatorObject {
    propertyName: string;
    mapping?: { [key: string]: string };
    defaultMapping?: string;

    [key: string]: any;
}

export interface XmlObject {
    name?: string;
    namespace?: string;
    prefix?: string;
    attribute?: boolean;
    wrapped?: boolean;
    nodeType?: 'element' | 'attribute' | 'text' | 'cdata' | 'none' | string;

    [key: string]: any;
}

export interface LinkObject {
    operationRef?: string;
    operationId?: string;
    parameters?: { [name: string]: any | string };
    requestBody?: any | string;
    description?: string;
    server?: ServerObject;

    [key: string]: any;
}

export interface ExampleObject {
    summary?: string;
    description?: string;
    /**
     * Embedded literal example. The `value` field and `externalValue` field are mutually exclusive.
     * @deprecated for non-JSON serialization targets in OAS 3.2. Use `dataValue` and/or `serializedValue` instead.
     */
    value?: any;
    /**
     * A URI that identifies the literal example.
     */
    externalValue?: string;
    /**
     * An example of the data structure that MUST be valid according to the relevant Schema Object.
     * If this field is present, `value` MUST be absent.
     * (OAS 3.2)
     */
    dataValue?: any;
    /**
     * An example of the serialized form of the value.
     * If `dataValue` is present, then this field SHOULD contain the serialization of the given data.
     * (OAS 3.2)
     */
    serializedValue?: string;

    [key: string]: any;
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
    content?: Record<string, MediaTypeObject | { $ref: string } | { $dynamicRef?: string }>;
    example?: any;
    examples?: Record<string, any>;

    [key: string]: any;
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
    content?: Record<string, MediaTypeObject | { $ref: string } | { $dynamicRef?: string }>;
    deprecated?: boolean;

    [key: string]: any;
}

export interface EncodingProperty {
    contentType?: string;
    headers?: Record<string, any>;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    encoding?: Record<string, EncodingProperty>;
    prefixEncoding?: EncodingProperty[];
    itemEncoding?: EncodingProperty;

    [key: string]: any;
}

export interface RequestBody {
    description?: string;
    required?: boolean;
    content?: Record<string, MediaTypeObject | { $ref: string } | { $dynamicRef?: string }>;

    [key: string]: any;
}

export interface MediaTypeObject {
    schema?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    itemSchema?: SwaggerDefinition | boolean | { $ref: string } | { $dynamicRef?: string };
    example?: any;
    examples?: Record<string, ExampleObject | { $ref: string }>;
    encoding?: Record<string, EncodingProperty>;
    prefixEncoding?: EncodingProperty[];
    itemEncoding?: EncodingProperty;

    [key: string]: any;
}

export interface SwaggerResponse {
    description?: string;
    summary?: string;
    content?: Record<string, MediaTypeObject | { $ref: string } | { $dynamicRef?: string }>;
    links?: Record<string, LinkObject | { $ref: string }>;
    headers?: Record<string, HeaderObject | { $ref: string }>;

    [key: string]: any;
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
    enum?: (string | number)[];
    items?: SwaggerDefinition | boolean | (SwaggerDefinition | boolean)[];
    prefixItems?: (SwaggerDefinition | boolean)[];
    if?: SwaggerDefinition | boolean;
    then?: SwaggerDefinition | boolean;
    else?: SwaggerDefinition | boolean;
    not?: SwaggerDefinition | boolean;
    contentEncoding?: string;
    contentMediaType?: string;
    contentSchema?: SwaggerDefinition | boolean;
    unevaluatedProperties?: SwaggerDefinition | boolean;
    $ref?: string;
    $dynamicRef?: string;
    $dynamicAnchor?: string;
    allOf?: (SwaggerDefinition | boolean)[];
    oneOf?: (SwaggerDefinition | boolean)[];
    anyOf?: (SwaggerDefinition | boolean)[];
    additionalProperties?: SwaggerDefinition | boolean;
    properties?: { [propertyName: string]: SwaggerDefinition | boolean };
    patternProperties?: { [pattern: string]: SwaggerDefinition | boolean };
    dependentSchemas?: Record<string, SwaggerDefinition | boolean>;
    discriminator?: DiscriminatorObject;
    readOnly?: boolean;
    writeOnly?: boolean;
    nullable?: boolean;
    required?: string[];
    example?: unknown;
    examples?: unknown[];
    xml?: XmlObject;
    externalDocs?: ExternalDocumentationObject;

    [key: string]: any;
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

    [key: string]: any;
}

export interface SpecOperation {
    tags?: string[];
    summary?: string;
    description?: string;
    externalDocs?: ExternalDocumentationObject;
    operationId?: string;
    consumes?: string[];
    produces?: string[];
    parameters?: any[];
    requestBody?: any;
    responses: Record<string, any>;
    schemes?: string[];
    deprecated?: boolean;
    security?: Record<string, string[]>[];
    servers?: ServerObject[];
    callbacks?: Record<string, PathItem | { $ref: string }>;

    [key: string]: any;
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
    parameters?: any[];
    servers?: ServerObject[];

    [key: string]: any;
}

export interface SwaggerSpec {
    openapi?: string;
    swagger?: string;
    $self?: string;
    info: InfoObject;
    externalDocs?: ExternalDocumentationObject;
    tags?: TagObject[];
    paths: { [pathName: string]: PathItem };
    webhooks?: { [name: string]: PathItem };
    jsonSchemaDialect?: string;
    servers?: ServerObject[];
    definitions?: { [definitionsName: string]: SwaggerDefinition | boolean };
    components?: {
        schemas?: Record<string, SwaggerDefinition | boolean>;
        responses?: Record<string, SwaggerResponse | { $ref: string }>;
        securitySchemes?: Record<string, SecurityScheme>;
        pathItems?: Record<string, PathItem>;
        callbacks?: Record<string, PathItem | { $ref: string }>;
        links?: Record<string, LinkObject | { $ref: string }>;
        headers?: Record<string, HeaderObject | { $ref: string }>;
        parameters?: Record<string, Parameter | { $ref: string }>;
        requestBodies?: Record<string, RequestBody | { $ref: string }>;
        examples?: Record<string, ExampleObject | { $ref: string }>;
        mediaTypes?: Record<string, MediaTypeObject | { $ref: string }>;
        webhooks?: Record<string, PathItem | { $ref: string }>;
    };
    securityDefinitions?: { [securityDefinitionName: string]: SecurityScheme };

    [key: string]: any;
}
