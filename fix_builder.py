import os

p = 'src/vendors/angular/utils/http-params-builder.generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace("{ name: 'value', type: 'Record<string, string | number | boolean | object | undefined | null>' }", "{ name: 'value', type: 'string | number | boolean | object | undefined | null' }")

with open(p, 'w') as f:
    f.write(c)

