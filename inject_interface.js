const fs = require('fs');
const p = 'artifacts/api-client-react/src/client.ts';
let code = fs.readFileSync(p, 'utf8');

const interfaceCode = `
export interface CannedResponse {
  id: number;
  companyId: number;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
`;

if (!code.includes('export interface CannedResponse')) {
  code = code + interfaceCode;
  fs.writeFileSync(p, code);
  console.log('Added interface');
}
