# Usage

Use the CLI or programmatic API.

## CLI Options

```bash
Usage: cdd-web-ng [options] [command]

OpenAPI ↔ Angular

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  from_openapi               Generate code from OpenAPI
  to_openapi [options]       Generate an OpenAPI specification from TypeScript code (snapshot-based with AST fallback)
  to_docs_json [options]     Generate JSON containing how to call operations in the target language
  serve_json_rpc [options]   Expose CLI interface as JSON-RPC server
  help [command]             display help for command
```

### from_openapi subcommands

- `to_sdk_cli`: Generate Client SDK CLI from an OpenAPI specification
- `to_sdk`: Generate Client SDK from an OpenAPI specification
- `to_server`: Generate Server from an OpenAPI specification

## Environment Variables

All parameters map to an environment variable starting with `CDD_`, like `CDD_INPUT`, `CDD_OUTPUT`, `CDD_PORT`, `CDD_NO_WRAPPING`.

## Code Example

See `README.md` for programmatic code snippets using the internal `cdd-web-ng` index file.
