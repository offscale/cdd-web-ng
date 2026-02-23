// tests/00-core/utils/openapi-reverse-models.spec.ts
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parseGeneratedModelSource, parseGeneratedModels } from '@src/core/utils/openapi-reverse-models.js';

const tempDirs: string[] = [];

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
        expect((schemas.Base as any).properties.id.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.Base as any).properties.createdAt.readOnly).toBe(true);
        // type-coverage:ignore-next-line
        expect((schemas.Base as any).properties.createdAt.format).toBe('date-time');

        // type-coverage:ignore-next-line
        expect((schemas.Status as any).enum).toEqual(['active', 'inactive']);
        // type-coverage:ignore-next-line
        expect((schemas.Status as any).deprecated).toBe(true);
        // type-coverage:ignore-next-line
        expect((schemas.Level as any).type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.Mixed as any).type).toBeUndefined();

        // type-coverage:ignore-next-line
        expect((schemas.Mode as any).enum).toEqual(['auto', 'manual']);
        expect(schemas.AnyAlias).toBeDefined();
        expect(schemas.UnknownAlias).toBeDefined();
        expect(schemas.ObjAlias).toBeDefined();
        // type-coverage:ignore-next-line
        expect((schemas.LiteralNum as any).const).toBe(42);
        // type-coverage:ignore-next-line
        expect((schemas.LiteralTrue as any).const).toBe(true);
        // type-coverage:ignore-next-line
        expect((schemas.LiteralFalse as any).const).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.LiteralNull as any).type).toBe('null');
        // type-coverage:ignore-next-line
        expect((schemas.LiteralNull as any).const).toBe(null);
        // type-coverage:ignore-next-line
        expect((schemas.ParenAlias as any).type).toBe('string');

        // type-coverage:ignore-next-line
        expect((schemas.NullableName as any).type).toEqual(['string', 'null']);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalName as any).type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.UnionAnyOf as any).anyOf.length).toBe(2);

        // type-coverage:ignore-next-line
        expect((schemas.ArrayAlias as any).type).toBe('array');
        // type-coverage:ignore-next-line
        expect((schemas.ArrayAlias as any).items.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as any).prefixItems.length).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as any).minItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as any).maxItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.TupleAlias as any).items).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as any).prefixItems.length).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as any).minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as any).maxItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.OptionalTuple as any).items).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as any).prefixItems.length).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as any).minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as any).maxItems).toBe(2);
        // type-coverage:ignore-next-line
        expect((schemas.NamedTuple as any).items).toBe(false);
        // type-coverage:ignore-next-line
        expect((schemas.RestTuple as any).prefixItems.length).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.RestTuple as any).minItems).toBe(1);
        // type-coverage:ignore-next-line
        expect((schemas.RestTuple as any).items.type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.ReadonlyAlias as any).items.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.ArrayRef as any).items.type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.SetAlias as any).items.type).toBe('boolean');
        // type-coverage:ignore-next-line
        expect((schemas.RecordAlias as any).additionalProperties.type).toBe('number');
        // type-coverage:ignore-next-line
        expect((schemas.MapAlias as any).additionalProperties.type).toBe('string');
        // type-coverage:ignore-next-line
        expect((schemas.DateAlias as any).format).toBe('date-time');
        // type-coverage:ignore-next-line
        expect((schemas.BlobAlias as any).format).toBe('binary');
        // type-coverage:ignore-next-line
        expect((schemas.FileAlias as any).format).toBe('binary');

        // type-coverage:ignore-next-line
        const extensionModel = schemas.ExtensionModel as any;
        // type-coverage:ignore-next-line
        expect(extensionModel['x-entity']).toBe('internal');
        // type-coverage:ignore-next-line
        expect(extensionModel['x-meta']).toEqual({ tier: 1 });
        // type-coverage:ignore-next-line
        expect(extensionModel.properties.value['x-prop']).toBe(true);

        // type-coverage:ignore-next-line
        const eventPayload = schemas.EventPayload as any;
        // type-coverage:ignore-next-line
        expect(eventPayload.properties.data.contentMediaType).toBe('application/json');
        // type-coverage:ignore-next-line
        expect(eventPayload.properties.data.contentSchema.properties.id.type).toBe('string');

        // type-coverage:ignore-next-line
        expect((schemas.RefAlias as any).$ref).toBe('#/components/schemas/Base');
        // type-coverage:ignore-next-line
        expect((schemas.IntersectionAlias as any).allOf.length).toBe(2);

        // type-coverage:ignore-next-line
        const typeLiteral = schemas.TypeLiteralAlias as any;
        // type-coverage:ignore-next-line
        expect(typeLiteral.properties.foo.type).toBe('string');
        // type-coverage:ignore-next-line
        expect(typeLiteral.properties['bar-baz'].type).toBe('number');
        // type-coverage:ignore-next-line
        expect(typeLiteral.properties.ro.readOnly).toBe(true);
        // type-coverage:ignore-next-line
        expect(typeLiteral.additionalProperties.type).toBe('string');

        // type-coverage:ignore-next-line
        const derived = schemas.Derived as any;
        // type-coverage:ignore-next-line
        expect(derived.allOf.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(derived.allOf[1].properties.name.type).toBe('string');

        // type-coverage:ignore-next-line
        const derivedNoProps = schemas.DerivedNoProps as any;
        // type-coverage:ignore-next-line
        expect(derivedNoProps.allOf.length).toBe(1);

        // type-coverage:ignore-next-line
        const derivedIndexOnly = schemas.DerivedIndexOnly as any;
        // type-coverage:ignore-next-line
        expect(derivedIndexOnly.allOf.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(derivedIndexOnly.allOf[1].additionalProperties.type).toBe('string');

        // type-coverage:ignore-next-line
        const discriminated = schemas.Discriminated as any;
        // type-coverage:ignore-next-line
        expect(discriminated.discriminator).toEqual({
            propertyName: 'kind',
            mapping: { cat: 'Cat', dog: 'Dog' },
        });

        // type-coverage:ignore-next-line
        const pet = schemas.Pet as any;
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
        const inlinePet = schemas.InlinePet as any;
        // type-coverage:ignore-next-line
        expect(inlinePet.discriminator).toEqual({ propertyName: 'kind' });
        // type-coverage:ignore-next-line
        expect(inlinePet.oneOf?.length).toBe(2);
        // type-coverage:ignore-next-line
        expect(inlinePet.anyOf).toBeUndefined();

        // type-coverage:ignore-next-line
        const withDocs = schemas.WithDocs as any;
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
        const multiExample = schemas.MultiExample as any;
        // type-coverage:ignore-next-line
        expect(multiExample.example).toBeUndefined();
        // type-coverage:ignore-next-line
        expect(multiExample.examples).toEqual([{ id: 1 }, { id: 2 }]);

        // type-coverage:ignore-next-line
        const binaryPayload = schemas.BinaryPayload as any;
        // type-coverage:ignore-next-line
        expect(binaryPayload.properties.data.contentMediaType).toBe('image/png');
        // type-coverage:ignore-next-line
        expect(binaryPayload.properties.data.contentEncoding).toBe('base64');

        // type-coverage:ignore-next-line
        const constraints = schemas.Constraints as any;
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
        const xmlDoc = schemas.XmlDoc as any;
        // type-coverage:ignore-next-line
        expect(xmlDoc.properties.value.xml.name).toBe('doc');
        // type-coverage:ignore-next-line
        expect(xmlDoc.properties.value.xml.namespace).toBe('https://example.com');
        // type-coverage:ignore-next-line
        expect(xmlDoc.properties.value.xml.prefix).toBe('ex');

        // type-coverage:ignore-next-line
        const closedMap = schemas.ClosedMap as any;
        // type-coverage:ignore-next-line
        expect(closedMap.additionalProperties).toBe(false);

        // type-coverage:ignore-next-line
        const tagged = schemas.TaggedSchema as any;
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
        const conditional = schemas.ConditionalTagged as any;
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
        const taggedUnion = schemas.TaggedUnion as any;
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

        const schemas = parseGeneratedModels(dir, fs as any);
        expect(schemas.ExtraModel).toBeDefined();

        const nestedDir = path.join(modelsDir, 'nested');
        fs.mkdirSync(nestedDir, { recursive: true });
        fs.writeFileSync(path.join(nestedDir, 'nested.ts'), 'export interface Nested { id: string; }');
        const nestedSchemas = parseGeneratedModels(modelsDir, fs as any);
        expect(nestedSchemas.Nested).toBeDefined();

        const fileSchemas = parseGeneratedModels(path.join(modelsDir, 'index.ts'), fs as any);
        expect(fileSchemas.Base).toBeDefined();

        const emptyDir = makeTempDir();
        expect(() => parseGeneratedModels(emptyDir, fs as any)).toThrow(/No generated model files/);

        const badFile = path.join(dir, 'not-model.txt');
        fs.writeFileSync(badFile, 'data');
        expect(() => parseGeneratedModels(badFile, fs as any)).toThrow(/Expected a generated model file/);

        const noExportDir = makeTempDir();
        const noExportModelsDir = path.join(noExportDir, 'models');
        fs.mkdirSync(noExportModelsDir, { recursive: true });
        fs.writeFileSync(path.join(noExportModelsDir, 'index.ts'), 'const value = 1;');
        expect(() => parseGeneratedModels(noExportDir, fs as any)).toThrow(/No exported models could be reconstructed/);
    });
});
