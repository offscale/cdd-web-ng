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
    parameters?: { [name: string]: any | string; };
    requestBody?: any | string;
    description?: string;
    server?: ServerObject;

    [key: string]: any;
}

export interface ExampleObject {
    summary?: string;
    description?: string;
    value?: any;
    externalValue?: string;

    [key: string]: any;
}

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

    [key: string]: any;
}

export interface Parameter {
    name: string;
    in: "query" | "path" | "header" | "cookie" | "formData" | "querystring";
    required?: boolean;
    schema?: SwaggerDefinition | { $ref: string };
    type?: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file';
    format?: string;
    description?: string;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    allowEmptyValue?: boolean;
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
    deprecated?: boolean;

    [key: string]: any;
}

export interface EncodingProperty {
    contentType?: string;
    headers?: Record<string, any>;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;

    [key: string]: any;
}

export interface RequestBody {
    required?: boolean;
    content?: Record<string, {
        schema?: SwaggerDefinition | { $ref: string };
        itemSchema?: SwaggerDefinition | { $ref: string };
        encoding?: Record<string, EncodingProperty>;
        prefixEncoding?: EncodingProperty[];
        itemEncoding?: EncodingProperty;
    }>;

    [key: string]: any;
}

export interface SwaggerResponse {
    description?: string;
    content?: Record<string, {
        schema?: SwaggerDefinition | { $ref: string };
        itemSchema?: SwaggerDefinition | { $ref: string };
    }>;
    links?: Record<string, LinkObject | { $ref: string }>;
    headers?: Record<string, HeaderObject | { $ref: string }>;

    [key: string]: any;
}

export interface SwaggerDefinition {
    type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "file" | "null" | ("string" | "number" | "integer" | "boolean" | "object" | "array" | "null")[];
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
    items?: SwaggerDefinition | SwaggerDefinition[];
    prefixItems?: SwaggerDefinition[];
    if?: SwaggerDefinition;
    then?: SwaggerDefinition;
    else?: SwaggerDefinition;
    not?: SwaggerDefinition;
    contentEncoding?: string;
    contentMediaType?: string;
    contentSchema?: SwaggerDefinition;
    unevaluatedProperties?: SwaggerDefinition | boolean;
    $ref?: string;
    $dynamicRef?: string;
    $dynamicAnchor?: string;
    allOf?: SwaggerDefinition[];
    oneOf?: SwaggerDefinition[];
    anyOf?: SwaggerDefinition[];
    additionalProperties?: SwaggerDefinition | boolean;
    properties?: { [propertyName: string]: SwaggerDefinition };
    patternProperties?: { [pattern: string]: SwaggerDefinition };
    dependentSchemas?: Record<string, SwaggerDefinition>;
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
    in?: 'header' | 'query' | 'cookie';
    name?: string;
    scheme?: 'bearer' | string;
    flows?: Record<string, unknown>;
    openIdConnectUrl?: string;

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
    definitions?: { [definitionsName: string]: SwaggerDefinition };
    components?: {
        schemas?: Record<string, SwaggerDefinition>;
        securitySchemes?: Record<string, SecurityScheme>;
        pathItems?: Record<string, PathItem>;
        callbacks?: Record<string, PathItem | { $ref: string }>;
        links?: Record<string, LinkObject | { $ref: string }>;
        headers?: Record<string, HeaderObject | { $ref: string }>;
    };
    securityDefinitions?: { [securityDefinitionName: string]: SecurityScheme };

    [key: string]: any;
}
