import { describe, expect, it, vi } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { DiscriminatorGenerator } from '@src/service/emit/utility/discriminator.generator.js';
import { createTestProject } from '../shared/helpers.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';
import ts from 'typescript';

// OpenAPI 3.0 Spec with Explicit Mapping
const oas3Spec: SwaggerSpec = {
    openapi: '3.0.0',
    info: { title: 'Discrim Test', version: '1.0' },
    paths: {},
    components: {
        schemas: {
            Pet: {
                type: 'object',
                discriminator: {
                    propertyName: 'petType',
                    mapping: {
                        'cat_obj': '#/components/schemas/Cat',
                        'dog_obj': '#/components/schemas/Dog'
                    }
                },
                properties: {
                    name: { type: 'string' },
                    petType: { type: 'string' }
                },
                required: ['name', 'petType']
            },
            Cat: {
                allOf: [
                    { $ref: '#/components/schemas/BasePet' },
                    { type: 'object', properties: { meow: { type: 'boolean' } } }
                ]
            },
            Dog: {
                allOf: [
                    { $ref: '#/components/schemas/BasePet' },
                    { type: 'object', properties: { bark: { type: 'boolean' } } }
                ]
            }
        }
    }
};

// Swagger 2.0 Spec with Implicit Mapping (string discriminator)
const swagger2Spec: SwaggerSpec = {
    swagger: '2.0',
    info: { title: 'Legacy Test', version: '1.0' },
    paths: {},
    definitions: {
        Animal: {
            type: 'object',
            discriminator: 'kind',
            properties: {
                kind: { type: 'string' }
            }
        },
        Lion: {
            allOf: [
                { $ref: '#/definitions/Animal' }
            ]
        }
    }
} as any; // Cast because strict types expect InfoObject oas3 style sometimes in test mocks

describe('Emitter: DiscriminatorGenerator', () => {

    const runGenerator = (spec: SwaggerSpec) => {
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(spec, config);

        // Manually populate schemas in parser because extractSchemas isn't usually public or called in this partial test setup
        // The generator iterates parser.schemas array
        if (spec.components?.schemas) {
            Object.entries(spec.components.schemas).forEach(([name, def]) => {
                parser.schemas.push({ name, definition: def });
            });
        }
        if (spec.definitions) {
            Object.entries(spec.definitions).forEach(([name, def]) => {
                parser.schemas.push({ name, definition: def });
            });
        }

        new DiscriminatorGenerator(parser, project).generate('/out');
        return project;
    };

    const compileGeneratedFile = (project: Project) => {
        const sourceFile = project.getSourceFileOrThrow('/out/discriminators.ts');
        const code = sourceFile.getText();
        const jsCode = ts.transpile(code, { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS });
        const moduleHelper = { exports: {} as any };
        new Function('exports', jsCode)(moduleHelper.exports);
        return moduleHelper.exports;
    };

    it('should generate registry for OAS3 explicit discriminators', () => {
        const project = runGenerator(oas3Spec);
        const { API_DISCRIMINATORS } = compileGeneratedFile(project);

        expect(API_DISCRIMINATORS).toBeDefined();
        expect(API_DISCRIMINATORS['Pet']).toBeDefined();
        expect(API_DISCRIMINATORS['Pet'].propertyName).toBe('petType');

        const mapping = API_DISCRIMINATORS['Pet'].mapping;
        expect(mapping).toBeDefined();
        // Should resolve the ref to the simple Model Name
        expect(mapping['cat_obj']).toBe('Cat');
        expect(mapping['dog_obj']).toBe('Dog');
    });

    it('should generate registry for Swagger 2 string discriminators', () => {
        const project = runGenerator(swagger2Spec);
        const { API_DISCRIMINATORS } = compileGeneratedFile(project);

        expect(API_DISCRIMINATORS).toBeDefined();
        expect(API_DISCRIMINATORS['Animal']).toBeDefined();
        expect(API_DISCRIMINATORS['Animal'].propertyName).toBe('kind');
        // Swagger 2 has no explicit mapping in the generic generator unless inferred.
        // Expect mapping to be undefined.
        expect(API_DISCRIMINATORS['Animal'].mapping).toBeUndefined();
    });

    it('should produce valid module for specs with no discriminators', () => {
        const emptySpec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'Empty', version: '1' },
            paths: {},
            components: {
                schemas: {
                    Simple: { type: 'string' }
                }
            }
        };
        const project = runGenerator(emptySpec);
        const sourceFile = project.getSourceFileOrThrow('/out/discriminators.ts');
        expect(sourceFile.getText()).toContain('export { };');
    });

    it('should correctly map full URI references to internal model names', () => {
        const uriSpec: SwaggerSpec = {
            openapi: '3.0.0',
            info: { title: 'URI Mapping', version: '1' },
            paths: {},
            components: {
                schemas: {
                    Context: {
                        type: 'object',
                        discriminator: {
                            propertyName: 'type',
                            mapping: {
                                'external': 'https://schemas.example.com/models/ExternalModel'
                            }
                        }
                    },
                    ExternalModel: {
                        type: 'object',
                        properties: { type: { type: 'string' } }
                    }
                }
            }
        };

        // Setup mocks to simulate resolution without actual HTTP request
        const project = createTestProject();
        const config: GeneratorConfig = { output: '/out', options: {} } as any;
        const parser = new SwaggerParser(uriSpec, config);

        const externalDef = uriSpec.components!.schemas!.ExternalModel;
        const contextDef = uriSpec.components!.schemas!.Context;

        parser.schemas.push({ name: 'ExternalModel', definition: externalDef });
        parser.schemas.push({ name: 'Context', definition: contextDef });

        // Spy on resolveReference. When asked for the URL, return the object memory ref.
        vi.spyOn(parser, 'resolveReference').mockImplementation((ref) => {
            if (ref === 'https://schemas.example.com/models/ExternalModel') return externalDef;
            return undefined;
        });

        new DiscriminatorGenerator(parser, project).generate('/out');
        const { API_DISCRIMINATORS } = compileGeneratedFile(project);

        expect(API_DISCRIMINATORS['Context'].mapping['external']).toBe('ExternalModel');
    });

    it('should use pascalCase fallback for unresolvable references', () => {
        const fallbackSpec: SwaggerSpec = {
            openapi: '3.2.0',
            info: { title: 'Fallback', version: '1' },
            paths: {},
            components: {
                schemas: {
                    Item: {
                        discriminator: {
                            propertyName: 'k',
                            mapping: {
                                'remote': 'https://remote.org/definitions/weird-name.json'
                            }
                        }
                    }
                }
            }
        } as any;

        const project = runGenerator(fallbackSpec);
        const { API_DISCRIMINATORS } = compileGeneratedFile(project);

        // Should extract "weird-name", strip json, and PascalCase it -> WeirdName
        expect(API_DISCRIMINATORS['Item'].mapping['remote']).toBe('WeirdName');
    });
});
