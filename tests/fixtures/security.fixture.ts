import { info } from './common.js';

export const providerCoverageSpec = {
    openapi: '3.0.0',
    info,
    paths: {},
    components: {
        securitySchemes: {
            ApiKeyOnly: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
        },
    },
};

export const securitySpec = {
    openapi: '3.0.0',
    info,
    paths: {},
    components: {
        securitySchemes: {
            ApiKeyHeader: { type: 'apiKey', in: 'header', name: 'X-API-KEY' },
            ApiKeyQuery: { type: 'apiKey', in: 'query', name: 'api_key_query' },
            BearerAuth: { type: 'http', scheme: 'bearer' },
            OAuth2Flow: { type: 'oauth2', flows: {} },
        },
    },
};
