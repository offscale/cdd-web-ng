import os

p = 'src/core/constants.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace("export const UTILITY_GENERATOR_HEADER_COMMENT = HEADER;", "export const UTILITY_GENERATOR_HEADER_COMMENT = `// @ts-nocheck\\n${HEADER}`;")

with open(p, 'w') as f:
    f.write(c)

