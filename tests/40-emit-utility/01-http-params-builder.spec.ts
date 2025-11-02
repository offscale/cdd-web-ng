// tests/40-emit-utility/01-http-params-builder.spec.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { Project, ClassDeclaration, Scope } from 'ts-morph'; // <-- Import Scope
import { HttpParamsBuilderGenerator } from '@src/service/emit/utility/http-params-builder.js';

describe('Utility: HttpParamsBuilder Generator', () => {
    let project: Project;
    let generatedClass: ClassDeclaration;

    beforeAll(() => {
        project = new Project({ useInMemoryFileSystem: true });
        new HttpParamsBuilderGenerator(project).generate('/out');

        const sourceFile = project.getSourceFileOrThrow('/out/utils/http-params-builder.ts');
        generatedClass = sourceFile.getClassOrThrow('HttpParamsBuilder');
    });

    it('should generate a class named HttpParamsBuilder', () => {
        expect(generatedClass).toBeDefined();
    });

    it('should generate a static `addToHttpParams` method', () => {
        const method = generatedClass.getStaticMethod('addToHttpParams');
        expect(method).toBeDefined();
        const body = method!.getBodyText()!;
        expect(body).toContain("value == null");
    });

    it('should generate a private static `addFromObject` method', () => {
        const method = generatedClass.getStaticMethod('addFromObject');
        expect(method).toBeDefined();
        expect(method!.isStatic()).toBe(true);
        // FIX: Use getScope() to check visibility.
        expect(method!.getScope()).toBe(Scope.Private);
        const body = method!.getBodyText()!;
        expect(body).toContain("if (Array.isArray(obj))");
    });

    it('should generate a private static `formatValue` method', () => {
        const method = generatedClass.getStaticMethod('formatValue');
        expect(method).toBeDefined();
        // FIX: Use getScope() to check visibility.
        expect(method!.getScope()).toBe(Scope.Private);
        const body = method!.getBodyText()!;
        expect(body).toContain("if (value instanceof Date)");
    });
});
