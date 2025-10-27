// ./rolldown.plugin.string.js

import { readFileSync } from 'node:fs';

/**
 * A simple Rolldown plugin to import text files as strings.
 * This is used to bundle .template files directly into the JS output.
 */
export function inlineTextFiles() {
  return {
    name: 'inline-text-files',
    load(id) {
      // Check if the imported file path ends with .template
      if (id.endsWith('.template')) {
        // Read the file content
        const content = readFileSync(id, 'utf-8');
        // Return a JS module that default-exports the content as a string.
        // JSON.stringify handles escaping correctly.
        return `export default ${JSON.stringify(content)};`;
      }
      // For any other file type, let Rolldown handle it
      return null;
    },
  };
}
