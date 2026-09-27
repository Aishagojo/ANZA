import { writeFileSync } from 'node:fs';
import { contract } from '../src/contracts/contract.js';
writeFileSync(new URL('../docs/openapi.json', import.meta.url), JSON.stringify(contract, null, 2) + '\n');
console.log('Exported docs/openapi.json');
