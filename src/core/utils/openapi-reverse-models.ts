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
import { SwaggerDefinition } from '../types/index.js';

/** Map of schema names to reconstructed schema definitions. */
export type ReverseSchemaMap = Record<string, SwaggerDefinition | boolean>;

/** File system requirements for reverse model parsing helpers. */
export type ReverseModelFileSystem = {
    statSync: (filePath: string) => { isFile: () => boolean; isDirectory: () => boolean };
    readFileSync: (filePath: string, encoding: string) => string;
    readdirSync: (dirPath: string) => string[];
};

const MODEL_FILE_SUFFIX = '.ts';
const MODEL_SPEC_SUFFIX = '.spec.ts';
const MODEL_DECL_SUFFIX = '.d.ts';

/**
 * Parses a generated model source file and returns reconstructed schema definitions.
 */
export function parseGeneratedModelSource(sourceText: string, filePath = 'models/index.ts'): ReverseSchemaMap {
    const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    return parseModelSourceFile(sourceFile);
}

/**
 * Parses generated model files from a file path or directory, returning reconstructed schemas.
 */
export function parseGeneratedModels(inputPath: string, fileSystem: ReverseModelFileSystem): ReverseSchemaMap {
    const stat = fileSystem.statSync(inputPath);
    const modelFiles: string[] = [];

    if (stat.isFile()) {
        if (!isModelFilePath(inputPath)) {
            throw new Error(`Expected a generated model file (*.ts). Received: ${inputPath}`);
        }
        modelFiles.push(inputPath);
    } else if (stat.isDirectory()) {
        collectModelFiles(inputPath, fileSystem, modelFiles);
    } else {
        throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
    }

    if (modelFiles.length === 0) {
        throw new Error(`No generated model files found under: ${inputPath}`);
    }

    const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
    const schemas: ReverseSchemaMap = {};

    for (const filePath of modelFiles) {
        const contents = fileSystem.readFileSync(filePath, 'utf-8');
        const sourceFile = project.createSourceFile(filePath, contents, { overwrite: true });
        Object.assign(schemas, parseModelSourceFile(sourceFile));
    }

    if (Object.keys(schemas).length === 0) {
        throw new Error(`No exported models could be reconstructed from: ${inputPath}`);
    }

    return schemas;
}

function parseModelSourceFile(sourceFile: import('ts-morph').SourceFile): ReverseSchemaMap {
    const schemas: ReverseSchemaMap = {};

    sourceFile.getEnums().forEach(enumDecl => {
        if (!enumDecl.isExported()) return;
        schemas[enumDecl.getName()] = schemaFromEnum(enumDecl);
    });

    sourceFile.getTypeAliases().forEach(aliasDecl => {
        if (!aliasDecl.isExported()) return;
        schemas[aliasDecl.getName()] = schemaFromTypeAlias(aliasDecl);
    });

    sourceFile.getInterfaces().forEach(interfaceDecl => {
        if (!interfaceDecl.isExported()) return;
        schemas[interfaceDecl.getName()] = schemaFromInterface(interfaceDecl);
    });

    return schemas;
}

function isModelFilePath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    return (
        normalized.endsWith(MODEL_FILE_SUFFIX) &&
        !normalized.endsWith(MODEL_SPEC_SUFFIX) &&
        !normalized.endsWith(MODEL_DECL_SUFFIX)
    );
}

function collectModelFiles(dirPath: string, fileSystem: ReverseModelFileSystem, output: string[]): void {
    const entries = fileSystem.readdirSync(dirPath);
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fileSystem.statSync(fullPath);
        if (stat.isDirectory()) {
            if (entry === 'models') {
                collectAllModelFiles(fullPath, fileSystem, output);
            } else {
                collectModelFiles(fullPath, fileSystem, output);
            }
            continue;
        }
        if (stat.isFile() && isModelFilePath(fullPath) && fullPath.includes(`${path.sep}models${path.sep}`)) {
            output.push(fullPath);
        }
    }
}

function collectAllModelFiles(dirPath: string, fileSystem: ReverseModelFileSystem, output: string[]): void {
    const entries = fileSystem.readdirSync(dirPath);
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry);
        const stat = fileSystem.statSync(fullPath);
        if (stat.isDirectory()) {
            collectAllModelFiles(fullPath, fileSystem, output);
            continue;
        }
        if (stat.isFile() && isModelFilePath(fullPath)) {
            output.push(fullPath);
        }
    }
}

function schemaFromEnum(enumDecl: EnumDeclaration): SwaggerDefinition {
    const values = enumDecl.getMembers().map(member => {
        const value = member.getValue();
        if (value !== undefined) return value;
        const init = member.getInitializer();
        if (!init) return member.getName();
        if (Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init)) {
            return init.getLiteralText();
        }
        if (Node.isNumericLiteral(init)) {
            return Number(init.getText());
        }
        if (init.getKind() === SyntaxKind.TrueKeyword) return true;
        if (init.getKind() === SyntaxKind.FalseKeyword) return false;
        return init.getText();
    });

    const allNumbers = values.every(v => typeof v === 'number');
    const allStrings = values.every(v => typeof v === 'string');
    const schema: SwaggerDefinition = {
        enum: values as (string | number)[],
        ...(allNumbers ? { type: 'number' } : allStrings ? { type: 'string' } : {}),
    };

    applyDocs(schema, enumDecl);
    return schema;
}

function schemaFromInterface(interfaceDecl: InterfaceDeclaration): SwaggerDefinition {
    const ownSchema = buildObjectSchema(interfaceDecl.getProperties(), interfaceDecl.getIndexSignatures());
    const extendsTypes = interfaceDecl.getExtends().map(e => e.getExpression().getText()).filter(Boolean);

    let schema: SwaggerDefinition = ownSchema;
    if (extendsTypes.length > 0) {
        const refs = extendsTypes.map(name => ({ $ref: `#/components/schemas/${name}` }));
        if (Object.keys(ownSchema).length > 0 && Object.keys(ownSchema.properties || {}).length > 0) {
            schema = { allOf: [...refs, ownSchema] };
        } else if (Object.keys(ownSchema).length > 0 && ownSchema.additionalProperties) {
            schema = { allOf: [...refs, ownSchema] };
        } else {
            schema = { allOf: refs };
        }
    }

    applyDocs(schema, interfaceDecl);
    return schema;
}

function schemaFromTypeAlias(aliasDecl: TypeAliasDeclaration): SwaggerDefinition {
    const typeNode = aliasDecl.getTypeNode();
    const schema = typeNode ? schemaFromTypeNode(typeNode) : {};
    applyDocs(schema, aliasDecl);
    return schema;
}

function buildObjectSchema(
    properties: PropertySignature[],
    indexSignatures: import('ts-morph').IndexSignatureDeclaration[],
): SwaggerDefinition {
    const schema: SwaggerDefinition = { type: 'object' };
    const props: Record<string, SwaggerDefinition | boolean> = {};
    const required: string[] = [];

    properties.forEach(prop => {
        const name = normalizePropertyName(prop);
        const typeNode = prop.getTypeNode();
        const propSchema = typeNode ? schemaFromTypeNode(typeNode) : {};
        applyDocs(propSchema, prop);
        if (prop.isReadonly()) propSchema.readOnly = true;
        if (!prop.hasQuestionToken()) required.push(name);
        props[name] = propSchema;
    });

    if (Object.keys(props).length > 0) {
        schema.properties = props;
    }
    if (required.length > 0) {
        schema.required = required;
    }

    const indexSignature = indexSignatures[0];
    if (indexSignature) {
        const returnTypeNode = indexSignature.getReturnTypeNode();
        schema.additionalProperties = returnTypeNode ? schemaFromTypeNode(returnTypeNode) : {};
    }

    return schema;
}

function normalizePropertyName(prop: PropertySignature): string {
    const nameNode = prop.getNameNode();
    if (Node.isStringLiteral(nameNode) || Node.isNoSubstitutionTemplateLiteral(nameNode)) {
        return nameNode.getLiteralText();
    }
    return prop.getName();
}

function schemaFromTypeNode(node: TypeNode): SwaggerDefinition {
    switch (node.getKind()) {
        case SyntaxKind.StringKeyword:
            return { type: 'string' };
        case SyntaxKind.NumberKeyword:
            return { type: 'number' };
        case SyntaxKind.BooleanKeyword:
            return { type: 'boolean' };
        case SyntaxKind.AnyKeyword:
        case SyntaxKind.UnknownKeyword:
        case SyntaxKind.ObjectKeyword:
            return {};
        case SyntaxKind.NullKeyword:
            return { nullable: true };
        case SyntaxKind.LiteralType:
            return schemaFromLiteral(node as import('ts-morph').LiteralTypeNode);
        case SyntaxKind.ArrayType: {
            const arrayNode = node as import('ts-morph').ArrayTypeNode;
            return { type: 'array', items: schemaFromTypeNode(arrayNode.getElementTypeNode()) };
        }
        case SyntaxKind.TupleType: {
            const tupleNode = node as import('ts-morph').TupleTypeNode;
            return schemaFromTupleType(tupleNode);
        }
        case SyntaxKind.TypeReference:
            return schemaFromTypeReference(node as import('ts-morph').TypeReferenceNode);
        case SyntaxKind.UnionType:
            return schemaFromUnion(node as import('ts-morph').UnionTypeNode);
        case SyntaxKind.IntersectionType:
            return schemaFromIntersection(node as import('ts-morph').IntersectionTypeNode);
        case SyntaxKind.TypeLiteral:
            return buildObjectSchema(
                (node as import('ts-morph').TypeLiteralNode)
                    .getMembers()
                    .filter(Node.isPropertySignature),
                (node as import('ts-morph').TypeLiteralNode)
                    .getMembers()
                    .filter(Node.isIndexSignatureDeclaration),
            );
        case SyntaxKind.ParenthesizedType:
            return schemaFromTypeNode((node as import('ts-morph').ParenthesizedTypeNode).getTypeNode());
        case SyntaxKind.TypeOperator:
            return schemaFromTypeNode((node as import('ts-morph').TypeOperatorNode).getTypeNode());
        default:
            return {};
    }
}

function schemaFromLiteral(node: import('ts-morph').LiteralTypeNode): SwaggerDefinition {
    const literal = node.getLiteral();
    if (Node.isStringLiteral(literal) || Node.isNoSubstitutionTemplateLiteral(literal)) {
        return { type: 'string', enum: [literal.getLiteralText()] };
    }
    if (Node.isNumericLiteral(literal)) {
        return { type: 'number', enum: [Number(literal.getText())] };
    }
    if (literal.getKind() === SyntaxKind.TrueKeyword) {
        return { type: 'boolean', enum: [true] };
    }
    if (literal.getKind() === SyntaxKind.FalseKeyword) {
        return { type: 'boolean', enum: [false] };
    }
    if (literal.getKind() === SyntaxKind.NullKeyword) {
        return { nullable: true };
    }
    return {};
}

function schemaFromTypeReference(node: import('ts-morph').TypeReferenceNode): SwaggerDefinition {
    const typeName = node.getTypeName().getText();
    const typeArgs = node.getTypeArguments();

    if (typeName === 'Array' || typeName === 'ReadonlyArray' || typeName === 'Set') {
        const elementType = typeArgs[0] ? schemaFromTypeNode(typeArgs[0]) : {};
        return { type: 'array', items: elementType };
    }

    if (typeName === 'Record' || typeName === 'Map') {
        const valueType = typeArgs[1] ? schemaFromTypeNode(typeArgs[1]) : {};
        return { type: 'object', additionalProperties: valueType };
    }

    if (typeName === 'Date') return { type: 'string', format: 'date-time' };
    if (typeName === 'Blob' || typeName === 'File') return { type: 'string', format: 'binary' };

    return { $ref: `#/components/schemas/${typeName}` };
}

function schemaFromTupleType(tupleNode: import('ts-morph').TupleTypeNode): SwaggerDefinition {
    const elements = tupleNode.getElements();
    const prefixItems: (SwaggerDefinition | boolean)[] = [];
    let restSchema: SwaggerDefinition | boolean | undefined;
    let minItems = 0;
    let sawOptional = false;

    for (const element of elements) {
        let isOptional = false;
        let typeNode: TypeNode | undefined;

        if (Node.isNamedTupleMember(element)) {
            isOptional = element.hasQuestionToken();
            const restToken = element.getDotDotDotToken();
            if (restToken) {
                restSchema = schemaFromTypeNode(element.getTypeNode());
                continue;
            }
            typeNode = element.getTypeNode();
        } else if (Node.isRestTypeNode(element)) {
            restSchema = schemaFromTypeNode(element.getTypeNode());
            continue;
        } else if (Node.isOptionalTypeNode(element)) {
            isOptional = true;
            typeNode = element.getTypeNode();
        } else {
            typeNode = element as TypeNode;
        }

        if (!typeNode) continue;
        prefixItems.push(schemaFromTypeNode(typeNode));
        if (!isOptional && !sawOptional) {
            minItems += 1;
        } else {
            sawOptional = true;
        }
    }

    if (prefixItems.length === 0 && restSchema) {
        if (typeof restSchema === 'object' && restSchema !== null && restSchema.type === 'array') {
            const inner = (restSchema as SwaggerDefinition).items;
            return { type: 'array', items: inner ?? {} };
        }
        return { type: 'array', items: restSchema };
    }

    const schema: SwaggerDefinition = { type: 'array', prefixItems };
    if (restSchema) {
        if (typeof restSchema === 'object' && restSchema !== null && restSchema.type === 'array') {
            restSchema = (restSchema as SwaggerDefinition).items ?? {};
        }
        if (minItems > 0) schema.minItems = minItems;
        schema.items = restSchema;
        return schema;
    }

    if (prefixItems.length > 0) {
        schema.minItems = minItems;
        schema.maxItems = prefixItems.length;
        schema.items = false;
    }

    return schema;
}

function schemaFromUnion(node: import('ts-morph').UnionTypeNode): SwaggerDefinition {
    const typeNodes = node.getTypeNodes();
    let nullable = false;
    const filtered: TypeNode[] = [];

    typeNodes.forEach(typeNode => {
        if (isNullTypeNode(typeNode)) {
            nullable = true;
            return;
        }
        if (isUndefinedTypeNode(typeNode)) {
            return;
        }
        filtered.push(typeNode);
    });

    if (filtered.length === 1) {
        const schema = schemaFromTypeNode(filtered[0]);
        if (nullable) schema.nullable = true;
        return schema;
    }

    if (allLiteralTypes(filtered)) {
        const literals = filtered.map(typeNode => schemaFromTypeNode(typeNode));
        const enumValues = literals
            .flatMap(schema => (schema.enum ? schema.enum : []))
            .filter(value => value !== undefined);
        const type = literals.find(schema => schema.type)?.type;
        const schema: SwaggerDefinition = { enum: enumValues as (string | number)[] };
        if (type) schema.type = type;
        if (nullable) schema.nullable = true;
        return schema;
    }

    const anyOf = filtered.map(schemaFromTypeNode);
    const schema: SwaggerDefinition = { anyOf };
    if (nullable) schema.nullable = true;
    return schema;
}

function schemaFromIntersection(node: import('ts-morph').IntersectionTypeNode): SwaggerDefinition {
    const allOf = node.getTypeNodes().map(schemaFromTypeNode);
    return { allOf };
}

function isNullTypeNode(node: TypeNode): boolean {
    if (node.getKind() === SyntaxKind.NullKeyword) return true;
    return Node.isLiteralTypeNode(node) && node.getLiteral().getKind() === SyntaxKind.NullKeyword;
}

function isUndefinedTypeNode(node: TypeNode): boolean {
    if (node.getKind() === SyntaxKind.UndefinedKeyword) return true;
    if (node.getKind() === SyntaxKind.TypeReference) {
        return (node as import('ts-morph').TypeReferenceNode).getTypeName().getText() === 'undefined';
    }
    return false;
}

function allLiteralTypes(nodes: TypeNode[]): boolean {
    return nodes.every(node => node.getKind() === SyntaxKind.LiteralType);
}

function applyDocs(schema: SwaggerDefinition, node: Node): void {
    const jsDocs = node.getJsDocs();
    if (jsDocs.length === 0) return;
    const primaryDoc = jsDocs[0];
    const exampleValues: unknown[] = [];

    const description = primaryDoc.getDescription().trim();
    if (description) schema.description = description;

    for (const tag of primaryDoc.getTags()) {
        const tagName = tag.getTagName();
        const text = (tag.getCommentText() ?? '').trim();
        const normalized = tagName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

        if (tagName === 'deprecated') {
            schema.deprecated = true;
            continue;
        }

        if (tagName === 'example' && text) {
            exampleValues.push(parseDocValue(text));
            continue;
        }

        if (tagName === 'default' && text) {
            schema.default = parseDocValue(text);
            continue;
        }

        const rawValue = text ? parseDocValue(text) : true;

        switch (normalized) {
            case 'minimum':
            case 'min': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.minimum = value;
                break;
            }
            case 'maximum':
            case 'max': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.maximum = value;
                break;
            }
            case 'exclusiveminimum': {
                const value = asNumber(rawValue);
                schema.exclusiveMinimum = value !== undefined ? value : !!rawValue;
                break;
            }
            case 'exclusivemaximum': {
                const value = asNumber(rawValue);
                schema.exclusiveMaximum = value !== undefined ? value : !!rawValue;
                break;
            }
            case 'minlength': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.minLength = value;
                break;
            }
            case 'maxlength': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.maxLength = value;
                break;
            }
            case 'pattern': {
                if (typeof rawValue === 'string') schema.pattern = rawValue;
                break;
            }
            case 'format': {
                if (typeof rawValue === 'string') schema.format = rawValue;
                break;
            }
            case 'multipleof': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.multipleOf = value;
                break;
            }
            case 'minitems': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.minItems = value;
                break;
            }
            case 'maxitems': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.maxItems = value;
                break;
            }
            case 'uniqueitems': {
                schema.uniqueItems = asBoolean(rawValue);
                break;
            }
            case 'minproperties': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.minProperties = value;
                break;
            }
            case 'maxproperties': {
                const value = asNumber(rawValue);
                if (value !== undefined) schema.maxProperties = value;
                break;
            }
            case 'readonly': {
                schema.readOnly = asBoolean(rawValue);
                break;
            }
            case 'writeonly': {
                schema.writeOnly = asBoolean(rawValue);
                break;
            }
            case 'nullable': {
                schema.nullable = asBoolean(rawValue);
                break;
            }
            case 'title': {
                if (typeof rawValue === 'string') schema.title = rawValue;
                break;
            }
            case 'contentmediatype': {
                if (typeof rawValue === 'string') schema.contentMediaType = rawValue;
                break;
            }
            case 'contentencoding': {
                if (typeof rawValue === 'string') schema.contentEncoding = rawValue;
                break;
            }
        }
    }

    if (exampleValues.length === 1) {
        schema.example = exampleValues[0];
    } else if (exampleValues.length > 1) {
        schema.examples = exampleValues;
    }
}

function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
    }
    return undefined;
}

function asBoolean(value: unknown): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
    }
    return Boolean(value);
}

function parseDocValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}
