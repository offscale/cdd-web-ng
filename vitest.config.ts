import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{spec,test}.ts'],
        testTimeout: 30000,
        reporters: ['verbose'],
        alias: {
            '../src': new URL('./src', import.meta.url).pathname,
        },
        // Use the new server.deps.inline instead of the deprecated deps.inline
        server: {
            deps: {
                inline: [
                    /src\//
                ],
                noExternal: true,
            },
        },
    },
});
