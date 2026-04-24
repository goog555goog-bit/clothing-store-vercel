import sys

f = open('admin.html', 'r', encoding='utf-8')
content = f.read()
f.close()

lines = content.split('\n')
print('Total lines: ' + str(len(lines)))

print('')
print('=== Lines 3186-3215 ===')
for i in range(3185, min(3215, len(lines))):
    line = lines[i]
    problems = []
    for j in range(len(line)):
        ch = line[j]
        code = ord(ch)
        if code == 8216 or code == 8217:
            problems.append('pos ' + str(j) + ': SMART QUOTE')
        elif code == 8220 or code == 8221:
            problems.append('pos ' + str(j) + ': SMART DBLQUOTE')
        elif code == 160:
            problems.append('pos ' + str(j) + ': NBSP')
        elif code == 8203:
            problems.append('pos ' + str(j) + ': ZERO-WIDTH SPACE')
        elif code == 65279:
            problems.append('pos ' + str(j) + ': BOM')
    
    if len(problems) > 0:
        print('Line ' + str(i+1) + ': PROBLEMS:')
        for p in problems:
            print('  ' + p)
        print('  hex: ' + ' '.join([hex(ord(c)) for c in line[:150]]))
    else:
        print('Line ' + str(i+1) + ': OK | ' + line.rstrip()[:100])

print('')
print('=== Searching ENTIRE file for smart quotes ===')
for i in range(len(lines)):
    line = lines[i]
    for j in range(len(line)):
        code = ord(line[j])
        if code == 8216 or code == 8217 or code == 8220 or code == 8221:
            ctx = line[max(0,j-15):j+15]
            print('Line ' + str(i+1) + ' pos ' + str(j) + ': SMART QUOTE U+' + hex(code) + ' context: ' + ctx)

print('Done.')
