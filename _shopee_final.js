require('dotenv/config');
const axios = require('axios');
const crypto = require('crypto');
const cfg = require('./dist/config').config;

const ts = Math.floor(Date.now() / 1000);
const hmac = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest('hex');
const sign = hmac(cfg.SHOPEE_SECRET, cfg.SHOPEE_APP_ID + ts);
const body = JSON.stringify({ query: '{ __typename }' });

async function test(desc, params, headers) {
  try {
    const r = await axios.post('https://open-api.affiliate.shopee.com.br/graphql', body, {
      params, headers: { 'Content-Type': 'application/json', ...headers }, timeout: 8000
    });
    console.log(desc + ':', r.data?.errors?.[0]?.message ?? JSON.stringify(r.data?.data));
  } catch(e) { console.log(desc + ': HTTP', e.response?.status); }
}

Promise.resolve().then(async () => {
  // Formato composto: appId:timestamp:sign
  await test('appId:ts:sign',
    { app_id: cfg.SHOPEE_APP_ID, timestamp: ts },
    { Authorization: 'SHA256 ' + cfg.SHOPEE_APP_ID + ':' + ts + ':' + sign }
  );
  // URL-encoded params como payload do sign
  const urlPayload = 'app_id=' + cfg.SHOPEE_APP_ID + '&timestamp=' + ts;
  await test('HMAC(url-params)',
    { app_id: cfg.SHOPEE_APP_ID, timestamp: ts },
    { Authorization: 'SHA256 ' + hmac(cfg.SHOPEE_SECRET, urlPayload) }
  );
  // Basic auth com appId:secret
  const basic = Buffer.from(cfg.SHOPEE_APP_ID + ':' + cfg.SHOPEE_SECRET).toString('base64');
  await test('Basic auth',
    { app_id: cfg.SHOPEE_APP_ID, timestamp: ts },
    { Authorization: 'Basic ' + basic }
  );
  // v2 endpoint com sign no body
  try {
    const r = await axios.post('https://open-api.affiliate.shopee.com.br/graphql',
      JSON.stringify({ query: '{ __typename }', variables: {}, extensions: { app_id: cfg.SHOPEE_APP_ID, timestamp: ts, sign } }),
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );
    console.log('Sign no body extensions:', r.data?.errors?.[0]?.message ?? JSON.stringify(r.data?.data));
  } catch(e) { console.log('Sign no body: HTTP', e.response?.status); }
});
