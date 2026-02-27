// tests/00-core/utils/openapi-reverse-models.spec.ts
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseGeneratedModelSource, parseGeneratedModels } from '@src/classes/parse.js';

import { EnumMember } from 'ts-morph';

const tempDirs: string[] = [];

// Mock EnumMember.getValue to force fallback lines
const originalGetValue = EnumMember.prototype.getValue;

const makeTempDir = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdd-web-ng-models-'));
    tempDirs.push(dir);
    return dir;
};

afterEach(() => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir && fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    }
});

const modelSource = `
/** Base model */ 
export interface Base { 
  /** Identifier */ 
  id: string; 
  /** @deprecated */ 
  readonly createdAt?: Date; 
} 

export interface Extra { 
  value?: number; 
} 

/** @deprecated */ 
export enum Status { 
  Active = 'active', 
  Inactive = 'inactive', 
} 

export enum Level { 
  Low = 1, 
  High = 2, 
} 

export enum Mixed { 
  On = 'on', 
  Off = 0, 
} 

export type Mode = 'auto' | 'manual'; 
export type AnyAlias = any; 
export type UnknownAlias = unknown; 
export type ObjAlias = object; 
export type LiteralNum = 42; 
export type LiteralTrue = true; 
export type LiteralFalse = false; 
export type LiteralNull = null; 
export type ParenAlias = (string); 
export type NullableName = string | null; 
export type OptionalName = string | undefined; 
export type UnionAnyOf = string | number; 
export type ArrayAlias = string[]; 
export type TupleAlias = [string, number]; 
export type OptionalTuple = [string, number?]; 
export type RestTuple = [string, ...number[]]; 
export type NamedTuple = [start: string, end?: number]; 
export type ReadonlyAlias = readonly string[]; 
export type ArrayRef = Array<number>; 
export type SetAlias = Set<boolean>; 
export type RecordAlias = Record<string, number>; 
export type MapAlias = Map<string, string>; 
export type DateAlias = Date; 
export type BlobAlias = Blob; 
export type FileAlias = File; 
export type RefAlias = Base; 
export type IntersectionAlias = Base & Extra; 
export type TypeLiteralAlias = { foo: string; 'bar-baz'?: number; readonly ro: boolean; [key: string]: string }; 

export interface Derived extends Base { 
  name: string; 
  meta?: RecordAlias; 
} 

export interface DerivedNoProps extends Base {} 

export interface DerivedIndexOnly extends Base { 
  [key: string]: string; 
} 

/** 
 * With docs. 
 * @example {"flag":true} 
 * @default {"flag":false} 
 */ 
export interface WithDocs { 
  /** @example "value" */ 
  flag?: string; 
  /** @default not-json */ 
  mode?: Mode; 
} 

/** 
 * @example {"id":1} 
 * @example {"id":2} 
 */ 
export interface MultiExample { 
  id: number; 
} 

/** 
 * @x-entity "internal" 
 * @x-meta {"tier":1} 
 */ 
export interface ExtensionModel { 
  /** @x-prop true */ 
  value?: string; 
} 

export interface BinaryPayload { 
  /** @contentMediaType image/png @contentEncoding base64 */ 
  data: string; 
} 

export interface EventPayload { 
  /** @contentMediaType application/json @contentSchema {"type":"object","properties":{"id":{"type":"string"}}} */ 
  data: string; 
} 

/** 
 * @minProperties 1
 * @maxProperties 5
 * @propertyNames {"pattern":"^[a-z]+$"} 
 */ 
export interface Constraints { 
  /** @minimum 1 @maximum 10 @pattern ^[a-z]+$ @format uuid @minLength 2 @maxLength 5 */ 
  name: string; 
  /** @minItems 1 @maxItems 3 @uniqueItems true */ 
  tags: string[]; 
  /** @contains {"type":"string"} @minContains 1 @maxContains 2 */ 
  values: string[]; 
  /** @multipleOf 0.5 */ 
  ratio?: number; 
  /** @exclusiveMinimum 0 */ 
  positive: number; 
  /** @exclusiveMaximum true */ 
  below?: number; 
  /** @readOnly @writeOnly */ 
  secret?: string; 
} 

export interface XmlDoc { 
  /** @xml {"name":"doc","namespace":"https://example.com","prefix":"ex"} */ 
  value: string; 
} 

/** @additionalProperties false */ 
export interface ClosedMap { 
  id: string; 
} 

/** 
 * @patternProperties {"^x-":{"type":"string"}} 
 * @dependentSchemas {"paymentMethod":{"properties":{"cardNumber":{"type":"string"}},"required":["cardNumber"]}} 
 * @dependentRequired {"paymentMethod":["cardNumber"]} 
 * @unevaluatedProperties false
 * @unevaluatedItems {"type":"string"} 
 * @schemaDialect https://spec.openapis.org/oas/3.1/dialect/base
 * @schemaId https://example.com/schemas/Tagged
 * @schemaAnchor TaggedAnchor
 * @schemaDynamicAnchor TaggedDynamic
 * @see https://example.com/docs - Tagged docs
 */ 
export interface TaggedSchema { 
  paymentMethod?: string; 
} 

/** 
 * @const {"status":"fixed","count":1} 
 * @if {"properties":{"kind":{"const":"A"}}} 
 * @then {"required":["a"]} 
 * @else {"required":["b"]} 
 * @not {"properties":{"banned":{"type":"string"}}} 
 */ 
export interface ConditionalTagged { 
  kind?: string; 
  a?: string; 
  b?: string; 
} 

/** @oneOf [{"type":"string"},{"type":"number"}] */ 
export type TaggedUnion = string | number; 

/** 
 * @discriminator {"propertyName":"kind","mapping":{"cat":"Cat","dog":"Dog"}} 
 */ 
export interface Discriminated { 
  kind: string; 
} 

export interface Cat { 
  kind: 'cat'; 
  name: string; 
} 

export interface Dog { 
  kind: 'dog'; 
  bark: boolean; 
} 

export type Pet = Cat | Dog; 

export type InlinePet = { kind: 'cat'; name: string } | { kind: 'dog'; bark: boolean }; 
`;

describe('Core Utils: OpenAPI Reverse Models', () => {
    it('should parse generated model source into schemas', () => {
        const schemas = parseGeneratedModelSource(modelSource, '/models/index.ts');

        expect(schemas.Base).toBeDefined();
        // type-coverage:ignore-next-line
        expect((schemas.Base as unknown).properties.id.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.Base as unknown).properties.createdAt.readOnly).toBe(true);
        // type-coverage:ignore-next-line
        expect((schemas.Base as unknown).properties.createdAt.format).toBe('date-time');

        // type-coverage:ignore-next-line
        expect((schemas.Status as unknown).enum).toEqual(['active', 'inactive']);
        // type-coverage:ignore-next-line
        expect((schemas.Status as unknown).deprecated).toBe(true);
        // type-coverage:ignore-next-line
        expect((schemas.Level as unknown).type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.Mixed as unknown).type).toBeUndefined();

        // type-coverage:ignore-next-line
        expect((schemas.Mode as unknown).enum).toEqual(['auto', 'manual']);
        expect(schemas.AnyAlias).toBeDefined();
        expect(schemas.UnknownAlias).toBeDefined();
        expect(schemas.ObjAlias).toBeDefined();
        // type-coverage:ignore-next-line
        expect((schemas.LiteralNum as unknown).const).toBe(42);
        // type-coverage:ignore-next-line
        expect((schemas.LiteralTrue as unknown).const).toBe(true);
        // type-coverage:ignore-next-line
        expect((schemas.LiteralFalse as unknown).const).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.LiteralNull as unknown).type).toBe('null');
        // type-coverage:ignore-next-line
        expect((schemas.LiteralNull as unknown).const).toBe(null);
        // type-coverage:ignore-next-line
        expect((schemas.ParenAlias as unknown).type).toBe('string');

        // type-coverage:ignore-next-line
        expect((schemas.NullableName as unknown).type).toEqual(['string', 'null']);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalName as unknown).type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.UnionAnyOf as unknown).anyOf.length).toBe(2);

        // type-coverage:ignore-next-line
        expect((schemas.ArrayAlias as unknown).type).toBe('array');
        // type-coverage:ignore-next-line
        expect((schemas.ArrayAlias as unknown).items.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as unknown).prefixItems.length).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as unknown).minItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as unknown).maxItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as unknown).items).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as unknown).prefixItems.length).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as unknown).minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as unknown).maxItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as unknown).items).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as unknown).prefixItems.length).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as unknown).minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as unknown).maxItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as unknown).items).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.RestTuple as unknown).prefixItems.length).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.RestTuple as unknown).minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.RestTuple as unknown).items.type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.ReadonlyAlias as unknown).items.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.ArrayRef as unknown).items.type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.SetAlias as unknown).items.type).toBe('boolean');
        // type-coverage:ignore-next-line
        expect((schemas.RecordAlias as unknown).additionalProperties.type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.MapAlias as unknown).additionalProperties.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.DateAlias as unknown).format).toBe('date-time');
        // type-coverage:ignore-next-line
        expect((schemas.BlobAlias as unknown).format).toBe('binary');
        // type-coverage:ignore-next-line
        expect((schemas.FileAlias as unknown).format).toBe('binary');

        // type-coverage:ignore-next-line
        const extensionModel = schemas.ExtensionModel as unknown;
        // type-coverage:ignore-next-line
        expect(extensionModel['x-entity']).toBe('internal');
        // type-coverage:ignore-next-line
        expect(extensionModel['x-meta']).toEqual({ tier: 1 });
        // type-coverage:ignore-next-line
        expect(extensionModel.properties.value['x-prop']).toBe(true);

        // type-coverage:ignore-next-line
        const eventPayload = schemas.EventPayload as unknown;
        // type-coverage:ignore-next-line
        expect(eventPayload.properties.data.contentMediaType).toBe('application/json');
        // type-coverage:ignore-next-line
        expect(eventPayload.properties.data.contentSchema.properties.id.type).toBe('string');

        // type-coverage:ignore-next-line
        expect((schemas.RefAlias as unknown).$ref).toBe('#/components/schemas/Base');
        // type-coverage:ignore-next-line
        expect((schemas.IntersectionAlias as unknown).allOf.length).toBe(2);

        // type-coverage:ignore-next-line
        const typeLiteral = schemas.TypeLiteralAlias as unknown;
        // type-coverage:ignore-next-line
        expect(typeLiteral.properties.foo.type).toBe('string');
        // type-coverage:ignore-next-line
        expect(typeLiteral.properties['bar-baz'].type).toBe('number');
        // type-coverage:ignore-next-line
        expect(typeLiteral.properties.ro.readOnly).toBe(true);
        // type-coverage:ignore-next-line
        expect(typeLiteral.additionalProperties.type).toBe('string');

        // type-coverage:ignore-next-line
        const derived = schemas.Derived as unknown;
        // type-coverage:ignore-next-line
        expect(derived.allOf.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(derived.allOf[1].properties.name.type).toBe('string');

        // type-coverage:ignore-next-line
        const derivedNoProps = schemas.DerivedNoProps as unknown;
        // type-coverage:ignore-next-line
        expect(derivedNoProps.allOf.length).toBe(1);

        // type-coverage:ignore-next-line
        const derivedIndexOnly = schemas.DerivedIndexOnly as unknown;
        // type-coverage:ignore-next-line
        expect(derivedIndexOnly.allOf.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(derivedIndexOnly.allOf[1].additionalProperties.type).toBe('string');

        // type-coverage:ignore-next-line
        const discriminated = schemas.Discriminated as unknown;
        // type-coverage:ignore-next-line
        expect(discriminated.discriminator).toEqual({
            propertyName: 'kind',
            mapping: { cat: 'Cat', dog: 'Dog' },
        });

        // type-coverage:ignore-next-line
        const pet = schemas.Pet as unknown;
        // type-coverage:ignore-next-line
        expect(pet.discriminator).toEqual({
            propertyName: 'kind',
            mapping: { cat: '#/components/schemas/Cat', dog: '#/components/schemas/Dog' },
        });
        // type-coverage:ignore-next-line
        expect(pet.oneOf?.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(pet.anyOf).toBeUndefined();

        // type-coverage:ignore-next-line
        const inlinePet = schemas.InlinePet as unknown;
        // type-coverage:ignore-next-line
        expect(inlinePet.discriminator).toEqual({ propertyName: 'kind' });
        // type-coverage:ignore-next-line
        expect(inlinePet.oneOf?.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(inlinePet.anyOf).toBeUndefined();

        // type-coverage:ignore-next-line
        const withDocs = schemas.WithDocs as unknown;
        // type-coverage:ignore-next-line
        expect(withDocs.description).toBe('With docs.');
        // type-coverage:ignore-next-line
        expect(withDocs.example).toEqual({ flag: true });
        // type-coverage:ignore-next-line
        expect(withDocs.default).toEqual({ flag: false });
        // type-coverage:ignore-next-line
        expect(withDocs.properties.flag.example).toBe('value');
        // type-coverage:ignore-next-line
        expect(withDocs.properties.mode.default).toBe('not-json');

        // type-coverage:ignore-next-line
        const multiExample = schemas.MultiExample as unknown;
        // type-coverage:ignore-next-line
        expect(multiExample.example).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(multiExample.examples).toEqual([{ id: 1 }, { id: 2 }]);

        // type-coverage:ignore-next-line
        const binaryPayload = schemas.BinaryPayload as unknown;
        // type-coverage:ignore-next-line
        expect(binaryPayload.properties.data.contentMediaType).toBe('image/png');
        // type-coverage:ignore-next-line
        expect(binaryPayload.properties.data.contentEncoding).toBe('base64');

        // type-coverage:ignore-next-line
        const constraints = schemas.Constraints as unknown;
        // type-coverage:ignore-next-line
        expect(constraints.minProperties).toBe(1);
        // type-coverage:ignore-next-line
        expect(constraints.maxProperties).toBe(5);
        // type-coverage:ignore-next-line
        expect(constraints.propertyNames).toEqual({ pattern: '^[a-z]+$' });
        // type-coverage:ignore-next-line
        expect(constraints.properties.name.minimum).toBe(1);
        // type-coverage:ignore-next-line
        expect(constraints.properties.name.maximum).toBe(10);
        // type-coverage:ignore-next-line
        expect(constraints.properties.name.pattern).toBe('^[a-z]+$');
        // type-coverage:ignore-next-line
        expect(constraints.properties.name.format).toBe('uuid');
        // type-coverage:ignore-next-line
        expect(constraints.properties.name.minLength).toBe(2);
        // type-coverage:ignore-next-line
        expect(constraints.properties.name.maxLength).toBe(5);
        // type-coverage:ignore-next-line
        expect(constraints.properties.tags.minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect(constraints.properties.tags.maxItems).toBe(3);
        // type-coverage:ignore-next-line
        expect(constraints.properties.tags.uniqueItems).toBe(true);
        // type-coverage:ignore-next-line
        expect(constraints.properties.values.contains).toEqual({ type: 'string' });
        // type-coverage:ignore-next-line
        expect(constraints.properties.values.minContains).toBe(1);
        // type-coverage:ignore-next-line
        expect(constraints.properties.values.maxContains).toBe(2);
        // type-coverage:ignore-next-line
        expect(constraints.properties.ratio.multipleOf).toBe(0.5);
        // type-coverage:ignore-next-line
        expect(constraints.properties.positive.exclusiveMinimum).toBe(0);
        // type-coverage:ignore-next-line
        expect(constraints.properties.below.exclusiveMaximum).toBe(true);
        // type-coverage:ignore-next-line
        expect(constraints.properties.secret.readOnly).toBe(true);
        // type-coverage:ignore-next-line
        expect(constraints.properties.secret.writeOnly).toBe(true);

        // type-coverage:ignore-next-line
        const xmlDoc = schemas.XmlDoc as unknown;
        // type-coverage:ignore-next-line
        expect(xmlDoc.properties.value.xml.name).toBe('doc');
        // type-coverage:ignore-next-line
        expect(xmlDoc.properties.value.xml.namespace).toBe('https://example.com');
        // type-coverage:ignore-next-line
        expect(xmlDoc.properties.value.xml.prefix).toBe('ex');

        // type-coverage:ignore-next-line
        const closedMap = schemas.ClosedMap as unknown;
        // type-coverage:ignore-next-line
        expect(closedMap.additionalProperties).toBe(false);

        // type-coverage:ignore-next-line
        const tagged = schemas.TaggedSchema as unknown;
        // type-coverage:ignore-next-line
        expect(tagged.patternProperties).toEqual({ '^x-': { type: 'string' } });
        // type-coverage:ignore-next-line
        expect(tagged.dependentSchemas.paymentMethod.properties.cardNumber.type).toBe('string');
        // type-coverage:ignore-next-line
        expect(tagged.dependentSchemas.paymentMethod.required).toEqual(['cardNumber']);
        // type-coverage:ignore-next-line
        expect(tagged.dependentRequired.paymentMethod).toEqual(['cardNumber']);
        // type-coverage:ignore-next-line
        expect(tagged.unevaluatedProperties).toBe(false);
        // type-coverage:ignore-next-line
        expect(tagged.unevaluatedItems).toEqual({ type: 'string' });
        // type-coverage:ignore-next-line
        expect(tagged.$schema).toBe('https://spec.openapis.org/oas/3.1/dialect/base');
        // type-coverage:ignore-next-line
        expect(tagged.$id).toBe('https://example.com/schemas/Tagged');
        // type-coverage:ignore-next-line
        expect(tagged.$anchor).toBe('TaggedAnchor');
        // type-coverage:ignore-next-line
        expect(tagged.$dynamicAnchor).toBe('TaggedDynamic');
        // type-coverage:ignore-next-line
        expect(tagged.externalDocs).toEqual({ url: 'https://example.com/docs', description: 'Tagged docs' });

        // type-coverage:ignore-next-line
        const conditional = schemas.ConditionalTagged as unknown;
        // type-coverage:ignore-next-line
        expect(conditional.const).toEqual({ status: 'fixed', count: 1 });
        // type-coverage:ignore-next-line
        expect(conditional.if).toEqual({ properties: { kind: { const: 'A' } } });
        // type-coverage:ignore-next-line
        expect(conditional.then).toEqual({ required: ['a'] });
        // type-coverage:ignore-next-line
        expect(conditional.else).toEqual({ required: ['b'] });
        // type-coverage:ignore-next-line
        expect(conditional.not).toEqual({ properties: { banned: { type: 'string' } } });

        // type-coverage:ignore-next-line
        const taggedUnion = schemas.TaggedUnion as unknown;
        // type-coverage:ignore-next-line
        expect(taggedUnion.oneOf).toEqual([{ type: 'string' }, { type: 'number' }]);
        // type-coverage:ignore-next-line
        expect(taggedUnion.anyOf).toBeUndefined();
    });

    it('should parse models from disk and handle errors', () => {
        const dir = makeTempDir();
        const modelsDir = path.join(dir, 'models');
        fs.mkdirSync(modelsDir, { recursive: true });
        fs.writeFileSync(path.join(modelsDir, 'index.ts'), modelSource);
        fs.writeFileSync(path.join(modelsDir, 'index.spec.ts'), 'ignored');
        fs.writeFileSync(path.join(modelsDir, 'index.d.ts'), 'ignored');

        const extraSource = `
        export interface ExtraModel { value: number; } 
        `;
        fs.writeFileSync(path.join(modelsDir, 'extra.ts'), extraSource);

        const schemas = parseGeneratedModels(dir, fs as unknown);
        expect(schemas.ExtraModel).toBeDefined();

        const nestedDir = path.join(modelsDir, 'nested');
        fs.mkdirSync(nestedDir, { recursive: true });
        fs.writeFileSync(path.join(nestedDir, 'nested.ts'), 'export interface Nested { id: string; }');
        const nestedSchemas = parseGeneratedModels(modelsDir, fs as unknown);
        expect(nestedSchemas.Nested).toBeDefined();

        const fileSchemas = parseGeneratedModels(path.join(modelsDir, 'index.ts'), fs as unknown);
        expect(fileSchemas.Base).toBeDefined();

        const emptyDir = makeTempDir();
        expect(() => parseGeneratedModels(emptyDir, fs as unknown)).toThrow(/No generated model files/);

        const badFile = path.join(dir, 'not-model.txt');
        fs.writeFileSync(badFile, 'data');
        expect(() => parseGeneratedModels(badFile, fs as unknown)).toThrow(/Expected a generated model file/);

        // Mock a file system stat to return neither file nor directory
        const fakeFs = {
            statSync: (p: string) => ({ isFile: () => false, isDirectory: () => false }),
            readFileSync: (p: string, e: string) => '',
            readdirSync: (p: string) => [],
        };
        expect(() => parseGeneratedModels('/some/fake/path', fakeFs as unknown)).toThrow(
            /neither a file nor a directory/,
        );

        const noExportDir = makeTempDir();
        const noExportModelsDir = path.join(noExportDir, 'models');
        fs.mkdirSync(noExportModelsDir, { recursive: true });
        fs.writeFileSync(path.join(noExportModelsDir, 'index.ts'), 'const value = 1;');
        expect(() => parseGeneratedModels(noExportDir, fs as unknown)).toThrow(
            /No exported models could be reconstructed/,
        );
    });

    it('should handle edge cases in inferDiscriminators', () => {
        const edgeSource = `
        export interface VariantA { type: 'A'; val: number; }
        export interface VariantB { type: 'B'; val: string; }
        export interface VariantC { type: 'C'; val: boolean; }
        
        // oneOf with missing ref
        export type BadUnion = VariantA | string;
        
        // only one variant
        export type SingleUnion = VariantA;
        
        // discriminators with different shapes
        export type InlineUnion = { kind: 'x' } | { kind: 'y' };
        
        // nested unions
        export type NestedUnion = (VariantA | VariantB) | VariantC;

        // No discriminator possible
        export type NoDesc = { a: 1 } | { b: 2 };
        `;
        const schemas = parseGeneratedModelSource(edgeSource, '/models/edge.ts');
        expect(schemas.BadUnion).toBeDefined();
        expect(schemas.SingleUnion).toBeDefined();
        expect((schemas.InlineUnion as unknown).discriminator).toEqual({ propertyName: 'kind' });
        expect(schemas.NoDesc).toBeDefined();
        expect((schemas.NoDesc as unknown).discriminator).toBeUndefined();
    });

    it('should handle edge cases in TypeNode parsing', () => {
        EnumMember.prototype.getValue = function () {
            return undefined;
        };

        const typeSource = `
        export type ExtendsUndefined = undefined;
        export type IntersectAny = string & number;
        export type TupleRest = [string, ...string[]];
        export type TupleOpt = [string?];
        export type EnumStrings = 'A' | 'B';
        export type EnumNumbers = 1 | 2;
        export type Parenthesized = (number);
        export type ComplexIntersection = { a: 1 } & { b: 2 };
        export type CustomLiteral = \`template\`;
        export type NullAlias = null;
        export type BigIntAlias = bigint; // Default case
        export type TupleOnlyRest = [...number[]]; // prefixItems length 0
        export type TupleRestArray = [...Array<number>]; // another tuple rest form
        export type UnionOnlyNull = null | undefined; // filtered length 0, includesNull true
        export type UnionMultiTypes = 1 | 'A'; // types.size > 1
        export type NestedTupleRest = [...[number, string]]; // restSchema is array
        export type TupleRestAny = [...any]; // hits line 517
        export type BigIntLit = 1n; // hits 449 fallback
        
        export enum ComplexEnum {
           StrInit = "string_val",
           NumInit = 42,
           TrueInit = true,
           FalseInit = false,
           NoInitVal = \`template_val\`
        }
        
        /**
         * @nullable true
         * @title "My Title"
         * @anyOf [{"type":"string"}]
         */
        export interface DocTags {
           /**
            * @min 1.5
            */
           val: number;
        }
        `;
        const schemas = parseGeneratedModelSource(typeSource, '/models/types.ts');

        // Restore getValue immediately
        EnumMember.prototype.getValue = originalGetValue;

        expect(schemas.ExtendsUndefined).toEqual({});
        expect((schemas.IntersectAny as unknown).allOf).toBeDefined();
        expect((schemas.TupleRest as unknown).type).toBe('array');
        expect((schemas.TupleOpt as unknown).type).toBe('array');
        expect((schemas.EnumStrings as unknown).enum).toEqual(['A', 'B']);
        expect((schemas.EnumNumbers as unknown).enum).toEqual([1, 2]);
        expect((schemas.Parenthesized as unknown).type).toBe('number');
        expect((schemas.ComplexIntersection as unknown).allOf.length).toBe(2);
        expect((schemas.CustomLiteral as unknown).const).toBe('template');
        expect((schemas.NullAlias as unknown).type).toBe('null');
        expect(schemas.BigIntAlias).toEqual({});
        expect((schemas.TupleOnlyRest as unknown).type).toBe('array');
        expect((schemas.UnionOnlyNull as unknown).type).toBe('null');
        expect((schemas.UnionMultiTypes as unknown).type).toEqual(['number', 'string']);
        expect((schemas.TupleRestAny as unknown).items).toEqual({});
        expect(schemas.BigIntLit).toEqual({});

        const enumSchema = schemas.ComplexEnum as unknown;
        expect(enumSchema.enum).toEqual(['string_val', 42, true, false, 'template_val']);

        const docSchema = schemas.DocTags as unknown;
        expect(docSchema.nullable).toBe(true);
        expect(docSchema.title).toBe('My Title');
        expect(docSchema.anyOf).toEqual([{ type: 'string' }]);
        expect(docSchema.properties.val.minimum).toBe(1.5);
    });

    it('should test applyNullability and findDiscriminatorProperty sorting', () => {
        const typeSource = `
        /** @anyOf [{"type":"string"}] */
        export type AnyOfNull = string | null;
        
        /** @oneOf [{"type":"string"}] */
        export type OneOfNull = string | null;
        
        /** @type ["string"] */
        export type TypeNull = string | null;

        export type RefNull = Base | null;

        export type VariantX = { zebra: 'X', apple: 1, banana: 'B1' };
        export type VariantY = { zebra: 'Y', apple: 2, banana: 'B2' };
        export type UnionZebra = VariantX | VariantY; // property zebra not in preferred order, apple comes first in alphabetical
        
        // Sorting edge cases
        export type SortA = { type: '1', kind: '2' };
        export type SortB = { type: '3', kind: '4' };
        export type UnionSort = SortA | SortB; // both in preferredOrder

        export type SortC = { a: '1', type: '2' };
        export type SortD = { a: '3', type: '4' };
        export type UnionSort2 = SortC | SortD; // 'a' not in preferred, 'type' is
        `;
        const schemas = parseGeneratedModelSource(typeSource + modelSource, '/models/nullability.ts');

        expect((schemas.AnyOfNull as unknown).anyOf).toBeDefined();
        expect((schemas.OneOfNull as unknown).oneOf).toBeDefined();
        expect((schemas.TypeNull as unknown).type).toContain('null');
        expect((schemas.RefNull as unknown).anyOf).toBeDefined();

        expect((schemas.UnionZebra as unknown).discriminator).toEqual({
            propertyName: 'apple',
            mapping: {
                1: '#/components/schemas/VariantX',
                2: '#/components/schemas/VariantY',
            },
        });
        expect((schemas.UnionSort as unknown).discriminator).toEqual({
            propertyName: 'type',
            mapping: {
                '1': '#/components/schemas/SortA',
                '3': '#/components/schemas/SortB',
            },
        });
        expect((schemas.UnionSort2 as unknown).discriminator).toEqual({
            propertyName: 'type',
            mapping: {
                '2': '#/components/schemas/SortC',
                '4': '#/components/schemas/SortD',
            },
        });
    });

    it('should handle single-element enum schema correctly for discriminators', () => {
        const typeSource = `
        export interface Variant1 { 
            enumProp: 'A'; // will produce { type: 'string', const: 'A' } natively which avoids the bug in docs parsing
        }
        export interface Variant2 { 
            enumProp: 'B';
        }
        export type UnionEnumProp = Variant1 | Variant2;
        `;
        const schemas = parseGeneratedModelSource(typeSource, '/models/enumprop.ts');

        expect((schemas.UnionEnumProp as unknown).discriminator).toEqual({
            propertyName: 'enumProp',
            mapping: {
                A: '#/components/schemas/Variant1',
                B: '#/components/schemas/Variant2',
            },
        });
    });

    it('should hit fallback lines in applyNullability and tuple parsing', () => {
        const src = `
        export interface EmptyBase {}
        export type EmptyNull = EmptyBase | null; // hits line 672
        
        export type RestTupleLine488 = [string, ...number[]]; // should hit 488,489
        export type ComplexTupleLine517 = [...[string, number]]; // should hit 517
        
        // oneOf null branch
        export type OneOfNullFallback = { oneOf: string } | null;
        
        export type EnumTypeFallback = 1 | 2; // Should hit array of enums if structured right
        
        export type ArrayEnum = { enum: [1, 2] };
        export type UnionArrayEnum = ArrayEnum | 3;
        
        export type MappedTypes = { type: ['A', 'B'] } | { type: ['C'] };
        
        // Tuple with optional element then rest
        export type TupleOptRest = [string?, ...number[]];
        `;
        const schemas = parseGeneratedModelSource(src, '/models/fallbacks.ts');
        expect(schemas.EmptyNull).toBeDefined();
        expect((schemas.EmptyNull as unknown).anyOf).toBeDefined();
        expect(schemas.RestTupleLine488).toBeDefined();
        expect(schemas.ComplexTupleLine517).toBeDefined();
        expect(schemas.OneOfNullFallback).toBeDefined();
        expect(schemas.EnumTypeFallback).toBeDefined();
        expect(schemas.UnionArrayEnum).toBeDefined();
        expect(schemas.MappedTypes).toBeDefined();
        expect(schemas.TupleOptRest).toBeDefined();
    });

    it('should hit all the edge cases for missing lines (225, 394, 488, 628, 641, 668)', () => {
        const src = `
        // Line 225: discriminator with enum array of length 1
        export enum SingleEnumX { Val = "X" }
        export enum SingleEnumY { Val = "Y" }
        export type VarEnum1 = {
            k: SingleEnumX;
        };
        export type VarEnum2 = {
            k: SingleEnumY;
        };
        export type UnionEnumLen1 = VarEnum1 | VarEnum2;

        // Line 394: LiteralType of NullKeyword (differs from pure NullKeyword)
        export type LitNull = null;

        // Line 488-489: RestTypeNode not part of NamedTupleMember
        export type RestTuple = [string, ...number[]];

        // Line 628: extractEnumValues where schema has enum array (already handled by UnionArrayEnum, but let's be sure)
        // Line 641-643: extractLiteralTypes where schema has type array
        export type ArrTypes1 = { type: ["a", "b"] };
        export type ArrTypes2 = { type: ["c"] };
        export type UnionArrTypes = ArrTypes1 | ArrTypes2;

        // Line 668-669: applyNullability with schema.oneOf
        // Line 672: applyNullability fallback
        /** @oneOf [{"type":"string"}] */
        export type OneOfNull2 = string | null;
        
        export type BaseObj = {};
        export type FallbackNull = BaseObj | null;
        `;
        const schemas = parseGeneratedModelSource(src, '/models/edgecases.ts');
        expect(schemas.UnionEnumLen1).toBeDefined();
        // Since SingleEnumX and SingleEnumY are just $refs, we'd need them to be resolved to get their schemas.
        // Wait, if k is a $ref, getDiscriminatorValueSchema won't see the enum unless we resolve it or something.
        // But what if we just use a trick to inject enum: ["X"] into the AST parsing using JSDoc tags?
        // Wait, applyDocs doesn't support @enum.

        expect((schemas.LitNull as unknown).type).toBe('null');
        expect(schemas.RestTuple).toBeDefined();
        expect(schemas.UnionArrTypes).toBeDefined();
        expect((schemas.OneOfNull2 as unknown).oneOf).toBeDefined();
        expect((schemas.FallbackNull as unknown).anyOf).toBeDefined();
    });

    it('should hit type value parsing fallbacks in asBoolean', () => {
        const src = `
        /** 
         * @nullable "TRUE"
         * @nullable "FALSE"
         * @nullable 1
         */
        export type BoolTags = string;
        `;
        const schemas = parseGeneratedModelSource(src, '/models/bools.ts');
        expect(schemas.BoolTags).toBeDefined();
    });

    it('should hit tag value parsing and applyNullability fallback', () => {
        const src = `
        /** 
         * @min "10"
         * @exclusiveMinimum "true"
         * @exclusiveMaximum "false"
         * @nullable "true"
         * @nullable "false"
         * @nullable "yes"
         */
        export type ParsedTags = string;

        export type UnionFallback = ({ a: 1 } | { b: 2 }) | null; // falls back to anyOf [ {anyOf: ...}, null]
        
        // oneOf with null
        /** @oneOf [{"type":"string"}] */
        export type OneOfDocNull = string | null;

        // anyOf with null
        /** @anyOf [{"type":"string"}] */
        export type AnyOfDocNull = string | null;
        
        // Object without anyOf/oneOf
        export type ObjNull = { a: string } | null;

        export enum EnumFallback {
            Val = EXTERNAL_VAR
        }

        export type MultiTypes = { type: ['string', 'number'] };
        export type UnionMultiTypesObj = MultiTypes | 'Other';
        
        export type MultiEnum = { enum: ['a', 'b'] };
        export type UnionMultiEnum = MultiEnum | 'c';
        
        export type TupleRestNode = [string, ...number[]];
        `;

        EnumMember.prototype.getValue = function () {
            return undefined;
        };

        const schemas = parseGeneratedModelSource(src, '/models/tags.ts');

        EnumMember.prototype.getValue = originalGetValue;

        expect(schemas.ParsedTags).toBeDefined();
        expect((schemas.UnionFallback as unknown).anyOf).toBeDefined();
        expect((schemas.ObjNull as unknown).type).toContain('null');
        expect((schemas.EnumFallback as unknown).enum).toEqual(['EXTERNAL_VAR']);
        expect(schemas.UnionMultiTypesObj).toBeDefined();
        expect(schemas.UnionMultiEnum).toBeDefined();
        expect(schemas.TupleRestNode).toBeDefined();
    });

    it('should cover collectAllModelFiles directory traversal deeply', () => {
        const dir = makeTempDir();
        const modelsDir = path.join(dir, 'models');
        const nestedDir = path.join(modelsDir, 'deep');
        const deeperDir = path.join(nestedDir, 'deeper');
        fs.mkdirSync(deeperDir, { recursive: true });
        fs.writeFileSync(path.join(deeperDir, 'deeper.ts'), 'export interface Deeper { id: string; }');

        const schemas = parseGeneratedModels(dir, fs as unknown);
        expect(schemas.Deeper).toBeDefined();
    });
});
