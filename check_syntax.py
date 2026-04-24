import sys

with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
print(f'Total lines: {len(lines)}')

# Check lines around 3194 for hidden characters
print('\n=== Checking lines 3186-3215 for hidden/non-ASCII chars ===')
for i in range(3185, min(3215, len(lines))):
    line = lines[i]
    problems = []
    for j, ch in enumerate(line):
        code = ord(ch)
        # Check for non-printable chars (except tab, space) and unusual unicode
        if code < 32 and code != 9:
            problems.append(f'  pos {j}: control char U+{code:04X}')
        elif code > 127 and code < 3585:  # Skip Thai range (0E00-0E7F)
            problems.append(f'  pos {j}: U+{code:04X} ({ch})')
        elif code >= 8192 and code <= 8303:  # Unicode punctuation/spaces
            problems.append(f'  pos {j}: SPECIAL U+{code:04X} ({repr(ch)})')
        elif code == 8216 or code == 8217:  # Smart single quotes
            problems.append(f'  pos {j}: SMART QUOTE U+{code:04X} ({repr(ch)})')
        elif code == 8220 or code == 8221:  # Smart double quotes
            problems.append(f'  pos {j}: SMART DBLQUOTE U+{code:04X} ({repr(ch)})')
        elif code == 160:  # Non-breaking space
            problems.append(f'  pos {j}: NBSP U+00A0')
    
    if problems:
        print(f'Line {i+1}: PROBLEMS FOUND:')
        for p in problems:
            print(p)
        print(f'  Full line: {repr(line[:200])}')
    else:
        # Just show the line
        print(f'Line {i+1}: OK | {line.rstrip()[:120]}')

# Also check around the first script opening at 1029
print('\n=== Checking script block boundaries ===')
for i, line in enumerate(lines):
    stripped = line.strip()
    if '<script>' in stripped.lower() or '</script>' in stripped.lower():
        print(f'Line {i+1}: {stripped[:120]}')

# Look for any smart quotes or hidden chars in the entire script block  
print('\n=== Scanning entire script block (1029-3281) for smart quotes/hidden chars ===')
for i in range(1028, min(3281, len(lines))):
    line = lines[i]
    for j, ch in enumerate(line):
        code = ord(ch)
        if code in (8216, 8217, 8218, 8219, 8220, 8221, 8222, 8223):
            print(f'Line {i+1} pos {j}: SMART QUOTE U+{code:04X} ({repr(ch)})')
            print(f'  Context: ...{line[max(0,j-20):j+20]}...')
        elif code == 160:
            print(f'Line {i+1} pos {j}: NON-BREAKING SPACE')
        elif code in (8206, 8207, 8234, 8235, 8236, 8237, 8238):
            print(f'Line {i+1} pos {j}: BIDI CONTROL U+{code:04X}')
        elif code == 65279:
            print(f'Line {i+1} pos {j}: BOM/ZWNBSP U+FEFF')
        elif code == 8203:
            print(f'Line {i+1} pos {j}: ZERO-WIDTH SPACE U+200B')

print('\nDone.')
