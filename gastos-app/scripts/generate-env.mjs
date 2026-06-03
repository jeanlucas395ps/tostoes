import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const devOut = join(root, 'src/environments/environment.ts');
const prodOut = join(root, 'src/environments/environment.prod.ts');

const PROD_API_DEFAULT = 'https://api.tostoes.com.br/api';

const defaults = {
  API_URL: '/api',
  PROD_API_URL: PROD_API_DEFAULT,
};

function parseEnv(content) {
  const vars = { ...defaults };
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
  : { ...defaults };

// Vercel / CI: variáveis de ambiente têm prioridade sobre .env local
const devApiUrl = process.env.API_URL ?? fileVars.API_URL ?? defaults.API_URL;
const prodApiUrl =
  process.env.PROD_API_URL ??
  process.env.API_URL ??
  fileVars.PROD_API_URL ??
  fileVars.API_URL ??
  PROD_API_DEFAULT;

function writeEnvironment(path, production, apiUrl) {
  const file = `// Gerado por scripts/generate-env.mjs , não edite manualmente
export const environment = {
  production: ${production},
  apiUrl: ${JSON.stringify(apiUrl)},
};
`;
  writeFileSync(path, file, 'utf8');
}

writeEnvironment(devOut, false, devApiUrl);
writeEnvironment(prodOut, true, prodApiUrl);

console.log('environment.ts →', devApiUrl);
console.log('environment.prod.ts →', prodApiUrl);
