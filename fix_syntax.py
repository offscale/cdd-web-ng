import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

p = 'tests/30-emit-service/03-service-method-edge-cases.spec.ts'
r(p, '        );\n        );', '        );')

