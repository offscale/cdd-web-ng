import { defineConfig } from 'vitest/config';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.spec.ts'],
        testTimeout: 30000,
        reporters: ['verbose', 'junit'],
        alias: {
            '@src': path.resolve(__dirname, './src'),
        },
        outputFile: {
            junit: 'coverage/junit.xml'
        },
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'html', 'lcov'],
            reportsDirectory: './coverage',
            include: ['src/**/*.ts'],
            exclude: [
                'src/cli.ts', 'src/custom.d.ts', 'src/index.ts',
                // Exclude the barrel files themselves, coverage should focus on implementation
                'src/core/types.ts', 'src/core/utils.ts', 'src/core/constants.ts',
                '**/index.ts',
                'src/component', 'src/route', // Stubs
                'tests/fixtures/**' // Data
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
                        map: null
                    };
                }
                return;
            }
        }
    ]
});
