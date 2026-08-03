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
      `powershell -NoProfile -WindowStyle Hidden -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*wwebjs_auth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
      { stdio: 'ignore', timeout: 15000, windowsHide: true } // windowsHide: sem janela CMD/PowerShell piscando
    );
  } catch { /* melhor tentar iniciar mesmo assim */ }
}

let client: Client | null = null;
let isReady = false;
let latestQr: string | null = null;
let initializing = false; // trava: impede dois initWhatsApp concorrentes (retry + watchdog)

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
  if (initializing) { console.log('[WHATSAPP] init já em andamento — ignorando reinit'); return; }
  if (client) {
    try { await client.destroy(); } catch {}
    client = null;
    isReady = false;
    latestQr = null;
  }
  await initWhatsApp();
}

// ── Watchdog de AUTO-RECUPERAÇÃO ────────────────────────────────────────────
// A página do WhatsApp Web pode travar (isReady=true mas getChat/envio dão
// timeout `Runtime.callFunctionOn timed out`). Quando as operações degradam,
// reiniciamos o cliente SOZINHO — reusa a sessão salva (LocalAuth), então
// reconecta sem QR se a sessão for válida. É o que mantém o bot rodando sem
// intervenção manual.
let opFailures = 0;
let readyAt = 0;
let lastReinit = 0;
let recovering = false;
const FAILURE_LIMIT = 10;            // falhas após estabilizar → reinicia
const GRACE_MS = 90_000;            // ignora falhas nos 90s após conectar (backlog)
const REINIT_COOLDOWN_MS = 180_000; // no máx 1 reinício automático a cada 3min

export function markReadyNow(): void {
  readyAt = Date.now();
  opFailures = 0;
}

export function reportChatOk(): void {
  opFailures = 0;
}

export function reportChatFailure(): void {
  // Ignora falhas na janela de estabilização (WhatsApp reenvia backlog ao conectar)
  if (readyAt === 0 || Date.now() - readyAt < GRACE_MS) return;
  opFailures++;
  if (opFailures < FAILURE_LIMIT || recovering) return;
  if (Date.now() - lastReinit < REINIT_COOLDOWN_MS) return; // evita churn

  recovering = true;
  lastReinit = Date.now();
  isReady = false; // portal mostra offline enquanto recupera
  console.error(`[WATCHDOG] ${opFailures} falhas de operação após estabilizar — sessão travada, reiniciando cliente automaticamente...`);
  reinitWhatsApp()
    .then(() => console.log('[WATCHDOG] cliente reiniciado com sucesso'))
    .catch(err => console.error('[WATCHDOG] falha ao reiniciar:', (err as Error).message))
    .finally(() => { recovering = false; opFailures = 0; });
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
  initializing = true;
  diag('initWhatsApp() iniciado — matando chromes órfãos');
  killOrphanWhatsAppChrome();
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  diag('criando Client (LocalAuth + puppeteer)...');
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: CHROME_PATH,
      // Timeout de protocolo maior: envios com mídia grande podem demorar; o
      // watchdog cuida de travamentos reais (não deixa preso pra sempre).
      protocolTimeout: 120_000,
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
    markReadyNow(); // inicia a janela de estabilização do watchdog
    diag('evento: ready — WhatsApp conectado!');

    // Qual versão do WhatsApp Web carregou (chave para o erro "r")
    try {
      const wwv = await client!.getWWebVersion();
      diag(`WhatsApp Web version carregada: ${wwv}`);
    } catch (err) { diagErr('getWWebVersion', err); }

    try {
      diag(`Numero do bot: +${client!.info.wid.user}`);
    } catch (err) { diagErr('client.info.wid', err); }

    // Listagem de grupos é só informativa. NÃO bloqueia nem sobrecarrega:
    // 1 tentativa, best-effort. O repasse não depende disso (usa msg.from).
    diag('conectado — listagem de grupos é opcional, seguindo sem bloquear');
    client!.getChats()
      .then((chats: any[]) => {
        const groups = chats.filter((c: any) => c.isGroup);
        diag(`getChats() OK — ${groups.length} grupos`);
        for (const id of config.SOURCE_GROUP_IDS) {
          if (!groups.find((g: any) => g.id._serialized === id)) {
            console.log(`AVISO: grupo FONTE ${id} não encontrado na lista (pode estar apenas lento)`);
          }
        }
      })
      .catch((err: any) => diag(`getChats() falhou (não crítico — repasse usa msg.from): ${err?.message?.slice(0, 40)}`));

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

  // Mensagens recebidas de OUTRAS pessoas.
  // NÃO chamamos getChat aqui (era 1 getChat por mensagem, sobrecarregando a
  // página). msg.from de grupo já é o id; o log usa ele direto. handleCommand e
  // handleSourceMessage fazem seus próprios filtros baratos antes de qualquer getChat.
  client.on('message', async (msg: Message) => {
    const isSourceGroup = config.SOURCE_GROUP_IDS.includes(msg.from);
    if (isSourceGroup) {
      console.log(`[MSG-FONTE] ${msg.from} corpo="${msg.body?.slice(0, 60)}"`);
    }
    try {
      await handleCommand(msg);
      await handleSourceMessage(msg);
    } catch (err) {
      // Nunca deixa erro de processamento virar unhandledRejection
      console.error('[MSG] erro ao processar:', (err as Error).message?.slice(0, 60));
    }
  });

  // Mensagens enviadas pelo próprio bot (para comandos no mesmo número)
  client.on('message_create', async (msg: Message) => {
    if (msg.fromMe) await handleCommand(msg);
  });

  try {
    await client.initialize();
  } finally {
    initializing = false; // libera a trava (sucesso ou falha)
  }
  return client;
}
