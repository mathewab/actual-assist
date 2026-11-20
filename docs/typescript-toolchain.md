# TypeScript compiler and lint compatibility

Server builds explicitly use the pinned npm alias typescript-compiler (TypeScript
7.0.2). Use npm run build:server or npm run build, not an unqualified tsc:
both compiler packages provide that binary name.

The canonical typescript package remains pinned to 6.0.3 for the legacy compiler
API used by ESLint tooling. Upstream typescript-eslint 8.72.2 and canary
8.72.3-alpha.8 still require TypeScript below 6.1.0. TypeScript 7 exposes different
unstable APIs; widening peer ranges alone cannot supply the missing legacy API.

This is a transitional dual toolchain, not native TypeScript 7 lint support.
All existing lint rules remain enabled. Source must remain parseable by the
TypeScript 6 lint parser until upstream supports the new API.

Verify using normal npm ci, npm run build, npm run lint, npm test and mock-backed
npm run test:e2e. Do not bypass peer checks or disable lint. Once upstream lint
tooling supports TypeScript 7, test that update, remove the alias and TypeScript 6
bridge, restore a single compiler dependency and update this note.
