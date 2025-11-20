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

        this.addRequestOptionsInterface(sourceFile);
    }

    /**
     * Analyzes a single schema definition and delegates to the correct generator function
     * based on its structure. This method acts as a dispatcher to handle the different
     * ways a schema can be defined in OpenAPI.
     * @param sourceFile The ts-morph SourceFile to which the type will be added.
     * @param name The PascalCase name for the generated type.
     * @param definition The schema definition object from the specification.
     * @private
     */
    private generateTypeFromSchema(sourceFile: SourceFile, name: string, definition: SwaggerDefinition): void {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const docs = definition.description ? [definition.description] : [];
        if (definition.externalDocs?.url) {
            docs.push(`@see ${definition.externalDocs.url} ${definition.externalDocs.description || ''}`.trim());
        }

        // Case 1: Handle schemas with an empty `enum` array, which should resolve to `any`.
        if (definition.enum && definition.enum.length === 0) {
            sourceFile.addTypeAlias({ name, isExported: true, type: 'any', docs });
            return;
        }

        // Case 2: Handle `allOf` composition by creating an intersection type alias (e.g., `TypeA & TypeB`).
        if (definition.allOf) {
            const typeString = getTypeScriptType(definition, this.config, knownTypes);
            sourceFile.addTypeAlias({ name, isExported: true, type: typeString, docs });
            return;
        }

        // Case 3: Handle string enums based on the `enumStyle` configuration.
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

        // Case 4: Handle standard object schemas by generating a TypeScript interface.
        if (definition.type === 'object' || definition.properties) {
            this.generateInterface(sourceFile, name, definition, docs);
            return;
        }

        // Case 5: As a fallback, generate a type alias. This covers primitive types,
        // union-style enums (if `enumStyle` is 'union'), and other miscellaneous schemas.
        const typeString = getTypeScriptType(definition, this.config, knownTypes);
        sourceFile.addTypeAlias({ name, isExported: true, type: typeString, docs });
    }

    /**
     * Generates a TypeScript `interface` for a given object schema definition.
     * It handles properties, optionality (`required` keyword), and `additionalProperties`.
     * @param sourceFile The ts-morph SourceFile to which the interface will be added.
     * @param name The PascalCase name for the interface.
     * @param definition The schema definition object.
     * @param docs An array of strings for the TSDoc comment on the interface.
     * @private
     */
    private generateInterface(sourceFile: SourceFile, name: string, definition: SwaggerDefinition, docs: string[]): void {
        const knownTypes = this.parser.schemas.map(s => s.name);
        const interfaceDeclaration = sourceFile.addInterface({
            name,
            isExported: true,
            docs,
        });

        // Generate properties for the interface.
        if (definition.properties) {
            interfaceDeclaration.addProperties(Object.entries(definition.properties).map(([key, propDef]) => {

                // Build property documentation including specific OpenAPI 3.1 fields
                const propDocs: string[] = [];
                if (propDef.description) {
                    propDocs.push(propDef.description);
                }
                if (propDef.contentEncoding) {
                    propDocs.push(`Content Encoding: ${propDef.contentEncoding}`);
                }
                if (propDef.contentMediaType) {
                    propDocs.push(`Content Media Type: ${propDef.contentMediaType}`);
                }
                if (propDef.externalDocs?.url) {
                    propDocs.push(`@see ${propDef.externalDocs.url} ${propDef.externalDocs.description || ''}`);
                }

                return {
                    // Quote property names that are not valid TS identifiers (e.g., 'with-hyphen').
                    name: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`,
                    type: getTypeScriptType(propDef, this.config, knownTypes),
                    hasQuestionToken: !(definition.required || []).includes(key),
                    docs: propDocs,
                };
            }));
        }

        // Add an index signature if `additionalProperties` is defined.
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
     * Adds common Angular HTTP imports to the models file, as they are needed for the
     * `RequestOptions` interface.
     * @param sourceFile The ts-morph SourceFile to modify.
     * @private
     */
    private addCommonAngularImports(sourceFile: SourceFile): void {
        sourceFile.addImportDeclaration({
            moduleSpecifier: '@angular/common/http',
            namedImports: ['HttpHeaders', 'HttpContext', 'HttpParams']
        });
    }

    /**
     * Adds a standardized `RequestOptions` interface to the models file. This provides
     * a consistent way for generated services to accept optional HTTP request parameters.
     * @param sourceFile The ts-morph SourceFile to modify.
     * @private
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
