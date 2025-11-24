import { Project } from "ts-morph";
import * as path from "node:path";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

export class FileDownloadGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "file-download.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        sourceFile.addImportDeclarations([
            {
                namedImports: ["HttpResponse"],
                moduleSpecifier: "@angular/common/http",
            },
            {
                namedImports: ["Observable", "tap"],
                moduleSpecifier: "rxjs",
            },
        ]);

        sourceFile.addFunction({
            name: "downloadFile",
            isExported: true,
            parameters: [
                { name: "blob", type: "Blob" },
                { name: "filename", type: "string" },
            ],
            returnType: "void",
            docs: ["Triggers a browser file download by creating a temporary anchor element."],
            statements: `
    const url = window.URL.createObjectURL(blob); 
    const link = document.createElement('a'); 
    link.href = url; 
    link.download = filename; 
    document.body.appendChild(link); 
    link.click(); 
    document.body.removeChild(link); 
    window.URL.revokeObjectURL(url);`
        });

        sourceFile.addFunction({
            name: "downloadFileOperator",
            isExported: true,
            typeParameters: [{ name: "T", constraint: "Blob | HttpResponse<Blob>" }],
            parameters: [
                { name: "fallbackFilename", type: "string" },
            ],
            returnType: "(source: Observable<T>) => Observable<T>",
            docs: ["An RxJS pipeable operator to automatically trigger a file download."],
            statements: `
    return (source: Observable<T>) => { 
        return source.pipe( 
            tap((response: T) => { 
                const blob = response instanceof HttpResponse ? response.body : response; 
                if (!blob) { 
                    console.error('Download failed: Blob is null or undefined.'); 
                    return; 
                } 
                const contentDisposition = response instanceof HttpResponse ? response.headers.get('content-disposition') : null; 
                const filename = extractFilenameFromContentDisposition(contentDisposition) ?? fallbackFilename; 
                downloadFile(blob, filename); 
            }) 
        ); 
    };`
        });

        sourceFile.addFunction({
            name: "extractFilenameFromContentDisposition",
            isExported: true,
            parameters: [
                { name: "contentDisposition", type: "string | null" },
            ],
            returnType: "string | null",
            docs: ["Extracts a filename from a 'Content-Disposition' header string."],
            statements: `
    if (!contentDisposition) { 
        return null; 
    } 
    const filenameMatch = contentDisposition.match(/filename\\*?=['"]?([^'"\\n;]+)['"]?/i); 
    if (!filenameMatch || !filenameMatch[1]) { 
        return null; 
    } 
    const filename = filenameMatch[1]; 
    if (filename.toLowerCase().startsWith("utf-8''")) { 
        try { 
            return decodeURIComponent(filename.substring(7)); 
        } catch { 
            return filename.substring(7); 
        } 
    } 
    return filename;`
        });

        sourceFile.formatText();
    }
}
