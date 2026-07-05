// ══════════════════════════════════════════════════════════════════════════
// ENGINE CREATOR — persistência de templates custom
// Armazena em data/templates.json. Todo I/O é assíncrono (fs.promises).
// ══════════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { AdTemplate } from './types';

const DEFAULT_TEMPLATE_CONTENT = [
  '📦 *{titulo}*',
  '',
  '🔥De {preco_original} por *{preco}* (-{desconto})',
  '💰 *{preco}*',
  '🏷️ Cupom: `{cupom}`',
  '',
  '🛒 {loja}',
  '👉Compre por aqui: {link}',
].join('\n');

export interface TemplateStore {
  list(): Promise<AdTemplate[]>;
  get(id: string): Promise<AdTemplate | undefined>;
  create(name: string, content: string): Promise<AdTemplate>;
  update(id: string, patch: { name?: string; content?: string }): Promise<AdTemplate | undefined>;
  remove(id: string): Promise<boolean>;
  /** Retorna o template padrão (primeiro da lista) — sempre existe. */
  getDefault(): Promise<AdTemplate>;
}

export function createTemplateStore(filePath?: string): TemplateStore {
  const FILE = filePath ?? path.join(process.cwd(), 'data', 'templates.json');
  let cache: AdTemplate[] | null = null;

  async function load(): Promise<AdTemplate[]> {
    if (cache) return cache;
    try {
      const raw = await fs.promises.readFile(FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      cache = [];
    }
    if (cache.length === 0) {
      cache.push({
        id: randomUUID(),
        name: 'Padrão',
        content: DEFAULT_TEMPLATE_CONTENT,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await persist(cache);
    }
    return cache;
  }

  async function persist(templates: AdTemplate[]): Promise<void> {
    await fs.promises.mkdir(path.dirname(FILE), { recursive: true });
    await fs.promises.writeFile(FILE, JSON.stringify(templates, null, 2));
  }

  return {
    async list() {
      return [...await load()];
    },

    async get(id) {
      return (await load()).find(t => t.id === id);
    },

    async create(name, content) {
      const templates = await load();
      const template: AdTemplate = {
        id: randomUUID(),
        name: name.trim() || 'Sem nome',
        content,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      templates.push(template);
      await persist(templates);
      return template;
    },

    async update(id, patch) {
      const templates = await load();
      const template = templates.find(t => t.id === id);
      if (!template) return undefined;
      if (patch.name !== undefined) template.name = patch.name.trim() || template.name;
      if (patch.content !== undefined) template.content = patch.content;
      template.updatedAt = Date.now();
      await persist(templates);
      return template;
    },

    async remove(id) {
      const templates = await load();
      const idx = templates.findIndex(t => t.id === id);
      if (idx === -1) return false;
      if (templates.length === 1) return false; // nunca remove o último template
      templates.splice(idx, 1);
      await persist(templates);
      return true;
    },

    async getDefault() {
      return (await load())[0];
    },
  };
}

/** Instância padrão usada pelo bot (data/templates.json). */
export const templateStore = createTemplateStore();
