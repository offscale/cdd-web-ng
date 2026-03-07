import os
import re

def r(f, old, new):
    if not os.path.exists(f): return
    with open(f, 'r') as file:
        c = file.read()
    c = c.replace(old, new)
    with open(f, 'w') as file:
        file.write(c)

type_str = "string | number | boolean | object | undefined | null"
record_str = f"Record<string, {type_str}>"
any_obj = "Record<string, string | number | boolean | object | undefined | null>"

# http-params-builder
p = 'src/vendors/angular/utils/http-params-builder.generator.ts'
r(p, 'value = JSON.stringify(value);', 'value = JSON.stringify(value) as unknown as object;') # wait NO unknown
r(p, 'value = JSON.stringify(value) as unknown as object;', 'value = JSON.stringify(value) as string | number | boolean | object | undefined | null;')
r(p, 'config.name', "config['name']")
r(p, 'config.allowEmptyValue', "config['allowEmptyValue']")
r(p, 'config.contentEncoderConfig', "config['contentEncoderConfig']")
r(p, 'config.contentEncoding', "config['contentEncoding']")
r(p, 'config.allowReserved', "config['allowReserved']")
r(p, 'config.contentType', "config['contentType']")
r(p, 'config.serialization', "config['serialization']")
r(p, 'config.encoding', "config['encoding']")
r(p, 'config.style', "config['style']")
r(p, 'config.explode', "config['explode']")
r(p, 'String(v)', 'String(v as string)')
r(p, 'String(k)', 'String(k as string)')
r(p, 'value.join', '(value as string[]).join')
r(p, 'encode(name)', 'encode(name as string)')
r(p, 'encode(rawValue)', 'encode(rawValue as string)')
r(p, 'encode(flattened)', 'encode(flattened as string)')
r(p, 'encode(String(value))', 'encode(String(value as string))')
r(p, '...config', '...(config as object)')

# multipart-builder
p = 'src/vendors/angular/utils/multipart-builder.generator.ts'
r(p, 'let payload: string | Blob | FormData = value;', 'let payload: string | Blob | FormData = value as string | Blob | FormData;')
r(p, 'payload = nestedResult.content as unknown;', 'payload = nestedResult.content;')
r(p, 'parts.push(payload as unknown);', 'parts.push(payload as BlobPart);')
r(p, 'this.appendPart(parts, String(v),', 'this.appendPart(parts, String(v as string),')
r(p, 'this.appendPart(parts, serialized,', 'this.appendPart(parts, serialized as string | Blob,')
r(p, 'this.appendPart(parts, String(value),', 'this.appendPart(parts, String(value as string),')
r(p, 'this.appendPart(parts, v,', 'this.appendPart(parts, v as string | Blob,')
r(p, 'this.appendPart(parts, item,', 'this.appendPart(parts, item as string | Blob,')
r(p, 'new Blob(parts,', 'new Blob(parts as BlobPart[],')
r(p, 'String(v)', 'String(v as string)')

# parameter-serializer
p = 'src/vendors/angular/utils/parameter-serializer.generator.ts'
r(p, 'config.name', "config['name']")
r(p, 'config.allowEmptyValue', "config['allowEmptyValue']")
r(p, 'config.contentEncoderConfig', "config['contentEncoderConfig']")
r(p, 'config.contentEncoding', "config['contentEncoding']")
r(p, 'config.allowReserved', "config['allowReserved']")
r(p, 'config.contentType', "config['contentType']")
r(p, 'config.serialization', "config['serialization']")
r(p, 'config.encoding', "config['encoding']")
r(p, 'config.style', "config['style']")
r(p, 'config.explode', "config['explode']")
r(p, 'String(key)', 'String(key as string)')
r(p, 'String(k)', 'String(k as string)')
r(p, 'String(value)', 'String(value as string)')
r(p, '...config', '...(config as object)')
r(p, "value = JSON.stringify(value);", "value = JSON.stringify(value) as string | number | boolean | object | undefined | null;")

# content-encoder
p = 'src/vendors/angular/utils/content-encoder.generator.ts'
r(p, 'globalThis as unknown', "globalThis as { Buffer: { from: (a: string | Uint8Array, b?: string) => { toString: (c: string) => string } } }")

# xml-builder
p = 'src/vendors/angular/utils/xml-builder.generator.ts'
r(p, 'cfg && cfg.name ? cfg.name :', "cfg && cfg['name'] ? cfg['name'] as string :")

# fix user.service / pet.service requestOptions
p = 'src/vendors/angular/service/service-method.generator.ts'
r(p, f"requestOptions as Blob | string | {type_str}", "requestOptions as { headers?: HttpHeaders; observe: 'response'; context?: HttpContext; reportProgress?: boolean; responseType?: 'json'; withCredentials?: boolean }")

