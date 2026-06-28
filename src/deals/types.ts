export interface Deal {
  id: string;
  title: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  url: string;
  affiliateUrl?: string;
  imageUrl?: string;
  store: string;
  source: 'pelando' | 'promobit' | 'amazon' | 'shopee' | 'mercadolivre' | 'whatsapp';
  category?: string;
  couponCode?: string;
  rawText?: string; // texto original completo para mensagens encaminhadas do WhatsApp
  createdAt: Date;
}

export interface Coupon {
  id: string;
  code: string;
  store: string;
  discount: string;
  description: string;
  expiresAt?: Date;
  url: string;
  source: string;
}
