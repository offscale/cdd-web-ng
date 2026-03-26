import { describe, expect, it } from 'vitest';
import { generateDocsJson } from '@src/functions/docs_generator.js';
import { SwaggerParser } from '@src/openapi/parse.js';
import { GeneratorConfig } from '@src/core/types/index.js';
import { PathInfo } from '@src/core/types/analysis.js';

describe('generateDocsJson', () => {
    it('should generate concise documentation correctly without imports or wrapping', () => {
        const parser = {
            operations: [
                {
                    path: '/users',
                    method: 'get',
                    methodName: 'getUsers',
                    operationId: 'getUsers',
                    tags: ['Users'],
                } as PathInfo,
            ],
        } as string | number | boolean | object | undefined | null as SwaggerParser;

        const config: GeneratorConfig = { output: '', input: '', options: { imports: false, wrapping: false } };
        const result = generateDocsJson(parser, config, {});

        expect(result.endpoints).toBeDefined();
        expect(result.endpoints['/users']).toBeDefined();
        expect(result.endpoints['/users']['get']).toBe('const response = await this.service.getUsers();\nconsole.log(response);');
    });

    it('should generate documentation with imports and wrapping', () => {
        const parser = {
            operations: [
                {
                    path: '/posts/{id}',
                    method: 'post',
                    methodName: 'createPost',
                    operationId: 'createPost',
                    tags: [],
                    parameters: [{ name: 'id', in: 'path', required: true }],
                } as string | number | boolean | object | undefined | null as PathInfo,
            ],
        } as string | number | boolean | object | undefined | null as SwaggerParser;

        const config: GeneratorConfig = { output: '', input: '', options: { imports: false, wrapping: false } };
        const result = generateDocsJson(parser, config, { imports: true, wrapping: true });

        const snippet = result.endpoints['/posts/{id}']['post'];
        expect(snippet).toContain("import { PostsService } from './api/services/posts.service';");
        expect(snippet).toContain("export class ExampleComponent {");
        expect(snippet).toContain("        const response = await this.service.createPost({ /* arguments */ });");
        expect(snippet).toContain("    }");
        expect(snippet).toContain("}");
    });

    it('should handle imports without wrapping correctly', () => {
        const parser = {
            operations: [
                {
                    path: '/comments',
                    method: 'delete',
                    methodName: 'deleteComment',
                    operationId: 'deleteComment',
                    requestBody: { content: {} },
                } as string | number | boolean | object | undefined | null as PathInfo,
            ],
        } as string | number | boolean | object | undefined | null as SwaggerParser;

        const config: GeneratorConfig = { output: '', input: '', options: { imports: false, wrapping: false } };
        const result = generateDocsJson(parser, config, { imports: true, wrapping: false });

        const snippet = result.endpoints['/comments']['delete'];
        expect(snippet).toContain("import { CommentsService } from './api/services/comments.service';");
        expect(snippet).toContain('const response = await this.service.deleteComment({ /* arguments */ });');
        expect(snippet).not.toContain("export class ExampleComponent");
    });

    it('should fallback method names correctly and deduplicate', () => {
        const parser = {
            operations: [
                {
                    path: '/test1',
                    method: 'get',
                    methodName: '',
                    operationId: '',
                    tags: ['TestTag'],
                } as string | number | boolean | object | undefined | null as PathInfo,
                {
                    path: '/test2',
                    method: 'get',
                    methodName: '',
                    operationId: 'Invalid-Name-Format!',
                    tags: ['TestTag'],
                } as string | number | boolean | object | undefined | null as PathInfo,
                {
                    path: '/test3',
                    method: 'get',
                    methodName: '',
                    operationId: 'Invalid-Name-Format!',
                    tags: ['TestTag'],
                } as string | number | boolean | object | undefined | null as PathInfo,
            ],
        } as string | number | boolean | object | undefined | null as SwaggerParser;

        const config: GeneratorConfig = {
            output: '',
            input: '',
            options: { imports: false, wrapping: false },
        };

        const result = generateDocsJson(parser, config, {});

        expect(result.endpoints['/test1']['get']).toContain('.getTest1()');
        expect(result.endpoints['/test2']['get']).toContain('.invalidNameFormat()');
        expect(result.endpoints['/test3']['get']).toContain('.invalidNameFormat2()'); // Deduplication
    });

    it('should respect custom method name from config', () => {
        const parser = {
            operations: [
                {
                    path: '/custom',
                    method: 'get',
                    methodName: 'getCustom',
                    operationId: 'customId',
                } as string | number | boolean | object | undefined | null as PathInfo,
            ],
        } as string | number | boolean | object | undefined | null as SwaggerParser;

        const config: GeneratorConfig = {
            output: '',
            input: '',
            options: {
                customizeMethodName: (id: string) => {
                    if (id === 'customId') return 'myCustomMethodName';
                    return undefined;
                },
            },
        };
        const result = generateDocsJson(parser, config, {});

        expect(result.endpoints['/custom']['get']).toContain('.myCustomMethodName()');
    });

    it('should handle multiple methods on the same path', () => {
        const parser = {
            operations: [
                {
                    path: '/users',
                    method: 'get',
                    methodName: 'getUsers',
                    operationId: 'getUsers',
                } as any,
                {
                    path: '/users',
                    method: 'post',
                    methodName: 'createUser',
                    operationId: 'createUser',
                } as any,
            ],
        } as any;

        const config: any = { output: '', input: '', options: {} };
        const result = generateDocsJson(parser, config, { wrapping: true });

        expect(result.endpoints['/users']['get']).toContain('getUsers');
        expect(result.endpoints['/users']['post']).toContain('createUser');
    });
});
