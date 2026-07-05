import { describe, it, expect, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { createTemplateStore } from '../../src/shared/templates/store';

function tmpFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'templates-test-'));
  return path.join(dir, 'templates.json');
}

describe('templateStore', () => {
  let file: string;

  beforeEach(() => {
    file = tmpFile();
  });

  it('cria template padrão no primeiro acesso', async () => {
    const store = createTemplateStore(file);
    const templates = await store.list();
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe('Padrão');
    expect(templates[0].content).toContain('{titulo}');
  });

  it('cria, lê, atualiza e remove templates', async () => {
    const store = createTemplateStore(file);

    const created = await store.create('Meu Template', 'Oferta: {titulo} — {link}');
    expect(created.id).toBeTruthy();

    const found = await store.get(created.id);
    expect(found?.name).toBe('Meu Template');

    const updated = await store.update(created.id, { name: 'Renomeado' });
    expect(updated?.name).toBe('Renomeado');
    expect(updated?.content).toBe('Oferta: {titulo} — {link}');

    const removed = await store.remove(created.id);
    expect(removed).toBe(true);
    expect(await store.get(created.id)).toBeUndefined();
  });

  it('não remove o último template', async () => {
    const store = createTemplateStore(file);
    const [only] = await store.list();
    expect(await store.remove(only.id)).toBe(false);
    expect(await store.list()).toHaveLength(1);
  });

  it('persiste entre instâncias (arquivo JSON)', async () => {
    const store1 = createTemplateStore(file);
    await store1.create('Persistido', '{titulo}');

    const store2 = createTemplateStore(file);
    const templates = await store2.list();
    expect(templates.some(t => t.name === 'Persistido')).toBe(true);
  });

  it('update de id inexistente retorna undefined', async () => {
    const store = createTemplateStore(file);
    expect(await store.update('nao-existe', { name: 'X' })).toBeUndefined();
  });
});
