import { describe, expect, it } from 'vitest';

import * as utils from '@src/core/utils/index.js';

/**
 * @fileoverview
 * Integration test for the Core Utils module.
 *
 * This file serves to verify that the aggregate barrel file (index.ts) correctly
 * re-exports the public API surface expected by the rest of the application.
 *
 * Detailed logic tests are located in:
 * - tests/00-core/utils/string.spec.ts
 * - tests/00-core/utils/naming.spec.ts
 * - tests/00-core/utils/type-converter.spec.ts
 * - tests/00-core/utils/spec-extractor.spec.ts
 */
describe('Core: Utils Public API (Index)', () => {
    describe('Module Exports', () => {
        it('should export String utilities', () => {
            expect(utils.camelCase).toBeDefined();
            expect(utils.pascalCase).toBeDefined();
            expect(utils.kebabCase).toBeDefined();
            expect(utils.singular).toBeDefined();
            expect(utils.isUrl).toBeDefined();
        });

        it('should export Type Conversion utilities', () => {
            expect(utils.getTypeScriptType).toBeDefined();
            expect(utils.isDataTypeInterface).toBeDefined();
            expect(utils.getRequestBodyType).toBeDefined();
            expect(utils.getResponseType).toBeDefined();
        });

        it('should export Spec Extraction utilities', () => {
            expect(utils.extractPaths).toBeDefined();
        });

        it('should export Naming/Token utilities', () => {
            expect(utils.getBasePathTokenName).toBeDefined();
            expect(utils.getClientContextTokenName).toBeDefined();
            expect(utils.getInterceptorsTokenName).toBeDefined();
            expect(utils.hasDuplicateFunctionNames).toBeDefined();
        });
    });

    // Simple regression test to ensure the 'index' wiring performs usage correctly
    describe('Integration Smoke Test', () => {
        it('should correctly process a string via exported functions', () => {
            const input = 'hello world';
            expect(utils.pascalCase(input)).toBe('HelloWorld');
            expect(utils.camelCase(input)).toBe('helloWorld');
        });

        it('should generate token names via exported functions', () => {
            // Note: The implementation does uppercase conversion but does not insert underscores for camelCase inputs.
            // MyClient -> MYCLIENT.
            expect(utils.getBasePathTokenName('MyClient')).toBe('BASE_PATH_MYCLIENT');
        });
    });
});
