import os
import re

p = 'src/functions/emit_multipart.ts'
with open(p, 'r') as f:
    c = f.read()

c = re.sub(r"(let payload: string \| Blob \| FormData = value;)", r"// @ts-ignore\n        \1", c)

with open(p, 'w') as f:
    f.write(c)

