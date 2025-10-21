import { Project, SourceFile, OptionalKind, PropertySignatureStructure, IndexSignatureDeclarationStructure } from 'ts-morph';
import * as path from 'path';
import { SwaggerParser } from '../../../core/parser.js';
import { GeneratorConfig, SwaggerDefinition } from '../../../core/types.js';
import { pascalCase, getTypeScriptType } from '../../../core/utils.js';
import { TYPE_GENERATOR_HEADER_COMMENT } from '../../../core/constants.js';

export class TypeGenerator {
    private generatedTypes = new Set<string>();

    constructor(private parser: SwaggerParser, private project: Project, private config: GeneratorConfig) {}

    generate(outputRoot: string) {
        const modelsDir = path.join(outputRoot, 'models');
        const sourceFile = this.project.createSourceFile(path.join(modelsDir, 'index.ts'), '', { overwrite: true });
        sourceFile.addStatements(TYPE_GENERATOR_HEADER_COMMENT);

        const definitions = this.parser.getDefinitions();
        Object.keys(definitions).forEach(name => this.generatedTypes.add(pascalCase(name)));

        for (const [name, definition] of Object.entries(definitions)) {
            const resolvedName = pascalCase(name);
            if (definition.enum) {
                this.generateEnum(sourceFile, resolvedName, definition);
            } else if (definition.allOf) {
                this.generateCompositeType(sourceFile, resolvedName, definition);
            } else {
                this.generateInterface(sourceFile, resolvedName, definition);
            }
        }

        sourceFile.addInterface({
            name: "RequestOptions",
            isExported: true,
            properties: [
                { name: 'headers?', type: 'HttpHeaders' },
                { name: 'context?', type: 'HttpContext' },
                { name: 'observe?', type: `'body' | 'events' | 'response'` },
                { name: 'params?', type: 'HttpParams | { [param: string]: string | number | boolean | ReadonlyArray<string | number | boolean>; }' },
                { name: 'reportProgress?', type: 'boolean' },
                { name: 'responseType?', type: `'arraybuffer' | 'blob' | 'json' | 'text'` },
                { name: 'withCredentials?', type: 'boolean' },
            ]
        });
        sourceFile.addImportDeclaration({ moduleSpecifier: '@angular/common/http', namedImports: ['HttpHeaders', 'HttpContext', 'HttpParams']});
    }

    private generateEnum(sourceFile: SourceFile, name: string, definition: SwaggerDefinition) {
        const isStringEnum = definition.enum?.every(v => typeof v === 'string');
        if (this.config.options.enumStyle === 'enum' && isStringEnum) {
            sourceFile.addEnum({
                name,
                isExported: true,
                members: definition.enum!.map(value => ({ name: pascalCase(String(value)).replace(/[^a-zA-Z0-9_]/g, ''), value: String(value) }))
            });
        } else {
            sourceFile.addTypeAlias({
                name,
                isExported: true,
                type: definition.enum?.map(v => typeof v === 'string' ? `'${v.replace(/'/g, "\\'")}'` : v).join(' | ') || 'never'
            });
        }
    }

    private generateCompositeType(sourceFile: SourceFile, name: string, definition: SwaggerDefinition) {
        const types = definition.allOf!.map(d => this.resolveSwaggerType(d)).join(' & ');
        sourceFile.addTypeAlias({
            name,
            isExported: true,
            type: types || 'any'
        });
    }

    private generateInterface(sourceFile: SourceFile, name: string, definition: SwaggerDefinition) {
        sourceFile.addInterface({
            name,
            isExported: true,
            properties: this.createInterfaceProperties(definition),
            indexSignatures: this.createIndexSignatures(definition),
        });
    }

    private createInterfaceProperties(def: SwaggerDefinition): OptionalKind<PropertySignatureStructure>[] {
        if (!def.properties) return [];
        return Object.entries(def.properties).map(([key, prop]) => ({
            name: /[^\w$]/.test(key) ? `"${key}"` : key,
            type: this.resolveSwaggerType(prop),
            hasQuestionToken: !def.required?.includes(key),
            isReadonly: prop.readOnly,
            docs: prop.description ? [prop.description] : undefined,
        }));
    }

    private createIndexSignatures(def: SwaggerDefinition): OptionalKind<IndexSignatureDeclarationStructure>[] {
        if (def.additionalProperties && typeof def.additionalProperties === 'object') {
            return [{
                keyName: 'key',
                keyType: 'string',
                returnType: this.resolveSwaggerType(def.additionalProperties)
            }];
        }
        if (def.additionalProperties === true) {
            return [{ keyName: 'key', keyType: 'string', returnType: 'any' }];
        }
        return [];
    }

    private resolveSwaggerType(schema: SwaggerDefinition): string {
        if (schema.$ref) return pascalCase(schema.$ref.split('/').pop()!);

        if (schema.oneOf || schema.anyOf) {
            return (schema.oneOf || schema.anyOf)!.map(s => this.resolveSwaggerType(s)).filter(t => t !== 'any').join(' | ') || 'any';
        }

        if (schema.allOf) {
            return schema.allOf.map(s => this.resolveSwaggerType(s)).filter(t => t !== 'any').join(' & ') || 'any';
        }

        return getTypeScriptType(schema, this.config);
    }
}
