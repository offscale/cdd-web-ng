Future
======

This project could go in multiple directions.

One idea I've been playing with is to focus on interoperability. This is out-of-scope for cdd-web-_ng_ as the _ng_
stands for Angular… but this repo could be split up into base/`abstract` `class`es whence this repo has the Angular
specific tech… or even rename this repo and this package handles all Angular and non-Angular solutions (in the
TypeScript web-frontend framework space).

## Full OpenAPI 3.2.0 + Swagger 2 compatibility

- [ ] Full OpenAPI 3.2.0 + Swagger 2 compatibility

## HTTP client interoperability

Add support for:

- [ ] [Fetch API (builtin)](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [ ] [Axios](https://axios-http.com)

## Framework interoperability

Add support for creating an auto-admin UI for/with:

- [ ] [Web components (builtin)](https://developer.mozilla.org/en-US/docs/Web/API/Web_components)
- [ ] [Qwik](https://qwik.dev)
- [ ] [React](https://react.dev)
- [ ] [Svelte](https://svelte.dev)
- [ ] [Vue](https://vuejs.org)

## Sync within codebase

- [ ] Modify mock can update client can update admin UI.
- [ ] Modify admin UI can update mock can update client.

## FROM codebase TO OpenAPI

- [ ] Bidirectionality is what distinctly makes it _cdd_: **C**ompiler **D**riven **D**evelopment.

## CI/CD

GitHub Actions for:

- [ ] tests
- [ ] linting and other code-quality checks
- [ ] release to npmjs
- [ ] release hosted HTML API docs
