# WASM Support

The `cdd-ts` compiler is written in TypeScript and runs on Node.js.

## Is Native WASM Support Possible?

**Directly**: No. TypeScript natively compiles to JavaScript, not WebAssembly. Projects like AssemblyScript exist, but they do not support the vast majority of the standard TypeScript compiler APIs (like `ts-morph` and `typescript` which this project relies on). Furthermore, standard Node.js APIs like `fs` and `path` are heavily utilized.

**Bundling & Compiling to WASM**: Yes. We produce a browser-compatible JavaScript bundle using standard bundlers (like `esbuild`) and polyfill/externalize necessary APIs. Then, using [Javy](https://github.com/bytecodealliance/javy), we compile that JavaScript payload and the QuickJS runtime together into a fully functional standalone WebAssembly (`.wasm`) module.

For the purpose of integrating this project into a unified web interface, you have the choice between utilizing the `.js` bundle directly (which is lighter) or executing the true `.wasm` binary in environments that require it.

The `make build_wasm` step runs `esbuild` to generate the browser-compatible JS bundle and then invokes `javy-cli` to compile it to WebAssembly, ensuring both `wasm/cdd-ts.js` and `wasm/cdd-ts.wasm` are produced.
