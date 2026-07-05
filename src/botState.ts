import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), 'data', 'bot-state.json');

function loadState(): boolean {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      return raw.enabled !== false; // default true se o arquivo existir mas não tiver o campo
    }
  } catch {}
  return true; // primeira execução: começa ativo
}

let enabled = loadState();

export const isBotEnabled = (): boolean => enabled;

export const setBotEnabled = (value: boolean): void => {
  enabled = value;
  fs.promises.mkdir(path.dirname(STATE_FILE), { recursive: true })
    .then(() => fs.promises.writeFile(STATE_FILE, JSON.stringify({ enabled: value })))
    .catch(err => console.error('[BOT STATE] Erro ao salvar estado:', (err as Error).message));
};
