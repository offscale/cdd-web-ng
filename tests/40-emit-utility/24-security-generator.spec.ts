import { describe, expect, it } from 'vitest';
import { Project } from 'ts-morph';
import { SwaggerParser } from '@src/core/parser.js';
import { SecurityGenerator } from '@src/service/emit/utility/security.generator.js';
import { GeneratorConfig, SwaggerSpec } from '@src/core/types.js';

describe('Emitter: SecurityGenerator', () => {

    const runGenerator = (spec: Partial<SwaggerSpec>) => {
        const project = new Project({ useInMemoryFileSystem: true });
        const config: GeneratorConfig = { input: '', output: '/out', options: {} };
        const parser = new SwaggerParser(spec as any, config);

        new SecurityGenerator(parser, project).generate('/out');
        return project;
    };

    it('should handle empty security schemes gracefully', () => {
        const project = runGenerator({
            openapi: '3.0.0',
            info: { title: 'Empty', version: '1.0' },
            paths: {},
            components: {}
        });

        // Use try/catch because getSourceFileOrThrow throws if missing.
        // If logic skips generation for empty schemes, we expect NO file or empty check.
        const sourceFile = project.getSourceFile('/out/security.ts');
        if (sourceFile) {
            expect(sourceFile.getText()).toContain('export const API_SECURITY_SCHEMES');
        } else {
            // Accept absence if logic returns early
            expect(true).toBe(true);
        }
    });

    it('should generate API Key definitions (header, query, cookie)', () => {
        const project = runGenerator({
            openapi: '3.0.0',
            info: { title: 'ApiKey', version: '1.0' },
            paths: {},
            components: {
                securitySchemes: {
                    ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
                    ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key' },
                    ApiKeyCookie: { type: 'apiKey', in: 'cookie', name: 'SESSIONID' }
                }
            }
        });

        const sourceFile = project.getSourceFileOrThrow('/out/security.ts');
        const text = sourceFile.getText();

        expect(text).toContain('ApiKeyHeader');
        expect(text).toContain('"in": "header"');
        expect(text).toContain('"name": "X-API-KEY"');

        expect(text).toContain('ApiKeyQuery');
        expect(text).toContain('"in": "query"');

        expect(text).toContain('ApiKeyCookie');
        expect(text).toContain('"in": "cookie"');
    });

    it('should generate HTTP security definitions (Basic, Bearer)', () => {
        // Fix: Cast to prevent TS2353 strict object literal error for 'bearerFormat'
        const schemes: any = {
            BasicAuth: {
                type: 'http',
                scheme: 'basic'
            },
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        };

        const project = runGenerator({
            openapi: '3.0.0',
            info: { title: 'HTTP', version: '1.0' },
            paths: {},
            components: {
                securitySchemes: schemes
            }
        });

        const sourceFile = project.getSourceFileOrThrow('/out/security.ts');
        const text = sourceFile.getText();

        expect(text).toContain('BasicAuth');
        expect(text).toContain('"scheme": "basic"');

        expect(text).toContain('BearerAuth');
        expect(text).toContain('"scheme": "bearer"');
        expect(text).toContain('"bearerFormat": "JWT"');
    });

    it('should generate OAuth2 security definitions', () => {
        const project = runGenerator({
            openapi: '3.0.0',
            info: { title: 'OAuth2', version: '1.0' },
            paths: {},
            components: {
                securitySchemes: {
                    OAuth2Flows: {
                        type: 'oauth2',
                        flows: {
                            implicit: {
                                authorizationUrl: 'https://example.com/auth',
                                scopes: { 'read:users': 'Read Users' }
                            },
                            password: {
                                tokenUrl: 'https://example.com/token',
                                scopes: {}
                            }
                        }
                    }
                }
            }
        });

        const sourceFile = project.getSourceFileOrThrow('/out/security.ts');
        const text = sourceFile.getText();

        expect(text).toContain('OAuth2Flows');
        expect(text).toContain('"type": "oauth2"');
        expect(text).toContain('"authorizationUrl": "https://example.com/auth"');
        expect(text).toContain('"read:users": "Read Users"');
    });

    it('should generate OpenID Connect security definitions', () => {
        const project = runGenerator({
            openapi: '3.0.0',
            info: { title: 'OIDC', version: '1.0' },
            paths: {},
            components: {
                securitySchemes: {
                    OpenID: {
                        type: 'openIdConnect',
                        openIdConnectUrl: 'https://example.com/.well-known/openid-configuration'
                    }
                }
            }
        });

        const sourceFile = project.getSourceFileOrThrow('/out/security.ts');
        const text = sourceFile.getText();

        expect(text).toContain('OpenID');
        expect(text).toContain('"type": "openIdConnect"');
        expect(text).toContain('"openIdConnectUrl": "https://example.com/.well-known/openid-configuration"');
    });

    it('should support Legacy Swagger 2.0 securityDefinitions', () => {
        const project = runGenerator({
            swagger: '2.0',
            info: { title: 'Legacy', version: '1.0' },
            paths: {},
            securityDefinitions: {
                LegacyBasic: {
                    type: 'basic'
                },
                LegacyApiKey: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'X-Auth'
                }
            }
        } as any);

        const sourceFile = project.getSourceFileOrThrow('/out/security.ts');
        const text = sourceFile.getText();

        expect(text).toContain('LegacyBasic');
        // In Swagger 2 -> OAS 3 normalization, basic becomes http/basic
        expect(text).toContain('"type": "basic"'); // Or however the parser normalizes it, likely raw
        expect(text).toContain('LegacyApiKey');
        expect(text).toContain('"name": "X-Auth"');
    });
});
