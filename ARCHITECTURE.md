# cdd-web-ng Architecture

<!-- BADGES_START -->
<!-- Replace these placeholders with your repository-specific badges -->

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI/CD](https://github.com/offscale/cdd-web-ng/workflows/CI/badge.svg)](https://github.com/offscale/cdd-web-ng/actions)
[![Coverage](https://codecov.io/gh/offscale/cdd-web-ng/branch/master/graph/badge.svg)](https://codecov.io/gh/offscale/cdd-web-ng)

<!-- BADGES_END -->

The **cdd-web-ng** tool acts as a dedicated compiler and transpiler. Its fundamental architecture follows standard compiler design principles, divided into three distinct phases: **Frontend (Parsing)**, **Intermediate Representation (IR)**, and **Backend (Emitting)**.

This decoupled design ensures that any format capable of being parsed into the IR can subsequently be emitted into any supported output transport mechanism, whether that is a browser-native SDK, an administrative UI component, or an OpenAPI specification.

## 🏗 High-Level Overview

```mermaid
graph TD
    %% Styling Definitions
    classDef frontend fill:#57caff,stroke:#4285f4,stroke-width:2px,color:#20344b,font-family:Roboto Mono
    classDef core fill:#ffd427,stroke:#f9ab00,stroke-width:3px,color:#20344b,font-family:Google Sans,font-weight:bold
    classDef backend fill:#5cdb6d,stroke:#34a853,stroke-width:2px,color:#20344b,font-family:Roboto Mono
    classDef endpoint fill:#ffffff,stroke:#20344b,stroke-width:1px,color:#20344b,font-family:Google Sans

    subgraph Frontend [Parsers]
        A[OpenAPI .yaml/.json]:::endpoint --> P1(OpenAPI Parser):::frontend
        B[TypeScript Models / Source]:::endpoint --> P2(TypeScript Parser):::frontend
        D[Client SDKs / Services]:::endpoint --> P4(Service Parser):::frontend
    end

    subgraph Core [Intermediate Representation]
        IR((CDD IR)):::core
    end

    subgraph Backend [Emitters]
        E1(OpenAPI Emitter):::backend --> X[OpenAPI .yaml/.json]:::endpoint
        E2(TypeScript Emitter):::backend --> Y[TypeScript Models / Interfaces]:::endpoint
        E4(Client Emitter):::backend --> W[Angular / Fetch / Axios / Node SDKs]:::endpoint
        E5(Admin UI Emitter):::backend --> V[Angular Admin UI Components]:::endpoint
    end

    P1 --> IR
    P2 --> IR
    P4 --> IR

    IR --> E1
    IR --> E2
    IR --> E4
    IR --> E5
```

## 🧩 Core Components

### 1. The Frontend (Parsers)

The Frontend's responsibility is to read an input source and translate it into the universal CDD Intermediate Representation (IR).

- **Static Analysis (AST-Driven)**: For TypeScript source code, the tool **does not** use dynamic reflection or execute the code. Instead, it reads the source files, generates an Abstract Syntax Tree (AST) utilizing `ts-morph`, and navigates the tree to extract classes, interfaces, client methods, type signatures, and docstrings.
- **OpenAPI Parsing**: For OpenAPI and JSON Schema inputs, `SwaggerParser` normalizes the structure, resolving internal `$ref`s and extracting properties, endpoints, and metadata into the IR.

### 2. Intermediate Representation (IR)

The Intermediate Representation is the crucial "glue" of the architecture. It is a normalized, language-agnostic data structure managed primarily by `ServiceMethodAnalyzer`. It translates raw OpenAPI into:

- **Models**: Entities containing typed properties, required fields, defaults, and descriptions.
- **Endpoints / Operations (`ServiceMethodModel`)**: HTTP verbs, paths, path/query/body parameters, serialization strategies, and response variants.
- **Metadata**: Tooling hints, docstrings, and validations.

By standardizing on a single IR, the system guarantees that parsing logic and emitting logic remain completely decoupled.

### 3. The Backend (Emitters)

The Backend's responsibility is to take the universal IR and generate valid target output. `cdd-web-ng` focuses specifically on front-end and backend Node.js code generation targeting multiple transports via a Plugin Architecture.

- **`AbstractClientGenerator`**: The base orchestrator that defines the pipeline (generate models -> generate utilities -> generate services).
- **Vendor Plugins**:
    - **`AngularClientGenerator`**: Emits RxJS-based `HttpClient` code and `NgModule`s.
    - **`FetchClientGenerator`**: Emits Promise-based native browser `fetch` code.
    - **`AxiosClientGenerator`**: Emits Promise-based `axios` configurations and requests.
    - **`NodeClientGenerator`**: Emits Promise-based `node:http/https` chunks and streams.
- **Admin UI Emitter**: An optional plugin (currently Angular-only) that translates the IR into robust components (forms, lists) for resource management.

## 🔄 Extensibility

Because of the IR-centric design, adding support for a new output format (e.g. `React`, `Vue`) requires minimal effort:

1. Create a class extending `AbstractClientGenerator`.
2. Implement an `AbstractServiceGenerator` to manage the output files.
3. Use the `ServiceMethodAnalyzer` to iterate over endpoints, mapping the IR properties (like `urlTemplate`, `queryParams`, `body`) to your target framework's specific AST nodes using `ts-morph`.

## 🛡 Design Principles

1. **A Single Source of Truth**: Developers should be able to maintain their definitions in whichever format is most ergonomic for their team (OpenAPI files, Native Code, Client libraries) and generate the rest.
2. **Zero-Execution Parsing**: Ensure security and resilience by strictly statically analyzing inputs. The compiler must never need to run the target code to understand its structure.
3. **Lossless Conversion**: Maximize the retention of metadata (e.g., type annotations, docstrings, default values, validators) during the transition `Source -> IR -> Target`.
4. **Symmetric Operations**: An Endpoint in the IR holds all the information necessary to generate both the Client-side SDK method that calls it, and accurately reconstruct the OpenAPI path item that defined it.
