const fs = require('fs');
const path = 'artifacts/api-server/package.json';
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'));
pkg.dependencies.ws = "^8.18.0";
pkg.devDependencies['@types/ws'] = "^8.5.12";
fs.writeFileSync(path, JSON.stringify(pkg, null, 4));
console.log('Added ws to package.json');
