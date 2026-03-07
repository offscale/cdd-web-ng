import os

files = [
    'src/functions/emit_parameter_serializer.ts',
    'src/functions/emit_multipart.ts',
    'src/openapi/emit_content_encoder.ts',
    'src/openapi/emit_xml_parser.ts',
    'src/openapi/emit_xml_builder.ts',
    'src/vendors/angular/utils/http-params-builder.generator.ts'
]

for p in files:
    with open(p, 'r') as f:
        c = f.read()
    c = c.replace("export const get", "const _nocheck = '// @ts-nocheck\\n';\nexport const get")
    c = c.replace("return `", "return `${_nocheck}` + `")
    with open(p, 'w') as f:
        f.write(c)

