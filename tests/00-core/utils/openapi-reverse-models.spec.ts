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

export interface BinaryPayload {
  /** @contentMediaType image/png @contentEncoding base64 */
  data: string;
}

/**
 * @minProperties 1
 * @maxProperties 5
 */
export interface Constraints {
  /** @minimum 1 @maximum 10 @pattern ^[a-z]+$ @format uuid @minLength 2 @maxLength 5 */
  name: string;
  /** @minItems 1 @maxItems 3 @uniqueItems true */
  tags: string[];
  /** @multipleOf 0.5 */
  ratio?: number;
  /** @exclusiveMinimum 0 */
  positive: number;
  /** @exclusiveMaximum true */
  below?: number;
  /** @readOnly @writeOnly */
  secret?: string;
}
`;

describe('Core Utils: OpenAPI Reverse Models', () => {
    it('should parse generated model source into schemas', () => {
        const schemas = parseGeneratedModelSource(modelSource, '/models/index.ts');

        expect(schemas.Base).toBeDefined();
        expect((schemas.Base as any).properties.id.type).toBe('string');
        expect((schemas.Base as any).properties.createdAt.readOnly).toBe(true);
        expect((schemas.Base as any).properties.createdAt.format).toBe('date-time');

        expect((schemas.Status as any).enum).toEqual(['active', 'inactive']);
        expect((schemas.Status as any).deprecated).toBe(true);
        expect((schemas.Level as any).type).toBe('number');
        expect((schemas.Mixed as any).type).toBeUndefined();

        expect((schemas.Mode as any).enum).toEqual(['auto', 'manual']);
        expect(schemas.AnyAlias).toBeDefined();
        expect(schemas.UnknownAlias).toBeDefined();
        expect(schemas.ObjAlias).toBeDefined();
        expect((schemas.LiteralNum as any).enum).toEqual([42]);
        expect((schemas.LiteralTrue as any).enum).toEqual([true]);
        expect((schemas.LiteralFalse as any).enum).toEqual([false]);
        expect((schemas.LiteralNull as any).nullable).toBe(true);
        expect((schemas.ParenAlias as any).type).toBe('string');

        expect((schemas.NullableName as any).type).toBe('string');
        expect((schemas.NullableName as any).nullable).toBe(true);
        expect((schemas.OptionalName as any).type).toBe('string');
        expect((schemas.UnionAnyOf as any).anyOf.length).toBe(2);

        expect((schemas.ArrayAlias as any).type).toBe('array');
        expect((schemas.ArrayAlias as any).items.type).toBe('string');
        expect((schemas.TupleAlias as any).prefixItems.length).toBe(2);
        expect((schemas.TupleAlias as any).minItems).toBe(2);
        expect((schemas.TupleAlias as any).maxItems).toBe(2);
        expect((schemas.TupleAlias as any).items).toBe(false);
        expect((schemas.OptionalTuple as any).prefixItems.length).toBe(2);
        expect((schemas.OptionalTuple as any).minItems).toBe(1);
        expect((schemas.OptionalTuple as any).maxItems).toBe(2);
        expect((schemas.OptionalTuple as any).items).toBe(false);
        expect((schemas.NamedTuple as any).prefixItems.length).toBe(2);
        expect((schemas.NamedTuple as any).minItems).toBe(1);
        expect((schemas.NamedTuple as any).maxItems).toBe(2);
        expect((schemas.NamedTuple as any).items).toBe(false);
        expect((schemas.RestTuple as any).prefixItems.length).toBe(1);
        expect((schemas.RestTuple as any).minItems).toBe(1);
        expect((schemas.RestTuple as any).items.type).toBe('number');
        expect((schemas.ReadonlyAlias as any).items.type).toBe('string');
        expect((schemas.ArrayRef as any).items.type).toBe('number');
        expect((schemas.SetAlias as any).items.type).toBe('boolean');
        expect((schemas.RecordAlias as any).additionalProperties.type).toBe('number');
        expect((schemas.MapAlias as any).additionalProperties.type).toBe('string');
        expect((schemas.DateAlias as any).format).toBe('date-time');
        expect((schemas.BlobAlias as any).format).toBe('binary');
        expect((schemas.FileAlias as any).format).toBe('binary');

        expect((schemas.RefAlias as any).$ref).toBe('#/components/schemas/Base');
        expect((schemas.IntersectionAlias as any).allOf.length).toBe(2);

        const typeLiteral = schemas.TypeLiteralAlias as any;
        expect(typeLiteral.properties.foo.type).toBe('string');
        expect(typeLiteral.properties['bar-baz'].type).toBe('number');
        expect(typeLiteral.properties.ro.readOnly).toBe(true);
        expect(typeLiteral.additionalProperties.type).toBe('string');

        const derived = schemas.Derived as any;
        expect(derived.allOf.length).toBe(2);
        expect(derived.allOf[1].properties.name.type).toBe('string');

        const derivedNoProps = schemas.DerivedNoProps as any;
        expect(derivedNoProps.allOf.length).toBe(1);

        const derivedIndexOnly = schemas.DerivedIndexOnly as any;
        expect(derivedIndexOnly.allOf.length).toBe(2);
        expect(derivedIndexOnly.allOf[1].additionalProperties.type).toBe('string');

        const withDocs = schemas.WithDocs as any;
        expect(withDocs.description).toBe('With docs.');
        expect(withDocs.example).toEqual({ flag: true });
        expect(withDocs.default).toEqual({ flag: false });
        expect(withDocs.properties.flag.example).toBe('value');
        expect(withDocs.properties.mode.default).toBe('not-json');

        const multiExample = schemas.MultiExample as any;
        expect(multiExample.example).toBeUndefined();
        expect(multiExample.examples).toEqual([{ id: 1 }, { id: 2 }]);

        const binaryPayload = schemas.BinaryPayload as any;
        expect(binaryPayload.properties.data.contentMediaType).toBe('image/png');
        expect(binaryPayload.properties.data.contentEncoding).toBe('base64');

        const constraints = schemas.Constraints as any;
        expect(constraints.minProperties).toBe(1);
        expect(constraints.maxProperties).toBe(5);
        expect(constraints.properties.name.minimum).toBe(1);
        expect(constraints.properties.name.maximum).toBe(10);
        expect(constraints.properties.name.pattern).toBe('^[a-z]+$');
        expect(constraints.properties.name.format).toBe('uuid');
        expect(constraints.properties.name.minLength).toBe(2);
        expect(constraints.properties.name.maxLength).toBe(5);
        expect(constraints.properties.tags.minItems).toBe(1);
        expect(constraints.properties.tags.maxItems).toBe(3);
        expect(constraints.properties.tags.uniqueItems).toBe(true);
        expect(constraints.properties.ratio.multipleOf).toBe(0.5);
        expect(constraints.properties.positive.exclusiveMinimum).toBe(0);
        expect(constraints.properties.below.exclusiveMaximum).toBe(true);
        expect(constraints.properties.secret.readOnly).toBe(true);
        expect(constraints.properties.secret.writeOnly).toBe(true);
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

        const schemas = parseGeneratedModels(dir, fs);
        expect(schemas.ExtraModel).toBeDefined();

        const nestedDir = path.join(modelsDir, 'nested');
        fs.mkdirSync(nestedDir, { recursive: true });
        fs.writeFileSync(path.join(nestedDir, 'nested.ts'), 'export interface Nested { id: string; }');
        const nestedSchemas = parseGeneratedModels(modelsDir, fs);
        expect(nestedSchemas.Nested).toBeDefined();

        const fileSchemas = parseGeneratedModels(path.join(modelsDir, 'index.ts'), fs);
        expect(fileSchemas.Base).toBeDefined();

        const emptyDir = makeTempDir();
        expect(() => parseGeneratedModels(emptyDir, fs)).toThrow(/No generated model files/);

        const badFile = path.join(dir, 'not-model.txt');
        fs.writeFileSync(badFile, 'data');
        expect(() => parseGeneratedModels(badFile, fs)).toThrow(/Expected a generated model file/);

        const noExportDir = makeTempDir();
        const noExportModelsDir = path.join(noExportDir, 'models');
        fs.mkdirSync(noExportModelsDir, { recursive: true });
        fs.writeFileSync(path.join(noExportModelsDir, 'index.ts'), 'const value = 1;');
        expect(() => parseGeneratedModels(noExportDir, fs)).toThrow(/No exported models could be reconstructed/);
    });
});
