import { defineConfig } from 'rolldown';
import { copy } from '@rolldown/plugin-copy';
import path from 'path';

export default defineConfig({
    input: {
        index: 'src/index.ts',
        cli: 'src/cli.ts',
    },
    output: {
        dir: 'dist',
        format: 'esm',
        entryFileNames: '[name].js',
        chunkFileNames: '[name]-[hash].js',
    },
    external: [
        'ts-morph',
        'js-yaml',
        'commander',
        'fs',
        'path',
        'url'
    ],
    plugins: [
        copy({
            targets: [
                { src: 'src/service/templates', dest: 'dist' }
            ]
        }),
    ],
    resolve: {
        extensions: ['.ts', '.js'],
        // This helps Rolldown understand how to resolve .js imports from .ts files
        mainFields: ['module', 'main'],
    },
});
