import { OptionalKind, ParameterDeclarationStructure } from "ts-morph";

/**
 * Represents the serialization strategy for a specific parameter.
 * This abstracts "How" a parameter interacts with the URL/Headers/Body.
 */
export interface ParamSerialization {
    paramName: string; // The name of the variable in the method signature
    originalName: string; // The name in the HTTP request (e.g. header name)
    style?: string;
    explode: boolean;
    allowReserved: boolean;
    serializationLink?: 'json' | undefined; // Explicit hint if complex serialization needed
}

/**
 * Describes the request body configuration.
 */
export type BodyVariant =
    | { type: 'json'; paramName: string; }
    | { type: 'xml'; paramName: string; rootName: string; config: any }
    | { type: 'multipart'; paramName: string; config: any }
    | { type: 'urlencoded'; paramName: string; config: any }
    | { type: 'raw'; paramName: string; }
    | { type: 'encoded-form-data'; paramName: string; mappings: string[] } // For legacy formdata loops
    ;

/**
 * The Intermediate Representation (IR) of a Service Method.
 * This model is framework-agnostic regarding *how* the request is made,
 * but specific about *what* the request consists of.
 */
export interface ServiceMethodModel {
    methodName: string;
    httpMethod: string;
    urlTemplate: string; // e.g. "/users/{id}"

    // Documentation
    docs?: string;
    isDeprecated: boolean;

    // Method Signature
    parameters: OptionalKind<ParameterDeclarationStructure>[];
    responseType: string;

    // Request Construction Logic
    pathParams: ParamSerialization[];
    queryParams: ParamSerialization[];
    headerParams: ParamSerialization[];
    cookieParams: ParamSerialization[];

    // Body Logic
    body?: BodyVariant;

    // Context / Config
    security: Record<string, string[]>[]; // Effective security requirements
    hasServers: boolean; // If true, method overrides base path
    basePath?: string; // If hasServers is true
}
