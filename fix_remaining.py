import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

# type-converter.spec.ts
r('tests/00-core/utils/type-converter.spec.ts', "number | unknown", f"number | {type_str}")
r('tests/00-core/utils/type-converter.spec.ts', f"[{type_str}[]]", f"[({type_str})[]]")
r('tests/00-core/utils/type-converter.spec.ts', f"...{type_str}[]", f"...({type_str})[]")
r('tests/00-core/utils/type-converter.spec.ts', f"...{type_str}[]]", f"...({type_str})[]]")

# 30-emit-service/02-coverage.spec.ts
r('tests/30-emit-service/02-coverage.spec.ts', "string | number | boolean | object | null | undefined", type_str)

# 04-service-method-generator-coverage.spec.ts
r('tests/30-emit-service/04-service-method-generator-coverage.spec.ts', "string | number | boolean | object>>", type_str + ">>")

# 09-content-decoding.spec.ts
r('tests/30-emit-service/09-content-decoding.spec.ts', "string | number | boolean | object>>", type_str + ">>")

# 50-emit-admin/03-form-component-generator.spec.ts
r('tests/50-emit-admin/03-form-component-generator.spec.ts', "string | number | boolean | object>'", type_str + ">'")
r('tests/50-emit-admin/03-form-component-generator.spec.ts', "string | number | boolean | object')", type_str + "')")

# parse_type_converter.ts (Fix arrays)
r('src/classes/parse_type_converter.ts', f"return `{type_str}[]`;", f"return `({type_str})[]`;")

