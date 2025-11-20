import { Project, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, SwaggerDefinition } from '../../../core/types.js';
import { getTypeScriptType, pascalCase } from '../../../core/utils.js';
import { TYPE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `models/index.ts` file, which contains all TypeScript interfaces,
 * enums, and type aliases derived from the schemas in an OpenAPI specification.
 * This class is responsible for interpreting various schema structures (`allOf`, `enum`, `object`, etc.)
 * and converting them into appropriate, well-formed TypeScript types.
 */
export class TypeGenerator {
    /**
     * @param parser The `SwaggerParser` instance containing the loaded specification.
     * @param project The `ts-morph` project instance for AST manipulation.
     * @param config The global generator configuration.
     */
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
        private readonly config: GeneratorConfig
    ) {
    }

    /**
     * The main entry point for the generator. It creates the `models/index.ts` file
     * and populates it with all the generated types from the specification.
     * @param outDir The root output directory for the generated library (e.g., 'generated').
     */
    public generate(outDir: string): void {
        const modelsDir = `${outDir}/models`;
        this.project.getFileSystem().mkdirSync(modelsDir);
        const sourceFile = this.project.createSourceFile(`${modelsDir}/index.ts`, '', { overwrite: true });

        sourceFile.addStatements(TYPE_GENERATOR_HEADER_COMMENT);
        this.addCommonAngularImports(sourceFile);

        for (const schema of this.parser.schemas) {
            this.generateTypeFromSchema(sourceFile, schema.name, schema.definition);
        }

        this.generateWebhookTypes(sourceFile);

        this.addRequestOptionsInterface(sourceFile);
    }

    private generateWebhookTypes(sourceFile: SourceFile): void {
        const spec = this.parser.spec;
        if (!spec.webhooks) return;

        for (const [name, pathItem] of Object.entries(spec.webhooks)) {
            const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'trace'];
            for (const method of methods) {
                const operation = (pathItem as any)[method];
                if (operation && operation.requestBody && operation.requestBody.content) {
                    for (const [_, content] of Object.entries(operation.requestBody.content)) {
                        if ((content as any).schema) {
                            const typeName = `${pascalCase(name)}Webhook`;
                            const description = operation.description || operation.summary || `Webhook payload for ${name}`;
                            const definition = (content as any).schema as SwaggerDefinition;
                            const definitionWithDocs = {
                                ...definition,
                                description: definition.description || description
                            };
                            this.generateTypeFromSchema(sourceFile, typeName, definitionWithDocs);
                        }
                    }
                }
            }
        }
    }

    /**
     * Analyzes a single schema definition and delegates to the correct generator function
     * based on its structure. This method acts as a dispatcher to handle the different
     * ways a schema can be defined in OpenAPI.
     */
    private generateTypeFromSchema(sourceFile: SourceFile, name: string, definition: SwaggerDefinition): void {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const docs = definition.description ? [definition.description] : [];
        if (definition.externalDocs?.url) {
            docs.push(`@see ${definition.externalDocs.url} ${definition.externalDocs.description || ''}`.trim());
        }

        if (definition.enum && definition.enum.length === 0) {
            sourceFile.addTypeAlias({ name, isExported: true, type: 'any', docs });
            return;
        }

        if (definition.allOf) {
            const typeString = getTypeScriptType(definition, this.config, knownTypes);
            sourceFile.addTypeAlias({ name, isExported: true, type: typeString, docs });
            return;
        }

        const isStringEnum = (definition.enum?.every(e => typeof e === 'string')) ?? false;
        if (isStringEnum && this.config.options.enumStyle === 'enum') {
            sourceFile.addEnum({
                name,
                isExported: true,
                docs,
                members: definition.enum!.map(val => ({ name: pascalCase(val as string), value: val as string }))
            });
            return;
        }

        if (definition.type === 'object' || definition.properties) {
            // Generate main interface
            this.generateInterface(sourceFile, name, definition, docs, 'response');

            // Check if we need a separate Request interface
            if (this.needsRequestType(definition)) {
                const requestDocs = [...docs, `Request object for ${name}. Omitted readOnly properties.`];
                this.generateInterface(sourceFile, `${name}Request`, definition, requestDocs, 'request');
            }
            return;
        }

        const typeString = getTypeScriptType(definition, this.config, knownTypes);
        sourceFile.addTypeAlias({ name, isExported: true, type: typeString, docs });
    }

    /** Checks if a definition has readOnly or writeOnly properties requiring a split. */
    private needsRequestType(definition: SwaggerDefinition): boolean {
        if (!definition.properties) return false;
        return Object.values(definition.properties).some(p => p.readOnly || p.writeOnly);
    }

    /**
     * Generates a TypeScript `interface` for a given object schema definition.
     * It handles properties, optionality (`required` keyword), and `additionalProperties`.
     *
     * @param mode 'response' = standard/response view (no writeOnly), 'request' = request view (no readOnly).
     */
    private generateInterface(sourceFile: SourceFile, name: string, definition: SwaggerDefinition, docs: string[], mode: 'response' | 'request'): void {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const interfaceDeclaration = sourceFile.addInterface({
            name,
            isExported: true,
            docs,
        });

        if (definition.properties) {
            interfaceDeclaration.addProperties(Object.entries(definition.properties).map(([key, propDef]) => {
                // MODE: Response
                // Skip if property is writeOnly.
                if (mode === 'response' && propDef.writeOnly) {
                    return null;
                }
                // Mark as readonly if property is readOnly.
                const isReadOnly = mode === 'response' && propDef.readOnly;

                // MODE: Request
                // Skip if property is readOnly.
                if (mode === 'request' && propDef.readOnly) {
                    return null;
                }

                const propDocs: string[] = [];
                if (propDef.description) propDocs.push(propDef.description);
                if (propDef.contentEncoding) propDocs.push(`Content Encoding: ${propDef.contentEncoding}`);
                if (propDef.contentMediaType) propDocs.push(`Content Media Type: ${propDef.contentMediaType}`);
                if (propDef.externalDocs?.url) propDocs.push(`@see ${propDef.externalDocs.url} ${propDef.externalDocs.description || ''}`);

                return {
                    name: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`,
                    type: getTypeScriptType(propDef, this.config, knownTypes),
                    // In Request mode, optionality follows valid rules. writeOnly fields are standard optional/required.
                    // However, in complex scenarios, some fields might be strictly required in requests.
                    hasQuestionToken: !(definition.required || []).includes(key),
                    isReadonly: !!isReadOnly,
                    docs: propDocs,
                };
            }).filter((p): p is NonNullable<typeof p> => p !== null));
        }

        if (definition.additionalProperties) {
            const returnType = definition.additionalProperties === true
                ? 'any'
                : getTypeScriptType(definition.additionalProperties as SwaggerDefinition, this.config, knownTypes);

            interfaceDeclaration.addIndexSignature({
                keyName: 'key',
                keyType: 'string',
                returnType,
            });
        }
    }

    /**
     * Adds common Angular HTTP imports to the models file.
     */
    private addCommonAngularImports(sourceFile: SourceFile): void {
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: ['HttpHeaders', 'HttpContext', 'HttpParams']
        });
    }

    /**
     * Adds the `RequestOptions` interface.
     */
    private addRequestOptionsInterface(sourceFile: SourceFile): void {
        sourceFile.addInterface({
            name: 'RequestOptions',
            isExported: true,
            docs: ["A common interface for providing optional parameters to HTTP requests."],
            properties: [
                { name: 'headers?', type: 'HttpHeaders | { [header: string]: string | string[]; }' },
                { name: 'context?', type: 'HttpContext' },
                {
                    name: 'params?',
                    type: 'HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>; }'
                },
                { name: 'reportProgress?', type: 'boolean' },
                { name: 'withCredentials?', type: 'boolean' },
            ]
        });
    }
}
