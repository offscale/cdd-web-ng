import { describe, expect, it } from 'vitest';
import { validateSpec, SpecValidationError } from '@src/core/validator.js'; // Assuming exported
import { SwaggerParser } from '@src/core/parser.js';
import { GeneratorConfig } from '@src/core/types.js';

describe('Core: Input Spec Validation', () => {
    const validInfo = { title: 'Valid API', version: '1.0.0' };
    const validConfig: GeneratorConfig = { input: '', output: '', options: {} };

    describe('Structural Validation', () => {
        it('should accept a valid Swagger 2.0 spec with paths', () => {
            const spec: any = {
                swagger: '2.0',
                info: validInfo,
                paths: {}
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with paths', () => {
            const spec: any = {
                openapi: '3.0.1',
                info: validInfo,
                paths: {}
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with components only (no paths)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                components: { schemas: {} }
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept a valid OpenAPI 3.x spec with webhooks only (no paths)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: validInfo,
                webhooks: {}
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should throw if spec object is null/undefined', () => {
            expect(() => validateSpec(null as any)).toThrow(SpecValidationError);
            expect(() => validateSpec(undefined as any)).toThrow(SpecValidationError);
        });

        it('should throw on missing version header', () => {
            const spec: any = { info: validInfo, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on invalid version (e.g. 1.2)', () => {
            const spec: any = { swagger: '1.2', info: validInfo, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/Unsupported or missing OpenAPI\/Swagger version/);
        });

        it('should throw on missing info object', () => {
            const spec: any = { openapi: '3.0.0', paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain an 'info' object/);
        });

        it('should throw on missing info title', () => {
            const spec: any = { openapi: '3.0.0', info: { version: '1.0' }, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain a required string field: 'title'/);
        });

        it('should throw on missing info version', () => {
            const spec: any = { openapi: '3.0.0', info: { title: 'API' }, paths: {} };
            expect(() => validateSpec(spec)).toThrow(/must contain a required string field: 'version'/);
        });

        it('should throw if Swagger 2.0 has no paths', () => {
            const spec: any = { swagger: '2.0', info: validInfo }; // Missing paths
            expect(() => validateSpec(spec)).toThrow(/Swagger 2.0 specification must contain a 'paths' object/);
        });

        it('should throw if OpenAPI 3.x has no paths, components, or webhooks', () => {
            const spec: any = { openapi: '3.0.0', info: validInfo }; // Completely empty structure
            expect(() => validateSpec(spec)).toThrow(/must contain at least one of: 'paths', 'components', or 'webhooks'/);
        });
    });

    describe('License Object Validation', () => {
        it('should throw if License contains both url and identifier (Mutually Exclusive)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'Apache 2.0',
                        url: 'https://apache.org',
                        identifier: 'Apache-2.0'
                    }
                },
                paths: {}
            };
            expect(() => validateSpec(spec)).toThrow(/mutually exclusive/);
        });

        it('should accept License with only url', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'MIT',
                        url: 'https://opensource.org/licenses/MIT'
                    }
                },
                paths: {}
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept License with only identifier (OAS 3.1+)', () => {
            const spec: any = {
                openapi: '3.1.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'MIT',
                        identifier: 'MIT'
                    }
                },
                paths: {}
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });

        it('should accept License with neither url nor identifier (just name)', () => {
            const spec: any = {
                openapi: '3.0.0',
                info: {
                    ...validInfo,
                    license: {
                        name: 'Proprietary'
                    }
                },
                paths: {}
            };
            expect(() => validateSpec(spec)).not.toThrow();
        });
    });

    describe('Integration with SwaggerParser', () => {
        it('should validate spec upon construction', () => {
            const invalidSpec: any = { openapi: '3.0.0' }; // No info
            expect(() => new SwaggerParser(invalidSpec, validConfig)).toThrow(SpecValidationError);
        });

        it('should support custom validation callback from config', () => {
            const spec: any = { openapi: '3.0.0', info: validInfo, paths: {} };
            const config: GeneratorConfig = {
                ...validConfig,
                validateInput: (s) => s.info.title !== 'Forbidden Title'
            };

            // Should pass
            expect(() => new SwaggerParser(spec, config)).not.toThrow();

            // Should fail custom validation
            const badSpec = { ...spec, info: { ...validInfo, title: 'Forbidden Title' } };
            expect(() => new SwaggerParser(badSpec, config)).toThrow('Custom input validation failed');
        });
    });
});
