# cdd-web-ng Architecture

<!-- BADGES_START -->
<!-- Replace these placeholders with your repository-specific badges -->

[![License](https://img.shields.io/badge/license-Apache--2.0%20OR%20MIT-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CI/CD](https://github.com/offscale/cdd-web-ng/workflows/CI/badge.svg)](https://github.com/offscale/cdd-web-ng/actions)
[![Coverage](https://codecov.io/gh/offscale/cdd-web-ng/branch/master/graph/badge.svg)](https://codecov.io/gh/offscale/cdd-web-ng)

<!-- BADGES_END -->

The **cdd-web-ng** tool acts as a dedicated compiler and transpiler. Its fundamental architecture follows standard compiler design principles, divided into three distinct phases: **Frontend (Parsing)**, **Intermediate Representation (IR)**, and **Backend (Emitting)**.

This decoupled design ensures that any format capable of being parsed into the IR can subsequently be emitted into any supported output format, whether that is a client-side SDK, an administrative UI component, or an OpenAPI specification.

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
        E4(Client Emitter):::backend --> W[Angular Services / API Calls]:::endpoint
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

- **Static Analysis (AST-Driven)**: For `TypeScript (Angular)` source code, the tool **does not** use dynamic reflection or execute the code. Instead, it reads the source files, generates an Abstract Syntax Tree (AST) utilizing `ts-morph`, and navigates the tree to extract classes, interfaces, client methods, type signatures, and docstrings.
- **OpenAPI Parsing**: For OpenAPI and JSON Schema inputs, the parser normalizes the structure, resolving internal `$ref`s and extracting properties, endpoints (from a client perspective), and metadata into the IR.

### 2. Intermediate Representation (IR)

The Intermediate Representation is the crucial "glue" of the architecture. It is a normalized, language-agnostic data structure that represents concepts like:

- **Models**: Entities containing typed properties, required fields, defaults, and descriptions.
- **Endpoints / Operations**: HTTP verbs, paths, path/query/body parameters, and responses. In the IR, an operation is an abstract concept that can represent an API Client dispatching a request or an Admin UI component interacting with a resource.
- **Metadata**: Tooling hints, docstrings, and validations.

By standardizing on a single IR (heavily inspired by OpenAPI / JSON Schema primitives), the system guarantees that parsing logic and emitting logic remain completely decoupled.

### 3. The Backend (Emitters)

The Backend's responsibility is to take the universal IR and generate valid target output. `cdd-web-ng` focuses specifically on front-end code generation targeting the Angular framework (with extendable structure for others like React and Vue).

- **Code Generation**: Emitters iterate over the IR and generate idiomatic `TypeScript (Angular)` source code.
    - A **Client Emitter** creates Angular API service wrappers, fetch functions using `HttpClient`, and response-parsing logic.
    - An **Admin UI Emitter** translates the IR into robust Angular components (forms, lists) for resource management.
    - A **Model Emitter** creates TypeScript interfaces or classes matching the schema definitions.
- **Specification Generation**: Emitters translating back to OpenAPI serialize the IR into standard OpenAPI 3.x JSON or YAML, rigorously formatting descriptions, type constraints, and endpoint schemas based on what was parsed from the source code.

## 🔄 Extensibility

Because of the IR-centric design, adding support for a new output format requires minimal effort:

1. **To support parsing a new source**: Write a parser that converts the target AST/DSL into the CDD IR. Once written, the source can automatically be exported to OpenAPI, Client SDKs, or Admin UIs.
2. **To support emitting a new framework**: Write an emitter that converts the CDD IR into the framework's DSL/AST. Once written, the framework can automatically be generated from OpenAPI.

## 🛡 Design Principles

1. **A Single Source of Truth**: Developers should be able to maintain their definitions in whichever format is most ergonomic for their team (OpenAPI files, Native Code, Client libraries) and generate the rest.
2. **Zero-Execution Parsing**: Ensure security and resilience by strictly statically analyzing inputs. The compiler must never need to run the target code to understand its structure.
3. **Lossless Conversion**: Maximize the retention of metadata (e.g., type annotations, docstrings, default values, validators) during the transition `Source -> IR -> Target`.
4. **Symmetric Operations**: An Endpoint in the IR holds all the information necessary to generate both the Client-side SDK method that calls it, and accurately reconstruct the OpenAPI path item that defined it.
