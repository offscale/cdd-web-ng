import { Project, SourceFile } from 'ts-morph';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, SwaggerDefinition } from '../../../core/types.js';
import { getTypeScriptType, pascalCase } from '../../../core/utils.js';
import { TYPE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

/**
 * Generates the `models/index.ts` file containing all TypeScript interfaces,
 * enums, and type aliases derived from the OpenAPI specification's schemas.
 */
export class TypeGenerator {
    /**
     * Initializes a new instance of the `TypeGenerator`.
     * @param parser The `SwaggerParser` instance.
     * @param project The `ts-morph` project instance.
     * @param config The global generator configuration.
     */
    constructor(
        private readonly parser: SwaggerParser,
        private readonly project: Project,
        private readonly config: GeneratorConfig
    ) {}

    /**
     * Generates the models file and populates it with all defined types.
     * @param outDir The root output directory for the generated library.
     */
    public generate(outDir: string): void {
        const modelsDir = `${outDir}/models`;
        this.project.getFileSystem().mkdirSync(modelsDir);
        const sourceFile = this.project.createSourceFile(`${modelsDir}/index.ts`, '', { overwrite: true });

        sourceFile.addStatements(TYPE_GENERATOR_HEADER_COMMENT);
        this.addCommonAngularImports(sourceFile);

        for (const schema of this.parser.schemas) {
            if (schema.definition.enum) {
                this.generateEnum(sourceFile, schema.name, schema.definition);
            } else {
                this.generateInterface(sourceFile, schema.name, schema.definition);
            }
        }
        this.addRequestOptionsInterface(sourceFile);
    }

    /**
     * Generates a TypeScript `enum` or a string literal union `type` for an OpenAPI enum definition.
     * @param sourceFile The `ts-morph` SourceFile to add the enum to.
     * @param name The name of the enum.
     * @param definition The schema definition for the enum.
     * @private
     */
    private generateEnum(sourceFile: SourceFile, name: string, definition: SwaggerDefinition): void {
        const isStringEnum = (definition.enum?.every(e => typeof e === 'string')) ?? false;
        // Generate a real 'enum' for string enums if style is 'enum', otherwise use a union type.
        // This branch is now covered by tests.
        if (isStringEnum && this.config.options.enumStyle === 'enum') {
            sourceFile.addEnum({ name, isExported: true, members: definition.enum!.map(val => ({ name: pascalCase(val as string), value: val as string })) });
        } else {
            sourceFile.addTypeAlias({ name, isExported: true, type: definition.enum?.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(' | ') ?? 'any' });
        }
    }

    /**
     * Generates a TypeScript `interface` or `type` alias for an OpenAPI schema.
     * @param sourceFile The `ts-morph` SourceFile to add the interface/type to.
     * @param name The name of the interface/type.
     * @param definition The schema definition.
     * @private
     */
    private generateInterface(sourceFile: SourceFile, name: string, definition: SwaggerDefinition): void {
        const knownTypes = this.parser.schemas.map(s => s.name);

        if (definition.properties || (definition.type === 'object' && definition.additionalProperties)) {
            // Generate an interface for objects with properties or index signatures.
            sourceFile.addInterface({
                name,
                isExported: true,
                properties: Object.entries(definition.properties || {}).map(([key, propDef]) => ({
                    name: /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`,
                    type: getTypeScriptType(propDef, this.config, knownTypes),
                    hasQuestionToken: !(definition.required || []).includes(key),
                    docs: propDef.description ? [propDef.description] : [], // This now correctly adds TSDoc to properties.
                })),
                ...(definition.additionalProperties && {
                    indexSignatures: [{
                        keyName: 'key', keyType: 'string',
                        returnType: definition.additionalProperties === true ? 'any' : getTypeScriptType(definition.additionalProperties as SwaggerDefinition, this.config, knownTypes)
                    }]
                })
            });
        } else {
            // This branch is now covered by a test. It handles non-object schemas (e.g., aliases for primitives).
            const typeString = getTypeScriptType(definition, this.config, knownTypes);
            sourceFile.addTypeAlias({ name, isExported: true, type: typeString });
        }
    }

    private addCommonAngularImports(sourceFile: SourceFile): void {
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/common/http', namedImports: ['HttpHeaders', 'HttpContext', 'HttpParams'] });
    }

    private addRequestOptionsInterface(sourceFile: SourceFile): void {
        sourceFile.addInterface({
            name: 'RequestOptions', isExported: true,
            docs: ["A common interface for providing optional parameters to HTTP requests."],
            properties: [
                { name: 'headers?', type: 'HttpHeaders | { [header: string]: string | string[]; }' },
                { name: 'context?', type: 'HttpContext' },
                { name: 'params?', type: 'HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>; }' },
                { name: 'reportProgress?', type: 'boolean' },
                { name: 'withCredentials?', type: 'boolean' },
            ]
        });
    }
}
