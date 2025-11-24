import {
    ExternalDocumentationObject,
    HeaderObject,
    LinkObject,
    Parameter,
    PathItem,
    ServerObject,
    SwaggerDefinition
} from "./openapi.js";

// ===================================================================================
// SECTION: Derived Types for Admin UI Generation & Parsing
// ===================================================================================

/** A single encoding definition for a multipart property. */
export interface EncodingProperty {
    contentType?: string;
    headers?: Record<string, any>;
    style?: string;
    explode?: boolean;
    allowReserved?: boolean;
    [key: string]: any;
}

/** Represents the request body of an operation. */
export interface RequestBody {
    required?: boolean;
    content?: Record<string, {
        schema?: SwaggerDefinition | { $ref: string };
        encoding?: Record<string, EncodingProperty>;
    }>;
    [key: string]: any;
}

/** Represents a single response from an API Operation. */
export interface SwaggerResponse {
    description?: string;
    content?: Record<string, { schema?: SwaggerDefinition | { $ref: string } }>;
    links?: Record<string, LinkObject | { $ref: string }>;
    headers?: Record<string, HeaderObject | { $ref: string }>;
    [key: string]: any;
}

/** A processed, unified representation of a single API operation (e.g., GET /users/{id}). */
export interface PathInfo {
    path: string;
    method: string;
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
    externalDocs?: ExternalDocumentationObject;
    tags?: string[];
    consumes?: string[];
    parameters?: Parameter[];
    requestBody?: RequestBody;
    responses?: Record<string, SwaggerResponse>;
    methodName?: string;
    security?: { [key: string]: string[] }[];
    servers?: ServerObject[] | undefined;
    callbacks?: Record<string, PathItem | { $ref: string }>;
    [key: string]: any;
}

/** A processed representation of an API operation, classified for UI generation. */
export interface ResourceOperation {
    action: 'list' | 'create' | 'getById' | 'update' | 'delete' | string;
    path: string;
    method: string;
    operationId?: string;
    methodName?: string;
    methodParameters?: Parameter[];
    isCustomItemAction?: boolean;
    isCustomCollectionAction?: boolean;
}

/** Represents a logical API resource (e.g., "Users"), derived by grouping related paths. */
export interface Resource {
    name: string;
    modelName: string;
    operations: ResourceOperation[];
    isEditable: boolean;
    formProperties: FormProperty[];
    listProperties: FormProperty[];
}

/** A simple wrapper for a property's name and its underlying schema, used for templating. */
export interface FormProperty {
    name: string;
    schema: SwaggerDefinition;
}
