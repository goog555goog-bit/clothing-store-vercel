const fs = require('fs');
const path = require('path');

const folders = [
  'c:\\Users\\User\\.gemini\\antigravity\\scratch\\clothing-store-vercel',
  'c:\\Users\\User\\.gemini\\antigravity\\scratch\\clothing-store'
];

folders.forEach(folder => {
  // Update CSS files
  ['style.css', 'style.html'].forEach(filename => {
    const filePath = path.join(folder, filename);
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Add flex-wrap utility if not exists
      if (!content.includes('.flex-wrap {')) {
        content = content.replace('.flex-col { display: flex; flex-direction: column; }', '.flex-col { display: flex; flex-direction: column; }\n.flex-wrap { flex-wrap: wrap; }');
      }
      
      // Add flex-wrap to nav-actions
      if (content.includes('.nav-actions {')) {
         const regex = /\.nav-actions\s*{[^}]*}/;
         const match = content.match(regex);
         if (match && !match[0].includes('flex-wrap')) {
            const newBlock = match[0].replace('display: flex;', 'display: flex; flex-wrap: wrap;');
            content = content.replace(regex, newBlock);
         }
      }
      
      fs.writeFileSync(filePath, content);
    }
  });
  
  // Replace in HTML and JS
  const replaceInFiles = (dir) => {
    fs.readdirSync(dir).forEach(file => {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory() && file !== '.git') {
        replaceInFiles(fullPath);
      } else if (file.endsWith('.html') || file.endsWith('.js') || file.endsWith('.gs')) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let newContent = content
          .replace(/class="flex flex-wrap gap-1"/g, 'class="flex flex-wrap gap-1"')
          .replace(/class="flex flex-wrap gap-2"/g, 'class="flex flex-wrap gap-2"')
          // specific places that are prone to overlap
          .replace(/class="flex flex-wrap items-center justify-between gap-2" style="margin-bottom:1.5rem"/g, 'class="flex flex-wrap justify-between items-center gap-2" style="margin-bottom:1.5rem"')
          .replace(/class="flex flex-wrap items-center justify-between gap-2" style="margin-bottom:1.5rem"/g, 'class="flex flex-wrap items-center justify-between gap-2" style="margin-bottom:1.5rem"')
          .replace(/class="flex flex-wrap items-center justify-between gap-2" style="margin-bottom:1rem"/g, 'class="flex flex-wrap items-center justify-between gap-2" style="margin-bottom:1rem"');
          
        if (newContent !== content) {
          fs.writeFileSync(fullPath, newContent);
        }
      }
    });
  };
  replaceInFiles(folder);
});
console.log('Fixes applied successfully.');
