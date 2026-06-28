import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { handleSourceMessage } from './sourceMonitor';
import { config } from '../config';

let client: Client | null = null;
let isReady = false;

export function getClient(): Client {
  if (!client) throw new Error('WhatsApp client nao inicializado');
  return client;
}

export function isClientReady(): boolean {
  return isReady;
}

export async function initWhatsApp(): Promise<Client> {
  const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

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

  client.on('qr', (qr: string) => {
    console.log('\nEscaneie o QR code abaixo com o WhatsApp:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', async () => {
    isReady = true;
    console.log('\nWhatsApp conectado!');

    try {
      console.log(`Numero do bot: +${client!.info.wid.user}`);
    } catch {}

    // Aguarda a sessão carregar completamente antes de listar grupos
    await new Promise(r => setTimeout(r, 5000));

    let groups: any[] = [];
    for (let tentativa = 1; tentativa <= 3; tentativa++) {
      const chats = await client!.getChats().catch(() => []);
      groups = chats.filter((c: any) => c.isGroup);
      if (groups.length > 0) break;
      if (tentativa < 3) {
        console.log(`Grupos vazios (tentativa ${tentativa}/3), aguardando...`);
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
  });

  client.on('authenticated', () => console.log('WhatsApp autenticado'));
  client.on('auth_failure', (msg: string) => console.error('Falha na autenticacao:', msg));
  client.on('disconnected', (reason: string) => {
    isReady = false;
    console.warn('WhatsApp desconectado:', reason);
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
