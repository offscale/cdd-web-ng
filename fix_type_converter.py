import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

# Fix type-converter.ts
r('src/classes/parse_type_converter.ts', 'unknown', type_str)

# Fix tests
r('tests/00-core/utils/type-converter.spec.ts', "'unknown'", f"'{type_str}'")
r('tests/00-core/utils/type-converter.spec.ts', "unknown[]", f"({type_str})[]")
r('tests/00-core/utils/type-converter.spec.ts', "{ [key: string]: unknown }", f"{{ [key: string]: {type_str} }}")

# Fix type generator tests
r('tests/20-emit-type/00-type-generator.spec.ts', 'unknown', type_str)
r('tests/20-emit-type/08-type-generator-coverage.spec.ts', 'unknown', type_str)

# Fix analysis tests
r('tests/analysis/03-service-method-analyzer.spec.ts', "'unknown'", f"'{type_str}'")

# Fix emit utility tests (if any)
r('tests/40-emit-utility/13-content-encoder.spec.ts', 'unknown', type_str)
r('tests/40-emit-utility/14-content-decoder.spec.ts', 'unknown', type_str)

