// ══════════════════════════════════════════════════════════════════════════
// CAMADA COMPARTILHADA — padronizador de repasses
//
// Junta extrator + template padrão para transformar uma promoção de texto
// livre em mensagem padronizada do canal.
//
// GARANTIA DE FALLBACK: qualquer falha (extração incompleta, template
// inválido, erro de I/O) retorna o texto processado original — o canal nunca
// deixa de receber a promoção por causa da padronização.
// ══════════════════════════════════════════════════════════════════════════

import { extractAdInput } from './adExtractor';
import { renderTemplate } from './templates/renderer';
import { templateStore } from './templates/store';

/**
 * Padroniza uma mensagem de repasse usando o template padrão do portal.
 * @param originalText  texto original do grupo fonte
 * @param processedText texto com links de afiliado já substituídos
 * @param source        loja detectada
 * @returns mensagem padronizada, ou processedText se não for possível padronizar
 */
export async function standardizeForward(
  originalText: string,
  processedText: string,
  source: string
): Promise<string> {
  try {
    const input = extractAdInput(originalText, processedText, source);
    if (!input) return processedText;

    const template = await templateStore.getDefault();
    const rendered = renderTemplate(template.content, input);

    // Sanidade: mensagem renderizada precisa ter o link e algum conteúdo
    if (!rendered || !rendered.includes(input.link)) return processedText;

    return rendered;
  } catch {
    return processedText;
  }
}
