// Extract the main script block from admin.html and check for syntax errors
const fs = require('fs');
const content = fs.readFileSync('admin.html', 'utf8');

// Find the main script block (line 1029 to 3281)
const lines = content.split(/\r?\n/);
console.log('Total lines:', lines.length);
console.log('');

// Check for non-ASCII invisible chars in lines 3188-3210
console.log('=== Lines 3188-3210 char analysis ===');
for (let i = 3187; i < 3210 && i < lines.length; i++) {
  const line = lines[i];
  const nonAscii = [];
  for (let j = 0; j < line.length; j++) {
    const code = line.charCodeAt(j);
    if (code > 127 || (code < 32 && code !== 9)) {
      nonAscii.push({pos: j, code: code, hex: '0x' + code.toString(16), char: line[j]});
    }
  }
  if (nonAscii.length > 0) {
    console.log('Line ' + (i+1) + ': NON-ASCII found:', JSON.stringify(nonAscii));
    console.log('  Content: ' + line.substring(0, 120));
  }
}

// Try to parse the main script block
console.log('');
console.log('=== Attempting to parse main script block (lines 1030-3280) ===');
const scriptLines = lines.slice(1029, 3280);
const scriptContent = scriptLines.join('\n');

try {
  new Function(scriptContent);
  console.log('SUCCESS: Script parses without errors!');
} catch (e) {
  console.log('PARSE ERROR:', e.message);
  
  // Try to find the exact line
  // Binary search for the offending line
  let start = 0;
  let end = scriptLines.length;
  
  // Check progressively larger chunks
  for (let chunk = 100; chunk <= scriptLines.length; chunk += 100) {
    try {
      new Function(scriptLines.slice(0, chunk).join('\n'));
    } catch (e2) {
      console.log('Error occurs between line ' + (1030 + chunk - 100) + ' and ' + (1030 + chunk));
      
      // Narrow it down
      for (let i = chunk - 100; i < chunk; i++) {
        try {
          new Function(scriptLines.slice(0, i).join('\n'));
        } catch (e3) {
          console.log('EXACT error line: ' + (1030 + i) + ': ' + scriptLines[i-1].substring(0, 120));
          console.log('Error: ' + e3.message);
          
          // Show hex of that line
          const badLine = scriptLines[i-1];
          const hexChars = [];
          for (let k = 0; k < badLine.length && k < 200; k++) {
            hexChars.push(badLine.charCodeAt(k).toString(16).padStart(2, '0'));
          }
          console.log('Hex: ' + hexChars.join(' '));
          break;
        }
      }
      break;
    }
  }
}
