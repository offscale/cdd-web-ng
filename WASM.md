# WASM Support

The `cdd-web-ng` compiler is written in TypeScript and runs on Node.js.

## Is Native WASM Support Possible?

**Directly**: No. TypeScript natively compiles to JavaScript, not WebAssembly. Projects like AssemblyScript exist, but they do not support the vast majority of the standard TypeScript compiler APIs (like `ts-morph` and `typescript` which this project relies on). Furthermore, standard Node.js APIs like `fs` and `path` are heavily utilized.

**Bundling**: Yes. We can produce a browser-compatible JavaScript bundle using standard bundlers (like `esbuild` or `webpack`) and polyfilling `fs` with an in-memory filesystem.

If true WebAssembly is absolutely required (e.g. for executing in an environment without a JS engine), a JS runtime like QuickJS could be compiled to WASM using `emsdk` and ship alongside the bundled JS code. For the purpose of integrating this project into a unified web interface, the easiest path is just to use the JS bundle.

The `make build_wasm` step currently runs the standard `npm run build` process to ensure the Node.js build passes.
