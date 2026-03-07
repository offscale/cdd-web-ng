import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

p = 'src/openapi/emit_xml_builder.ts'
type_str = "string | number | boolean | object | undefined | null"
record_str = f"Record<string, {type_str}>"

r(p, "cfg && (cfg as any).name ? (cfg as any).name as string :", f"cfg && (cfg as {record_str})['name'] ? (cfg as {record_str})['name'] as string :")

