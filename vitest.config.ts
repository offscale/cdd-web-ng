import { defineConfig } from 'vitest/config';
import fs from 'node:fs'; // <-- Import fs for the plugin

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
        // --- START: Added for Test Coverage ---
        coverage: {
            // Use 'istanbul' for accurate TS source mapping
            provider: 'istanbul',
            // Reporters for terminal, HTML, and CI/CD
            reporter: ['text', 'html', 'lcov'],
            // Directory where the report will be generated
            reportsDirectory: './coverage',
            // Only include files from the 'src' directory
            include: ['src/**/*.ts'],
            // Exclude files that don't have testable logic
            exclude: [
                'src/cli.ts', // CLI entry point is hard to unit test
                'src/index.ts', // Orchestrator, tested via integration
                'src/core/types.ts',
                'src/core/constants.ts',
                '**/index.ts', // Exclude barrel files
                'src/custom.d.ts', // Type declarations are not testable
            ],
            // Enforce 90% coverage (optional, you can lower these)
            thresholds: {
                statements: 90,
                branches: 90,
                functions: 90,
                lines: 90,
            },
        },
        // --- END: Added for Test Coverage ---
        server: {
            deps: {
                inline: [
                    /src\//
                ],
                noExternal: true,
            },
        },
    },
    // FIX: Add a plugin to handle .template imports during testing
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
