# BellaEconomia — Setup e Documentação

Bot de WhatsApp para captação, re-afiliação e reenvio automático de promoções em grupos.

---

## Visão Geral

O bot tem duas fontes de promoções:

1. **Grupos fonte (WhatsApp):** Monitora grupos configurados, substitui links por links afiliados próprios e repassa para os grupos destino — incluindo a imagem original da mensagem.
2. **APIs externas (fila):** Busca promoções a cada hora em Pelando, Promobit, ML e Amazon. As promoções ficam em fila e são enviadas respeitando o delay configurado no portal.
3. **Shopee (aprovação manual):** Sugestões da API Shopee com comissão ≥ 10% aparecem numa aba dedicada do portal para você aprovar antes de entrar na fila.

---

## Pré-requisitos

- **Node.js 20+**
- **Google Chrome** em `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Número de WhatsApp dedicado ao bot (não pode ser o seu número pessoal)
- Contas nos programas de afiliado desejados (cada um é opcional individualmente)

---

## Estrutura de Arquivos

```
bellaeconomia/
├── src/
│   ├── index.ts                        # Entrada: Express + WhatsApp + Scheduler + API REST
│   ├── config.ts                       # Leitura e validação do .env
│   ├── botState.ts                     # Flag global para ligar/pausar o bot via portal
│   ├── metrics.ts                      # Log de atividade em memória (enviados, erros, filtrados)
│   ├── settings.ts                     # Configurações do portal (lojas, tipos, limites, delay)
│   ├── calendar/
│   │   └── specialDates.ts             # Datas especiais (Black Friday, etc.) → cap maior
│   ├── database/
│   │   └── index.ts                    # SQLite — deals, sent_messages, shopee_suggestions
│   ├── deals/
│   │   ├── types.ts                    # Interface Deal e Coupon
│   │   └── providers/
│   │       ├── pelando.ts              # Busca promoções Pelando (GraphQL + fallback HTML)
│   │       ├── promobit.ts             # Busca promoções Promobit (API + fallback HTML)
│   │       ├── mercadolivre.ts         # Busca promoções ML via API oficial (standby)
│   │       ├── mercadolivre-headless.ts # Gera link afiliado ML via Puppeteer/Chrome
│   │       ├── amazon.ts               # Busca promoções Amazon via PA-API (standby)
│   │       └── shopee.ts               # API Shopee: sugestões diárias + link afiliado
│   ├── scheduler/
│   │   ├── cron.ts                     # Cron de busca (1h) e envio (1min)
│   │   └── queue.ts                    # Fila em memória com delay e filtro por loja
│   └── whatsapp/
│       ├── client.ts                   # Inicialização, sessão e comandos (!ping, !id…)
│       ├── sender.ts                   # Envia deals da fila com imagem via MessageMedia.fromUrl
│       ├── formatter.ts                # Formata mensagem de promoção (padrão e Shopee)
│       ├── forwarder.ts                # Re-afiliaçao de links (Amazon, Shopee, ML)
│       └── sourceMonitor.ts            # Monitor de grupos fonte: dedup + filtros + repasse
├── portal/
│   └── src/
│       ├── App.tsx                     # Painel de controle React (Dashboard + Aba Shopee)
│       ├── api.ts                      # Funções fetch para a API do bot
│       └── App.css                     # Estilos do portal
├── data/
│   ├── bellaeconomia.db                   # SQLite (criado automaticamente)
│   ├── portal-settings.json            # Configurações salvas do portal
│   └── ml-session.json                 # Cookies da sessão ML (criado automaticamente)
├── .wwebjs_auth/                       # Sessão WhatsApp local (criado automaticamente)
├── start-bot.bat                       # Build + start para Windows
├── start-bot-silent.vbs                # Executa o .bat sem janela CMD
├── register-startup.ps1                # Registra autostart no Task Scheduler
├── .env                                # Credenciais — NUNCA subir para o Git
├── .gitignore
└── package.json
```

---

## Configuração Inicial

### 1. Instalar dependências

```
npm install
```

### 2. Criar o arquivo `.env`

Crie o arquivo `.env` na raiz do projeto. **Nunca compartilhe este arquivo nem o suba para o GitHub — ele já está no `.gitignore`.**

```env
# === WhatsApp ===
# IDs dos grupos onde o bot POSTA promoções (vírgula para múltiplos)
WHATSAPP_GROUP_IDS=120363XXXXXXXXXXXX@g.us

# IDs dos grupos que o bot MONITORA para re-afiliação
SOURCE_GROUP_IDS=120363XXXXXXXXXXXX@g.us

# === Scheduler ===
FETCH_INTERVAL_MIN=60       # Intervalo entre buscas nas APIs externas (minutos)
DAILY_MSG_CAP=100           # Limite diário de mensagens (hard cap)
SPECIAL_DAY_MSG_CAP=25      # Limite em datas especiais (Black Friday, etc.)
QUIET_HOUR_START=0          # Início do horário de silêncio (0–23)
QUIET_HOUR_END=6            # Fim do horário de silêncio (0–23)

# === Servidor ===
PORT=3000

# === Mercado Livre Afiliados ===
ML_AFFILIATE_EMAIL=seu@email.com
ML_AFFILIATE_PASSWORD=suasenha

# === Amazon Associados ===
AMAZON_PARTNER_TAG=seutag-20
AMAZON_ACCESS_KEY=AKIA...       # Só para busca via PA-API (standby)
AMAZON_SECRET_KEY=...

# === Shopee Afiliados ===
SHOPEE_APP_ID=18332661070
SHOPEE_SECRET=              # Obtenha em affiliate.shopee.com.br → Meu API
SHOPEE_AFFILIATE_ID=18332661070
```

> **Delay entre envios:** configurado no portal (aba Dashboard), não mais no `.env`. A fila verifica a cada minuto se o delay já passou.

**Como descobrir o ID de um grupo:** adicione o número do bot ao grupo e envie `!id` — o bot responde com o ID no formato `120363...@g.us`.

### 3. Compilar o TypeScript

```
npm run build
```

### 4. Iniciar o bot

```
npm start
```

Na primeira execução, um QR Code aparece no terminal. Escaneie com o WhatsApp do **número do bot** (não o seu pessoal).

---

## Portal de Controle

Acesse em **http://localhost:3000** enquanto o bot estiver rodando.

### Aba Dashboard

| Recurso | Descrição |
|---------|-----------|
| **Ligar / Pausar Bot** | Botão no header — pausa o processamento sem derrubar o servidor |
| **Enviados hoje / Limite** | Contador em tempo real com o cap efetivo do dia |
| **Lojas** | Ativa/desativa promoções por loja (Amazon, Shopee, ML, Pelando, Promobit) |
| **Tipo de conteúdo** | Filtra por Produto ou Cupom puro |
| **Máx. anúncios/dia** | Limita quantas promoções o bot envia por dia |
| **Delay entre envios** | Intervalo mínimo em minutos entre dois envios consecutivos |
| **Atividade recente** | Log em tempo real: envios, bloqueios, filtros, erros |

### Aba Shopee

Exibe produtos sugeridos pela API da Shopee com **comissão ≥ 10%**, ordenados por volume de vendas.

| Recurso | Descrição |
|---------|-----------|
| **Buscar 50 novos** | Chama a API Shopee agora e atualiza a lista de sugestões pendentes |
| **Aprovar** | Adiciona o produto à fila de envio imediatamente |
| **Rejeitar** | Descarta o produto (não reaparece até o próximo refresh) |
| **Badges** | Mostra contagem de pendentes / aprovados / rejeitados |

Cada card exibe: imagem, título, preço original e atual, % de desconto, comissão, avaliação, vendas e nome da loja.

> A busca automática acontece todo dia às 8h. O botão "Buscar 50 novos" permite atualizar manualmente a qualquer momento.

### Classificação de tipos (Produto vs. Cupom)

- **Produto:** mensagem com URL de produto e/ou preço específico (mesmo que tenha código de desconto embutido)
- **Cupom puro:** mensagem que promove apenas um código de desconto, sem produto, sem link, sem preço

---

## Fluxo da Fila (APIs externas)

```
fetchAll() [a cada 60min]
   └── Pelando + Promobit + Amazon + ML → enqueue()
           └── saveDeal() → DB (INSERT OR IGNORE)
                   └── se novo → queue[] em memória

flushQueue() [a cada 1min]
   └── canSendNow()? (delay configurado no portal)
       └── queue vazia? → getUnsentDeals() do banco (só lojas habilitadas)
           └── sendDealToGroups() → WhatsApp
```

**Aprovação Shopee:**
```
Portal "Buscar 50 novos" / cron 8h
   └── fetchShopeeSuggestions() → shopee_suggestions (pending)

Portal "Aprovar"
   └── updateShopeeSuggestionStatus(approved)
   └── enqueue([deal]) → queue[] em memória → enviado no próximo flush
```

---

## Afiliados

### Mercado Livre

**Método:** Headless Chrome navegando em `mercadolivre.com.br/afiliados/linkbuilder`.

- Requer `ML_AFFILIATE_EMAIL` e `ML_AFFILIATE_PASSWORD` no `.env`
- Na primeira execução faz login automático e salva a sessão em `data/ml-session.json`
- Gera links no formato `meli.la/XXXXX`
- URLs `/social/` (campanhas ML) usam Puppeteer para resolver o produto antes de gerar o link
- Produtos Apple e similares retornam `⚠️ Este URL não é permitido` — o bot descarta automaticamente

**Se o login automático falhar (CAPTCHA ou 2FA):**
```
npx tsx src/ml-login-manual.ts
```
Abre o Chrome para você completar o login manualmente. O bot salva os cookies depois.

---

### Amazon

**Método:** Substituição do parâmetro `?tag=` na URL — sem necessidade de PA-API.

- Requer apenas `AMAZON_PARTNER_TAG` no `.env`
- Resolve short links `amzn.to` e `link.amazon` antes de substituir
- Remove todos os parâmetros de tracking; mantém só `?tag=seutag-20`
- A PA-API (`AMAZON_ACCESS_KEY` + `AMAZON_SECRET_KEY`) só é usada para **buscar promoções via scheduler** (standby — requer aprovação de 30 vendas qualificadas)

---

### Shopee

**Método:** GraphQL na Open API da Shopee Affiliates.

- Requer `SHOPEE_APP_ID` e `SHOPEE_SECRET` no `.env`
- **Autenticação:** `SHA256(AppId + Timestamp + RequestBody + Secret)`
- **Re-afiliação** (grupos fonte): mutation `generateShortLink` → verifica tag `mmp_pid=an_{AppId}` no redirect
- **Sugestões** (aba portal): query `productOfferV2(limit: 50)` → filtra comissão ≥ 10% → ordena por vendas
- Links da fila de aprovação já vêm afiliados — não passam pelo `replaceAffiliateLinks`

**Como obter o `SHOPEE_SECRET`:**
1. Acesse `https://affiliate.shopee.com.br`
2. Vá em **Meu API**
3. Copie o **AppId** e a **Senha** (= secret)

---

## Envio de Imagens

| Pipeline | Origem da imagem |
|---|---|
| **Grupos fonte** | `msg.downloadMedia()` — baixa a mídia original da mensagem WhatsApp |
| **APIs** (Pelando, Amazon, Shopee…) | `MessageMedia.fromUrl(deal.imageUrl)` — baixa da URL retornada pela API |

O bot **nunca usa `msg.forward()`** — ele repassaria os links de afiliado de quem postou. Sempre reenvia com texto próprio + imagem baixada. Se o download falhar, envia o texto sem imagem.

---

## Deduplicação de Promoções

### 1. Dedup por texto (hash do corpo completo)

- MD5 do **corpo inteiro** da mensagem
- Bloqueia reenvio durante **6 horas** (evita spam pós-restart sem bloquear a mesma promoção no dia seguinte)

### 2. Dedup por URL de produto específico

Só para URLs que identificam um produto único pelo ID no path:

| Loja | Pattern |
|------|---------|
| Amazon | `/dp/B0XXXXXXXXXX` ou `/gp/product/...` |
| Shopee | `-i.shopId.itemId` ou `/product/shopId/itemId` |
| Mercado Livre | `MLB123456`, `_JM`, `/p/MLB...` |

Short links (`amzn.to`, `s.shopee.com.br`, `meli.la`) **não** entram no dedup por URL — cada share gera link único.

Janela de bloqueio por URL: **12 horas**.

### Anti-spam ao reconectar

Mensagens recebidas **antes** do bot iniciar são ignoradas silenciosamente (evita processar o backlog acumulado offline).

---

## WhatsApp — Sessão e Re-validação

A sessão é salva em `.wwebjs_auth/session/` pelo `LocalAuth`. **Não precisa escanear o QR code após reiniciar o PC.**

O QR code reaparece apenas quando:
1. A sessão foi invalidada (logout no celular, sessão expirada)
2. A pasta `.wwebjs_auth/` foi deletada
3. Troca de número ou reinstalação do WhatsApp

---

## Autostart no Windows

| Arquivo | Função |
|---------|--------|
| `start-bot.bat` | Compila e inicia o bot; redireciona saída para `logs/bot.log` |
| `start-bot-silent.vbs` | Roda o `.bat` via `wscript.exe` sem abrir janela CMD |
| `register-startup.ps1` | Registra a tarefa no Task Scheduler do Windows |

### Registrar o autostart (rode uma vez como Administrador)

```powershell
Set-ExecutionPolicy Bypass -Scope Process -Force
.\register-startup.ps1
```

### Comandos úteis de manutenção

```powershell
# Ver se o bot está rodando
Get-Process node -ErrorAction SilentlyContinue

# Checar status via API
Invoke-WebRequest http://localhost:3000/api/stats | Select-Object -ExpandProperty Content

# Ler os últimos logs
Get-Content logs\bot.log -Tail 50 -Wait

# Parar o bot manualmente
Get-Process node | Stop-Process -Force

# Remover do autostart
Unregister-ScheduledTask -TaskName "BellaEconomia Bot" -Confirm:$false
```

---

## API do Bot

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/stats` | Status: WhatsApp, botEnabled, enviados hoje, fila, cap |
| `GET` | `/api/settings` | Configurações atuais do portal |
| `PATCH` | `/api/settings` | Atualiza configurações (lojas, tipos, maxDailyAds, delayMinutes) |
| `GET` | `/api/activity` | Últimas 30 atividades registradas |
| `POST` | `/api/bot/start` | Liga o bot |
| `POST` | `/api/bot/stop` | Pausa o bot (mantém servidor no ar) |
| `GET` | `/api/groups` | Lista grupos com papéis (fonte/destino) |
| `GET` | `/api/shopee/suggestions` | Lista sugestões Shopee com contagem por status |
| `POST` | `/api/shopee/suggestions/refresh` | Busca 50 novos produtos na API Shopee agora |
| `POST` | `/api/shopee/suggestions/:id/approve` | Aprova sugestão e enfileira para envio |
| `POST` | `/api/shopee/suggestions/:id/reject` | Rejeita sugestão |
| `GET` | `/health` | Health check simples |

---

## Comandos do Bot (no WhatsApp)

| Comando | Descrição |
|---------|-----------|
| `!ping` | Verifica se o bot está online |
| `!status` | Mostra número e grupos configurados |
| `!id` | Retorna o ID do grupo atual |
| `!grupos` | Lista todos os grupos que o bot participa |

---

## Desenvolvimento

```bash
# Modo dev com hot-reload
npm run dev

# Compilar para produção
npm run build

# Iniciar
npm start

# Testar re-afiliação Amazon
npx tsx src/test-amazon.ts

# Testar re-afiliação Shopee
npx tsx src/test-shopee.ts

# Testar comissão via API Shopee
npx tsx src/test-shopee-commission.ts

# Testar geração de link ML
npx tsx src/test-ml.ts

# Login manual ML (se o automático falhar)
npx tsx src/ml-login-manual.ts
```

---

## Segurança

- O arquivo `.env` contém todas as credenciais — **nunca compartilhe nem o suba para o Git**
- O `.env` já está no `.gitignore`
- Os cookies de sessão ML (`data/ml-session.json`) e a sessão WhatsApp (`.wwebjs_auth/`) também são arquivos sensíveis — não compartilhe
- O `SHOPEE_SECRET` é equivalente a uma senha — não exiba em logs
