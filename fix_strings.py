import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            path = os.path.join(root, file)
            r(path, "type: 'unknown'", f"type: '{type_str}'")
            r(path, ": 'unknown'", f": '{type_str}'")
            r(path, "return 'unknown';", f"return '{type_str}';")

for root, _, files in os.walk('tests'):
    for file in files:
        if file.endswith('.ts'):
            path = os.path.join(root, file)
            r(path, "type: 'unknown'", f"type: '{type_str}'")
            r(path, ": 'unknown'", f": '{type_str}'")
            r(path, "return 'unknown';", f"return '{type_str}';")
            r(path, "toBe('unknown')", f"toBe('{type_str}')")

