import type { Deal, Coupon } from '../deals/types';

export function formatDeal(deal: Deal): string {
  if (deal.source === 'shopee') return formatShopee(deal);
  return formatDefault(deal);
}

function formatShopee(deal: Deal): string {
  const lines: string[] = [];

  lines.push(`🔥 *${deal.title}*`);
  lines.push('');

  if (deal.originalPrice && deal.originalPrice > deal.price) {
    const disc = Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100);
    lines.push(`De ~R$ ${deal.originalPrice.toFixed(2)}~ Por → *R$ ${deal.price.toFixed(2)}*`);
    lines.push(`💰 *${disc}% de desconto*`);
  } else {
    lines.push(`💰 *R$ ${deal.price.toFixed(2)}*`);
  }

  if (deal.couponCode) {
    lines.push(`🏷️ Cupom: \`${deal.couponCode}\``);
  }

  lines.push('');
  lines.push(`🛒 ${deal.store}`);
  lines.push('');
  lines.push(`Compre aqui👉 ${deal.affiliateUrl ?? deal.url}`);

  return lines.join('\n');
}

function formatDefault(deal: Deal): string {
  const lines: string[] = [];

  lines.push(`*${deal.title}*`);
  lines.push('');

  if (deal.originalPrice && deal.originalPrice > deal.price) {
    const disc = Math.round(((deal.originalPrice - deal.price) / deal.originalPrice) * 100);
    lines.push(`De R$ ${deal.originalPrice.toFixed(2)} por *R$ ${deal.price.toFixed(2)}* (-${disc}%)`);
  } else {
    lines.push(`*R$ ${deal.price.toFixed(2)}*`);
  }

  if (deal.couponCode) {
    lines.push(`Cupom: \`${deal.couponCode}\``);
  }

  lines.push('');
  lines.push(`Loja: ${deal.store}`);
  lines.push(deal.affiliateUrl ?? deal.url);

  return lines.join('\n');
}

export function formatCoupon(coupon: Coupon): string {
  const lines: string[] = [];
  lines.push(`*CUPOM ${coupon.store.toUpperCase()}*`);
  lines.push('');
  lines.push(`Codigo: \`${coupon.code}\``);
  lines.push(`Desconto: *${coupon.discount}*`);
  lines.push(coupon.description);
  if (coupon.expiresAt) {
    lines.push(`Valido ate ${coupon.expiresAt.toLocaleDateString('pt-BR')}`);
  }
  lines.push('');
  lines.push(coupon.url);
  return lines.join('\n');
}
