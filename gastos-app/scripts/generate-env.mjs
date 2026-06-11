import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const devOut = join(root, 'src/environments/environment.ts');
const prodOut = join(root, 'src/environments/environment.prod.ts');

const defaultApiUrl = '/api';

function parseEnv(content) {
  const vars = { API_URL: defaultApiUrl };
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

const fileVars = existsSync(envPath)
  ? parseEnv(readFileSync(envPath, 'utf8'))
  : { API_URL: defaultApiUrl };

const apiUrl = process.env.API_URL ?? fileVars.API_URL ?? defaultApiUrl;

function writeEnvironment(path, production, url) {
  const file = `// Gerado por scripts/generate-env.mjs — não edite manualmente
export const environment = {
  production: ${production},
  apiUrl: ${JSON.stringify(url)},
};
`;
  writeFileSync(path, file, 'utf8');
}

writeEnvironment(devOut, false, apiUrl);
writeEnvironment(prodOut, true, apiUrl);

console.log('environment.ts →', apiUrl);
console.log('environment.prod.ts →', apiUrl);
