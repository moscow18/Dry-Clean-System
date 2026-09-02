const fs = require('fs');
const path = require('path');

function getLocalISODateDef() {
  return `function getLocalISODate(d = new Date()) {
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
}
`;
}

// 1. Add getLocalISODate to common.js
const commonPath = path.join(__dirname, 'renderer', 'js', 'shared', 'common.js');
let commonContent = fs.readFileSync(commonPath, 'utf8');
if (!commonContent.includes('getLocalISODate')) {
  commonContent += '\n' + getLocalISODateDef();
  fs.writeFileSync(commonPath, commonContent, 'utf8');
  console.log('Added getLocalISODate to common.js');
}

// 2. Replace all occurrences in renderer/js
function walk(dir) {
  fs.readdirSync(dir).forEach(file => {
    const f = path.join(dir, file);
    if (fs.statSync(f).isDirectory()) {
      walk(f);
    } else if (f.endsWith('.js')) {
      let c = fs.readFileSync(f, 'utf8');
      if (c.includes("new Date().toISOString().split('T')[0]")) {
        c = c.replace(/new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]/g, 'getLocalISODate()');
        fs.writeFileSync(f, c, 'utf8');
        console.log('Replaced in', f);
      }
    }
  });
}
walk(path.join(__dirname, 'renderer', 'js'));
