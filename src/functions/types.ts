// src/analysis/service-method-types.ts
import { OptionalKind, ParameterDeclarationStructure } from 'ts-morph';
import { ServerObject } from '@src/core/types/index.js';

export interface ParamSerialization {
    paramName: string;
    originalName: string;
    style?: string;
    explode: boolean;
    allowReserved: boolean;
    contentType?: string;
    encoding?: Record<string, unknown>;
    contentEncoderConfig?: Record<string, unknown>;
    serializationLink?: 'json' | 'json-subset' | undefined;
}

export type BodyVariant =
    | { type: 'json'; paramName: string }
    | { type: 'json-lines'; paramName: string }
    | { type: 'json-seq'; paramName: string }
    | { type: 'xml'; paramName: string; rootName: string; config: Record<string, unknown> }
    | { type: 'multipart'; paramName: string; config: Record<string, unknown> }
    | { type: 'urlencoded'; paramName: string; config: Record<string, unknown> }
    | { type: 'raw'; paramName: string }
    | { type: 'encoded-form-data'; paramName: string; mappings: string[] };

export type ResponseSerialization =
    | 'json'
    | 'text'
    | 'blob'
    | 'arraybuffer'
    | 'sse'
    | 'json-seq'
    | 'json-lines'
    | 'xml';

export interface ResponseVariant {
    mediaType: string;
    type: string;
    serialization: ResponseSerialization;
    xmlConfig?: Record<string, unknown>;
    decodingConfig?: Record<string, unknown>;
    sseMode?: 'event' | 'data';
    isDefault: boolean;
}

export interface ErrorResponseInfo {
    code: string;
    type: string;
    description?: string;
}

export interface ServiceMethodModel {
    methodName: string;
    httpMethod: string;
    urlTemplate: string;

    docs?: string;
    isDeprecated: boolean;

    parameters: OptionalKind<ParameterDeclarationStructure>[];

    responseType: string;
    responseSerialization: ResponseSerialization;
    responseXmlConfig?: Record<string, unknown>;
    responseDecodingConfig?: Record<string, unknown>;
    sseMode?: 'event' | 'data';

    responseVariants: ResponseVariant[];

    requestEncodingConfig?: Record<string, unknown>;

    errorResponses: ErrorResponseInfo[];

    pathParams: ParamSerialization[];
    queryParams: ParamSerialization[];
    headerParams: ParamSerialization[];
    cookieParams: ParamSerialization[];

    body?: BodyVariant;
    requestContentType?: string;

    security: Record<string, string[]>[];
    extensions: Record<string, unknown>;
    hasServers: boolean;
    basePath?: string;
    operationServers?: ServerObject[];
}
