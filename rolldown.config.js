// ./rolldown.config.js

import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json' with { type: 'json' };

export default defineConfig([
    // --- Library Bundle ---
    {
        input: 'src/index.ts',
        output: {
            // FIX: Use `dir` instead of `file`
            dir: 'dist',
            // FIX: Specify the naming pattern for entry files
            entryFileNames: 'index.js',
            // FIX: Specify a pattern for any other generated chunks
            chunkFileNames: '[name]-[hash].js',
            format: 'es',
            sourcemap: true,
        },
        external: Object.keys(pkg.dependencies || {}),
        plugins: [
            dts(), // This will now correctly output to `dist/index.d.ts`
        ],
    },

    // --- CLI Bundle ---
    {
        input: 'src/cli.ts',
        output: {
            // FIX: Use `dir` instead of `file`
            dir: 'dist',
            // FIX: Specify the naming pattern for the CLI entry file
            entryFileNames: 'cli.js',
            chunkFileNames: '[name]-[hash].js',
            format: 'es',
            sourcemap: true,
            banner: '#!/usr/bin/env node',
        },
        external: Object.keys(pkg.dependencies || {}),
    },
]);
