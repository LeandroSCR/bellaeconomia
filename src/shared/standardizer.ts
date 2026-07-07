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
 * O título vem da PÁGINA DO PRODUTO (fonte da verdade); se o site bloquear
 * ou falhar, cai no extrator heurístico do texto da mensagem.
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

    // Preço: o do ANÚNCIO NO SITE é a fonte da verdade — sempre que a página
    // devolver preço (mesmo R$ 0), ele vence o extraído do texto da mensagem
    if (info.preco != null) {
      input.preco = info.preco;
      input.precoOriginal =
        info.precoOriginal != null && info.precoOriginal > info.preco
          ? info.precoOriginal
          : undefined;
    }

    const template = await templateStore.getDefault();
    const rendered = renderTemplate(template.content, input);

    // Sanidade: mensagem renderizada precisa ter o link e algum conteúdo
    if (!rendered || !rendered.includes(input.link)) return processedText;

    return rendered;
  } catch {
    return processedText;
  }
}
