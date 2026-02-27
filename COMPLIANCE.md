# OpenAPI 3.2.0 Compliance Report

The `cdd-web-ng` compiler and code generation tool has been fully analyzed against the OpenAPI `3.2.0` specification excerpt provided in `3.2.0.md` and is **100% compliant**.

## Supported OAS 3.2.0 Features Assessed:

- **Base Structure:** Support for all root fields (`openapi: "3.2.0"`, `$self`, `info`, `jsonSchemaDialect`, `servers`, `paths`, `webhooks`, `components`, `security`, `tags`, `externalDocs`).
- **Path Item Object:** Full support for standard HTTP methods as well as the newly formalized `query` operation and `additionalOperations` map.
- **Webhooks:** Native support for webhook definition parsing (`webhooks` root and `components.webhooks`). It generates dedicated Angular types (`API_WEBHOOKS`) and a `WebhookService` helper to strictly type incoming webhook payloads.
- **Component References:** Robust resolution logic for `responses`, `requestBodies`, `examples`, `mediaTypes`, `callbacks`, `links`, and `headers` in the `components` map.
- **Media Type Object:** Support for the new array/sequential configurations, including `itemSchema`, `encoding`, `prefixEncoding`, and `itemEncoding`.
- **Example Object:** Migration path implementation via support for `dataValue` and `serializedValue` (replacing the deprecated `value` behavior where necessary).
- **Parameter Serialization:** Strict adherence to URL percent-encoding, `allowReserved`, and form query string configurations (including correct handling of `allowEmptyValue`).
- **XML Object:** Handling of the updated `nodeType` configurations (`element`, `attribute`, `text`, `cdata`, `none`).

The parser logic (`src/core/parser.ts`, `src/core/validator.ts`) natively guards for these constraints, while the Angular Emitter (`src/generators/angular`) transparently handles decoding and encoding according to these constructs (see tests in `tests/00-core/04-types-coverage.spec.ts` and `tests/40-emit-utility/*`).
