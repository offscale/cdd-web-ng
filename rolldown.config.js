import { defineConfig } from 'rolldown';
import dts from 'rolldown-plugin-dts'

export default defineConfig({
    input: {
        index: 'src/index.ts',
        cli: 'src/cli.ts'
    },
    output: {
        // These two lines are the crucial fix.
        dir: 'dist',
        emptyOutDir: true,

        format: 'es',
        sourcemap: true,
    },
    plugins: [
        dts()
    ],
    resolve: {
        // Add this to ensure templates are not bundled
        external: [
            /templates/
        ]
    }
});
