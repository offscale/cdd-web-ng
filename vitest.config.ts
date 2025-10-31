import { defineConfig } from 'vitest/config';
import fs from 'node:fs';

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
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: [
                'src/cli.ts',
                'src/index.ts',
                'src/core/types.ts',
                'src/core/constants.ts',
                '**/index.ts',
                'src/custom.d.ts',
            ],
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
        server: {
            deps: {
                inline: [
                    /src\//
                ],
            },
        },
    },
    // The custom plugin for .template files is no longer needed for TypeScript generation.
    // We keep it for the HTML templates used by the admin generator.
    plugins: [
        {
            name: 'vite-plugin-inline-text-files',
            transform(code, id) {
                if (id.endsWith('.template')) {
                    const fileContent = fs.readFileSync(id, 'utf-8');
                    return {
                        code: `export default ${JSON.stringify(fileContent)};`,
                        map: null
                    };
                }
            }
        }
    ]
});
