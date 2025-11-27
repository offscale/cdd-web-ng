# cdd-web-ng

[![License](https://img.shields.io/badge/license-MIT-blue)](https://opensource.org/licenses/MIT)
[![Tests and coverage](https://github.com/offscale/cdd-web-ng/actions/workflows/tests_and_coverage.yml/badge.svg)](https://github.com/offscale/cdd-web-ng/actions/workflows/tests_and_coverage.yml)
[![codecov](https://codecov.io/github/offscale/cdd-web-ng/graph/badge.svg?token=EtThJkGRA1)](https://codecov.io/github/offscale/cdd-web-ng)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.2.0-green)](https://spec.openapis.org/oas/v3.2.0)
[![Swagger](https://img.shields.io/badge/Swagger-2.0-orange)](https://swagger.io/specification/v2/)

**OpenAPI ↔ Angular**

`cdd-web-ng` is an advanced, spec-compliant code generator that transforms OpenAPI (3.0, 3.1, 3.2) and Swagger (2.0)
specifications into fully-featured Angular client SDKs. It goes beyond simple client generation, creating services,
models, and even a complete CRUD administrative UI with deep respect for the nuances of the API contract.

## Key Features

This generator is built to handle real-world, complex API definitions with a focus on correctness, extensibility, and
reliability.

### 🚀 Exhaustive OpenAPI 3.2.0 Compliance

While many generators only cover the basics, `cdd-web-ng` is designed to correctly implement even the most complex and
esoteric parts of the modern OpenAPI specification. If it's in the spec, we support it.

- **Complex Schemas & Polymorphism:** Full support for `discriminator` mapping (explicit and implicit), `allOf`
  compositions, `oneOf`/`anyOf` unions, and `readOnly`/`writeOnly` filtering (generating distinct request vs. response
  models).
- **JSON Schema 2020-12 Support:** Handles OAS 3.1 specific keywords like `$dynamicRef`, `dependentSchemas`,
  `unevaluatedProperties`, and `prefixItems` (tuples).
- **Advanced Serialization:**
    - **XML:** Full support for the `xml` object, including `nodeType`, namespaces, prefixes, and attribute wrapping.
    - **Multipart:** Nested `multipart/mixed` and `multipart/form-data` with specific header encodings.
    - **Streaming:** Native support for sequential media types like `application/json-seq`, `application/x-ndjson`, and
      `text/event-stream` (Server-Sent Events).
- **Runtime Features:** Implements
  dynamic [Runtime Expressions](https://spec.openapis.org/oas/v3.2.0.html#runtime-expressions) for resolving **Links**
  and **Callbacks** directly from HTTP responses.
- **Strict Parameter Serialization:** Correctly implements `style` and `explode` logic for all parameter locations (
  path, query, header, cookie), including "deepObject" and space/pipe delimited styles.

### 📚 Legacy Swagger 2.0 Support

Don't leave your legacy APIs behind. `cdd-web-ng` includes a robust compatibility layer that works with Swagger 2:

- Maps legacy `collectionFormat` (csv, ssv, pipes) to modern `style`/`explode` serialization.
- Normalizes `definitions` and `securityDefinitions` to the OpenAPI 3.0 component model.
- Ensures your legacy services utilize the same modern Angular features (Signals, Standalone Components) as your new
  ones.

### 🔌 Highly Extensible Architecture

The generator is designed from the ground up to be framework-agnostic, making it easy to add support for other web
frameworks like **React** or **Vue**.

This is achieved through a two-phase process:

1. **Analysis Phase:** The OpenAPI specification is parsed into a framework-agnostic **Intermediate Representation (IR)
   **. This IR (located in `src/analysis`) describes API operations, data models, validation rules, and UI components
   without any ties to Angular or any other technology.
2. **Emission Phase:** A framework-specific generator consumes the IR to produce source code. The current implementation
   targets Angular (`src/generators/angular`), but new generators for other frameworks can be easily added by consuming
   the same stable IR.

```mermaid
%%{
  init: {
    "theme": "base",
    "themeVariables": {
      "primaryTextColor": "#20344b",
      "lineColor": "#20344b"
    },
    "fontFamily": "Google Sans, Roboto, sans-serif"
  }
}%%
graph TD
    %% --- Top of the Flow ---
    OpenAPI_Spec(["`<b>OpenAPI 3.x / Swagger 2.0</b><br/>Source of Truth`"])

    subgraph Core_Forward [1. Core Layer]
        Spec_Parser("`<b>Spec Parser</b><br/>Loads, validates & normalizes`")
    end

    Parsed_Object(("-"))

    subgraph Analysis_Forward [2. Analysis Layer]
        Spec_Analyzer("`<b>Spec Analyzer</b><br/>Builds abstract model`")
    end

    %% --- Central Pivot ---
    IR{{"`<b>Intermediate Representation (IR)</b><br/><i>The bidirectional, framework-agnostic<br/>single source of truth for the API contract.</i>`"}}

    %% --- Generation Output ---
    subgraph Generation_Outputs [3. Generation Layer]
        Code_Generators("`<b>Code Generators</b><br/>(Angular, Shared, etc.)`")
    end

    Generated_Codebase(["`<b>Generated Codebase</b><br/>(Services, Components, Models)`"])

    %% --- Future Reverse Flow (Bottom Up) ---
    subgraph Analysis_Reverse [2. Reverse Analysis Layer]
        Code_Analyzer("`<b>Code Analyzer</b><br/>Builds abstract model from AST`")
    end

    Code_AST(("-"))

    subgraph Core_Reverse [1. Reverse Core Layer]
        Code_Scanner("`<b>Code Scanner</b><br/>AST Parser for source files`")
    end

    Existing_Codebase(["`<b>Existing Codebase</b><br/>(Services, Decorators)`"])

    %% --- Future Spec Generation (Loop Back) ---
    subgraph Spec_Generation ["Future: Spec Generation"]
        Spec_Generator("`<b>Spec Generator</b><br/>Emits OpenAPI 3.x YAML/JSON`")
    end

    %% --- CONNECTIONS ---

    %% Forward Flow (Top-Down)
    OpenAPI_Spec --> Spec_Parser --> Parsed_Object --> Spec_Analyzer --> IR --> Code_Generators --> Generated_Codebase

    %% Reverse Flow (Future, Bottom-Up)
    Existing_Codebase -- FUTURE --> Code_Scanner --> Code_AST --> Code_Analyzer -- FUTURE --> IR

    %% Spec Generation from IR (Future, Loop Back)
    IR -- FUTURE --> Spec_Generator -.-> OpenAPI_Spec

    %% --- STYLING ---

    %% Subgraph Styles
    style Core_Forward fill:#4285f4,stroke:#20344b,color:#ffffff
    style Analysis_Forward fill:#34a853,stroke:#20344b,color:#ffffff
    style Generation_Outputs fill:#f9ab00,stroke:#20344b,color:#20344b
    style Core_Reverse fill:#4285f4,stroke:#20344b,color:#ffffff,stroke-dasharray: 5 5
    style Analysis_Reverse fill:#34a853,stroke:#20344b,color:#ffffff,stroke-dasharray: 5 5
    style Spec_Generation fill:#f9ab00,stroke:#20344b,color:#20344b,stroke-dasharray: 5 5

    %% Node Styles
    style OpenAPI_Spec fill:#ea4335,stroke:#20344b,stroke-width:2px,color:#ffffff
    style Generated_Codebase fill:#20344b,stroke:#20344b,color:#ffffff
    style Existing_Codebase fill:#20344b,stroke:#20344b,color:#ffffff
    style Spec_Parser fill:#57caff,stroke:#20344b,color:#20344b
    style Spec_Analyzer fill:#5cdb6d,stroke:#20344b,color:#20344b
    style Code_Scanner fill:#57caff,stroke:#20344b,color:#20344b
    style Code_Analyzer fill:#5cdb6d,stroke:#20344b,color:#20344b
    style Code_Generators fill:#ffd427,stroke:#20344b,color:#20344b
    style Spec_Generator fill:#ffd427,stroke:#20344b,color:#20344b
    style Parsed_Object shape:circle,fill:#ffffff,stroke:#20344b,stroke-width:2px,color:#20344b
    style Code_AST shape:circle,fill:#ffffff,stroke:#20344b,stroke-width:2px,color:#20344b
    style IR fill:#fff,stroke:#34a853,stroke-width:4px,color:#20344b

    %% Link Styles (Grouped for stability)
    %% Link indices are 0-based, in order of definition.
    %% Solid Forward Flow Links (links 0 to 5)
    linkStyle 0,1,2,3,4,5 stroke-width:2px,stroke:#20344b
    %% Dashed Reverse Flow Links (links 6 to 9)
    linkStyle 6,7,8,9 stroke-width:2px,stroke-dasharray:5 5,stroke:#20344b
    %% Dashed Red Spec Gen Links (links 10 and 11)
    linkStyle 10,11 stroke-width:2px,stroke-dasharray:5 5,stroke:red
```

### ✅ Comprehensive Test Coverage

Reliability is paramount. The codebase is validated by a robust, multi-layered test suite to ensure every feature, from
core parsing to the generated UI, works as expected.

- **Unit Tests** (`00-core` to `50-emit-admin`) for core utilities, individual analyzers, and generator components.
- **End-to-End Tests** (`60-e2e`) that run the entire generation process on complex, in-memory OpenAPI specs and
  validate the output.
- **Generated Code Tests** (`70-generated-code`) that validate the _test files_ we generate.
- A dedicated **`90-final-coverage`** suite with `branch-coverage.spec.ts` ensures even the smallest logical branches
  are tested.

## Installation

```bash
git clone --depth=1 https://github.com/offscale/cdd-web-ng
cd cdd-web-ng
npm install
npm run build
npm install -g .
```

(I'll put it up on npmjs soon)

## Usage

The primary way to use the generator is through its command-line interface.

```bash
cdd_web_ng from_openapi --input <path-or-url-to-spec> --output <output-directory> [options]
```

### Options

| Option                   | Alias | Description                                                               | Default       |
| ------------------------ | ----- | ------------------------------------------------------------------------- | ------------- |
| `--config <path>`        | `-c`  | Path to a configuration JS file.                                          | `undefined`   |
| `--input <path>`         | `-i`  | Path or URL to the OpenAPI spec (overrides config).                       | _Required_    |
| `--output <path>`        | `-o`  | Output directory for generated files (overrides config).                  | `./generated` |
| `--framework <name>`     |       | Target framework. Currently supports `angular`.                           | `angular`     |
| `--admin`                |       | Generate a complete Angular Material admin UI for CRUD operations.        | `false`       |
| `--no-generate-services` |       | Disable generation of API services.                                       | `true`        |
| `--no-tests-for-service` |       | Disable generation of `.spec.ts` test files for services.                 | `true`        |
| `--dateType <type>`      |       | How to type `format: "date"` or `"date-time"`. Choices: `string`, `Date`. | `Date`        |
| `--enumStyle <style>`    |       | How to generate enums. Choices: `enum`, `union`.                          | `enum`        |

## Acknowledgement

This project extends upon foundational ideas for Angular client generation (`Services` only; no tests; no auto-admin;
limited OpenAPI spec implementation) from the MIT-licensed [ng-openapi-gen](https://github.com/ng-openapi/ng-openapi)
project. Thanks to [Tareq Jami (@Mr-Jami)](https://github.com/Mr-Jami).
