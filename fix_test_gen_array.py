import os

p = 'src/vendors/angular/test/service-test-generator.ts'
with open(p, 'r') as f:
    c = f.read()

c = c.replace(
    "value = this.mockDataGenerator.generate(modelName);",
    "value = this.mockDataGenerator.generate(modelName);\n                        if (type.includes('[]')) value = `[${value}]`;"
)

with open(p, 'w') as f:
    f.write(c)

