const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const url = 'https://github.com/git-for-windows/git/releases/download/v2.44.0.windows.1/PortableGit-2.44.0-64-bit.7z.exe';
const targetDir = 'C:\\Users\\aharr\\PortableGit';
const exePath = path.join(process.env.TEMP || 'C:\\Users\\aharr\\AppData\\Local\\Temp', 'PortableGit.exe');

console.log('Downloading PortableGit from:', url);

function download(fileUrl, dest, callback) {
  const file = fs.createWriteStream(dest);
  https.get(fileUrl, (response) => {
    if (response.statusCode === 301 || response.statusCode === 302) {
      download(response.headers.location, dest, callback);
      return;
    }
    response.pipe(file);
    file.on('finish', () => {
      file.close(callback);
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    console.error('Download error:', err.message);
  });
}

download(url, exePath, () => {
  console.log('Downloaded to:', exePath);
  console.log('Extracting to:', targetDir);
  try {
    execSync(`"${exePath}" -y -o"${targetDir}"`, { stdio: 'inherit' });
    console.log('PortableGit installed successfully at:', targetDir);
  } catch (err) {
    console.error('Extraction error:', err.message);
  }
});
