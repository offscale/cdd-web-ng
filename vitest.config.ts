import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.{spec,test}.ts'],
        testTimeout: 30000,
        reporters: ['verbose'],
        // This helps Vitest resolve module paths correctly
        alias: {
            '../src': new URL('./src', import.meta.url).pathname,
        },
    },
});
