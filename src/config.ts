import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  WHATSAPP_GROUP_IDS: z.string().default('').transform(v =>
    v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
  ),
  SOURCE_GROUP_IDS: z.string().default('').transform(v =>
    v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
  ),

  FETCH_INTERVAL_MIN: z.string().default('60').transform(Number),
  DAILY_MSG_CAP: z.string().default('15').transform(Number),
  SPECIAL_DAY_MSG_CAP: z.string().default('25').transform(Number),
  QUIET_HOUR_START: z.string().default('0').transform(Number),
  QUIET_HOUR_END: z.string().default('6').transform(Number),

  PORT: z.string().default('3000').transform(Number),

  AMAZON_ACCESS_KEY: z.string().optional(),
  AMAZON_SECRET_KEY: z.string().optional(),
  AMAZON_PARTNER_TAG: z.string().optional(),

  SHOPEE_APP_ID: z.string().optional(),
  SHOPEE_SECRET: z.string().optional(),
  SHOPEE_AFFILIATE_ID: z.string().optional(),

  ML_CLIENT_ID: z.string().optional(),
  ML_CLIENT_SECRET: z.string().optional(),
  ML_AFFILIATE_EMAIL: z.string().optional(),
  ML_AFFILIATE_PASSWORD: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Variaveis de ambiente invalidas:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
