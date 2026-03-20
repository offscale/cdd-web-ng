cdd-ts
======

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![Angular Integration](https://github.com/offscale/cdd-ts/actions/workflows/integration.yml/badge.svg)](https://github.com/offscale/cdd-ts/actions/workflows/integration.yml)
[![Deploy docs to Pages](https://github.com/offscale/cdd-ts/actions/workflows/docs.yml/badge.svg)](https://github.com/offscale/cdd-ts/actions/workflows/docs.yml)
[![Linting and Code Quality](https://github.com/offscale/cdd-ts/actions/workflows/lint.yml/badge.svg)](https://github.com/offscale/cdd-ts/actions/workflows/lint.yml)
[![Tests and coverage](https://github.com/offscale/cdd-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/offscale/cdd-ts/actions/workflows/ci.yml)
[![Doc Coverage](https://img.shields.io/badge/doc_coverage-100%25-brightgreen.svg)](https://github.com/offscale/cdd-ts)
[![Test Coverage](https://img.shields.io/badge/test_coverage-100%25-brightgreen.svg)](https://github.com/offscale/cdd-ts)

OpenAPI ↔ TypeScript. This is one compiler in a suite, all focussed on the same task: Compiler Driven Development (CDD).

Each compiler is written in its target language, is whitespace and comment sensitive, and has both an SDK and CLI.

The CLI—at a minimum—has:

- `cdd-ts --help`
- `cdd-ts --version`
- `cdd-ts from_openapi to_sdk_cli -i spec.json`
- `cdd-ts from_openapi to_sdk -i spec.json`
- `cdd-ts from_openapi to_server -i spec.json`
- `cdd-ts to_openapi -f path/to/code`
- `cdd-ts to_docs_json --no-imports --no-wrapping -i spec.json`
- `cdd-ts serve_json_rpc --port 8080 --listen 0.0.0.0`

The goal of this project is to enable rapid application development without tradeoffs. Tradeoffs of Protocol Buffers / Thrift etc. are an untouchable "generated" directory and package, compile-time and/or runtime overhead. Tradeoffs of Java or JavaScript for everything are: overhead in hardware access, offline mode, ML inefficiency, and more. And neither of these alterantive approaches are truly integrated into your target system, test frameworks, and bigger abstractions you build in your app. Tradeoffs in CDD are code duplication (but CDD handles the synchronisation for you).

## 🚀 Capabilities

The `cdd-ts` compiler leverages a unified architecture to support various facets of API and code lifecycle management.

- **Compilation**:
    - **OpenAPI → `TypeScript`**: Generate idiomatic native models, network routes, client SDKs (Angular, Fetch, Axios), and Node servers directly from OpenAPI (`.json` / `.yaml`) specifications.
    - **`TypeScript` → OpenAPI**: Statically parse existing `TypeScript` source code and emit compliant OpenAPI specifications.
- **AST-Driven & Safe**: Employs static analysis (Abstract Syntax Trees via ts-morph) instead of unsafe dynamic execution or reflection, allowing it to safely parse and emit code even for incomplete or un-compilable project states.
- **Seamless Sync**: Keep your docs, tests, database, clients, and routing in perfect harmony. Update your code, and generate the docs; or update the docs, and generate the code.

## 📦 Installation

Requires Node.js 18+. You can install the CLI globally or run it via npx:

```bash
npm install -g cdd-ts
# Or use directly via npx
npx cdd-ts --help
```

## 🛠 Usage

### Command Line Interface

Generate an Angular Client SDK from an OpenAPI spec:

```bash
cdd-ts from_openapi to_sdk -i ./openapi.yaml -o ./src/api --framework angular
```

Generate an OpenAPI spec from your existing TypeScript models and routes:

```bash
cdd-ts to_openapi -f ./src -o ./openapi-snapshot.yaml
```

### Programmatic SDK / Library

```ts
import { SwaggerParser } from 'cdd-ts/openapi/parse';
import { generateFromConfig } from 'cdd-ts/index';

async function generate() {
    const config = {
        input: './openapi.yaml',
        output: './src/api',
        options: {
            framework: 'fetch',
            implementation: 'fetch',
        },
    };

    await generateFromConfig(config);
}
```

## Design choices

The `cdd-ts` project chooses `ts-morph` as its underlying AST wrapper over the native TypeScript compiler API to simplify static analysis and tree traversal. This avoids dynamic reflection or execution of your project's code, thus protecting your environment from arbitrary code execution during parsing.

In addition, it has a built-in JSON-RPC server (`serve_json_rpc`) which provides a unified endpoint for other CDD components and editors to query or command the parser symmetrically.

Note regarding WASM: Compiling this TypeScript CLI natively to a standalone WebAssembly binary is not currently possible without bundling a JS engine, due to heavy usage of standard Node.js libraries (`fs`, `path`). More details in [WASM.md](./WASM.md).

## 🏗 Supported Conversions for TypeScript

_(The boxes below reflect the features supported by this specific `cdd-ts` implementation)_

| Concept                                | Parse (From) | Emit (To) |
| -------------------------------------- | ------------ | --------- |
| OpenAPI (JSON/YAML)                    | ✅           | ✅        |
| `TypeScript` Models / Structs / Types  | ✅           | ✅        |
| `TypeScript` Server Routes / Endpoints | ✅           | ✅        |
| `TypeScript` API Clients / SDKs        | ✅           | ✅        |
| `TypeScript` ORM / DB Schemas          | [ ]          | [ ]       |
| `TypeScript` CLI Argument Parsers      | [ ]          | ✅        |
| `TypeScript` Docstrings / Comments     | ✅           | ✅        |

---

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <https://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.

## CLI Help

```
$ dist/cli.js --help
Usage: cdd-ts [options] [command]

OpenAPI ↔ Angular

Options:
  -V, --version             output the version number
  -h, --help                display help for command

Commands:
  from_openapi              Generate code from OpenAPI
  to_openapi [options]      Generate an OpenAPI specification from TypeScript
                            code (snapshot-based with AST fallback)
  to_docs_json [options]    Generate JSON containing how to call operations in
                            the target language
  serve_json_rpc [options]  Expose CLI interface as JSON-RPC server
  help [command]            display help for command
```

### `from_openapi`

```
$ dist/cli.js from_openapi --help
Usage: cdd-ts from_openapi [options] [command]

Generate code from OpenAPI

Options:
  -h, --help            display help for command

Commands:
  to_sdk_cli [options]  Generate Client SDK CLI from an OpenAPI specification
  to_sdk [options]      Generate Client SDK from an OpenAPI specification
  to_server [options]   Generate Server from an OpenAPI specification
  help [command]        display help for command
```

### `to_openapi`

```
$ dist/cli.js to_openapi --help
Usage: cdd-ts to_openapi [options]

Generate an OpenAPI specification from TypeScript code (snapshot-based with AST
fallback)

Options:
  -i, --input <path>   Path to a snapshot file or a generated output directory
                       (env: CDD_INPUT)
  -o, --output <path>  Output file (env: CDD_OUTPUT)
  --format <format>    Output format for the OpenAPI spec (choices: "json",
                       "yaml", default: "yaml", env: CDD_FORMAT)
  -h, --help           display help for command
```

### `to_docs_json`

```
$ dist/cli.js to_docs_json --help
Usage: cdd-ts to_docs_json [options]

Generate JSON containing how to call operations in the target language

Options:
  -i, --input <path>   Path or URL to the OpenAPI spec (env: CDD_INPUT)
  -o, --output <path>  Path to write the JSON to (env: CDD_OUTPUT)
  --no-imports         Do not include import statements in the generated code
                       (env: CDD_NO_IMPORTS)
  --no-wrapping        Do not wrap the generated code in a function or block
                       (env: CDD_NO_WRAPPING)
  -h, --help           display help for command
```
