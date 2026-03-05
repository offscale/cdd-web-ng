import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
    test: {
        watch: false,
        globals: true,
        environment: 'node',
        include: ['tests/**/*.spec.ts'],
        exclude: ['tests/fixtures/**'],
        testTimeout: 60000,
        hookTimeout: 60000,
        reporters: ['verbose', 'junit'],
        alias: {
            '@src': path.resolve(__dirname, './src'),
        },
        outputFile: {
            junit: 'coverage/junit.xml',
        },
        coverage: {
            provider: 'v8',
            thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
            reporter: ['text', 'html', 'lcov', 'json-summary'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: [
                'src/cli.ts',
                'src/custom.d.ts',
                'src/index.ts',
                // Exclude the barrel files themselves, coverage should focus on implementation
                'src/core/types.ts',
                'src/core/utils.ts',
                'src/core/constants.ts',
                '**/index.ts',
                'tests/fixtures/**', // Data
            ],
        },
    },
    plugins: [
        {
            name: 'vite-plugin-inline-text-files',
            transform(_code, id) {
                if (id.endsWith('.template')) {
                    const fileContent = fs.readFileSync(id, 'utf-8');
                    return {
                        code: `export default ${JSON.stringify(fileContent)};`,
                        map: null,
                    };
                }
                return;
            },
        },
    ],
});
