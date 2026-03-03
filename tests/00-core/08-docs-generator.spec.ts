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
        } as unknown as SwaggerParser;

        const config: GeneratorConfig = { output: '', input: '', options: {} };
        const result = generateDocsJson(parser, config, {});

        expect(result.length).toBe(4);
        const nodeDocs = result.find(l => l.language === 'node');
        expect(nodeDocs).toBeDefined();
        expect(nodeDocs!.operations.length).toBe(1);
        expect(nodeDocs!.operations[0].method).toBe('GET');
        expect(nodeDocs!.operations[0].path).toBe('/users');
        expect(nodeDocs!.operations[0].operationId).toBe('getUsers');
        expect(nodeDocs!.operations[0].code.snippet).toBe('const response = await service.getUsers();');
        expect(nodeDocs!.operations[0].code.imports).toBeUndefined();
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
                } as unknown as PathInfo,
            ],
        } as unknown as SwaggerParser;

        const config: GeneratorConfig = { output: '', input: '', options: {} };
        const result = generateDocsJson(parser, config, { imports: true, wrapping: true });

        const nodeDocs = result.find(l => l.language === 'node');
        const opCode = nodeDocs!.operations[0].code;
        expect(opCode.imports).toBe("import { PostsService } from './api/services/posts.service';");
        expect(opCode.wrapper_start).toBe('async function run() {\n    const service = new PostsService();');
        expect(opCode.snippet).toContain('const response = await service.createPost({ /* arguments */ });');
        expect(opCode.wrapper_end).toBe('}\nrun();');
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
                } as unknown as PathInfo,
            ],
        } as unknown as SwaggerParser;

        const config: GeneratorConfig = { output: '', input: '', options: {} };
        const result = generateDocsJson(parser, config, { imports: true, wrapping: false });

        const nodeDocs = result.find(l => l.language === 'node');
        const opCode = nodeDocs!.operations[0].code;
        expect(opCode.imports).toBe("import { CommentsService } from './api/services/comments.service';");
        expect(opCode.snippet).toContain('const response = await service.deleteComment({ /* arguments */ });');
        expect(opCode.wrapper_start).toBeUndefined();
    });

    it('should fallback method names correctly and deduplicate', () => {
        const parser = {
            operations: [
                {
                    path: '/test',
                    method: 'get',
                    methodName: '',
                    operationId: '',
                    tags: ['TestTag'],
                } as unknown as PathInfo,
                {
                    path: '/test',
                    method: 'get',
                    methodName: '',
                    operationId: 'Invalid-Name-Format!',
                    tags: ['TestTag'],
                } as unknown as PathInfo,
                {
                    path: '/test',
                    method: 'get',
                    methodName: '',
                    operationId: 'Invalid-Name-Format!',
                    tags: ['TestTag'],
                } as unknown as PathInfo,
            ],
        } as unknown as SwaggerParser;

        const config: GeneratorConfig = {
            output: '',
            input: '',
            options: {
                customizeMethodName: (id: string) => {
                    if (id === 'custom') return 'customMethod';
                    return undefined;
                },
            },
        };

        const result = generateDocsJson(parser, config, {});

        const ops = result[0].operations;
        expect(ops[0].code.snippet).toContain('getTest');
        expect(ops[1].code.snippet).toContain('invalidNameFormat');
        expect(ops[2].code.snippet).toContain('invalidNameFormat2'); // Deduplication
    });

    it('should respect custom method name from config', () => {
        const parser = {
            operations: [
                {
                    path: '/custom',
                    method: 'get',
                    methodName: 'getCustom',
                    operationId: 'customId',
                } as unknown as PathInfo,
            ],
        } as unknown as SwaggerParser;

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

        expect(result[0].operations[0].code.snippet).toContain('.myCustomMethodName()');
    });
});
