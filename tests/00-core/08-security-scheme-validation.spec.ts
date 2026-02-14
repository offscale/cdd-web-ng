import { describe, expect, it } from 'vitest';

import { validateSpec } from '@src/core/validator.js';
import { info } from '../fixtures/common.js';

describe('Core: Security Scheme Validation', () => {
    it('should require name and in for apiKey schemes', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    BadApiKey: { type: 'apiKey', in: 'header' },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(
            /apiKey security scheme "BadApiKey" must define non-empty 'name'/,
        );
    });

    it('should require scheme for http schemes', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    BadHttp: { type: 'http' },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(
            /http security scheme "BadHttp" must define non-empty 'scheme'/,
        );
    });

    it('should require valid oauth2 flows with URLs and scopes', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OAuthMissingFlows: { type: 'oauth2' },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(/must define 'flows'/);
    });

    it('should enforce https URLs for openIdConnect', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OIDC: {
                        type: 'openIdConnect',
                        openIdConnectUrl: 'http://example.com/.well-known/openid-configuration',
                    },
                },
            },
        };

        expect(() => validateSpec(spec as any)).toThrow(/openIdConnectUrl must use https/);
    });

    it('should accept valid oauth2 flows', () => {
        const spec = {
            openapi: '3.0.0',
            info,
            paths: {},
            components: {
                securitySchemes: {
                    OAuth: {
                        type: 'oauth2',
                        flows: {
                            authorizationCode: {
                                authorizationUrl: 'https://auth.example.com/authorize',
                                tokenUrl: 'https://auth.example.com/token',
                                scopes: {},
                            },
                        },
                    },
                },
            },
        };

        expect(() => validateSpec(spec as any)).not.toThrow();
    });
});
