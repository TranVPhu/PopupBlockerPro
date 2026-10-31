// Chạy lần lượt mọi file *.test.js, mỗi file một tiến trình riêng
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const only = process.argv[2];
const files = fs.readdirSync(__dirname)
    .filter((f) => f.endsWith('.test.js') && (!only || f.includes(only)))
    .sort();

const failures = [];
for (const file of files) {
    console.log(`\n=== ${file} ===`);
    const { status } = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit', timeout: 240000 });
    if (status !== 0) failures.push(file);
}

console.log(failures.length ? `\nTHẤT BẠI: ${failures.join(', ')}` : `\nĐẠT TẤT CẢ ${files.length} FILE TEST`);
process.exit(failures.length ? 1 : 0);
