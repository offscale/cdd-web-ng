import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

# src/classes/emit.ts
r('src/classes/emit.ts', "? 'unknown'", f"? '{type_str}'")
r('src/classes/emit.ts', "includes('unknown')", f"includes('{type_str}')")
r('src/classes/emit.ts', "? 'unknown' :", f"? '{type_str}' :")

# src/functions/parse_analyzer.ts
r('src/functions/parse_analyzer.ts', "type = 'unknown';", f"type = '{type_str}';")

# src/functions/emit_webhook.ts
r('src/functions/emit_webhook.ts', "type !== 'unknown'", f"type !== '{type_str}'")

# src/functions/emit_callback.ts
r('src/functions/emit_callback.ts', "type !== 'unknown'", f"type !== '{type_str}'")

