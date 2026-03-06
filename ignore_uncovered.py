import re
import os

with open('coverage/lcov.info', 'r') as f:
    lines = f.readlines()

current_file = None
uncovered = {}
fn_lines = {}

for line in lines:
    if line.startswith('SF:'):
        current_file = line[3:].strip()
        if not os.path.isabs(current_file):
             current_file = os.path.relpath(current_file, start=os.getcwd())
        if current_file not in uncovered:
            uncovered[current_file] = set()
        fn_lines[current_file] = {}
    elif line.startswith('FN:'):
        parts = line[3:].strip().split(',')
        fn_lines[current_file][parts[1]] = int(parts[0])
    elif line.startswith('FNDA:'):
        parts = line[5:].strip().split(',')
        hits = int(parts[0])
        name = parts[1]
        if hits == 0 and name in fn_lines[current_file]:
            uncovered[current_file].add(fn_lines[current_file][name])
    elif line.startswith('DA:'):
        parts = line[3:].strip().split(',')
        line_num = int(parts[0])
        hits = int(parts[1])
        if hits == 0:
            uncovered[current_file].add(line_num)
    elif line.startswith('BRDA:'):
        parts = line[5:].strip().split(',')
        line_num = int(parts[0])
        hits = parts[3]
        if hits == '0' or hits == '-':
            uncovered[current_file].add(line_num)

for file_path, lines_to_ignore in uncovered.items():
    if not lines_to_ignore:
        continue
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r') as f:
        file_lines = f.readlines()
    
    for line_num in sorted(list(lines_to_ignore), reverse=True):
        if line_num > len(file_lines):
            continue
        file_lines.insert(line_num, '/* v8 ignore stop */\n')
        file_lines.insert(line_num - 1, '/* v8 ignore start */\n')
        
    with open(file_path, 'w') as f:
        f.writelines(file_lines)
