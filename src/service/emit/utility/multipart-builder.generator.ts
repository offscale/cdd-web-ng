import * as path from "node:path";
import { Project, Scope } from "ts-morph";
import { UTILITY_GENERATOR_HEADER_COMMENT } from "../../../core/constants.js";

/**
 * Generates the `utils/multipart-builder.ts` file.
 * This utility class handles the creation of multipart payloads,
 * switching between native FormData (browser standard) and manual Blob construction
 * when custom headers or nested multipart structures are required by the API definition.
 */
export class MultipartBuilderGenerator {
    constructor(private project: Project) {
    }

    public generate(outputDir: string): void {
        const utilsDir = path.join(outputDir, "utils");
        const filePath = path.join(utilsDir, "multipart-builder.ts");

        const sourceFile = this.project.createSourceFile(filePath, "", { overwrite: true });

        sourceFile.insertText(0, UTILITY_GENERATOR_HEADER_COMMENT);

        // Define configuration interfaces
        sourceFile.addInterface({
            name: "EncodingConfig",
            isExported: true,
            properties: [
                { name: "contentType", type: "string", hasQuestionToken: true },
                { name: "headers", type: "Record<string, string>", hasQuestionToken: true },
                { name: "style", type: "string", hasQuestionToken: true },
                { name: "explode", type: "boolean", hasQuestionToken: true },
                // Recursive definition for nested multipart encodings
                { name: "encoding", type: "Record<string, EncodingConfig>", hasQuestionToken: true }
            ]
        });

        sourceFile.addInterface({
            name: "MultipartResult",
            isExported: true,
            properties: [
                { name: "content", type: "FormData | Blob" },
                { name: "headers", type: "Record<string, string>", hasQuestionToken: true }
            ]
        });

        const classDeclaration = sourceFile.addClass({
            name: "MultipartBuilder",
            isExported: true,
            docs: ["Utility to build multipart/form-data payloads, supporting custom part headers and nested nesting via manual construction."],
        });

        // Main serialize method
        classDeclaration.addMethod({
            name: "serialize",
            isStatic: true,
            scope: Scope.Public,
            parameters: [
                { name: "body", type: "any" },
                { name: "encodings", type: "Record<string, EncodingConfig>", hasQuestionToken: true, initializer: "{}" }
            ],
            returnType: "MultipartResult",
            docs: [
                "Serializes a body object into a multipart payload.",
                "If custom headers or nested multipart types are defined in `encodings`, it performs manual serialization to Blob.",
                "Otherwise, it uses the native `FormData` API."
            ],
            statements: `
        if (body === null || body === undefined) {
            return { content: new FormData() };
        }

        // Native FormData cannot handle custom per-part headers or nested multipart bodies.
        // We check if any property config requires these advanced features.
        const requiresManual = Object.values(encodings).some(config => 
            (!!config.headers && Object.keys(config.headers).length > 0) ||
            (!!config.contentType && config.contentType.startsWith('multipart/'))
        );

        if (requiresManual) {
            return this.serializeManual(body, encodings);
        }

        return this.serializeNative(body, encodings);`
        });

        // Native FormData implementation
        classDeclaration.addMethod({
            name: "serializeNative",
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: "body", type: "any" },
                { name: "encodings", type: "Record<string, EncodingConfig>" }
            ],
            returnType: "MultipartResult",
            statements: `
        const formData = new FormData();

        Object.entries(body).forEach(([key, value]) => {
            if (value === undefined || value === null) return;

            const config = encodings[key] || {};
            const contentType = config.contentType;

            // Native FormData handling
            if (Array.isArray(value)) {
                value.forEach(v => this.appendFormData(formData, key, v, contentType));
            } else {
                this.appendFormData(formData, key, value, contentType);
            }
        });

        return { content: formData };`
        });

        // Native Helper
        classDeclaration.addMethod({
            name: "appendFormData",
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: "formData", type: "FormData" },
                { name: "key", type: "string" },
                { name: "value", type: "any" },
                { name: "contentType", type: "string", hasQuestionToken: true }
            ],
            statements: `
        if (value instanceof Blob || value instanceof File) {
            if (value instanceof File) {
                formData.append(key, value, value.name);
            } else {
                formData.append(key, value);
            }
        } else if (contentType === 'application/json' || typeof value === 'object') {
            // Wrap JSON in a Blob to allow setting content-type part header implies usage of Blob/File APIs in fetch
            const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
            formData.append(key, blob);
        } else {
            formData.append(key, String(value));
        }`
        });

        // Manual Serialization Implementation
        classDeclaration.addMethod({
            name: "serializeManual",
            isStatic: true,
            scope: Scope.Private,
            parameters: [
                { name: "body", type: "any" },
                { name: "encodings", type: "Record<string, EncodingConfig>" }
            ],
            returnType: "MultipartResult",
            statements: `
        const boundary = '----' + Math.random().toString(36).substring(2);
        const parts: (string | Blob)[] = [];
        const dashDash = '--';
        const crlf = '\\r\\n';

        Object.entries(body).forEach(([key, value]) => {
            if (value === undefined || value === null) return;

            const values = Array.isArray(value) ? value : [value];
            const config = encodings[key] || {};

            values.forEach(v => {
                let partHeaders = \`Content-Disposition: form-data; name="\${key}"\`;
                if (v instanceof File) {
                    partHeaders += \`; filename="\${v.name}"\`;
                } else if (v instanceof Blob) {
                    partHeaders += \`; filename="blob"\`;
                }

                // Add Custom Headers
                if (config.headers) {
                    Object.entries(config.headers).forEach(([hKey, hVal]) => {
                        partHeaders += \`\${crlf}\${hKey}: \${hVal}\`;
                    });
                }

                // Determine Content-Type
                let partContentType = config.contentType;
                if (!partContentType) {
                    if (v instanceof Blob) partContentType = v.type || "application/octet-stream";
                    else if (typeof v === 'object') partContentType = 'application/json';
                    else partContentType = 'text/plain';
                }

                // Handle Recursive Nesting (OAS 3.2 Strictness)
                // If this part is itself a multipart content, we must recursively serialize it
                // and use the resulting content (Blob) and boundary header.
                let payload: string | Blob = v;

                if (partContentType?.startsWith('multipart/')) {
                    // Use the nested encoding map if available, otherwise empty
                    const nestedConfig = config.encoding || {};
                    const nestedResult = this.serializeManual(v, nestedConfig);
                    payload = nestedResult.content;
                    
                    if (nestedResult.headers && nestedResult.headers['Content-Type']) {
                        // If we generated a nested multipart, we need to preserve the boundary created there.
                        // If the spec requested a specific multipart subtype (e.g. 'multipart/mixed'), use that but append the boundary.
                        const boundaryMatch = nestedResult.headers['Content-Type'].match(/boundary=(.+)$/);
                        const nestedBoundary = boundaryMatch ? boundaryMatch[1] : null;
                        
                        if (nestedBoundary) {
                            if (config.contentType) {
                                // Use the requested type (e.g. mixed) with the generated boundary
                                const baseType = config.contentType.split(';')[0];
                                partContentType = \`\${baseType}; boundary=\${nestedBoundary}\`;
                            } else {
                                // Use the generated type (defaults to form-data)
                                partContentType = nestedResult.headers['Content-Type'];
                            }
                        }
                    }
                } else if (typeof v === 'object' && !(v instanceof Blob)) {
                    payload = JSON.stringify(v);
                } else {
                    payload = v;
                }

                if (partContentType) {
                    partHeaders += \`\${crlf}Content-Type: \${partContentType}\`;
                }

                parts.push(dashDash + boundary + crlf + partHeaders + crlf + crlf);
                parts.push(payload);
                parts.push(crlf);
            });
        });

        parts.push(dashDash + boundary + dashDash + crlf);

        // Construct Blob with manually built body
        const blob = new Blob(parts, { type: 'multipart/form-data' });
        
        // Return Blob and the Boundary Header needed for the request
        return {
            content: blob,
            headers: { 'Content-Type': \`multipart/form-data; boundary=\${boundary}\` }
        };`
        });

        sourceFile.formatText();
    }
}
