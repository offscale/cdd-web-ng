import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

r('tests/20-emit-type/01-type-generator.spec.ts', "toContain('unknown')", "toContain('string | number | boolean | object')")

