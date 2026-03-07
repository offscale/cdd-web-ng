import os

p = 'src/vendors/angular/utils/request-context.generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace("{ name: 'params?', type: 'HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>' }", "{ name: 'params?', type: 'Record<string, string | number | boolean | readonly (string | number | boolean)[]>' }")

with open(p, 'w') as f:
    f.write(c)

