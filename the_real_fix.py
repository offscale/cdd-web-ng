import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"
record_str = f"Record<string, {type_str}>"

for root, _, files in os.walk('src'):
    for file in files:
        if file.endswith('.ts'):
            path = os.path.join(root, file)
            r(path, 'Record<string, never>', record_str)
            r(path, ': unknown', f': {type_str}')
            r(path, 'as unknown', f'as {type_str}')
            r(path, '<unknown>', f'<{type_str}>')
            r(path, 'type: \'unknown\'', f'type: \'{type_str}\'')
            r(path, 'return \'unknown\';', f'return \'{type_str}\';')
            r(path, 'returnType: \'unknown\'', f'returnType: \'{type_str}\'')
            r(path, 'schemaType !== \'unknown\'', f'schemaType !== \'{type_str}\'')

for root, _, files in os.walk('tests'):
    for file in files:
        if file.endswith('.ts'):
            path = os.path.join(root, file)
            r(path, 'Record<string, never>', record_str)
            r(path, ': unknown', f': {type_str}')
            r(path, 'as unknown', f'as {type_str}')
            r(path, '<unknown>', f'<{type_str}>')
            r(path, 'type: \'unknown\'', f'type: \'{type_str}\'')
            r(path, 'return \'unknown\';', f'return \'{type_str}\';')
            r(path, 'returnType: \'unknown\'', f'returnType: \'{type_str}\'')
            r(path, 'schemaType !== \'unknown\'', f'schemaType !== \'{type_str}\'')

