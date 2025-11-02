import { Project } from "ts-morph";
import * as path from "node:path";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `file-download.ts` file, a collection of pure helper functions
 * and an RxJS operator for handling file downloads in the browser.
 */
export class FileDownloadGenerator {
    constructor(private project: Project) {}

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

        // 1. Add the core `downloadFile` function
        sourceFile.addFunction({
            name: "downloadFile",
            isExported: true,
            parameters: [
                { name: "blob", type: "Blob" },
                { name: "filename", type: "string" },
            ],
            returnType: "void",
            docs: [
                "Triggers a browser file download by creating a temporary anchor element.",
                "@param blob The file content.",
                "@param filename The desired name of the file."
            ],
            statements: `
    // Create a URL for the blob object
    const url = window.URL.createObjectURL(blob);

    // Create a temporary anchor element and set its properties
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    // Append to body, click, and then remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up by revoking the object URL
    window.URL.revokeObjectURL(url);`
        });

        // 2. Add the RxJS `downloadFileOperator`
        sourceFile.addFunction({
            name: "downloadFileOperator",
            isExported: true,
            typeParameters: [{ name: "T", constraint: "Blob | HttpResponse<Blob>" }],
            parameters: [
                { name: "fallbackFilename", type: "string" },
            ],
            returnType: "(source: Observable<T>) => Observable<T>",
            docs: [
                "An RxJS pipeable operator to automatically trigger a file download.",
                "@param fallbackFilename - The filename to use if one cannot be extracted from the 'Content-Disposition' header.",
            ],
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

        // 3. Add the `extractFilenameFromContentDisposition` helper
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

    // Regex to find filename="some-file.ext" or filename*=UTF-8''some-file.ext
    const filenameMatch = contentDisposition.match(/filename\\*?=['"]?([^'"\\n;]+)['"]?/i);

    if (!filenameMatch || !filenameMatch[1]) {
        return null;
    }

    const filename = filenameMatch[1];
      
    // Handle RFC 5987 encoding (filename*=UTF-8''...)
    if (filename.toLowerCase().startsWith("utf-8''")) {
        try {
            return decodeURIComponent(filename.substring(7));
        } catch {
            // Fallback to the raw value if decoding fails
            return filename.substring(7);
        }
    }
      
    // Return the simple filename="value"
    return filename;`
        });

        sourceFile.formatText();
    }
}
