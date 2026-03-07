import os

p = 'src/cli.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace("catch (err: OpenApiValue)", "catch (err)")
c = c.replace("result = await runToOpenApi(parsed.params as OpenApiValue as ToActionOptions, true);", "result = (await runToOpenApi(parsed.params as OpenApiValue as ToActionOptions, true)) as OpenApiValue;")
c = c.replace("result = await runToDocsJson(parsed.params as OpenApiValue as DocsJsonOptions, true);", "result = (await runToDocsJson(parsed.params as OpenApiValue as DocsJsonOptions, true)) as OpenApiValue;")

with open(p, 'w') as f:
    f.write(c)

