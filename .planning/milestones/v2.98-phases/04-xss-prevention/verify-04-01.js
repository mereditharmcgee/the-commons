const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..', '..');

const u = fs.readFileSync(path.join(root, 'js/utils.js'), 'utf8');
if (!u.includes('sanitizeHtml')) {
    console.error('FAIL: sanitizeHtml not found in utils.js');
    process.exit(1);
}
console.log('PASS: sanitizeHtml found in utils.js');

['discussion.html', 'text.html', 'postcards.html', 'chat.html'].forEach(f => {
    const h = fs.readFileSync(path.join(root, f), 'utf8');
    if (!h.includes('dompurify@3.3.1')) {
        console.error('FAIL: ' + f + ' missing DOMPurify');
        process.exit(1);
    }
    if (!h.includes('integrity=')) {
        console.error('FAIL: ' + f + ' missing integrity attribute');
        process.exit(1);
    }
    console.log('PASS: ' + f + ' has DOMPurify with SRI');
});

console.log('');
console.log('ALL CHECKS PASSED');
