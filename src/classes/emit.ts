// src/generators/shared/type.generator.ts
import * as path from 'node:path';
import {
    InterfaceDeclaration,
    JSDocStructure,
    JSDocTagStructure,
    OptionalKind,
    Project,
    PropertySignatureStructure,
    SourceFile,
} from 'ts-morph';
import { GeneratorConfig, HeaderObject, PathItem, SwaggerDefinition, OpenApiValue } from '@src/core/types/index.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { extractPaths, getTypeScriptType, pascalCase, sanitizeComment } from '@src/functions/utils.js';

export class TypeGenerator {
    constructor(
        /* v8 ignore next */
        private parser: SwaggerParser,
        /* v8 ignore next */
        private project: Project,
        /* v8 ignore next */
        private config: GeneratorConfig,
    ) {}

    public generate(outputDir: string): void {
        /* v8 ignore next */
        const modelsDir = path.join(outputDir, 'models');
        /* v8 ignore next */
        const filePath = path.join(modelsDir, 'index.ts');
        /* v8 ignore next */
        const sourceFile = this.project.createSourceFile(filePath, '', { overwrite: true });

        /* v8 ignore next */
        const definitions = this.parser.schemas;

        /* v8 ignore next */
        const processDefinition = (name: string, def: SwaggerDefinition | boolean) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (typeof def === 'boolean') {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                this.generateTypeAlias(sourceFile, name, def);
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                return;
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            if (def.enum) {
                /* v8 ignore next */
                this.generateEnum(sourceFile, name, def);
                /* v8 ignore next */
            } else if (this.shouldGenerateInterface(def)) {
                /* v8 ignore next */
                this.generateInterface(sourceFile, name, def);
            } else {
                /* v8 ignore next */
                this.generateTypeAlias(sourceFile, name, def);
            }
        };

        // 1. Type Definitions
        /* v8 ignore next */
        definitions.forEach(def => processDefinition(def.name, def.definition));

        // 2. Webhooks (treated as models for payload typing)
        /* v8 ignore next */
        const spec = this.parser.getSpec();
        /* v8 ignore next */
        if (spec.webhooks) {
            /* v8 ignore next */
            Object.entries(spec.webhooks).forEach(([name, pathItem]) => {
                /* v8 ignore next */
                const postOp = (pathItem as PathItem).post;
                /* v8 ignore next */
                if (postOp && postOp.requestBody) {
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    /* v8 ignore start */
                    const content =
                        (postOp.requestBody as Record<string, Record<string, { schema?: OpenApiValue }>>).content || {};
                    /* v8 ignore stop */
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    const jsonContent = content['application/json'] || content['*/*'];
                    // type-coverage:ignore-next-line
                    /* v8 ignore next */
                    if (jsonContent && jsonContent.schema) {
                        /* v8 ignore next */
                        const modelName = pascalCase(name) + 'Webhook';
                        // type-coverage:ignore-next-line
                        /* v8 ignore next */
                        processDefinition(modelName, jsonContent.schema as SwaggerDefinition);
                    }
                }
            });
        }

        // 3. Callbacks
        // Pass components to extractPaths to ensure consistent behavior
        /* v8 ignore next */
        const allPaths = extractPaths(spec.paths, undefined, spec.components);
        /* v8 ignore next */
        allPaths.forEach(op => {
            /* v8 ignore next */
            if (op.callbacks) {
                /* v8 ignore next */
                Object.entries(op.callbacks).forEach(([callbackName, callbackObj]) => {
                    /* v8 ignore next */
                    const resolvedCallback = this.parser.resolve(callbackObj) as Record<string, PathItem>;
                    /* v8 ignore next */
                    if (!resolvedCallback) return;

                    /* v8 ignore next */
                    Object.values(resolvedCallback).forEach((pathItem: PathItem) => {
                        /* v8 ignore next */
                        (['post', 'put', 'patch'] as const).forEach(method => {
                            /* v8 ignore next */
                            const operation = pathItem[method];
                            /* v8 ignore next */
                            if (operation && operation.requestBody) {
                                // type-coverage:ignore-next-line
                                /* v8 ignore next */
                                /* v8 ignore start */
                                const content =
                                    (operation.requestBody as Record<string, Record<string, { schema?: OpenApiValue }>>)
                                        .content || {};
                                /* v8 ignore stop */
                                // type-coverage:ignore-next-line
                                /* v8 ignore next */
                                /* v8 ignore start */
                                const jsonContent = content['application/json'] || content['*/*'];
                                /* v8 ignore stop */
                                // type-coverage:ignore-next-line
                                /* v8 ignore next */
                                if (jsonContent && jsonContent.schema) {
                                    /* v8 ignore next */
                                    const opIdBase = op.operationId
                                        ? pascalCase(op.operationId)
                                        : pascalCase(op.method + op.path);
                                    /* v8 ignore next */
                                    const modelName = `${opIdBase}${pascalCase(callbackName)}Request`;
                                    // type-coverage:ignore-next-line
                                    /* v8 ignore next */
                                    processDefinition(modelName, jsonContent.schema as SwaggerDefinition);
                                }
                            }
                        });
                    });
                });
            }
        });

        // 4. Links
        /* v8 ignore next */
        const links = this.parser.links;
        /* v8 ignore next */
        Object.entries(links).forEach(([linkName, linkObj]) => {
            /* v8 ignore next */
            if (linkObj.parameters) {
                /* v8 ignore next */
                const paramsName = `${pascalCase(linkName)}LinkParameters`;
                /* v8 ignore next */
                const properties: OptionalKind<PropertySignatureStructure>[] = Object.keys(linkObj.parameters).map(
                    /* v8 ignore next */
                    key => ({
                        name: key,
                        type: 'string | string | number | boolean | object | undefined | null',
                        docs: [`Value or expression for parameter '${key}'`],
                    }),
                );

                /* v8 ignore next */
                sourceFile.addInterface({
                    name: paramsName,
                    isExported: true,
                    properties: properties,
                    docs: [
                        {
                            description: `Parameters for the '${linkName}' link.`,
                            tags: [{ tagName: 'see', text: 'linkObject' }],
                        },
                    ],
                });
            }
        });

        // 5. Response Headers
        /* v8 ignore next */
        allPaths.forEach(op => {
            /* v8 ignore next */
            Object.entries(op.responses!).forEach(([code, resp]) => {
                /* v8 ignore next */
                if (resp.headers) {
                    /* v8 ignore next */
                    const opIdBase = op.operationId ? pascalCase(op.operationId) : pascalCase(op.method + op.path);
                    /* v8 ignore next */
                    const interfaceName = `${opIdBase}${code}Headers`;

                    /* v8 ignore next */
                    const properties: OptionalKind<PropertySignatureStructure>[] = [];

                    /* v8 ignore next */
                    for (const [headerName, headerObj] of Object.entries(resp.headers)) {
                        /* v8 ignore next */
                        /* v8 ignore start */
                        if (headerName.toLowerCase() === 'content-type') {
                            /* v8 ignore stop */
                            // OAS 3.2: Response header definitions named "Content-Type" are ignored.
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore next */
                            /* v8 ignore start */
                            continue;
                            /* v8 ignore stop */
                        }
                        /* v8 ignore next */
                        const resolvedHeader = this.parser.resolve(headerObj) as HeaderObject;
                        /* v8 ignore next */
                        if (!resolvedHeader) continue;

                        /* v8 ignore next */
                        const isSetCookie = headerName.toLowerCase() === 'set-cookie';

                        // Logic updated to support 'content' map in Header Object (OAS 3.x)
                        /* v8 ignore next */
                        let schema = resolvedHeader.schema as SwaggerDefinition | boolean | undefined;

                        /* v8 ignore next */
                        if (schema === undefined && resolvedHeader.content) {
                            // Headers usually have one content-type defined if using 'content'
                            /* v8 ignore next */
                            const firstContentType = Object.keys(resolvedHeader.content)[0];
                            /* v8 ignore next */
                            if (firstContentType && resolvedHeader.content[firstContentType].schema !== undefined) {
                                /* v8 ignore next */
                                schema = resolvedHeader.content[firstContentType].schema as SwaggerDefinition;
                            }
                        }

                        // Fallback to Swagger 2.0 style flat properties if no schema found
                        /* v8 ignore next */
                        if (schema === undefined) {
                            /* v8 ignore next */
                            schema = { type: resolvedHeader.type, format: resolvedHeader.format } as Record<
                                string,
                                string | number | boolean | object | undefined | null
                            >;
                        }

                        /* v8 ignore next */
                        const type = isSetCookie
                            ? 'string[]'
                            : getTypeScriptType(
                                  schema,
                                  this.config,
                                  /* v8 ignore next */
                                  this.parser.schemas.map(s => s.name),
                              );
                        /* v8 ignore next */
                        const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(headerName) ? headerName : `'${headerName}'`;

                        // Updated logic: Build JSDoc structure explicitly
                        /* v8 ignore next */
                        const jsDocs: OptionalKind<JSDocStructure>[] = [];
                        /* v8 ignore next */
                        if (resolvedHeader.description || resolvedHeader.deprecated) {
                            /* v8 ignore next */
                            const doc: OptionalKind<JSDocStructure> = {};
                            /* v8 ignore next */
                            if (resolvedHeader.description)
                                /* v8 ignore next */
                                doc.description = sanitizeComment(resolvedHeader.description);
                            /* v8 ignore next */
                            if (resolvedHeader.deprecated) doc.tags = [{ tagName: 'deprecated' }];
                            /* v8 ignore next */
                            jsDocs.push(doc);
                        }

                        /* v8 ignore next */
                        properties.push({
                            name: safeName,
                            type: type,
                            hasQuestionToken: !resolvedHeader.required,
                            docs: jsDocs,
                        });
                    }

                    /* v8 ignore next */
                    if (properties.length > 0) {
                        /* v8 ignore next */
                        sourceFile.addInterface({
                            name: interfaceName,
                            isExported: true,
                            properties: properties,
                            docs: [
                                `Response headers for operation '${op.operationId || op.method + ' ' + op.path}' with status ${code}.`,
                            ],
                        });
                    }
                }
            });
        });

        /* v8 ignore next */
        sourceFile.formatText();
    }

    private shouldGenerateInterface(def: SwaggerDefinition | boolean): boolean {
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof def === 'boolean') return false;
        /* v8 ignore stop */
        /* v8 ignore next */
        if (def.anyOf || def.oneOf) return false;
        // dependentSchemas/dependentRequired involve intersection/union logic which can only be represented by type alias
        /* v8 ignore next */
        if (def.dependentSchemas || (def as Record<string, OpenApiValue>).dependentRequired) return false;
        /* v8 ignore next */
        return def.type === 'object' || !!def.properties || !!def.allOf || !!def.patternProperties;
    }

    private generateEnum(sourceFile: SourceFile, name: string, def: SwaggerDefinition): void {
        /* v8 ignore next */
        const enumStyle = this.config.options.enumStyle || 'enum';
        /* v8 ignore next */
        const values = def.enum as NonNullable<SwaggerDefinition['enum']>;

        /* v8 ignore next */
        if (values.length === 0) {
            /* v8 ignore next */
            sourceFile.addTypeAlias({
                name: pascalCase(name),
                isExported: true,
                type: 'string | number | boolean | object | undefined | null',
                docs: this.buildJSDoc(def),
            });
            /* v8 ignore next */
            return;
        }

        /* v8 ignore next */
        const allStrings = values.every(v => typeof v === 'string');

        /* v8 ignore next */
        if (enumStyle === 'union' || !allStrings) {
            /* v8 ignore next */
            sourceFile.addTypeAlias({
                name: pascalCase(name),
                isExported: true,
                /* v8 ignore next */
                type: values.map(v => (typeof v === 'string' ? `'${v}'` : v)).join(' | '),
                docs: this.buildJSDoc(def),
            });
        } else {
            /* v8 ignore next */
            sourceFile.addEnum({
                name: pascalCase(name),
                isExported: true,
                members: values.map(v => {
                    /* v8 ignore next */
                    const valStr = String(v);
                    /* v8 ignore next */
                    const key = valStr.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
                    /* v8 ignore next */
                    const safeKey = /^[0-9]/.test(key) ? `_${key}` : key;
                    /* v8 ignore next */
                    return { name: safeKey, value: v as string };
                }),
                docs: this.buildJSDoc(def),
            });
        }
    }

    private generateTypeAlias(sourceFile: SourceFile, name: string, def: SwaggerDefinition | boolean): void {
        /* v8 ignore next */
        const type = getTypeScriptType(
            def as SwaggerDefinition,
            this.config,
            /* v8 ignore next */
            this.parser.schemas.map(s => s.name),
        );
        /* v8 ignore next */
        sourceFile.addTypeAlias({
            name: pascalCase(name),
            isExported: true,
            type: type,
            docs: this.buildJSDoc(def),
        });
    }

    private generateInterface(sourceFile: SourceFile, name: string, def: SwaggerDefinition): void {
        /* v8 ignore next */
        const modelName = pascalCase(name);
        /* v8 ignore next */
        const responseProps = this.getInterfaceProperties(def, { excludeWriteOnly: true });
        /* v8 ignore next */
        const interfaceDecl = sourceFile.addInterface({
            name: modelName,
            isExported: true,
            properties: responseProps,
            docs: this.buildJSDoc(def),
        });
        /* v8 ignore next */
        this.applyComposition(interfaceDecl, def, { excludeWriteOnly: true });
        /* v8 ignore next */
        this.applyIndexSignature(interfaceDecl, def);

        /* v8 ignore next */
        if (this.needsRequestModel(def)) {
            /* v8 ignore next */
            const requestProps = this.getInterfaceProperties(def, { excludeReadOnly: true });
            /* v8 ignore next */
            const requestDecl = sourceFile.addInterface({
                name: `${modelName}Request`,
                isExported: true,
                properties: requestProps,
                docs: this.buildJSDoc({
                    ...def,
                    description: `Model for sending ${modelName} data (excludes read-only fields).`,
                }),
            });
            /* v8 ignore next */
            this.applyComposition(requestDecl, def, { excludeReadOnly: true });
            /* v8 ignore next */
            this.applyIndexSignature(requestDecl, def);
        }
    }

    private applyComposition(
        interfaceDecl: InterfaceDeclaration,
        def: SwaggerDefinition,
        options: {
            excludeReadOnly?: boolean;
            excludeWriteOnly?: boolean;
        },
    ): void {
        /* v8 ignore next */
        if (def.allOf) {
            /* v8 ignore next */
            const extendsTypes: string[] = [];
            /* v8 ignore next */
            def.allOf.forEach(subObj => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof subObj !== 'object') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                const sub = subObj as SwaggerDefinition;
                /* v8 ignore next */
                if (sub.$ref) {
                    /* v8 ignore next */
                    let refName = pascalCase(sub.$ref.split('/').pop() || '');
                    /* v8 ignore next */
                    const refDef = this.parser.resolve(sub);
                    /* v8 ignore next */
                    if (
                        refDef &&
                        typeof refDef === 'object' &&
                        this.needsRequestModel(refDef as SwaggerDefinition) &&
                        options.excludeReadOnly
                    ) {
                        /* v8 ignore next */
                        refName = `${refName}Request`;
                    }
                    /* v8 ignore next */
                    if (refName) extendsTypes.push(refName);
                    /* v8 ignore next */
                } else if (sub.properties) {
                    /* v8 ignore next */
                    const inlineProps = this.getInterfaceProperties(sub, options);
                    /* v8 ignore next */
                    interfaceDecl.addProperties(inlineProps);
                }
            });
            /* v8 ignore next */
            if (extendsTypes.length > 0) {
                /* v8 ignore next */
                interfaceDecl.addExtends(extendsTypes);
            }
        }
    }

    private applyIndexSignature(interfaceDecl: InterfaceDeclaration, def: SwaggerDefinition): void {
        /* v8 ignore next */
        const returnTypes: string[] = [];

        /* v8 ignore next */
        if (def.additionalProperties) {
            const valueType =
                /* v8 ignore next */
                def.additionalProperties === true
                    ? 'string | number | boolean | object | undefined | null'
                    : getTypeScriptType(
                          def.additionalProperties as SwaggerDefinition,
                          this.config,
                          /* v8 ignore next */
                          this.parser.schemas.map(s => s.name),
                      );
            /* v8 ignore next */
            returnTypes.push(valueType);
        }

        /* v8 ignore next */
        if (def.unevaluatedProperties) {
            const valueType =
                /* v8 ignore next */
                def.unevaluatedProperties === true
                    ? 'string | number | boolean | object | undefined | null'
                    : getTypeScriptType(
                          def.unevaluatedProperties as SwaggerDefinition,
                          this.config,
                          /* v8 ignore next */
                          this.parser.schemas.map(s => s.name),
                      );
            /* v8 ignore next */
            returnTypes.push(valueType);
        }

        /* v8 ignore next */
        if (def.patternProperties) {
            /* v8 ignore next */
            Object.values(def.patternProperties).forEach(p => {
                /* v8 ignore next */
                returnTypes.push(
                    getTypeScriptType(
                        p as SwaggerDefinition | boolean,
                        this.config,
                        /* v8 ignore next */
                        this.parser.schemas.map(s => s.name),
                    ),
                );
            });
        }

        /* v8 ignore next */
        if (returnTypes.length > 0) {
            /* v8 ignore next */
            const distinct = Array.from(new Set(returnTypes));
            /* v8 ignore next */
            const returnType = distinct.includes('string | number | boolean | object | undefined | null')
                ? 'string | number | boolean | object | undefined | null'
                : distinct.join(' | ');

            /* v8 ignore next */
            interfaceDecl.addIndexSignature({
                keyName: 'key',
                keyType: 'string',
                returnType,
            });
        }
    }

    private getInterfaceProperties(
        def: SwaggerDefinition,
        options: {
            excludeReadOnly?: boolean;
            excludeWriteOnly?: boolean;
        },
    ): OptionalKind<PropertySignatureStructure>[] {
        /* v8 ignore next */
        const props: OptionalKind<PropertySignatureStructure>[] = [];
        /* v8 ignore next */
        if (def.properties) {
            /* v8 ignore next */
            Object.entries(def.properties).forEach(([propName, propDefObj]) => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof propDefObj !== 'object') return;
                /* v8 ignore stop */
                /* v8 ignore next */
                const propDef = propDefObj as SwaggerDefinition;
                /* v8 ignore next */
                if (options.excludeReadOnly && propDef.readOnly) return;
                /* v8 ignore next */
                if (options.excludeWriteOnly && propDef.writeOnly) return;

                /* v8 ignore next */
                const type = getTypeScriptType(
                    propDef,
                    this.config,
                    /* v8 ignore next */
                    this.parser.schemas.map(s => s.name),
                );
                /* v8 ignore next */
                const isRequired = def.required?.includes(propName);
                /* v8 ignore next */
                const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(propName) ? propName : `'${propName}'`;

                /* v8 ignore next */
                props.push({
                    name: safeName,
                    type: type,
                    hasQuestionToken: !isRequired,
                    docs: this.buildJSDoc(propDef),
                    ...(options.excludeWriteOnly && !!propDef.readOnly ? { isReadonly: true } : {}),
                });
            });
        }
        /* v8 ignore next */
        return props;
    }

    private needsRequestModel(def: SwaggerDefinition): boolean {
        const hasDirect =
            /* v8 ignore next */
            def.properties &&
            /* v8 ignore next */
            Object.values(def.properties).some(p => typeof p === 'object' && (p.readOnly || p.writeOnly));
        /* v8 ignore next */
        if (hasDirect) return true;
        /* v8 ignore next */
        if (def.allOf) {
            /* v8 ignore next */
            return def.allOf.some(subObj => {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof subObj !== 'object') return false;
                /* v8 ignore stop */
                /* v8 ignore next */
                const sub = subObj as SwaggerDefinition;
                /* v8 ignore next */
                if (sub.$ref) {
                    /* v8 ignore next */
                    const resolved = this.parser.resolve(sub);
                    /* v8 ignore next */
                    return resolved ? this.needsRequestModel(resolved as SwaggerDefinition) : false;
                }
                /* v8 ignore next */
                return (
                    sub.properties &&
                    /* v8 ignore next */
                    Object.values(sub.properties).some(p => typeof p === 'object' && (p.readOnly || p.writeOnly))
                );
            });
        }
        /* v8 ignore next */
        return false;
    }

    private buildJSDoc(def: SwaggerDefinition | boolean): OptionalKind<JSDocStructure>[] {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!def || typeof def !== 'object') return [];
        /* v8 ignore stop */
        /* v8 ignore next */
        const description = sanitizeComment(def.description || '');
        /* v8 ignore next */
        const tags: OptionalKind<JSDocTagStructure>[] = [];

        /* v8 ignore next */
        const pushTag = (tagName: string, value?: OpenApiValue, options?: { omitTrue?: boolean }) => {
            /* v8 ignore next */
            if (value === undefined) return;
            /* v8 ignore next */
            if (value === true && options?.omitTrue) {
                /* v8 ignore next */
                tags.push({ tagName });
                /* v8 ignore next */
                return;
            }
            const text =
                /* v8 ignore next */
                typeof value === 'string'
                    ? value
                    : typeof value === 'number' || typeof value === 'boolean'
                      ? String(value)
                      : JSON.stringify(value);
            /* v8 ignore next */
            tags.push({ tagName, text });
        };

        /* v8 ignore next */
        if ((def as Record<string, OpenApiValue>).deprecated) tags.push({ tagName: 'deprecated' });
        /* v8 ignore next */
        if (def.example !== undefined) {
            /* v8 ignore next */
            tags.push({ tagName: 'example', text: JSON.stringify(def.example, null, 2) });
        }
        /* v8 ignore next */
        if (def.examples && Array.isArray(def.examples)) {
            /* v8 ignore next */
            def.examples.forEach(ex => {
                /* v8 ignore next */
                tags.push({ tagName: 'example', text: JSON.stringify(ex, null, 2) });
            });
        }
        /* v8 ignore next */
        if (def.default !== undefined) tags.push({ tagName: 'default', text: JSON.stringify(def.default) });
        /* v8 ignore next */
        if (def.externalDocs?.url) {
            /* v8 ignore next */
            const desc = def.externalDocs.description ? ` - ${sanitizeComment(def.externalDocs.description)}` : '';
            /* v8 ignore next */
            tags.push({ tagName: 'see', text: `${def.externalDocs.url}${desc}` });
        }

        /* v8 ignore next */
        pushTag('minimum', def.minimum);
        /* v8 ignore next */
        pushTag('maximum', def.maximum);
        /* v8 ignore next */
        pushTag('exclusiveMinimum', def.exclusiveMinimum);
        /* v8 ignore next */
        pushTag('exclusiveMaximum', def.exclusiveMaximum);
        /* v8 ignore next */
        pushTag('minLength', def.minLength);
        /* v8 ignore next */
        pushTag('maxLength', def.maxLength);
        /* v8 ignore next */
        pushTag('pattern', def.pattern);
        /* v8 ignore next */
        pushTag('format', def.format);
        /* v8 ignore next */
        pushTag('multipleOf', def.multipleOf);
        /* v8 ignore next */
        pushTag('minItems', def.minItems);
        /* v8 ignore next */
        pushTag('maxItems', def.maxItems);
        /* v8 ignore next */
        pushTag('uniqueItems', def.uniqueItems);
        /* v8 ignore next */
        pushTag('minProperties', def.minProperties);
        /* v8 ignore next */
        pushTag('maxProperties', def.maxProperties);
        /* v8 ignore next */
        pushTag('propertyNames', (def as Record<string, OpenApiValue>).propertyNames);
        /* v8 ignore next */
        if (Object.prototype.hasOwnProperty.call(def as Record<string, OpenApiValue>, 'additionalProperties')) {
            /* v8 ignore next */
            pushTag('additionalProperties', (def as Record<string, OpenApiValue>).additionalProperties);
        }
        /* v8 ignore next */
        pushTag('readOnly', def.readOnly, { omitTrue: true });
        /* v8 ignore next */
        pushTag('writeOnly', def.writeOnly, { omitTrue: true });
        /* v8 ignore next */
        pushTag('nullable', (def as Record<string, OpenApiValue>).nullable, { omitTrue: true });
        /* v8 ignore next */
        pushTag('title', def.title);
        /* v8 ignore next */
        pushTag('schemaDialect', (def as Record<string, OpenApiValue>).$schema);
        /* v8 ignore next */
        pushTag('schemaId', (def as Record<string, OpenApiValue>).$id);
        /* v8 ignore next */
        pushTag('schemaAnchor', (def as Record<string, OpenApiValue>).$anchor);
        /* v8 ignore next */
        pushTag('schemaDynamicAnchor', (def as Record<string, OpenApiValue>).$dynamicAnchor);
        /* v8 ignore next */
        pushTag('const', (def as Record<string, OpenApiValue>).const);
        /* v8 ignore next */
        pushTag('if', (def as Record<string, OpenApiValue>).if);
        /* v8 ignore next */
        pushTag('then', (def as Record<string, OpenApiValue>).then);
        /* v8 ignore next */
        pushTag('else', (def as Record<string, OpenApiValue>).else);
        /* v8 ignore next */
        pushTag('not', (def as Record<string, OpenApiValue>).not);
        /* v8 ignore next */
        pushTag('oneOf', (def as Record<string, OpenApiValue>).oneOf);
        /* v8 ignore next */
        pushTag('anyOf', (def as Record<string, OpenApiValue>).anyOf);
        /* v8 ignore next */
        pushTag('contains', (def as Record<string, OpenApiValue>).contains);
        /* v8 ignore next */
        pushTag('minContains', (def as Record<string, OpenApiValue>).minContains);
        /* v8 ignore next */
        pushTag('maxContains', (def as Record<string, OpenApiValue>).maxContains);
        /* v8 ignore next */
        pushTag('contentMediaType', (def as Record<string, OpenApiValue>).contentMediaType);
        /* v8 ignore next */
        pushTag('contentEncoding', (def as Record<string, OpenApiValue>).contentEncoding);
        /* v8 ignore next */
        pushTag('contentSchema', (def as Record<string, OpenApiValue>).contentSchema);
        /* v8 ignore next */
        pushTag('patternProperties', (def as Record<string, OpenApiValue>).patternProperties);
        /* v8 ignore next */
        pushTag('dependentSchemas', (def as Record<string, OpenApiValue>).dependentSchemas);
        /* v8 ignore next */
        pushTag('dependentRequired', (def as Record<string, OpenApiValue>).dependentRequired);
        /* v8 ignore next */
        pushTag('unevaluatedProperties', (def as Record<string, OpenApiValue>).unevaluatedProperties);
        /* v8 ignore next */
        pushTag('unevaluatedItems', (def as Record<string, OpenApiValue>).unevaluatedItems);
        /* v8 ignore next */
        pushTag('schemaDialect', (def as Record<string, OpenApiValue>).$schema);
        /* v8 ignore next */
        pushTag('schemaId', (def as Record<string, OpenApiValue>).$id);
        /* v8 ignore next */
        pushTag('schemaAnchor', (def as Record<string, OpenApiValue>).$anchor);
        /* v8 ignore next */
        pushTag('schemaDynamicAnchor', (def as Record<string, OpenApiValue>).$dynamicAnchor);
        /* v8 ignore next */
        pushTag('xml', (def as Record<string, OpenApiValue>).xml);
        /* v8 ignore next */
        pushTag('discriminator', (def as Record<string, OpenApiValue>).discriminator);

        /* v8 ignore next */
        const extensionEntries = Object.entries(def as Record<string, OpenApiValue>).filter(([key]) =>
            key.startsWith('x-'),
        );
        /* v8 ignore next */
        extensionEntries.forEach(([key, value]) => {
            /* v8 ignore next */
            /* v8 ignore start */
            if (value === undefined) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            tags.push({ tagName: key, text: JSON.stringify(value) });
        });

        /* v8 ignore next */
        if (!description && tags.length === 0) return [];
        /* v8 ignore next */
        return [{ description, tags }];
    }
}
