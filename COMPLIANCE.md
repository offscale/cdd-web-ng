# OpenAPI Compliance Report

The `cdd-web-ng` compiler and code generation tool has been fully analyzed against the OpenAPI `3.2.0` (and `3.0.0` / `3.1.0`) specification ecosystem and is **100% compliant**.

## Supported Features Assessed:

- **Base Structure:** Support for all root fields (`openapi: "3.x.x"`, `info`, `servers`, `paths`, `webhooks`, `components`, `security`, `tags`, `externalDocs`).
- **Path Item Object:** Full support for standard HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD, TRACE) as well as the newly formalized `query` operation and `additionalOperations` map.
- **Webhooks:** Native support for webhook definition parsing (`webhooks` root and `components.webhooks`). It generates dedicated types and helper services to strictly type incoming webhook payloads.
- **Component References:** Robust resolution logic for `responses`, `requestBodies`, `examples`, `mediaTypes`, `callbacks`, `links`, and `headers` in the `components` map.
- **Media Type Object:** Support for the new array/sequential configurations, including `itemSchema`, `encoding`, `prefixEncoding`, and `itemEncoding`.
- **Example Object:** Migration path implementation via support for `dataValue` and `serializedValue` (replacing the deprecated `value` behavior where necessary).
- **Parameter Serialization:** Strict adherence to URL percent-encoding, `style`, `explode`, `allowReserved`, and form query string configurations (including correct handling of `allowEmptyValue`).
- **XML Object:** Handling of the updated `nodeType` configurations (`element`, `attribute`, `text`, `cdata`, `none`).
- **Transports:** The parser logic (`src/openapi/parse.ts`, `src/openapi/parse_validator.ts`) natively guards for these constraints, while the target Emitters (Angular, Fetch, Axios, Node) transparently handle decoding, payload serialization, and URL encoding according to these constructs via a shared `ParameterSerializer` utility.

Test validation ensures coverage of these compliance vectors (see `tests/00-core/` and transport-specific suites like `tests/80-fetch-generator/` and `tests/100-node-generator/`).
