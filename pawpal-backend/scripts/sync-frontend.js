const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..', '..', 'Pawpal-main');
const destDir = path.resolve(__dirname, '..', 'public');

const files = ['index.html', 'app.js', 'styles.css', 'motion.css', 'fonts.css'];

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

for (const file of files) {
  const srcFile = path.join(srcDir, file);
  const destFile = path.join(destDir, file);

  if (!fs.existsSync(srcFile)) {
    console.error(`Warning: source file not found: ${srcFile}`);
    continue;
  }

  if (file === 'index.html') {
    let content = fs.readFileSync(srcFile, 'utf8');
    const apiScript = "<script>window.PAWPAL_API = '/api';</script>";
    if (!content.includes(apiScript)) {
      content = content.replace(
        /([ \t]*)(<script\s+src=["']\/pawpal-api\.js["'][^>]*>)/i,
        `$1${apiScript}\n$1$2`
      );
    }
    fs.writeFileSync(destFile, content, 'utf8');
  } else {
    fs.copyFileSync(srcFile, destFile);
  }
}

console.log('Frontend synced to', destDir);
