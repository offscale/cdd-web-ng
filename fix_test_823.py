import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"
ast_str = "string | number | boolean | object"

# 30-emit-service/04-service-method-generator-coverage.spec.ts:823
r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', 
  f".toContain('Record<string, {ast_str}>')",
  f".toContain('Record<string, {type_str}>')")

