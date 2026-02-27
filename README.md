# cdd-web-ng

<!-- BADGES_START -->
<!-- Replace these placeholders with your repository-specific badges -->

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI/CD](https://github.com/offscale/cdd-web-ng/workflows/CI/badge.svg)](https://github.com/offscale/cdd-web-ng/actions)
[![Coverage](https://codecov.io/gh/offscale/cdd-web-ng/branch/master/graph/badge.svg)](https://codecov.io/gh/offscale/cdd-web-ng)

<!-- BADGES_END -->

OpenAPI ↔ TypeScript (Angular). Welcome to **cdd-web-ng**, a code-generation and compilation tool bridging the gap between OpenAPI specifications and native `TypeScript (Angular)` source code.

This toolset allows you to fluidly convert between your language's native constructs (like classes, interfaces, client services, and admin UI components) and OpenAPI specifications, ensuring a single source of truth without sacrificing developer ergonomics.

## 🚀 Capabilities

The `cdd-web-ng` compiler leverages a unified architecture to support various facets of API and code lifecycle management.

- **Compilation**:
    - **OpenAPI → `TypeScript (Angular)`**: Generate idiomatic native models, client SDKs, administrative UI components, and boilerplate directly from OpenAPI (`.json` / `.yaml`) specifications.
    - **`TypeScript (Angular)` → OpenAPI**: Statically parse existing `TypeScript (Angular)` source code and emit compliant OpenAPI specifications.
- **AST-Driven & Safe**: Employs static analysis (Abstract Syntax Trees) instead of unsafe dynamic execution or reflection, allowing it to safely parse and emit code even for incomplete or un-compilable project states.
- **Seamless Sync**: Keep your docs, tests, and clients in perfect harmony. Update your code, and generate the docs; or update the docs, and generate the code.

## 📦 Installation

Requires Node.js 18 or later. You can install the package directly into your project:

```bash
npm install cdd-web-ng --save-dev
```

Or run it directly using `npx`:

```bash
npx cdd-web-ng --help
```

## 🛠 Usage

### Command Line Interface

Generate Angular client services, models, and an optional admin UI from an OpenAPI spec:

```bash
npx cdd-web-ng from_openapi --input openapi.yaml --output ./src/app/core/api --clientName MyApi --admin
```

Generate an OpenAPI specification back from the generated TypeScript code:

```bash
npx cdd-web-ng to_openapi --file ./src/app/core/api --format yaml > openapi.yaml
```

### Programmatic SDK / Library

You can also integrate `cdd-web-ng` directly into your Node.js scripts:

```ts
import { generateFromConfig } from 'cdd-web-ng';

async function buildApi() {
    await generateFromConfig({
        input: 'path/to/openapi.yaml',
        output: './src/app/api',
        clientName: 'DemoApi',
        options: {
            framework: 'angular',
            admin: true,
            generateServices: true,
        },
    });
}

buildApi().catch(console.error);
```

## 🏗 Supported Conversions for TypeScript (Angular)

_(The boxes below reflect the features supported by this specific `cdd-web-ng` implementation)_

| Concept                                          | Parse (From) | Emit (To) |
| ------------------------------------------------ | ------------ | --------- |
| OpenAPI (JSON/YAML)                              | ✅           | ✅        |
| `TypeScript (Angular)` Models / Structs / Types  | ✅           | ✅        |
| `TypeScript (Angular)` Server Routes / Endpoints | [ ]          | [ ]       |
| `TypeScript (Angular)` API Clients / SDKs        | ✅           | ✅        |
| `TypeScript (Angular)` ORM / DB Schemas          | [ ]          | [ ]       |
| `TypeScript (Angular)` CLI Argument Parsers      | [ ]          | [ ]       |
| `TypeScript (Angular)` Docstrings / Comments     | ✅           | ✅        |

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
