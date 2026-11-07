import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
mkdirSync('dist', {recursive:true});
cpSync('public', 'dist', {recursive:true});
writeFileSync('dist/config.json', JSON.stringify({api:false}));
console.log('Built static, explicitly labeled demo in dist/. The live collector runs with npm run live.');
