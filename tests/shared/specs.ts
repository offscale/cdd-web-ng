/**
 * @fileoverview
 * This file acts as a barrel, re-exporting data fixtures from the `tests/fixtures/` directory.
 * This maintains backward compatibility with existing tests while reducing source file size.
 */

export * from '../fixtures/basic.fixture.js';
export * from '../fixtures/coverage.fixture.js';
export * from '../fixtures/security.fixture.js';
export * from '../fixtures/types.fixture.js';
export * from '../fixtures/admin.fixture.js';
export * from '../fixtures/polymorphism.fixture.js';
