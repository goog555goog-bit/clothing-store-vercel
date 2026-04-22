const fs = require('fs');
let content = fs.readFileSync('admin.html', 'utf8');

content = content.replace(/<tr><td colspan="\d+" class="text-center".*?<div class="spinner"><\/div><\/td><\/tr>/g, 
  '<tr><td colspan="10"><div class="skeleton sk-line"></div><div class="skeleton sk-line sk-line-short"></div></td></tr>');

content = content.replace(/<div class="text-center.*?<div class="spinner"><\/div><\/div>/g,
  '<div class="skeleton sk-line" style="height:30px; margin-top:20px;"></div><div class="skeleton sk-line sk-line-short"></div>');

content = content.replace(/<tr><td colspan="5" class="text-center" style="padding:2rem">ไม่พบประวัติกิจกรรม<\/td><\/tr>/g,
  `<tr><td colspan="10"><div class="empty-state"><i data-lucide="activity"></i><h3>ไม่มีข้อมูล</h3><p>ไม่พบประวัติกิจกรรม</p></div></td></tr>`);

content = content.replace(/<tr><td colspan="5" class="text-center" style="padding:2rem;color:var\(--text3\)">ไม่มีข้อมูลพยากรณ์<\/td><\/tr>/g,
  `<tr><td colspan="10"><div class="empty-state"><i data-lucide="trending-up"></i><h3>ไม่มีข้อมูล</h3><p>ระบบกำลังรวบรวมข้อมูลพยากรณ์</p></div></td></tr>`);

content = content.replace(/<tr><td colspan="5" class="text-center" style="padding:2rem">ไม่พบรายการ<\/td><\/tr>/g,
  `<tr><td colspan="10"><div class="empty-state"><i data-lucide="package-open"></i><h3>ไม่มีข้อมูล</h3><p>ไม่พบรายการในหมวดหมู่นี้</p></div></td></tr>`);

fs.writeFileSync('admin.html', content);

let appJs = fs.readFileSync('app.js', 'utf8');
appJs = appJs.replace(/<div class="text-center".*?<div class="spinner"><\/div><\/div>/g, 
  '<div class="skeleton sk-line" style="height:30px; margin-top:20px;"></div><div class="skeleton sk-line sk-line-short"></div>');
  
appJs = appJs.replace(/<tr><td colspan="\d+" class="text-center" style="padding:2rem">ไม่พบใบเบิก<\/td><\/tr>/g,
  `<tr><td colspan="10"><div class="empty-state"><i data-lucide="file-text"></i><h3>ไม่มีข้อมูล</h3><p>ยังไม่มีประวัติ หรือไม่พบใบเบิก</p></div></td></tr>`);
fs.writeFileSync('app.js', appJs);

console.log('Update Complete');
