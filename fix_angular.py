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

r('src/vendors/angular/utils/content-encoder.generator.ts', 'globalThis as unknown', f'globalThis as {record_str}')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.name', 'config[\'name\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.allowEmptyValue', 'config[\'allowEmptyValue\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.contentEncoderConfig', 'config[\'contentEncoderConfig\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.contentEncoding', 'config[\'contentEncoding\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.allowReserved', 'config[\'allowReserved\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.contentType', 'config[\'contentType\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.serialization', 'config[\'serialization\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.encoding', 'config[\'encoding\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.style', 'config[\'style\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', 'config.explode', 'config[\'explode\']')
r('src/vendors/angular/utils/http-params-builder.generator.ts', f'Record<string, {type_str}>', 'any') # Wait no any!
r('src/vendors/angular/utils/xml-builder.generator.ts', 'cfg.name', "cfg['name']")

