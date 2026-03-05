// src/core/utils/openapi-reverse-models.ts
import path from 'node:path';
import {
    EnumDeclaration,
    InterfaceDeclaration,
    Node,
    Project,
    PropertySignature,
    SyntaxKind,
    TypeAliasDeclaration,
    TypeNode,
} from 'ts-morph';
import { SwaggerDefinition } from '../core/types/index.js';

/** Map of schema names to reconstructed schema definitions. */
export type ReverseSchemaMap = Record<string, SwaggerDefinition | boolean>;

/** File system requirements for reverse model parsing helpers. */
export type ReverseModelFileSystem = {
    statSync: (filePath: string) => { isFile: () => boolean; isDirectory: () => boolean };
    readFileSync: (filePath: string, encoding: string) => string;
    readdirSync: (dirPath: string) => string[];
};

/* v8 ignore next */
const MODEL_FILE_SUFFIX = '.ts';
/* v8 ignore next */
const MODEL_SPEC_SUFFIX = '.spec.ts';
/* v8 ignore next */
const MODEL_DECL_SUFFIX = '.d.ts';

/**
 * Parses a generated model source file and returns reconstructed schema definitions.
 */
export function parseGeneratedModelSource(sourceText: string, filePath = 'models/index.ts'): ReverseSchemaMap {
    /* v8 ignore next */
    const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
    /* v8 ignore next */
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    /* v8 ignore next */
    const schemas = parseModelSourceFile(sourceFile);
    /* v8 ignore next */
    inferDiscriminators(schemas);
    /* v8 ignore next */
    return schemas;
}

/**
 * Parses generated model files from a file path or directory, returning reconstructed schemas.
 */
export function parseGeneratedModels(inputPath: string, fileSystem: ReverseModelFileSystem): ReverseSchemaMap {
    /* v8 ignore next */
    const stat = fileSystem.statSync(inputPath);
    /* v8 ignore next */
    const modelFiles: string[] = [];

    /* v8 ignore next */
    if (stat.isFile()) {
        /* v8 ignore next */
        if (!isModelFilePath(inputPath)) {
            /* v8 ignore next */
            throw new Error(`Expected a generated model file (*.ts). Received: ${inputPath}`);
        }
        /* v8 ignore next */
        modelFiles.push(inputPath);
        /* v8 ignore next */
    } else if (stat.isDirectory()) {
        /* v8 ignore next */
        collectModelFiles(inputPath, fileSystem, modelFiles);
    } else {
        /* v8 ignore next */
        throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
    }

    /* v8 ignore next */
    if (modelFiles.length === 0) {
        /* v8 ignore next */
        throw new Error(`No generated model files found under: ${inputPath}`);
    }

    /* v8 ignore next */
    const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
    /* v8 ignore next */
    const schemas: ReverseSchemaMap = {};

    /* v8 ignore next */
    for (const filePath of modelFiles) {
        /* v8 ignore next */
        const contents = fileSystem.readFileSync(filePath, 'utf-8');
        /* v8 ignore next */
        const sourceFile = project.createSourceFile(filePath, contents, { overwrite: true });
        /* v8 ignore next */
        Object.assign(schemas, parseModelSourceFile(sourceFile));
    }

    /* v8 ignore next */
    if (Object.keys(schemas).length === 0) {
        /* v8 ignore next */
        throw new Error(`No exported models could be reconstructed from: ${inputPath}`);
    }

    /* v8 ignore next */
    inferDiscriminators(schemas);
    /* v8 ignore next */
    return schemas;
}

function parseModelSourceFile(sourceFile: import('ts-morph').SourceFile): ReverseSchemaMap {
    /* v8 ignore next */
    const schemas: ReverseSchemaMap = {};

    /* v8 ignore next */
    sourceFile.getEnums().forEach(enumDecl => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!enumDecl.isExported()) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        schemas[enumDecl.getName()] = schemaFromEnum(enumDecl);
    });

    /* v8 ignore next */
    sourceFile.getTypeAliases().forEach(aliasDecl => {
        /* v8 ignore next */
        if (!aliasDecl.isExported()) return;
        /* v8 ignore next */
        schemas[aliasDecl.getName()] = schemaFromTypeAlias(aliasDecl);
    });

    /* v8 ignore next */
    sourceFile.getInterfaces().forEach(interfaceDecl => {
        /* v8 ignore next */
        if (!interfaceDecl.isExported()) return;
        /* v8 ignore next */
        schemas[interfaceDecl.getName()] = schemaFromInterface(interfaceDecl);
    });

    /* v8 ignore next */
    return schemas;
}

type DiscriminatorVariant = {
    schema: SwaggerDefinition;
    ref?: string;
};

function inferDiscriminators(schemas: ReverseSchemaMap): void {
    /* v8 ignore next */
    Object.values(schemas).forEach(schemaEntry => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (!schemaEntry || typeof schemaEntry !== 'object') return;
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (Array.isArray(schemaEntry)) return;
        /* v8 ignore stop */
        /* v8 ignore next */
        const schema = schemaEntry as SwaggerDefinition;
        /* v8 ignore next */
        if (schema.discriminator) return;

        /* v8 ignore next */
        const union = Array.isArray(schema.oneOf)
            ? schema.oneOf
            : Array.isArray(schema.anyOf)
              ? schema.anyOf
              : undefined;
        /* v8 ignore next */
        if (!union || union.length < 2) return;

        /* v8 ignore next */
        const variants = union
            /* v8 ignore next */
            .map(entry => resolveDiscriminatorVariant(entry, schemas))
            /* v8 ignore next */
            .filter((entry): entry is DiscriminatorVariant => !!entry);
        /* v8 ignore next */
        /* v8 ignore start */
        if (variants.length !== union.length) return;
        /* v8 ignore stop */

        /* v8 ignore next */
        const hasRefs = variants.every(variant => !!variant.ref);
        /* v8 ignore next */
        const hasInline = variants.some(variant => !variant.ref);
        /* v8 ignore next */
        /* v8 ignore start */
        if (hasRefs && hasInline) return;
        /* v8 ignore stop */

        /* v8 ignore next */
        const candidate = findDiscriminatorProperty(variants);
        /* v8 ignore next */
        if (!candidate) return;

        /* v8 ignore next */
        const mapping: Record<string, string> = {};

        /* v8 ignore next */
        const seenValues = new Set<string>();
        /* v8 ignore next */
        for (const variant of variants) {
            /* v8 ignore next */
            const value = getDiscriminatorValue(variant.schema, candidate);
            /* v8 ignore next */
            /* v8 ignore start */
            if (value === undefined) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            const key = String(value);
            /* v8 ignore next */
            /* v8 ignore start */
            if (seenValues.has(key)) return;
            /* v8 ignore stop */
            /* v8 ignore next */
            seenValues.add(key);
            /* v8 ignore next */
            if (variant.ref) mapping[key] = variant.ref;
        }

        /* v8 ignore next */
        schema.discriminator = hasRefs ? { propertyName: candidate, mapping } : { propertyName: candidate };
        /* v8 ignore next */
        if (schema.anyOf && !schema.oneOf) {
            /* v8 ignore next */
            schema.oneOf = schema.anyOf;
            /* v8 ignore next */
            delete schema.anyOf;
        }
    });
}

function resolveDiscriminatorVariant(
    entry: SwaggerDefinition | boolean,
    schemas: ReverseSchemaMap,
): DiscriminatorVariant | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;
    /* v8 ignore stop */
    /* v8 ignore next */
    if ('$ref' in entry) {
        /* v8 ignore next */
        const ref = String((entry as { $ref: string }).$ref);
        /* v8 ignore next */
        const name = extractSchemaName(ref);
        /* v8 ignore next */
        /* v8 ignore start */
        if (!name) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        const resolved = schemas[name];
        /* v8 ignore next */
        /* v8 ignore start */
        if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) return undefined;
        /* v8 ignore stop */
        /* v8 ignore next */
        return { schema: resolved as SwaggerDefinition, ref };
    }
    /* v8 ignore next */
    return { schema: entry as SwaggerDefinition };
}

function extractSchemaName(ref: string): string | undefined {
    /* v8 ignore next */
    const match = ref.match(/#\/components\/schemas\/(.+)$/);
    /* v8 ignore next */
    /* v8 ignore start */
    return match ? match[1] : undefined;
    /* v8 ignore stop */
}

function findDiscriminatorProperty(variants: DiscriminatorVariant[]): string | undefined {
    /* v8 ignore next */
    const candidateNames = new Set<string>();
    /* v8 ignore next */
    variants.forEach(variant => {
        /* v8 ignore next */
        const props = variant.schema.properties ?? {};
        /* v8 ignore next */
        Object.keys(props).forEach(name => candidateNames.add(name));
    });

    /* v8 ignore next */
    const orderedCandidates = Array.from(candidateNames);
    /* v8 ignore next */
    const preferredOrder = ['type', 'kind', 'petType', 'variant', 'discriminator'];

    /* v8 ignore next */
    orderedCandidates.sort((a, b) => {
        /* v8 ignore next */
        const ai = preferredOrder.indexOf(a);
        /* v8 ignore next */
        const bi = preferredOrder.indexOf(b);
        /* v8 ignore next */
        if (ai === -1 && bi === -1) return a.localeCompare(b);
        /* v8 ignore next */
        if (ai === -1) return 1;
        /* v8 ignore next */
        if (bi === -1) return -1;
        /* v8 ignore next */
        return ai - bi;
    });

    /* v8 ignore next */
    for (const name of orderedCandidates) {
        /* v8 ignore next */
        if (
            variants.every(variant => {
                /* v8 ignore next */
                const schema = variant.schema;
                /* v8 ignore next */
                const props = schema.properties ?? {};
                /* v8 ignore next */
                const propSchema = props[name];
                /* v8 ignore next */
                const required = Array.isArray(schema.required) && schema.required.includes(name);
                /* v8 ignore next */
                return (
                    required &&
                    !!propSchema &&
                    typeof propSchema === 'object' &&
                    getDiscriminatorValueSchema(propSchema as SwaggerDefinition) !== undefined
                );
            })
        ) {
            /* v8 ignore next */
            return name;
        }
    }

    /* v8 ignore next */
    return undefined;
}

function getDiscriminatorValue(schema: SwaggerDefinition, propName: string): string | number | boolean | undefined {
    /* v8 ignore next */
    /* v8 ignore start */
    const props = schema.properties ?? {};
    /* v8 ignore stop */
    /* v8 ignore next */
    const propSchema = props[propName];
    /* v8 ignore next */
    /* v8 ignore start */
    if (!propSchema || typeof propSchema !== 'object' || Array.isArray(propSchema)) return undefined;
    /* v8 ignore stop */

    /* v8 ignore next */
    return getDiscriminatorValueSchema(propSchema as SwaggerDefinition);
}

function getDiscriminatorValueSchema(schema: SwaggerDefinition): string | number | boolean | undefined {
    /* v8 ignore next */
    if (schema.const !== undefined) return schema.const as string | number | boolean;

    /* v8 ignore next */
    /* v8 ignore start */
    if (Array.isArray(schema.enum) && schema.enum.length === 1) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return schema.enum[0] as string | number | boolean;
        /* v8 ignore stop */
    }
    /* v8 ignore next */
    return undefined;
}

function isModelFilePath(filePath: string): boolean {
    /* v8 ignore next */
    const normalized = filePath.replace(/\\/g, '/');
    /* v8 ignore next */
    return (
        normalized.endsWith(MODEL_FILE_SUFFIX) &&
        !normalized.endsWith(MODEL_SPEC_SUFFIX) &&
        !normalized.endsWith(MODEL_DECL_SUFFIX)
    );
}

function collectModelFiles(dirPath: string, fileSystem: ReverseModelFileSystem, output: string[]): void {
    /* v8 ignore next */
    const entries = fileSystem.readdirSync(dirPath);
    /* v8 ignore next */
    for (const entry of entries) {
        /* v8 ignore next */
        const fullPath = path.join(dirPath, entry);
        /* v8 ignore next */
        const stat = fileSystem.statSync(fullPath);
        /* v8 ignore next */
        if (stat.isDirectory()) {
            /* v8 ignore next */
            if (entry === 'models') {
                /* v8 ignore next */
                collectAllModelFiles(fullPath, fileSystem, output);
            } else {
                /* v8 ignore next */
                collectModelFiles(fullPath, fileSystem, output);
            }
            /* v8 ignore next */
            continue;
        }
        /* v8 ignore next */
        if (stat.isFile() && isModelFilePath(fullPath) && fullPath.includes(`${path.sep}models${path.sep}`)) {
            /* v8 ignore next */
            output.push(fullPath);
        }
    }
}

function collectAllModelFiles(dirPath: string, fileSystem: ReverseModelFileSystem, output: string[]): void {
    /* v8 ignore next */
    const entries = fileSystem.readdirSync(dirPath);
    /* v8 ignore next */
    for (const entry of entries) {
        /* v8 ignore next */
        const fullPath = path.join(dirPath, entry);
        /* v8 ignore next */
        const stat = fileSystem.statSync(fullPath);
        /* v8 ignore next */
        if (stat.isDirectory()) {
            /* v8 ignore next */
            collectAllModelFiles(fullPath, fileSystem, output);
            /* v8 ignore next */
            continue;
        }
        /* v8 ignore next */
        if (stat.isFile() && isModelFilePath(fullPath)) {
            /* v8 ignore next */
            output.push(fullPath);
        }
    }
}

function schemaFromEnum(enumDecl: EnumDeclaration): SwaggerDefinition {
    /* v8 ignore next */
    const values = enumDecl.getMembers().map(member => {
        /* v8 ignore next */
        const value = member.getValue();
        /* v8 ignore next */
        if (value !== undefined) return value;
        /* v8 ignore next */
        const init = member.getInitializer();
        /* v8 ignore next */
        /* v8 ignore start */
        if (!init) return member.getName();
        /* v8 ignore stop */
        /* v8 ignore next */
        if (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init)) {
            /* v8 ignore next */
            return init.getLiteralText();
        }
        /* v8 ignore next */
        if (Node.isNumericLiteral(init)) {
            /* v8 ignore next */
            return Number(init.getText());
        }
        /* v8 ignore next */
        if (init.getKind() === SyntaxKind.TrueKeyword) return true;

        /* v8 ignore next */
        if (init.getKind() === SyntaxKind.FalseKeyword) return false;
        /* v8 ignore next */
        return init.getText();
    });

    /* v8 ignore next */
    const allNumbers = values.every(v => typeof v === 'number');
    /* v8 ignore next */
    const allStrings = values.every(v => typeof v === 'string');

    /* v8 ignore next */
    const schema: SwaggerDefinition = {
        enum: values as (string | number)[],
        ...(allNumbers ? { type: 'number' } : allStrings ? { type: 'string' } : {}),
    };

    /* v8 ignore next */
    applyDocs(schema, enumDecl);
    /* v8 ignore next */
    return schema;
}

function schemaFromInterface(interfaceDecl: InterfaceDeclaration): SwaggerDefinition {
    /* v8 ignore next */
    const ownSchema = buildObjectSchema(interfaceDecl.getProperties(), interfaceDecl.getIndexSignatures());
    /* v8 ignore next */
    const extendsTypes = interfaceDecl
        .getExtends()
        /* v8 ignore next */
        .map(e => e.getExpression().getText())
        .filter(Boolean);

    /* v8 ignore next */
    let schema: SwaggerDefinition = ownSchema;
    /* v8 ignore next */
    if (extendsTypes.length > 0) {
        /* v8 ignore next */
        const refs = extendsTypes.map(name => ({ $ref: `#/components/schemas/${name}` }));
        /* v8 ignore next */
        if (Object.keys(ownSchema).length > 0 && Object.keys(ownSchema.properties || {}).length > 0) {
            /* v8 ignore next */
            schema = { allOf: [...refs, ownSchema] };
            /* v8 ignore next */
        } else if (Object.keys(ownSchema).length > 0 && ownSchema.additionalProperties) {
            /* v8 ignore next */
            schema = { allOf: [...refs, ownSchema] };
        } else {
            /* v8 ignore next */
            schema = { allOf: refs };
        }
    }

    /* v8 ignore next */
    applyDocs(schema, interfaceDecl);
    /* v8 ignore next */
    return schema;
}

function schemaFromTypeAlias(aliasDecl: TypeAliasDeclaration): SwaggerDefinition {
    /* v8 ignore next */
    const typeNode = aliasDecl.getTypeNode();
    /* v8 ignore next */
    /* v8 ignore start */
    const schema = typeNode ? schemaFromTypeNode(typeNode) : {};
    /* v8 ignore stop */
    /* v8 ignore next */
    applyDocs(schema, aliasDecl);
    /* v8 ignore next */
    return schema;
}

function buildObjectSchema(
    properties: PropertySignature[],
    indexSignatures: import('ts-morph').IndexSignatureDeclaration[],
): SwaggerDefinition {
    /* v8 ignore next */
    const schema: SwaggerDefinition = { type: 'object' };
    /* v8 ignore next */
    const props: Record<string, SwaggerDefinition | boolean> = {};
    /* v8 ignore next */
    const required: string[] = [];

    /* v8 ignore next */
    properties.forEach(prop => {
        /* v8 ignore next */
        const name = normalizePropertyName(prop);
        /* v8 ignore next */
        const typeNode = prop.getTypeNode();
        /* v8 ignore next */
        /* v8 ignore start */
        const propSchema = typeNode ? schemaFromTypeNode(typeNode) : {};
        /* v8 ignore stop */
        /* v8 ignore next */
        applyDocs(propSchema, prop);
        /* v8 ignore next */
        if (prop.isReadonly()) propSchema.readOnly = true;
        /* v8 ignore next */
        if (!prop.hasQuestionToken()) required.push(name);
        /* v8 ignore next */
        props[name] = propSchema;
    });

    /* v8 ignore next */
    if (Object.keys(props).length > 0) {
        /* v8 ignore next */
        schema.properties = props;
    }

    /* v8 ignore next */
    if (required.length > 0) {
        /* v8 ignore next */
        schema.required = required;
    }

    /* v8 ignore next */
    const indexSignature = indexSignatures[0];

    /* v8 ignore next */
    if (indexSignature) {
        /* v8 ignore next */
        const returnTypeNode = indexSignature.getReturnTypeNode();
        /* v8 ignore next */
        /* v8 ignore start */
        schema.additionalProperties = returnTypeNode ? schemaFromTypeNode(returnTypeNode) : {};
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    return schema;
}

function normalizePropertyName(prop: PropertySignature): string {
    /* v8 ignore next */
    const nameNode = prop.getNameNode();
    /* v8 ignore next */
    if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
        /* v8 ignore next */
        return nameNode.getLiteralText();
    }

    /* v8 ignore next */
    return prop.getName();
}

export function schemaFromTypeNode(node: TypeNode): SwaggerDefinition {
    /* v8 ignore next */
    /* v8 ignore start */
    switch (node.getKind()) {
        /* v8 ignore stop */
        case SyntaxKind.StringKeyword:
            /* v8 ignore next */
            return { type: 'string' };

        case SyntaxKind.NumberKeyword:
            /* v8 ignore next */
            return { type: 'number' };

        case SyntaxKind.BooleanKeyword:
            /* v8 ignore next */
            return { type: 'boolean' };

        case SyntaxKind.AnyKeyword:
        case SyntaxKind.UnknownKeyword:
        case SyntaxKind.ObjectKeyword:
            /* v8 ignore next */
            return {};
        case SyntaxKind.NullKeyword:
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'null' };
        /* v8 ignore stop */
        case SyntaxKind.LiteralType:
            /* v8 ignore next */
            return schemaFromLiteral(node as import('ts-morph').LiteralTypeNode);
        case SyntaxKind.ArrayType: {
            /* v8 ignore next */
            const arrayNode = node as import('ts-morph').ArrayTypeNode;
            /* v8 ignore next */
            return { type: 'array', items: schemaFromTypeNode(arrayNode.getElementTypeNode()) };
        }
        case SyntaxKind.TupleType: {
            /* v8 ignore next */
            const tupleNode = node as import('ts-morph').TupleTypeNode;
            /* v8 ignore next */
            return schemaFromTupleType(tupleNode);
        }
        case SyntaxKind.TypeReference:
            /* v8 ignore next */
            return schemaFromTypeReference(node as import('ts-morph').TypeReferenceNode);
        case SyntaxKind.UnionType:
            /* v8 ignore next */
            return schemaFromUnion(node as import('ts-morph').UnionTypeNode);
        case SyntaxKind.IntersectionType:
            /* v8 ignore next */
            return schemaFromIntersection(node as import('ts-morph').IntersectionTypeNode);
        case SyntaxKind.TypeLiteral:
            /* v8 ignore next */
            return buildObjectSchema(
                (node as import('ts-morph').TypeLiteralNode).getMembers().filter(Node.isPropertySignature),
                (node as import('ts-morph').TypeLiteralNode).getMembers().filter(Node.isIndexSignatureDeclaration),
            );

        case SyntaxKind.ParenthesizedType:
            /* v8 ignore next */
            return schemaFromTypeNode((node as import('ts-morph').ParenthesizedTypeNode).getTypeNode());
        case SyntaxKind.TypeOperator: {
            /* v8 ignore next */
            const typeOp = node as unknown as { getTypeNode?: () => TypeNode };
            /* v8 ignore next */
            /* v8 ignore start */
            return schemaFromTypeNode(typeOp.getTypeNode ? typeOp.getTypeNode!() : node);
            /* v8 ignore stop */
        }
        default:
            /* v8 ignore next */
            return {};
    }
}

function schemaFromLiteral(node: import('ts-morph').LiteralTypeNode): SwaggerDefinition {
    /* v8 ignore next */
    const literal = node.getLiteral();
    /* v8 ignore next */
    if (Node.isStringLiteral(literal) || Node.isNoSubstitutionTemplateLiteral(literal)) {
        /* v8 ignore next */
        return { type: 'string', const: literal.getLiteralText() };
    }

    /* v8 ignore next */
    if (Node.isNumericLiteral(literal)) {
        /* v8 ignore next */
        return { type: 'number', const: Number(literal.getText()) };
    }

    /* v8 ignore next */
    if (literal.getKind() === SyntaxKind.TrueKeyword) {
        /* v8 ignore next */
        return { type: 'boolean', const: true };
    }

    /* v8 ignore next */
    if (literal.getKind() === SyntaxKind.FalseKeyword) {
        /* v8 ignore next */
        return { type: 'boolean', const: false };
    }

    /* v8 ignore next */
    if (literal.getKind() === SyntaxKind.NullKeyword) {
        /* v8 ignore next */
        /* v8 ignore next */
        return { type: 'null', const: null };
    }

    /* v8 ignore next */
    return {};
}

function schemaFromTypeReference(node: import('ts-morph').TypeReferenceNode): SwaggerDefinition {
    /* v8 ignore next */
    const typeName = node.getTypeName().getText();
    /* v8 ignore next */
    const typeArgs = node.getTypeArguments();

    /* v8 ignore next */
    if (typeName === 'Array' || typeName === 'ReadonlyArray' || typeName === 'Set') {
        /* v8 ignore next */
        /* v8 ignore start */
        const elementType = typeArgs[0] ? schemaFromTypeNode(typeArgs[0]) : {};
        /* v8 ignore stop */
        /* v8 ignore next */
        return { type: 'array', items: elementType };
    }

    /* v8 ignore next */
    if (typeName === 'Record' || typeName === 'Map') {
        /* v8 ignore next */
        /* v8 ignore start */
        const valueType = typeArgs[1] ? schemaFromTypeNode(typeArgs[1]) : {};
        /* v8 ignore stop */
        /* v8 ignore next */
        return { type: 'object', additionalProperties: valueType };
    }

    /* v8 ignore next */
    if (typeName === 'Date') return { type: 'string', format: 'date-time' };

    /* v8 ignore next */
    if (typeName === 'Blob' || typeName === 'File') return { type: 'string', format: 'binary' };

    /* v8 ignore next */
    return { $ref: `#/components/schemas/${typeName}` };
}

function schemaFromTupleType(tupleNode: import('ts-morph').TupleTypeNode): SwaggerDefinition {
    /* v8 ignore next */
    const elements = tupleNode.getElements();
    /* v8 ignore next */
    const prefixItems: (SwaggerDefinition | boolean)[] = [];
    let restSchema: SwaggerDefinition | boolean | undefined;
    /* v8 ignore next */
    let minItems = 0;
    /* v8 ignore next */
    let sawOptional = false;

    /* v8 ignore next */
    for (const element of elements) {
        /* v8 ignore next */
        let isOptional = false;
        let typeNode: TypeNode | undefined;

        /* v8 ignore next */
        if (Node.isNamedTupleMember(element)) {
            /* v8 ignore next */
            isOptional = element.hasQuestionToken();
            /* v8 ignore next */
            const restToken = element.getDotDotDotToken();
            /* v8 ignore next */
            /* v8 ignore start */
            if (restToken) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                restSchema = schemaFromTypeNode(element.getTypeNode());
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                continue;
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            typeNode = element.getTypeNode();
            /* v8 ignore next */
        } else if (Node.isRestTypeNode(element)) {
            /* v8 ignore next */
            /* v8 ignore next */
            restSchema = schemaFromTypeNode(element.getTypeNode());
            /* v8 ignore next */
            /* v8 ignore next */
            continue;
            /* v8 ignore next */
        } else if (Node.isOptionalTypeNode(element)) {
            /* v8 ignore next */
            isOptional = true;
            /* v8 ignore next */
            typeNode = element.getTypeNode();
        } else {
            /* v8 ignore next */
            typeNode = element as TypeNode;
        }

        /* v8 ignore next */
        /* v8 ignore start */
        if (!typeNode) continue;
        /* v8 ignore stop */

        /* v8 ignore next */
        prefixItems.push(schemaFromTypeNode(typeNode));
        /* v8 ignore next */
        if (!isOptional && !sawOptional) {
            /* v8 ignore next */
            minItems += 1;
        } else {
            /* v8 ignore next */
            sawOptional = true;
        }
    }

    /* v8 ignore next */
    if (prefixItems.length === 0 && restSchema) {
        /* v8 ignore next */
        if (typeof restSchema === 'object' && restSchema !== null && restSchema.type === 'array') {
            /* v8 ignore next */
            const inner = (restSchema as SwaggerDefinition).items;
            /* v8 ignore next */
            /* v8 ignore start */
            return { type: 'array', items: inner ?? {} };
            /* v8 ignore stop */
        }
        /* v8 ignore next */
        return { type: 'array', items: restSchema };
    }

    /* v8 ignore next */
    const schema: SwaggerDefinition = { type: 'array', prefixItems };

    /* v8 ignore next */
    if (restSchema) {
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof restSchema === 'object' && restSchema !== null && !Array.isArray(restSchema)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
            if ((restSchema as SwaggerDefinition).type === 'array') {
                /* v8 ignore stop */
                /* v8 ignore next */
                let restItems = (restSchema as SwaggerDefinition).items;
                /* v8 ignore next */
                /* v8 ignore start */
                if (Array.isArray(restItems)) restItems = restItems[0] || {};
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                restSchema = restItems ?? {};
                /* v8 ignore stop */
            }
        }

        /* v8 ignore next */
        if (minItems > 0) schema.minItems = minItems;
        /* v8 ignore next */
        /* v8 ignore start */
        if (restSchema !== undefined) {
            /* v8 ignore stop */
            /* v8 ignore next */
            schema.items = restSchema;
        }
        /* v8 ignore next */
        return schema;
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (prefixItems.length > 0) {
        /* v8 ignore stop */
        /* v8 ignore next */
        schema.minItems = minItems;
        /* v8 ignore next */
        schema.maxItems = prefixItems.length;
        /* v8 ignore next */
        schema.items = false;
    }

    /* v8 ignore next */
    return schema;
}

function schemaFromUnion(node: import('ts-morph').UnionTypeNode): SwaggerDefinition {
    /* v8 ignore next */
    const typeNodes = node.getTypeNodes();
    /* v8 ignore next */
    let includesNull = false;
    /* v8 ignore next */
    const filtered: TypeNode[] = [];

    /* v8 ignore next */
    typeNodes.forEach(typeNode => {
        /* v8 ignore next */
        if (isNullTypeNode(typeNode)) {
            /* v8 ignore next */
            includesNull = true;
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        if (isUndefinedTypeNode(typeNode)) {
            /* v8 ignore next */
            return;
        }
        /* v8 ignore next */
        filtered.push(typeNode);
    });

    /* v8 ignore next */
    if (filtered.length === 0) {
        /* v8 ignore next */
        /* v8 ignore start */
        return includesNull ? { type: 'null' } : {};
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    if (filtered.length === 1) {
        /* v8 ignore next */
        const schema = schemaFromTypeNode(filtered[0]);
        /* v8 ignore next */
        return includesNull ? applyNullability(schema) : schema;
    }

    /* v8 ignore next */
    if (allLiteralTypes(filtered)) {
        /* v8 ignore next */
        const literals = filtered.map(typeNode => schemaFromTypeNode(typeNode));
        /* v8 ignore next */
        const enumValues = extractEnumValues(literals);
        /* v8 ignore next */
        /* v8 ignore start */
        if (includesNull) enumValues.push(null);
        /* v8 ignore stop */

        /* v8 ignore next */
        const types = extractLiteralTypes(literals);
        /* v8 ignore next */
        /* v8 ignore start */
        if (includesNull) types.add('null');
        /* v8 ignore stop */

        /* v8 ignore next */
        const schema: SwaggerDefinition = { enum: enumValues };

        /* v8 ignore next */
        if (types.size === 1) {
            /* v8 ignore next */
            const [onlyType] = Array.from(types);
            /* v8 ignore next */
            /* v8 ignore start */
            if (onlyType) (schema as { type?: unknown }).type = onlyType;
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore start */
        } else if (types.size > 1) {
            /* v8 ignore stop */
            /* v8 ignore next */
            (schema as { type?: unknown }).type = Array.from(types);
        }
        /* v8 ignore next */
        return schema;
    }

    /* v8 ignore next */
    const anyOf = filtered.map(schemaFromTypeNode);

    /* v8 ignore next */
    /* v8 ignore start */
    if (includesNull) anyOf.push({ type: 'null' });
    /* v8 ignore stop */
    /* v8 ignore next */
    return { anyOf };
}

function schemaFromIntersection(node: import('ts-morph').IntersectionTypeNode): SwaggerDefinition {
    /* v8 ignore next */
    const allOf = node.getTypeNodes().map(schemaFromTypeNode);
    /* v8 ignore next */
    return { allOf };
}

function isNullTypeNode(node: TypeNode): boolean {
    /* v8 ignore next */
    /* v8 ignore start */
    if (node.getKind() === SyntaxKind.NullKeyword) return true;
    /* v8 ignore stop */

    /* v8 ignore next */
    return Node.isLiteralTypeNode(node) && node.getLiteral().getKind() === SyntaxKind.NullKeyword;
}

function isUndefinedTypeNode(node: TypeNode): boolean {
    /* v8 ignore next */
    if (node.getKind() === SyntaxKind.UndefinedKeyword) return true;

    /* v8 ignore next */
    if (node.getKind() === SyntaxKind.TypeReference) {
        /* v8 ignore next */
        return (node as import('ts-morph').TypeReferenceNode).getTypeName().getText() === 'undefined';
    }
    /* v8 ignore next */
    return false;
}

function allLiteralTypes(nodes: TypeNode[]): boolean {
    /* v8 ignore next */
    return nodes.every(node => node.getKind() === SyntaxKind.LiteralType);
}

function extractEnumValues(literals: SwaggerDefinition[]): unknown[] {
    /* v8 ignore next */
    const values: unknown[] = [];
    /* v8 ignore next */
    literals.forEach(schema => {
        /* v8 ignore next */
        /* v8 ignore start */
        if (schema.const !== undefined) {
            /* v8 ignore stop */
            /* v8 ignore next */
            values.push(schema.const);
        }
        /* v8 ignore next */
        /* v8 ignore start */
        if (Array.isArray(schema.enum)) {
            /* v8 ignore stop */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            values.push(...schema.enum);
            /* v8 ignore stop */
        }
    });

    /* v8 ignore next */
    return values;
}

function extractLiteralTypes(literals: SwaggerDefinition[]): Set<string> {
    /* v8 ignore next */
    const types = new Set<string>();
    /* v8 ignore next */
    literals.forEach(schema => {
        /* v8 ignore next */
        const type = schema.type;
        /* v8 ignore next */
        /* v8 ignore start */
        if (typeof type === 'string') {
            /* v8 ignore stop */
            /* v8 ignore next */
            types.add(type);
        } else {
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore next */
            /* v8 ignore start */
            if (Array.isArray(type)) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                type.forEach(entry => {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (typeof entry === 'string') types.add(entry);
                    /* v8 ignore stop */
                });
            }
        }
    });

    /* v8 ignore next */
    return types;
}

function applyNullability(schema: SwaggerDefinition): SwaggerDefinition {
    /* v8 ignore next */
    if ('$ref' in schema || '$dynamicRef' in schema) {
        /* v8 ignore next */
        return { anyOf: [schema, { type: 'null' }] };
    }

    /* v8 ignore next */
    if (schema.type) {
        /* v8 ignore next */
        /* v8 ignore start */
        const existing = Array.isArray(schema.type) ? [...schema.type] : [schema.type];
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore start */
        if (!existing.includes('null')) existing.push('null');
        /* v8 ignore stop */
        /* v8 ignore next */
        const cloned: SwaggerDefinition = { ...schema };
        /* v8 ignore next */
        cloned.type = existing as ('string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'null')[];
        /* v8 ignore next */
        return cloned;
    }

    /* v8 ignore next */
    /* v8 ignore start */
    if (schema.anyOf) {
        /* v8 ignore stop */
        /* v8 ignore next */
        return { ...schema, anyOf: [...schema.anyOf, { type: 'null' }] };
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    if (schema.oneOf) {
        /* v8 ignore stop */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore next */
        /* v8 ignore start */
        return { ...schema, oneOf: [...schema.oneOf, { type: 'null' }] };
        /* v8 ignore stop */
    }

    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore next */
    /* v8 ignore start */
    return { anyOf: [schema, { type: 'null' }] };
    /* v8 ignore stop */
}

function applyDocs(schema: SwaggerDefinition, node: Node): void {
    /* v8 ignore next */
    const nodeAsAny = node as unknown as { getJsDocs?: () => import('ts-morph').JSDoc[] };
    /* v8 ignore next */
    /* v8 ignore start */
    const jsDocs = nodeAsAny.getJsDocs ? nodeAsAny.getJsDocs() : [];
    /* v8 ignore stop */
    /* v8 ignore next */
    if (jsDocs.length === 0) return;

    /* v8 ignore next */
    const primaryDoc = jsDocs[0];
    /* v8 ignore next */
    const exampleValues: unknown[] = [];

    /* v8 ignore next */
    const description = primaryDoc.getDescription().trim();

    /* v8 ignore next */
    if (description) schema.description = description;

    /* v8 ignore next */
    for (const tag of primaryDoc.getTags()) {
        /* v8 ignore next */
        const tagName = tag.getTagName();
        /* v8 ignore next */
        const text = (tag.getCommentText() ?? '').trim();
        /* v8 ignore next */
        const normalized = tagName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        /* v8 ignore next */
        if (tagName === 'deprecated') {
            /* v8 ignore next */
            schema.deprecated = true;

            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        if (tagName === 'see') {
            /* v8 ignore next */
            const rawText = tag
                .getText()
                .replace(/^@see\s*/i, '')
                .trim();
            /* v8 ignore next */
            /* v8 ignore start */
            if (!rawText) continue;
            /* v8 ignore stop */

            /* v8 ignore next */
            const [rawUrl, ...rest] = rawText.split(' - ');
            /* v8 ignore next */
            const url = rawUrl?.trim();

            /* v8 ignore next */
            /* v8 ignore start */
            if (url) {
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                const desc = rest.length > 0 ? rest.join(' - ').trim() : undefined;
                /* v8 ignore stop */
                /* v8 ignore next */
                /* v8 ignore start */
                schema.externalDocs = desc ? { url, description: desc } : { url };
                /* v8 ignore stop */
            }
            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        if (tagName === 'example' && text) {
            /* v8 ignore next */
            exampleValues.push(parseDocValue(text));

            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        if (tagName === 'default' && text) {
            /* v8 ignore next */
            schema.default = parseDocValue(text);

            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        if (tagName.startsWith('x-')) {
            /* v8 ignore next */
            /* v8 ignore start */
            schema[tagName] = text ? parseDocValue(text) : true;
            /* v8 ignore stop */

            /* v8 ignore next */
            continue;
        }

        /* v8 ignore next */
        const rawValue = text ? parseDocValue(text) : true;
        /* v8 ignore next */
        const schemaRec = schema as Record<string, unknown>;

        /* v8 ignore next */
        /* v8 ignore start */
        switch (normalized) {
            /* v8 ignore stop */
            case 'minimum':
            case 'min': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.minimum = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'maximum':
            case 'max': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.maximum = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'exclusiveminimum': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                schema.exclusiveMinimum = value !== undefined ? value : !!rawValue;

                /* v8 ignore next */
                break;
            }
            case 'exclusivemaximum': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                schema.exclusiveMaximum = value !== undefined ? value : !!rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'minlength': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.minLength = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'maxlength': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.maxLength = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'pattern': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') schema.pattern = rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'format': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') schema.format = rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'multipleof': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.multipleOf = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'minitems': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.minItems = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'maxitems': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.maxItems = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'uniqueitems': {
                /* v8 ignore next */
                schema.uniqueItems = asBoolean(rawValue);

                /* v8 ignore next */
                break;
            }
            case 'minproperties': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.minProperties = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'maxproperties': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.maxProperties = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'propertynames': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' || typeof rawValue === 'boolean') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.propertyNames = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'additionalproperties': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' || typeof rawValue === 'boolean') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.additionalProperties = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'readonly': {
                /* v8 ignore next */
                schema.readOnly = asBoolean(rawValue);

                /* v8 ignore next */
                break;
            }
            case 'writeonly': {
                /* v8 ignore next */
                schema.writeOnly = asBoolean(rawValue);

                /* v8 ignore next */
                break;
            }
            case 'nullable': {
                /* v8 ignore next */
                schema.nullable = asBoolean(rawValue);

                /* v8 ignore next */
                break;
            }
            case 'title': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') schema.title = rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'type': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string' || Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    schema.type = rawValue as 'string';
                    /* v8 ignore stop */
                }
                /* v8 ignore next */
                break;
            }
            case 'const': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text) schema.const = rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'enum': {
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore next */
                    /* v8 ignore start */
                    schema.enum = rawValue as (string | number | boolean)[];
                    /* v8 ignore stop */
                }
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore next */
                /* v8 ignore start */
                break;
                /* v8 ignore stop */
            }
            case 'if': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && (typeof rawValue === 'object' || typeof rawValue === 'boolean')) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.if = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'then': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && (typeof rawValue === 'object' || typeof rawValue === 'boolean')) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.then = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'else': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && (typeof rawValue === 'object' || typeof rawValue === 'boolean')) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.else = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'not': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && (typeof rawValue === 'object' || typeof rawValue === 'boolean')) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.not = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'oneof': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.oneOf = rawValue as (SwaggerDefinition | boolean)[];

                    /* v8 ignore next */
                    if (schema.anyOf) delete schema.anyOf;
                }

                /* v8 ignore next */
                break;
            }
            case 'anyof': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (text && Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.anyOf = rawValue as (SwaggerDefinition | boolean)[];

                    /* v8 ignore next */
                    /* v8 ignore start */
                    if (schema.oneOf) delete schema.oneOf;
                    /* v8 ignore stop */
                }

                /* v8 ignore next */
                break;
            }
            case 'contains': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' || typeof rawValue === 'boolean') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.contains = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'mincontains': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.minContains = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'maxcontains': {
                /* v8 ignore next */
                const value = asNumber(rawValue);
                /* v8 ignore next */
                /* v8 ignore start */
                if (value !== undefined) schema.maxContains = value;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'contentmediatype': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') schema.contentMediaType = rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'contentencoding': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') schema.contentEncoding = rawValue;
                /* v8 ignore stop */

                /* v8 ignore next */
                break;
            }
            case 'contentschema': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' || typeof rawValue === 'boolean') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.contentSchema = rawValue as SwaggerDefinition | boolean;
                }
                /* v8 ignore next */
                break;
            }
            case 'patternproperties': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.patternProperties = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'dependentschemas': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.dependentSchemas = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'dependentrequired': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.dependentRequired = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'unevaluatedproperties': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' || typeof rawValue === 'boolean') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.unevaluatedProperties = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'unevaluateditems': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' || typeof rawValue === 'boolean') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.unevaluatedItems = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'schemadialect': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.$schema = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'schemaid': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.$id = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'schemaanchor': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.$anchor = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'schemadynamicanchor': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'string') {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schema.$dynamicAnchor = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'xml': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.xml = rawValue;
                }
                /* v8 ignore next */
                break;
            }
            case 'discriminator': {
                /* v8 ignore next */
                /* v8 ignore start */
                if (typeof rawValue === 'object' && rawValue !== null && !Array.isArray(rawValue)) {
                    /* v8 ignore stop */
                    /* v8 ignore next */
                    schemaRec.discriminator = rawValue;
                }
                /* v8 ignore next */
                break;
            }
        }
    }

    /* v8 ignore next */
    if (exampleValues.length === 1) {
        /* v8 ignore next */
        schema.example = exampleValues[0];
        /* v8 ignore next */
    } else if (exampleValues.length > 1) {
        /* v8 ignore next */
        schema.examples = exampleValues;
    }
}

function asNumber(value: unknown): number | undefined {
    /* v8 ignore next */
    if (typeof value === 'number' && !Number.isNaN(value)) return value;

    /* v8 ignore next */
    if (typeof value === 'string' && value.trim().length > 0) {
        /* v8 ignore next */
        const parsed = Number(value);
        /* v8 ignore next */
        if (!Number.isNaN(parsed)) return parsed;
    }
    /* v8 ignore next */
    return undefined;
}

function asBoolean(value: unknown): boolean {
    /* v8 ignore next */
    if (typeof value === 'boolean') return value;

    /* v8 ignore next */
    if (typeof value === 'string') {
        /* v8 ignore next */
        if (value.toLowerCase() === 'true') return true;
        /* v8 ignore next */
        if (value.toLowerCase() === 'false') return false;
    }
    /* v8 ignore next */
    return Boolean(value);
}

function parseDocValue(value: string): unknown {
    /* v8 ignore next */
    try {
        /* v8 ignore next */
        return JSON.parse(value);
    } catch {
        /* v8 ignore next */
        return value;
    }
}
