// vitest.config.ts (Final Final Version)

import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.spec.ts'],
        testTimeout: 30000,
        reporters: ['verbose'],
        alias: {
            // This is the most common and robust way
            '@src': path.resolve(__dirname, './src'),
        },
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: [
                'src/cli.ts', 'src/custom.d.ts', 'src/index.ts',
                'src/core/types.ts', 'src/core/constants.ts',
                '**/index.ts', 'src/component', 'src/route',
            ],
            /*thresholds: {
                statements: 99, branches: 95, functions: 99, lines: 99,
            }*/
        },
    },
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
