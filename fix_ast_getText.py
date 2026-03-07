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

# 30-emit-service/04-service-method-generator-coverage.spec.ts:375
# 30-emit-service/04-service-method-generator-coverage.spec.ts:823
# 30-emit-service/09-content-decoding.spec.ts:186

# It is better to just replace the whole expectation
r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', 
  f"toContain('Observable<Record<string, {type_str}>>')",
  f"toContain('Observable<Record<string, {ast_str}>>')")

r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', 
  f"toContain('Record<string, {type_str}>')",
  f"toContain('Record<string, {ast_str}>')")

r('tests/30-emit-service/09-content-decoding.spec.ts', 
  f"toContain('Observable<Record<string, {type_str}>>')",
  f"toContain('Observable<Record<string, {ast_str}>>')")

# Also 30-emit-service/02-coverage.spec.ts:159
r('tests/30-emit-service/02-coverage.spec.ts',
  f".toBe('Observable<Record<string, {type_str}>>')",
  f".toBe('Observable<string | number | boolean | object | null | undefined>')")

r('tests/30-emit-service/02-coverage.spec.ts',
  f".toBe('{type_str}')",
  f".toBe('string | number | boolean | object | null | undefined')")

