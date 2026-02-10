import {
    ExternalDocumentationObject,
    Parameter,
    PathItem,
    RequestBody,
    ServerObject,
    SwaggerDefinition,
    SwaggerResponse,
} from './openapi.js';

// ===================================================================================
// Derived Types for Admin UI Generation & Parsing
// ===================================================================================

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
    /** The classified action (e.g., 'list', 'create', 'getById', 'update', 'delete'). */
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
    /** True if the resource has any operations that modify data. */
    isEditable: boolean;
    /** All properties of the model, used for generating the create/edit form. */
    formProperties: FormProperty[];
    /** A subset of properties suitable for display in a list or table view. */
    listProperties: FormProperty[];
}

/** A simple wrapper for a property's name and its underlying schema, used for templating. */
export interface FormProperty {
    name: string;
    schema: SwaggerDefinition | boolean;
}
