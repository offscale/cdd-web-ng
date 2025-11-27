import { describe, expect, it } from 'vitest';

import { evaluateJsonPointer, evaluateRuntimeExpression, RuntimeContext } from '@src/core/runtime-expressions.js';

describe('Core: Runtime Expression Evaluator', () => {
    const mockContext: RuntimeContext = {
        url: 'https://example.com/users/123',
        method: 'POST',
        statusCode: 201,
        request: {
            headers: {
                'Content-Type': 'application/json',
                'X-Request-ID': 'req-1',
                Accept: ['application/json', 'text/html'],
            },
            query: {
                search: 'foo',
                tags: ['a', 'b'],
            },
            path: {
                id: '123',
            },
            body: {
                user: {
                    id: 999,
                    roles: ['admin', 'editor'],
                },
            },
        },
        response: {
            headers: {
                Location: 'https://example.com/users/999',
                'X-Rate-Limit': '100',
            },
            body: {
                success: true,
                id: 999,
                meta: {
                    timestamp: 1234567890,
                },
            },
        },
    };

    describe('JSON Pointer Evaluation', () => {
        const data = {
            foo: 'bar',
            nested: { val: 1 },
            arr: [10, 20],
            'slashed/prop': 'ok',
            'tilde~prop': 'ok',
        };

        it('should resolve top-level properties', () => {
            expect(evaluateJsonPointer(data, '/foo')).toBe('bar');
        });

        it('should resolve nested properties', () => {
            expect(evaluateJsonPointer(data, '/nested/val')).toBe(1);
        });

        it('should resolve array indices', () => {
            expect(evaluateJsonPointer(data, '/arr/0')).toBe(10);
            expect(evaluateJsonPointer(data, '/arr/1')).toBe(20);
        });

        it('should handle URI fragment style pointers (#/)', () => {
            expect(evaluateJsonPointer(data, '#/foo')).toBe('bar');
        });

        it('should handle escaped characters (~1 and ~0)', () => {
            expect(evaluateJsonPointer(data, '/slashed~1prop')).toBe('ok');
            expect(evaluateJsonPointer(data, '/tilde~0prop')).toBe('ok');
        });

        it('should return undefined for non-existent paths', () => {
            expect(evaluateJsonPointer(data, '/baz')).toBeUndefined();
            expect(evaluateJsonPointer(data, '/nested/foo')).toBeUndefined();
            expect(evaluateJsonPointer(data, '/arr/5')).toBeUndefined();
        });

        it('should return undefined for invalid non-numeric array index', () => {
            expect(evaluateJsonPointer(data, '/arr/key')).toBeUndefined();
        });

        it('should return full object for empty pointer', () => {
            expect(evaluateJsonPointer(data, '')).toEqual(data);
            expect(evaluateJsonPointer(data, '#')).toEqual(data);
        });
    });

    describe('Expression Resolution', () => {
        it('should resolve $url', () => {
            expect(evaluateRuntimeExpression('$url', mockContext)).toBe('https://example.com/users/123');
        });

        it('should resolve $method', () => {
            expect(evaluateRuntimeExpression('$method', mockContext)).toBe('POST');
        });

        it('should resolve $statusCode', () => {
            expect(evaluateRuntimeExpression('$statusCode', mockContext)).toBe(201);
        });

        it('should pass through constant strings', () => {
            expect(evaluateRuntimeExpression('hello world', mockContext)).toBe('hello world');
        });

        describe('$request sources', () => {
            it('should resolve request header (case-insensitive)', () => {
                expect(evaluateRuntimeExpression('$request.header.content-type', mockContext)).toBe('application/json');
                expect(evaluateRuntimeExpression('$request.header.X-Request-ID', mockContext)).toBe('req-1');
            });

            it('should resolve request query (case-sensitive)', () => {
                expect(evaluateRuntimeExpression('$request.query.search', mockContext)).toBe('foo');
                expect(evaluateRuntimeExpression('$request.query.Search', mockContext)).toBeUndefined();
            });

            it('should resolve request path (case-sensitive)', () => {
                expect(evaluateRuntimeExpression('$request.path.id', mockContext)).toBe('123');
            });

            it('should resolve full request body', () => {
                expect(evaluateRuntimeExpression('$request.body', mockContext)).toEqual(mockContext.request.body);
            });

            it('should resolve request body via pointer', () => {
                expect(evaluateRuntimeExpression('$request.body#/user/id', mockContext)).toBe(999);
                expect(evaluateRuntimeExpression('$request.body#/user/roles/0', mockContext)).toBe('admin');
            });
        });

        describe('$response sources', () => {
            it('should resolve response header', () => {
                expect(evaluateRuntimeExpression('$response.header.Location', mockContext)).toBe(
                    'https://example.com/users/999',
                );
            });

            it('should resolve response body via pointer', () => {
                expect(evaluateRuntimeExpression('$response.body#/id', mockContext)).toBe(999);
                expect(evaluateRuntimeExpression('$response.body#/meta/timestamp', mockContext)).toBe(1234567890);
            });

            it('should return undefined if response is missing', () => {
                const noRes: RuntimeContext = {
                    url: mockContext.url,
                    method: mockContext.method,
                    statusCode: mockContext.statusCode,
                    request: mockContext.request,
                    // response is undefined
                };
                expect(evaluateRuntimeExpression('$response.body', noRes)).toBeUndefined();
            });

            it('should return undefined for malformed body expressions', () => {
                // This expression is not '$response.body' and does not start with '$response.body#'
                expect(evaluateRuntimeExpression('$response.bodyFoo', mockContext)).toBeUndefined();
            });
        });

        describe('String Interpolation', () => {
            it('should interpolate simple values', () => {
                expect(evaluateRuntimeExpression('Status: {$statusCode}', mockContext)).toBe('Status: 201');
            });

            it('should interpolate multiple values', () => {
                const expr = 'https://api.com/items/{$response.body#/id}?token={$request.header.x-request-id}';
                expect(evaluateRuntimeExpression(expr, mockContext)).toBe('https://api.com/items/999?token=req-1');
            });

            it('should interpolate values inside body', () => {
                const expr = 'User role is {$request.body#/user/roles/0}';
                expect(evaluateRuntimeExpression(expr, mockContext)).toBe('User role is admin');
            });

            it('should strip undefined interpolations (or return empty string behavior)', () => {
                // The implementation replaces undefined/unresolvable macros with empty string
                expect(evaluateRuntimeExpression('val: {$request.query.missing}', mockContext)).toBe('val: ');
            });
        });
    });
});
