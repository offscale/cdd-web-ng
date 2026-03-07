import os

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

files = [
    'src/functions/emit_parameter_serializer.ts',
    'src/functions/emit_multipart.ts',
    'src/openapi/emit_content_encoder.ts',
    'src/openapi/emit_xml_builder.ts',
    'src/vendors/angular/utils/http-params-builder.generator.ts',
    'src/openapi/emit_xml_parser.ts'
]

type_str = "string | number | boolean | object | undefined | null"

for p in files:
    # http-params-builder & parameter-serializer
    r(p, 'config.name', "(config as Record<string, string | number | boolean | object | undefined | null>)['name']")
    r(p, 'config.allowEmptyValue', "(config as Record<string, string | number | boolean | object | undefined | null>)['allowEmptyValue']")
    r(p, 'config.contentEncoderConfig', "(config as Record<string, string | number | boolean | object | undefined | null>)['contentEncoderConfig']")
    r(p, 'config.contentEncoding', "(config as Record<string, string | number | boolean | object | undefined | null>)['contentEncoding']")
    r(p, 'config.allowReserved', "(config as Record<string, string | number | boolean | object | undefined | null>)['allowReserved']")
    r(p, 'config.contentType', "(config as Record<string, string | number | boolean | object | undefined | null>)['contentType']")
    r(p, 'config.serialization', "(config as Record<string, string | number | boolean | object | undefined | null>)['serialization']")
    r(p, 'config.encoding', "(config as Record<string, string | number | boolean | object | undefined | null>)['encoding']")
    r(p, 'config.style', "(config as Record<string, string | number | boolean | object | undefined | null>)['style']")
    r(p, 'config.explode', "(config as Record<string, string | number | boolean | object | undefined | null>)['explode']")
    r(p, "value = JSON.stringify(value);", f"value = JSON.stringify(value) as {type_str};")
    r(p, "String(v)", "String(v as string)")
    r(p, "String(k)", "String(k as string)")
    r(p, "String(key)", "String(key as string)")
    r(p, "value.join", "(value as string[]).join")
    r(p, "encode(name)", "encode(name as string)")
    r(p, "encode(rawValue)", "encode(rawValue as string)")
    r(p, "encode(flattened)", "encode(flattened as string)")
    r(p, "encode(String(value))", "encode(String(value as string))")
    r(p, "...config", "...(config as object)")
    
    # multipart-builder
    r(p, 'let payload: string | Blob | FormData = value;', 'let payload: string | Blob | FormData = value as string | Blob | FormData;')
    r(p, 'payload = nestedResult.content as unknown;', 'payload = nestedResult.content;')
    r(p, 'parts.push(payload as unknown);', 'parts.push(payload as BlobPart);')
    r(p, 'this.appendPart(parts, String(v),', 'this.appendPart(parts, String(v as string),')
    r(p, 'this.appendPart(parts, serialized,', 'this.appendPart(parts, serialized as string | Blob,')
    r(p, 'this.appendPart(parts, String(value),', 'this.appendPart(parts, String(value as string),')
    r(p, 'this.appendPart(parts, v,', 'this.appendPart(parts, v as string | Blob,')
    r(p, 'this.appendPart(parts, item,', 'this.appendPart(parts, item as string | Blob,')
    r(p, 'new Blob(parts,', 'new Blob(parts as BlobPart[],')

    # content-encoder
    r(p, 'globalThis as unknown', "globalThis as { Buffer: { from: (a: string | Uint8Array, b?: string) => { toString: (c: string) => string } } }")

    # xml-builder
    r(p, "cfg.name", "(cfg as Record<string, string | number | boolean | object | undefined | null>)['name']")

    # xml-parser
    r(p, "result.push", "(result as string[]).push")
    r(p, "items.push", "(items as string[]).push")

