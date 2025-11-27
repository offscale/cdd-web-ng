import { ModuleKind, ScriptTarget } from 'ts-morph';
import { SwaggerSpec } from './openapi.js';

/** Options that customize the output of the generated code. */
export interface GeneratorConfigOptions {
    /**
     * The target framework for generation.
     * - 'angular': Generates Angular services, interceptors, and modules.
     * - 'react': (Future) Generates React hooks and functional components.
     * - 'vue': (Future) Generates Vue composables.
     * @default 'angular'
     */
    framework?: 'angular' | 'react' | 'vue';
    /** The TypeScript type to use for properties with `format: "date"` or `"date-time"`. */
    dateType?: 'string' | 'Date';
    /**
     * The TypeScript type to use for `integer` types with `format: "int64"`.
     * Default is 'number', but 'string' is often safer for browser JS due to precision limit (2^53).
     */
    int64Type?: 'number' | 'string' | 'bigint';
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
    /**
     * Target runtime platform for the generated code.
     * - 'browser': (Default) Assumes standard browser environment. Cookie setting in headers will emit warnings.
     * - 'node': Assumes Node.js/SSR environment. Cookie setting is allowed without warnings.
     */
    platform?: 'browser' | 'node';
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
