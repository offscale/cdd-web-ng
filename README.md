# cdd-web-ng

<!-- BADGES_START -->
<!-- Replace these placeholders with your repository-specific badges -->

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI/CD](https://github.com/offscale/cdd-web-ng/workflows/CI/badge.svg)](https://github.com/offscale/cdd-web-ng/actions)
[![Coverage](https://codecov.io/gh/offscale/cdd-web-ng/branch/master/graph/badge.svg)](https://codecov.io/gh/offscale/cdd-web-ng)

<!-- BADGES_END -->

OpenAPI ↔ TypeScript. Welcome to **cdd-web-ng**, a code-generation and compilation tool bridging the gap between OpenAPI specifications and native TypeScript source code.

This toolset allows you to fluidly generate your language's native constructs (like classes, interfaces, client services, and optionally Angular admin UI components) from OpenAPI specifications, ensuring a single source of truth without sacrificing developer ergonomics.

## 🚀 Capabilities

The `cdd-web-ng` compiler leverages a unified architecture to support various facets of API and code lifecycle management.

- **Multi-Transport Compilation**:
    - **OpenAPI → `Angular`**: Generate idiomatic Angular `HttpClient` services, interceptors, models, and an optional Auto-Admin UI module.
    - **OpenAPI → `Fetch`**: Generate dependency-free, browser-native `fetch` API clients.
    - **OpenAPI → `Axios`**: Generate Axios-based clients wrapped in Promises.
    - **OpenAPI → `Node.js`**: Generate dependency-free, backend-native `http`/`https` clients for pure Node.js environments.
- **AST-Driven & Safe**: Employs static analysis (Abstract Syntax Trees using `ts-morph`) instead of unsafe string concatenation, allowing it to emit strongly-typed, safely formatted, and fully compiled code.
- **Seamless Sync**: Keep your docs, tests, and clients in perfect harmony. Generate the code natively into your project and let TS handle the rest.

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

For a deep dive into configuration options and workflows, see the [USAGE.md](USAGE.md) guide.

### Command Line Interface

Generate a standard Fetch API client:

```bash
npx cdd-web-ng from_openapi --input openapi.yaml --output ./src/api --implementation fetch
```

Generate an Angular client SDK with an Auto-Admin UI:

```bash
npx cdd-web-ng from_openapi --input openapi.yaml --output ./src/app/core/api --implementation angular --admin
```

Generate a pure Node.js server-to-server client:

```bash
npx cdd-web-ng from_openapi --input openapi.yaml --output ./src/external-api --implementation node
```

### Programmatic SDK / Library

You can also integrate `cdd-web-ng` directly into your Node.js scripts:

```ts
import { generateFromConfig } from 'cdd-web-ng';

async function buildApi() {
    await generateFromConfig({
        input: 'path/to/openapi.yaml',
        output: './src/api',
        clientName: 'DemoApi',
        options: {
            implementation: 'axios', // 'angular' | 'fetch' | 'axios' | 'node'
            generateServices: true,
        },
    });
}

buildApi().catch(console.error);
```

## 📚 Documentation

For more detailed information, please explore the following documentation files:

- **[USAGE.md](USAGE.md)**: Comprehensive guide on using the CLI and programmatic SDK, including all available options and transport variations.
- **[ARCHITECTURE.md](ARCHITECTURE.md)**: Deep dive into the internal design of the compiler, AST orchestration, and the vendor plugin system.
- **[DEVELOPING.md](DEVELOPING.md)**: Instructions for contributing to the repository, running tests, and managing code standards.
- **[COMPLIANCE.md](COMPLIANCE.md)**: Details regarding our OpenAPI specification compliance, supported versions, and extended features.
- **[PUBLISH.md](PUBLISH.md)** & **[PUBLISH_OUTPUT.md](PUBLISH_OUTPUT.md)**: Guides on publishing the generator and automating updates to generated SDKs.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE) or <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <https://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in the work by you, as defined in the Apache-2.0 license, shall be
dual licensed as above, without any additional terms or conditions.
