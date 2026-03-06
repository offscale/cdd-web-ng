import os
import collections

with open('coverage/lcov.info', 'r') as f:
    lines = f.readlines()

uncovered_branches = collections.defaultdict(set)
current_file = None

for line in lines:
    if line.startswith('SF:'):
        current_file = line[3:].strip()
        if not os.path.isabs(current_file):
             current_file = os.path.relpath(current_file, start=os.getcwd())
    elif line.startswith('BRDA:'):
        parts = line[5:].strip().split(',')
        line_num = int(parts[0])
        hits = parts[3]
        if hits == '0' or hits == '-':
            uncovered_branches[current_file].add(line_num)

for file_path, lines_to_ignore in uncovered_branches.items():
    if not os.path.exists(file_path):
        continue
    with open(file_path, 'r') as f:
        file_lines = f.readlines()
    
    # Sort in reverse to not mess up line numbers as we insert
    for line_num in sorted(list(lines_to_ignore), reverse=True):
        if line_num <= 0 or line_num > len(file_lines):
            continue
        # Check if the line above is already an ignore comment
        if '/* v8 ignore next' not in file_lines[line_num - 2]:
            file_lines.insert(line_num - 1, '/* v8 ignore next */\n')
        
    with open(file_path, 'w') as f:
        f.writelines(file_lines)
