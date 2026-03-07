import os

# 1. Add HttpParams back to request-context.ts
p = 'src/vendors/angular/utils/request-context.generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace(
    "type: 'Record<string, string | number | boolean | readonly (string | number | boolean)[]>'",
    "type: 'HttpParams | Record<string, string | number | boolean | readonly (string | number | boolean)[]>'"
)

with open(p, 'w') as f:
    f.write(c)

# 2. Fix fromObject in service-method.generator.ts
p = 'src/vendors/angular/service/service-method.generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace(
    "fromObject: options?.params ?? {}",
    "fromObject: (options?.params && !(options.params instanceof HttpParams) ? options.params : {}) as Record<string, string | number | boolean | readonly (string | number | boolean)[]>"
)

with open(p, 'w') as f:
    f.write(c)

