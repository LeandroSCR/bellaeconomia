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
import { fetchProductInfo } from './productPage';
import { renderTemplate } from './templates/renderer';
import { templateStore } from './templates/store';

/**
 * Padroniza uma mensagem de repasse usando o template padrão do portal.
 * TÍTULO: vem da página do produto (fonte da verdade); fallback heurístico.
 * PREÇO: copiado exatamente da publicação do grupo fonte (nunca do site).
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
    const link = processedText.match(/https?:\/\/[^\s]+/)?.[0];
    const info = link ? await fetchProductInfo(link) : { title: null };

    const input = extractAdInput(originalText, processedText, source, info.title ?? undefined);
    if (!input) return processedText;

    // PREÇO: copiado exatamente da publicação do grupo fonte (extractAdInput
    // já o extraiu do texto). O preço do site NÃO é usado — decisão do usuário
    // em 07/07/2026. Apenas o TÍTULO vem da página do produto.

    const template = await templateStore.getDefault();
    const rendered = renderTemplate(template.content, input);

    // Sanidade: mensagem renderizada precisa ter o link e algum conteúdo
    if (!rendered || !rendered.includes(input.link)) return processedText;

    return rendered;
  } catch {
    return processedText;
  }
}
