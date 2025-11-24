import { describe, expect, it } from 'vitest';

import { Project } from 'ts-morph';

import { AuthHelperGenerator } from '@src/generators/angular/utils/auth-helper.generator.js';
import { DateTransformerGenerator } from '@src/generators/angular/utils/date-transformer.generator.js';
import { FileDownloadGenerator } from '@src/generators/angular/utils/file-download.generator.js';

describe('Emitter: Miscellaneous Utility Generators', () => {

    it('AuthHelperGenerator should generate a complete service', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        new AuthHelperGenerator(project).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/auth/auth-helper.service.ts').getText();

        expect(fileContent).toContain('export class AuthHelperService');
        expect(fileContent).toContain('inject(OAuthService)');
        expect(fileContent).toContain('async configure(): Promise<void>');
        expect(fileContent).toContain('login(redirectUrl?: string)');
        expect(fileContent).toContain('logout()');
        expect(fileContent).toContain('getAccessToken(): string');
    });

    it('DateTransformerGenerator should generate interceptor and helpers', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        new DateTransformerGenerator(project).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/utils/date-transformer.ts').getText();

        expect(fileContent).toContain('export const ISO_DATE_REGEX');
        expect(fileContent).toContain('export function transformDates(body: any)');
        expect(fileContent).toContain('export class DateInterceptor implements HttpInterceptor');
    });

    it('FileDownloadGenerator should generate all download helpers', () => {
        const project = new Project({ useInMemoryFileSystem: true });
        new FileDownloadGenerator(project).generate('/out');
        const fileContent = project.getSourceFileOrThrow('/out/utils/file-download.ts').getText();

        expect(fileContent).toContain('export function downloadFile(blob: Blob, filename: string): void');
        expect(fileContent).toContain('export function downloadFileOperator<T extends Blob | HttpResponse<Blob>>');
        expect(fileContent).toContain('export function extractFilenameFromContentDisposition(contentDisposition: string | null): string | null');
    });
});
