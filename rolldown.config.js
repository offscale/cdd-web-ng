// ./rolldown.config.js

// FIX: Changed from a default import to a named import
import { dts } from 'rolldown-plugin-dts';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// We need to list node built-ins and dependencies as external
// to prevent rolldown from trying to bundle them.
const external = [
    'commander',
    'js-yaml',
    'ts-morph',
    'fs',
    'path',
    'url',
    /^node:/, // Match imports like 'node:fs'
];

export default {
    input: Object.fromEntries(
        // Find all TypeScript files in the src directory
        glob.sync('src/**/*.ts').map(file => [
            // This preserves the directory structure for the output.
            // e.g., 'src/core/utils.ts' becomes an entry named 'core/utils'
            file.slice(0, file.length - '.ts'.length).replace(/^src\//, ''),
            fileURLToPath(new URL(file, import.meta.url)),
        ])
    ),
    output: {
        dir: 'dist',
        format: 'es',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        // Add the #!/usr/bin/env node shebang to the CLI entry file so it's executable
        banner: (chunk) => {
            if (chunk.name === 'cli') {
                return '#!/usr/bin/env node';
            }
            return '';
        },
    },
    plugins: [
        // Use the dts plugin to generate TypeScript declaration files (.d.ts)
        dts({
            tsconfig: resolve(__dirname, 'tsconfig.json'),
        }),
    ],
    // Mark dependencies and Node.js built-ins as external
    external,
};
