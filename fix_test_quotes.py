import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

p = 'tests/30-emit-service/01-service-method-body.spec.ts'
bad = "observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'"
good = 'observe: "response"; context?: HttpContext; reportProgress?: boolean; responseType?: "json"'
r(p, bad, good)

for f in ['tests/30-emit-service/00-service-generator.spec.ts', 'tests/30-emit-service/02-coverage.spec.ts', 'tests/30-emit-service/04-service-method-generator-coverage.spec.ts', 'tests/30-emit-service/03-service-method-edge-cases.spec.ts']:
    r(f, bad, good)

r('src/vendors/angular/service/service-method.generator.ts', bad, good)

