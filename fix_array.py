import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

r('src/classes/parse_type_converter.ts', 
  f"restType = `, ...{type_str}[]`;", 
  f"restType = `, ...({type_str})[]`;")

r('tests/00-core/utils/type-converter.spec.ts',
  f"[string, ...{type_str}[]]",
  f"[string, ...({type_str})[]]")

