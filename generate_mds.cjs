const fs = require('fs');

const REPO_NAME = 'cdd-ts';
const LANGUAGE = 'Angular';
const LANGUAGE_EXTENSION = 'ts';
const CLI_COMMAND = 'cdd-ts';
const PROJECT_SCOPE = 'Bidirectional';
const INSTALL_INSTRUCTIONS = 'Requires Node.js 18+. Run `npm install -g cdd-ts`';
const SUPPORTED_CONVERSIONS = '✅ Parse OpenAPI, Emit Angular services and models';

const readmeTemplate = `cdd-${LANGUAGE.toUpperCase()}
============

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI/CD](https://github.com/offscale/${REPO_NAME}/workflows/CI/badge.svg)](https://github.com/offscale/${REPO_NAME}/actions)
<!-- TEST_COVERAGE_START -->
<!-- TEST_COVERAGE_END -->
<!-- DOC_COVERAGE_START -->
<!-- DOC_COVERAGE_END -->

OpenAPI ↔ ${LANGUAGE}. This is one compiler in a suite, all focussed on the same task: Compiler Driven Development (CDD).

Each compiler is written in its target language, is whitespace and comment sensitive, and has both an SDK and CLI.

The CLI—at a minimum—has:
- \`cdd-${LANGUAGE.toLowerCase()} --help\`
- \`cdd-${LANGUAGE.toLowerCase()} --version\`
- \`cdd-${LANGUAGE.toLowerCase()} from_openapi -i spec.json\`
- \`cdd-${LANGUAGE.toLowerCase()} to_openapi -f path/to/code\`
- \`cdd-${LANGUAGE.toLowerCase()} to_docs_json --no-imports --no-wrapping -i spec.json\`

The goal of this project is to enable rapid application development without tradeoffs. Tradeoffs of Protocol Buffers / Thrift etc. are an untouchable "generated" directory and package, compile-time and/or runtime overhead. Tradeoffs of Java or JavaScript for everything are: overhead in hardware access, offline mode, ML inefficiency, and more. And neither of these alterantive approaches are truly integrated into your target system, test frameworks, and bigger abstractions you build in your app. Tradeoffs in CDD are code duplication (but CDD handles the synchronisation for you).

## 🚀 Capabilities

The \`${REPO_NAME}\` compiler leverages a unified architecture to support various facets of API and code lifecycle management.

* **Compilation**:
  * **OpenAPI → \`${LANGUAGE}\`**: Generate idiomatic native models, network routes, client SDKs, database schemas, and boilerplate directly from OpenAPI (\`.json\` / \`.yaml\`) specifications.
  * **\`${LANGUAGE}\` → OpenAPI**: Statically parse existing \`${LANGUAGE}\` source code and emit compliant OpenAPI specifications.
* **AST-Driven & Safe**: Employs static analysis (Abstract Syntax Trees) instead of unsafe dynamic execution or reflection, allowing it to safely parse and emit code even for incomplete or un-compilable project states.
* **Seamless Sync**: Keep your docs, tests, database, clients, and routing in perfect harmony. Update your code, and generate the docs; or update the docs, and generate the code.

## 📦 Installation

${INSTALL_INSTRUCTIONS}

## 🛠 Usage

### Command Line Interface

\`\`\`sh
# Generate client from OpenAPI
${CLI_COMMAND} from_openapi -i swagger.json -o ./generated
# Generate OpenAPI from source
${CLI_COMMAND} to_openapi -f ./generated -o openapi.json
\`\`\`

### Programmatic SDK / Library

\`\`\`${LANGUAGE_EXTENSION}
import { generateFromConfig } from 'cdd-ts';

await generateFromConfig({
  input: 'swagger.json',
  output: './generated'
});
\`\`\`

## Design choices

This project uses \`ts-morph\` for robust TypeScript AST parsing and emission instead of regex, ensuring syntax-aware and loss-less generation. It includes custom formatting and dependency injection boilerplate specific to Angular.

## 🏗 Supported Conversions for ${LANGUAGE}

*(The boxes below reflect the features supported by this specific \`${REPO_NAME}\` implementation)*

| Concept | Parse (From) | Emit (To) |
|---------|--------------|-----------|
| OpenAPI (JSON/YAML) | ✅ | ✅ |
| \`${LANGUAGE}\` Models / Structs / Types | ✅ | ✅ |
| \`${LANGUAGE}\` Server Routes / Endpoints | [ ] | [ ] |
| \`${LANGUAGE}\` API Clients / SDKs | ✅ | ✅ |
| \`${LANGUAGE}\` ORM / DB Schemas | [ ] | [ ] |
| \`${LANGUAGE}\` CLI Argument Parsers | [ ] | [ ] |
| \`${LANGUAGE}\` Docstrings / Comments | ✅ | ✅ |

---

## WASM Support
| Feature | Supported | Implemented |
|---------|-----------|-------------|
| WASM | Yes | Yes |

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
`;

const archTemplate = `# ${REPO_NAME} Architecture

<!-- BADGES_START -->
[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI/CD](https://github.com/offscale/${REPO_NAME}/workflows/CI/badge.svg)](https://github.com/offscale/${REPO_NAME}/actions)
[![Coverage](https://codecov.io/gh/offscale/${REPO_NAME}/branch/master/graph/badge.svg)](https://codecov.io/gh/offscale/${REPO_NAME})
<!-- BADGES_END -->

The **${REPO_NAME}** tool acts as a dedicated compiler and transpiler. Its fundamental architecture follows standard compiler design principles, divided into three distinct phases: **Frontend (Parsing)**, **Intermediate Representation (IR)**, and **Backend (Emitting)**.

This decoupled design ensures that any format capable of being parsed into the IR can subsequently be emitted into any supported output format, whether that is a server-side route, a client-side SDK, a database ORM, or an OpenAPI specification.

## 🏗 High-Level Overview

\`\`\`mermaid
graph TD
    %% Styling Definitions
    classDef frontend fill:#57caff,stroke:#4285f4,stroke-width:2px,color:#20344b,font-family:Roboto Mono
    classDef core fill:#ffd427,stroke:#f9ab00,stroke-width:3px,color:#20344b,font-family:Google Sans,font-weight:bold
    classDef backend fill:#5cdb6d,stroke:#34a853,stroke-width:2px,color:#20344b,font-family:Roboto Mono
    classDef endpoint fill:#ffffff,stroke:#20344b,stroke-width:1px,color:#20344b,font-family:Google Sans

    subgraph Frontend [Parsers]
        A[OpenAPI .yaml/.json]:::endpoint --> P1(OpenAPI Parser):::frontend
        B[LANGUAGE Models / Source]:::endpoint --> P2(LANGUAGE Parser):::frontend
        C[Server Routes / Frameworks]:::endpoint --> P3(Framework Parser):::frontend
        D[Client SDKs / ORMs]:::endpoint --> P4(Ext Parser):::frontend
    end

    subgraph Core [Intermediate Representation]
        IR((CDD IR)):::core
    end

    subgraph Backend [Emitters]
        E1(OpenAPI Emitter):::backend --> X[OpenAPI .yaml/.json]:::endpoint
        E2(LANGUAGE Emitter):::backend --> Y[LANGUAGE Models / Structs]:::endpoint
        E3(Server Emitter):::backend --> Z[Server Routes / Controllers]:::endpoint
        E4(Client Emitter):::backend --> W[Client SDKs / API Calls]:::endpoint
        E5(Data Emitter):::backend --> V[ORM Models / CLI Parsers]:::endpoint
    end

    P1 --> IR
    P2 --> IR
    P3 --> IR
    P4 --> IR

    IR --> E1
    IR --> E2
    IR --> E3
    IR --> E4
    IR --> E5
\`\`\`

## 🧩 Core Components

### 1. The Frontend (Parsers)

The Frontend's responsibility is to read an input source and translate it into the universal CDD Intermediate Representation (IR).

* **Static Analysis (AST-Driven)**: For \`${LANGUAGE}\` source code, the tool **does not** use dynamic reflection or execute the code. Instead, it reads the source files, generates an Abstract Syntax Tree (AST), and navigates the tree to extract classes, structs, functions, type signatures, API client definitions, server routes, and docstrings.
* **OpenAPI Parsing**: For OpenAPI and JSON Schema inputs, the parser normalizes the structure, resolving internal \`$ref\`s and extracting properties, endpoints (client or server perspectives), and metadata into the IR.

### 2. Intermediate Representation (IR)

The Intermediate Representation is the crucial "glue" of the architecture. It is a normalized, language-agnostic data structure that represents concepts like:
* **Models**: Entities containing typed properties, required fields, defaults, and descriptions.
* **Endpoints / Operations**: HTTP verbs, paths, path/query/body parameters, and responses. In the IR, an operation is an abstract concept that can represent *either* a Server Route receiving a request *or* an API Client dispatching a request.
* **Metadata**: Tooling hints, docstrings, and validations.

By standardizing on a single IR (heavily inspired by OpenAPI / JSON Schema primitives), the system guarantees that parsing logic and emitting logic remain completely decoupled.

### 3. The Backend (Emitters)

The Backend's responsibility is to take the universal IR and generate valid target output. Emitters can be written to support various environments (e.g., Client vs Server, Web vs CLI).

* **Code Generation**: Emitters iterate over the IR and generate idiomatic \`${LANGUAGE}\` source code. 
  * A **Server Emitter** creates routing controllers and request-validation logic.
  * A **Client Emitter** creates API wrappers, fetch functions, and response-parsing logic.
* **Database & CLI Generation**: Emitters can also target ORM models or command-line parsers by mapping IR properties to database columns or CLI arguments.
* **Specification Generation**: Emitters translating back to OpenAPI serialize the IR into standard OpenAPI 3.x JSON or YAML, rigorously formatting descriptions, type constraints, and endpoint schemas based on what was parsed from the source code.

## 🔄 Extensibility

Because of the IR-centric design, adding support for a new \`${LANGUAGE}\` framework (e.g., a new Client library, Web framework, or ORM) requires minimal effort:
1. **To support parsing a new framework**: Write a parser that converts the framework's AST/DSL into the CDD IR. Once written, the framework can automatically be exported to OpenAPI, Client SDKs, CLI parsers, or any other existing output target.
2. **To support emitting a new framework**: Write an emitter that converts the CDD IR into the framework's DSL/AST. Once written, the framework can automatically be generated from OpenAPI or any other supported input.

## 🛡 Design Principles

1. **A Single Source of Truth**: Developers should be able to maintain their definitions in whichever format is most ergonomic for their team (OpenAPI files, Native Code, Client libraries, ORM models) and generate the rest.
2. **Zero-Execution Parsing**: Ensure security and resilience by strictly statically analyzing inputs. The compiler must never need to run the target code to understand its structure.
3. **Lossless Conversion**: Maximize the retention of metadata (e.g., type annotations, docstrings, default values, validators) during the transition \`Source -> IR -> Target\`.
4. **Symmetric Operations**: An Endpoint in the IR holds all the information necessary to generate both the Server-side controller that fulfills it, and the Client-side SDK method that calls it.
`;

fs.writeFileSync('README.md', readmeTemplate);
fs.writeFileSync('ARCHITECTURE.md', archTemplate);

const complianceTemplate = `# COMPLIANCE

OpenAPI 3.0, 3.1, and 3.2.0 features are mostly compliant where possible in TypeScript generation.
- Full type preservation
- Advanced \`$ref\` resolution
- Webhooks and Callbacks
- OneOf/AnyOf mapped to unions
`;
fs.writeFileSync('COMPLIANCE.md', complianceTemplate);

const developingTemplate = `# DEVELOPING

Prerequisites:
- Node.js 18+

Setup:
\`\`\`sh
npm install
\`\`\`

Build:
\`\`\`sh
npm run build
\`\`\`

Test:
\`\`\`sh
npm run test
\`\`\`
`;
fs.writeFileSync('DEVELOPING.md', developingTemplate);

const usageTemplate = `# USAGE

See README for more details.
`;
fs.writeFileSync('USAGE.md', usageTemplate);

const publishTemplate = `# PUBLISH

To publish this package to npm:
\`\`\`sh
npm run build
npm publish --access public
\`\`\`

To build and publish docs to a static location:
\`\`\`sh
npm run docs
# Copy 'docs' folder to your web server or GitHub Pages
\`\`\`
`;
fs.writeFileSync('PUBLISH.md', publishTemplate);

const publishOutputTemplate = `# PUBLISH_OUTPUT

For the generated client-library, you can publish it as an independent npm package:
1. Initialize package.json in the generated folder
2. Compile \`tsc\`
3. Run \`npm publish\`

A GitHub Action cronjob could automatically pull the OpenAPI spec, generate the code, and publish the client library if changes are detected.
`;
fs.writeFileSync('PUBLISH_OUTPUT.md', publishOutputTemplate);

const wasmTemplate = `# WASM SUPPORT

This project can be compiled to WASM using esbuild and run in the browser or inside a WebAssembly environment (like WasmEdge) after bundling or via QuickJS.

See Makefile \`build_wasm\` target for details.
`;
fs.writeFileSync('WASM.md', wasmTemplate);

console.log('Created all MD files.');
