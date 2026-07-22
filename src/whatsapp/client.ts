import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { execSync } from 'child_process';
import { handleSourceMessage } from './sourceMonitor';
import { config } from '../config';

// Mata Chromes órfãos que ficaram segurando o lock do perfil .wwebjs_auth
// (acontece quando o PM2 reinicia e o Chrome filho não morre junto — sem isso
// o bot entra em crash-loop com "The browser is already running").
function killOrphanWhatsAppChrome(): void {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*wwebjs_auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore', timeout: 15000 }
    );
  } catch { /* melhor tentar iniciar mesmo assim */ }
}

let client: Client | null = null;
let isReady = false;
let latestQr: string | null = null;

export function getClient(): Client {
  if (!client) throw new Error('WhatsApp client nao inicializado');
  return client;
}

export function isClientReady(): boolean {
  return isReady;
}

/** Último QR emitido pelo WhatsApp (null quando conectado ou ainda inicializando). */
export function getLatestQr(): string | null {
  return latestQr;
}

/** Destrói o cliente atual e inicializa do zero (força novo QR quando deslogado). */
export async function reinitWhatsApp(): Promise<void> {
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
    isReady = false;
    latestQr = null;
  }
  await initWhatsApp();
}

// ── Watchdog de sessão zumbi ────────────────────────────────────────────────
// A sessão do whatsapp-web.js pode entrar num estado em que isReady=true mas
// toda operação (getChat) falha no puppeteer. Contamos falhas consecutivas de
// getChat: passando do limite, marcamos offline e reconectamos automaticamente.
// MODO DIAGNÓSTICO: watchdog NÃO reconecta sozinho (evita churn durante a
// investigação). Só conta falhas para o log.
let consecutiveChatFailures = 0;

export function reportChatOk(): void {
  if (consecutiveChatFailures > 0) console.log(`[WATCHDOG] getChat OK (após ${consecutiveChatFailures} falhas)`);
  consecutiveChatFailures = 0;
}

export function reportChatFailure(): void {
  consecutiveChatFailures++;
}

// ── Logging de diagnóstico da inicialização ─────────────────────────────────
const t0 = Date.now();
function diag(msg: string): void {
  const s = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[INIT +${s}s] ${msg}`);
}
// Loga o erro COMPLETO (não só .message, que vem minificado como "r")
function diagErr(where: string, err: unknown): void {
  const e = err as any;
  console.error(`[INIT-ERRO] ${where}: name=${e?.name} message=${e?.message}`);
  if (e?.stack) console.error(`[INIT-ERRO] ${where} stack:\n${e.stack}`);
  try { console.error(`[INIT-ERRO] ${where} raw: ${JSON.stringify(e, Object.getOwnPropertyNames(e ?? {}))}`); } catch {}
}

export async function initWhatsApp(): Promise<Client> {
  diag('initWhatsApp() iniciado — matando chromes órfãos');
  killOrphanWhatsAppChrome();
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  diag('criando Client (LocalAuth + puppeteer)...');
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: CHROME_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  });

  // ── Instrumentação de TODOS os eventos do ciclo de vida ───────────────────
  client.on('loading_screen', (percent: any, message: any) => diag(`loading_screen ${percent}% ${message ?? ''}`));
  client.on('change_state', (state: any) => diag(`change_state → ${state}`));
  client.on('authenticated', () => { latestQr = null; diag('evento: authenticated'); });
  client.on('auth_failure', (m: any) => diagErr('auth_failure', m));
  client.on('disconnected', (reason: any) => { isReady = false; diag(`evento: disconnected — ${reason}`); });

  client.on('qr', (qr: string) => {
    latestQr = qr; // disponível no portal via GET /api/whatsapp/qr
    diag('evento: qr recebido (aguardando scan)');
    console.log('\nEscaneie o QR code abaixo com o WhatsApp (ou pelo portal):\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', async () => {
    isReady = true;
    latestQr = null;
    diag('evento: ready — WhatsApp conectado!');

    // Qual versão do WhatsApp Web carregou (chave para o erro "r")
    try {
      const wwv = await client!.getWWebVersion();
      diag(`WhatsApp Web version carregada: ${wwv}`);
    } catch (err) { diagErr('getWWebVersion', err); }

    try {
      diag(`Numero do bot: +${client!.info.wid.user}`);
    } catch (err) { diagErr('client.info.wid', err); }

    // Aguarda a sessão carregar completamente antes de listar grupos
    diag('aguardando 5s antes de getChats...');
    await new Promise(r => setTimeout(r, 5000));

    let groups: any[] = [];
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      diag(`getChats() tentativa ${tentativa}/3...`);
      let chats: any[] = [];
      try {
        chats = await client!.getChats();
        diag(`getChats() OK — ${chats.length} conversas retornadas`);
      } catch (err) {
        diagErr(`getChats tentativa ${tentativa}`, err);
        chats = [];
      }
      groups = chats.filter((c: any) => c.isGroup);
      if (groups.length > 0) break;
      if (tentativa < 3) {
        diag(`Grupos vazios (tentativa ${tentativa}/3), aguardando 5s...`);
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    if (groups.length === 0) {
      console.log('AVISO: Nenhum grupo encontrado. O numero do bot precisa estar nos grupos!');
    } else {
      console.log('\n=== GRUPOS QUE O BOT PARTICIPA ===');
      groups.forEach((g: any) => {
        const isSource = config.SOURCE_GROUP_IDS.includes(g.id._serialized);
        const isDest   = config.WHATSAPP_GROUP_IDS.includes(g.id._serialized);
        const tag = isSource ? '[FONTE]' : isDest ? '[DESTINO]' : '[outro]';
        console.log(`${tag} ${g.name} → ${g.id._serialized}`);
      });
      console.log('==================================\n');

      // Avisa se os grupos do .env não foram encontrados
      for (const id of config.SOURCE_GROUP_IDS) {
        if (!groups.find((g: any) => g.id._serialized === id)) {
          console.log(`AVISO: grupo FONTE ${id} não encontrado — o bot está nesse grupo?`);
        }
      }
      for (const id of config.WHATSAPP_GROUP_IDS) {
        if (!groups.find((g: any) => g.id._serialized === id)) {
          console.log(`AVISO: grupo DESTINO ${id} não encontrado — o bot está nesse grupo?`);
        }
      }
    }

    // ── AUTO-TESTE: isola onde o erro "r" acontece ────────────────────────
    const testId = config.SOURCE_GROUP_IDS[0];
    if (testId) {
      diag(`AUTO-TESTE: getChatById("${testId}")...`);
      try {
        const c = await client!.getChatById(testId);
        diag(`AUTO-TESTE getChatById OK: nome="${(c as any)?.name}" isGroup=${(c as any)?.isGroup}`);
      } catch (err) { diagErr('AUTO-TESTE getChatById', err); }

      diag('AUTO-TESTE: getState()...');
      try {
        const st = await client!.getState();
        diag(`AUTO-TESTE getState OK: ${st}`);
      } catch (err) { diagErr('AUTO-TESTE getState', err); }
    }
    diag('handler ready CONCLUÍDO');
  });

  const handleCommand = async (msg: Message) => {
    const body = msg.body?.trim();
    if (!body) return;

    if (body === '!ping') {
      await msg.reply('Pong! Bot funcionando ✓').catch(() => {});
      return;
    }

    if (body === '!status') {
      const lines = [
        `Numero: +${client!.info.wid.user}`,
        `Grupos destino: ${config.WHATSAPP_GROUP_IDS.join(', ') || 'nenhum'}`,
        `Grupos fonte: ${config.SOURCE_GROUP_IDS.join(', ') || 'nenhum'}`,
      ];
      await msg.reply(lines.join('\n')).catch(() => {});
      return;
    }

    if (body === '!id') {
      try {
        const chat = await msg.getChat();
        const id = chat.id._serialized;
        console.log(`[!id] ${chat.name} → ${id}`);
        await msg.reply(`ID: ${id}`);
      } catch (err) {
        console.error('[!id] erro:', (err as Error).message);
      }
      return;
    }

    if (body === '!grupos' || body === '!sources') {
      try {
        const chats = await client!.getChats();
        const groups = chats.filter((c: any) => c.isGroup);
        const list = groups.map((g: any) => `${g.name}: ${g.id._serialized}`).join('\n');
        await msg.reply(list || 'Nenhum grupo encontrado.');
      } catch (err) {
        console.error('[!grupos] erro:', (err as Error).message);
      }
      return;
    }
  };

  // Mensagens recebidas de OUTRAS pessoas
  client.on('message', async (msg: Message) => {
    const chat = await msg.getChat().catch(() => null);
    const groupId = (chat as any)?.id?._serialized ?? '';
    const isSourceGroup = config.SOURCE_GROUP_IDS.includes(groupId);

    console.log(`[MSG] grupo="${(chat as any)?.name ?? msg.from}" fonte=${isSourceGroup} corpo="${msg.body?.slice(0, 60)}"`);

    await handleCommand(msg);
    await handleSourceMessage(msg);
  });

  // Mensagens enviadas pelo próprio bot (para comandos no mesmo número)
  client.on('message_create', async (msg: Message) => {
    if (msg.fromMe) await handleCommand(msg);
  });

  await client.initialize();
  return client;
}
