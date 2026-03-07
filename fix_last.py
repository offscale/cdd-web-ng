import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

p = 'tests/30-emit-service/03-service-method-edge-cases.spec.ts'
# I messed up the backticks replace:
r(p, 'withCredentials?: boolean });`,', 'withCredentials?: boolean });`\n        );')

p = 'tests/30-emit-service/04-multipart-defaults.spec.ts'
bad = "observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'"
good = 'observe: "response"; context?: HttpContext; reportProgress?: boolean; responseType?: "json"'
r(p, bad, good)

