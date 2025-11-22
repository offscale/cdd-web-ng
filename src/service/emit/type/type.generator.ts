import * as path from "node:path";
import {
    JSDocStructure,
    JSDocTagStructure,
    OptionalKind,
    Project,
    PropertySignatureStructure,
    SourceFile
} from "ts-morph";
import { GeneratorConfig, HeaderObject, PathItem, SwaggerDefinition } from "@src/core/types.js";
import { SwaggerParser } from "@src/core/parser.js";
import { extractPaths, getTypeScriptType, pascalCase } from "@src/core/utils.js";

export class TypeGenerator {
    constructor(
        private parser: SwaggerParser,
        private project: Project,
        private config: GeneratorConfig
    ) {
    }

    public generate(outputDir: string): void {
        const modelsDir = path.join(outputDir, "models");
        const filePath = path.join(modelsDir, "index.ts");
        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        const definitions = this.parser.schemas;

        const processDefinition = (name: string, def: SwaggerDefinition) => {
            if (def.enum) {
                this.generateEnum(sourceFile, name, def);
            } else if (this.shouldGenerateInterface(def)) {
                this.generateInterface(sourceFile, name, def);
            } else {
                this.generateTypeAlias(sourceFile, name, def);
            }
        };

        // 1. Type Definitions
        definitions.forEach(def => processDefinition(def.name, def.definition));

        // 2. Webhooks (treated as models for payload typing)
        const spec = this.parser.getSpec();
        if (spec.webhooks) {
            Object.entries(spec.webhooks).forEach(([name, pathItem]) => {
                const postOp = (pathItem as any).post;
                if (postOp && postOp.requestBody) {
                    const content = postOp.requestBody.content || {};
                    const jsonContent = content['application/json'] || content['*/*'];
                    if (jsonContent && jsonContent.schema) {
                        const modelName = pascalCase(name) + 'Webhook';
                        processDefinition(modelName, jsonContent.schema as SwaggerDefinition);
                    }
                }
            });
        }

        // 3. Callbacks
        const allPaths = extractPaths(spec.paths);
        allPaths.forEach(op => {
            if (op.callbacks) {
                Object.entries(op.callbacks).forEach(([callbackName, callbackObj]) => {
                    const resolvedCallback = this.parser.resolve(callbackObj) as Record<string, PathItem>;
                    if (!resolvedCallback) return;

                    Object.values(resolvedCallback).forEach((pathItem: PathItem) => {
                        ['post', 'put', 'patch'].forEach(method => {
                            const operation = pathItem[method];
                            if (operation && operation.requestBody) {
                                const content = operation.requestBody.content || {};
                                const jsonContent = content['application/json'] || content['*/*'];
                                if (jsonContent && jsonContent.schema) {
                                    const opIdBase = op.operationId ? pascalCase(op.operationId) : pascalCase(op.method + op.path);
                                    const modelName = `${opIdBase}${pascalCase(callbackName)}Request`;
                                    processDefinition(modelName, jsonContent.schema as SwaggerDefinition);
                                }
                            }
                        });
                    });
                });
            }
        });

        // 4. Links
        const links = this.parser.links || {};
        Object.entries(links).forEach(([linkName, linkObj]) => {
            if (linkObj.parameters) {
                const paramsName = `${pascalCase(linkName)}LinkParameters`;
                const properties: OptionalKind<PropertySignatureStructure>[] = Object.keys(linkObj.parameters).map(key => ({
                    name: key,
                    type: 'string | any',
                    docs: [`Value or expression for parameter '${key}'`]
                }));

                sourceFile.addInterface({
                    name: paramsName,
                    isExported: true,
                    properties: properties,
                    docs: [{
                        description: `Parameters for the '${linkName}' link.`,
                        tags: [{ tagName: 'see', text: 'linkObject' }]
                    }]
                });
            }
        });

        // 5. Response Headers
        allPaths.forEach(op => {
            if (op.responses) {
                Object.entries(op.responses).forEach(([code, resp]) => {
                    if (resp.headers) {
                        const opIdBase = op.operationId ? pascalCase(op.operationId) : pascalCase(op.method + op.path);
                        const interfaceName = `${opIdBase}${code}Headers`;

                        const properties: OptionalKind<PropertySignatureStructure>[] = [];

                        for (const [headerName, headerObj] of Object.entries(resp.headers)) {
                            const resolvedHeader = this.parser.resolve(headerObj) as HeaderObject;
                            if (!resolvedHeader) continue;

                            // Logic updated to support 'content' map in Header Object (OAS 3.x)
                            let schema = resolvedHeader.schema as SwaggerDefinition;

                            if (!schema && resolvedHeader.content) {
                                // Headers usually have one content-type defined if using 'content'
                                const firstContentType = Object.keys(resolvedHeader.content)[0];
                                if (firstContentType && resolvedHeader.content[firstContentType].schema) {
                                    schema = resolvedHeader.content[firstContentType].schema as SwaggerDefinition;
                                }
                            }

                            // Fallback to Swagger 2.0 style flat properties if no schema found
                            if (!schema) {
                                schema = { type: resolvedHeader.type, format: resolvedHeader.format } as any;
                            }

                            const type = getTypeScriptType(schema, this.config, this.parser.schemas.map(s => s.name));
                            const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(headerName) ? headerName : `'${headerName}'`;

                            // Updated logic: Build JSDoc structure explicitly
                            const jsDocs: OptionalKind<JSDocStructure>[] = [];
                            if (resolvedHeader.description || resolvedHeader.deprecated) {
                                const doc: OptionalKind<JSDocStructure> = {};
                                if (resolvedHeader.description) doc.description = resolvedHeader.description;
                                if (resolvedHeader.deprecated) doc.tags = [{ tagName: 'deprecated' }];
                                jsDocs.push(doc);
                            }

                            properties.push({
                                name: safeName,
                                type: type,
                                hasQuestionToken: !resolvedHeader.required,
                                docs: jsDocs
                            });
                        }

                        if (properties.length > 0) {
                            sourceFile.addInterface({
                                name: interfaceName,
                                isExported: true,
                                properties: properties,
                                docs: [`Response headers for operation '${op.operationId || op.method + ' ' + op.path}' with status ${code}.`]
                            });
                        }
                    }
                });
            }
        });

        sourceFile.formatText();
    }

    private shouldGenerateInterface(def: SwaggerDefinition): boolean {
        if (def.anyOf || def.oneOf) return false;
        return def.type === 'object' || !!def.properties || !!def.allOf || !!def.patternProperties;
    }

    private generateEnum(sourceFile: SourceFile, name: string, def: SwaggerDefinition): void {
        const enumStyle = this.config.options.enumStyle || 'enum';
        const values = def.enum || [];

        if (values.length === 0) {
            sourceFile.addTypeAlias({
                name: pascalCase(name),
                isExported: true,
                type: 'any',
                docs: this.buildJSDoc(def)
            });
            return;
        }

        const allStrings = values.every(v => typeof v === 'string');

        if (enumStyle === 'union' || !allStrings) {
            sourceFile.addTypeAlias({
                name: pascalCase(name),
                isExported: true,
                type: values.map(v => typeof v === 'string' ? `'${v}'` : v).join(' | '),
                docs: this.buildJSDoc(def)
            });
        } else {
            sourceFile.addEnum({
                name: pascalCase(name),
                isExported: true,
                members: values.map(v => {
                    const valStr = String(v);
                    const key = valStr.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                    const safeKey = /^[0-9]/.test(key) ? `_${key}` : key;
                    return { name: safeKey, value: v as string };
                }),
                docs: this.buildJSDoc(def)
            });
        }
    }

    private generateTypeAlias(sourceFile: SourceFile, name: string, def: SwaggerDefinition): void {
        const type = getTypeScriptType(def, this.config, this.parser.schemas.map(s => s.name));
        sourceFile.addTypeAlias({
            name: pascalCase(name),
            isExported: true,
            type: type,
            docs: this.buildJSDoc(def)
        });
    }

    private generateInterface(sourceFile: SourceFile, name: string, def: SwaggerDefinition): void {
        const modelName = pascalCase(name);
        const responseProps = this.getInterfaceProperties(def, { excludeWriteOnly: true });
        const interfaceDecl = sourceFile.addInterface({
            name: modelName,
            isExported: true,
            properties: responseProps,
            docs: this.buildJSDoc(def)
        });
        this.applyComposition(interfaceDecl, def, { excludeWriteOnly: true });
        this.applyIndexSignature(interfaceDecl, def);

        if (this.needsRequestModel(def)) {
            const requestProps = this.getInterfaceProperties(def, { excludeReadOnly: true });
            const requestDecl = sourceFile.addInterface({
                name: `${modelName}Request`,
                isExported: true,
                properties: requestProps,
                docs: this.buildJSDoc({
                    ...def,
                    description: `Model for sending ${modelName} data (excludes read-only fields).`
                })
            });
            this.applyComposition(requestDecl, def, { excludeReadOnly: true });
            this.applyIndexSignature(requestDecl, def);
        }
    }

    private applyComposition(interfaceDecl: any, def: SwaggerDefinition, options: {
        excludeReadOnly?: boolean,
        excludeWriteOnly?: boolean
    }): void {
        if (def.allOf) {
            const extendsTypes: string[] = [];
            def.allOf.forEach(sub => {
                if (sub.$ref) {
                    let refName = pascalCase(sub.$ref.split('/').pop() || '');
                    const refDef = this.parser.resolve(sub);
                    if (refDef && this.needsRequestModel(refDef) && options.excludeReadOnly) {
                        refName = `${refName}Request`;
                    }
                    if (refName) extendsTypes.push(refName);
                } else if (sub.properties) {
                    const inlineProps = this.getInterfaceProperties(sub, options);
                    interfaceDecl.addProperties(inlineProps);
                }
            });
            if (extendsTypes.length > 0) {
                interfaceDecl.addExtends(extendsTypes);
            }
        }
    }

    private applyIndexSignature(interfaceDecl: any, def: SwaggerDefinition): void {
        const returnTypes: string[] = [];
        if (def.additionalProperties) {
            const valueType = def.additionalProperties === true
                ? 'any'
                : getTypeScriptType(def.additionalProperties as SwaggerDefinition, this.config, this.parser.schemas.map(s => s.name));
            returnTypes.push(valueType);
        }
        if (def.patternProperties) {
            Object.values(def.patternProperties).forEach(p => {
                returnTypes.push(getTypeScriptType(p, this.config, this.parser.schemas.map(s => s.name)));
            });
        }
        if (returnTypes.length > 0) {
            const distinct = Array.from(new Set(returnTypes));
            interfaceDecl.addIndexSignature({
                keyName: 'key',
                keyType: 'string',
                returnType: distinct.join(' | ')
            });
        }
    }

    private getInterfaceProperties(def: SwaggerDefinition, options: {
        excludeReadOnly?: boolean,
        excludeWriteOnly?: boolean
    }): OptionalKind<PropertySignatureStructure>[] {
        const props: OptionalKind<PropertySignatureStructure>[] = [];
        if (def.properties) {
            Object.entries(def.properties).forEach(([propName, propDef]) => {
                if (options.excludeReadOnly && propDef.readOnly) return;
                if (options.excludeWriteOnly && propDef.writeOnly) return;

                const type = getTypeScriptType(propDef, this.config, this.parser.schemas.map(s => s.name));
                const isRequired = def.required?.includes(propName);
                const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;

                props.push({
                    name: safeName,
                    type: type,
                    hasQuestionToken: !isRequired,
                    docs: this.buildJSDoc(propDef),
                    ...(options.excludeWriteOnly && !!propDef.readOnly && { isReadonly: true })
                });
            });
        }
        return props;
    }

    private needsRequestModel(def: SwaggerDefinition): boolean {
        const hasDirect = def.properties && Object.values(def.properties).some(p => p.readOnly || p.writeOnly);
        if (hasDirect) return true;
        if (def.allOf) {
            return def.allOf.some(sub => {
                if (sub.$ref) {
                    const resolved = this.parser.resolve(sub);
                    return resolved ? this.needsRequestModel(resolved) : false;
                }
                return sub.properties && Object.values(sub.properties).some(p => p.readOnly || p.writeOnly);
            });
        }
        return false;
    }

    private buildJSDoc(def: SwaggerDefinition): OptionalKind<JSDocStructure>[] {
        const description = def.description || '';
        const tags: OptionalKind<JSDocTagStructure>[] = [];

        if ((def as any).deprecated) tags.push({ tagName: 'deprecated' });
        if (def.example !== undefined) {
            tags.push({ tagName: 'example', text: JSON.stringify(def.example, null, 2) });
        }
        if (def.examples && Array.isArray(def.examples)) {
            def.examples.forEach(ex => {
                tags.push({ tagName: 'example', text: JSON.stringify(ex, null, 2) });
            });
        }
        if (def.default !== undefined) tags.push({ tagName: 'default', text: JSON.stringify(def.default) });
        if (def.externalDocs?.url) {
            const desc = def.externalDocs.description ? ` - ${def.externalDocs.description}` : '';
            tags.push({ tagName: 'see', text: `${def.externalDocs.url}${desc}` });
        }

        if (!description && tags.length === 0) return [];
        return [{ description, tags }];
    }
}
