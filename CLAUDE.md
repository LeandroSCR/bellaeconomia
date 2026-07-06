# BellaEconomia — Bot de WhatsApp para promoções com afiliados

Bot que monitora grupos fonte de WhatsApp, repassa promoções com links de afiliado
substituídos, e cria anúncios do zero a partir de templates custom. Portal web de
controle em `http://localhost:3000`.

---

## ⚠️ REGRAS CRÍTICAS — ler antes de qualquer alteração

### 1. Arquitetura de duas engines (estilo micro-services)

O bot tem **duas engines isoladas** que nunca devem se acoplar:

| Engine | O que faz | Onde vive | Status |
|---|---|---|---|
| **Forwarder** (repasse) | Lê grupos fonte e repassa promoções com link de afiliado trocado | `src/whatsapp/`, `src/scheduler/`, `src/deals/` | ✅ **VALIDADA — ZONA CONGELADA** |
| **Creator** (criação) | Cria anúncios do zero com templates custom | `src/engines/creator/` | Em evolução |

**Zona congelada (Forwarder):** os arquivos abaixo estão validados em produção.
Só altere se o usuário pedir explicitamente uma mudança NESSA engine:

- `src/whatsapp/sourceMonitor.ts` — fluxo de repasse em tempo real
- `src/whatsapp/sender.ts` — envio de deals da fila
- `src/whatsapp/forwarder.ts` — substituição de links por afiliados
- `src/whatsapp/formatter.ts` — formatação de deals de API
- `src/scheduler/queue.ts`, `src/scheduler/cron.ts` — fila e agendamento

**Regras de isolamento:**
- A engine **Creator** (`src/engines/creator/`) NUNCA importa arquivos da zona congelada.
  Ela só usa a infraestrutura compartilhada (ver abaixo).
- A engine **Forwarder** NUNCA importa nada de `src/engines/`. O que as duas precisam
  compartilhar vive em `src/shared/` (templates, extrator, padronizador).
- A única camada que conhece as duas é o composition root `src/index.ts` (rotas HTTP).

**Infraestrutura compartilhada** (pode ser usada pelas duas engines, mudanças aqui
exigem rodar TODOS os testes):
- `src/whatsapp/client.ts` — cliente WhatsApp (getClient, isClientReady)
- `src/database/index.ts` — SQLite async (markSent, wasRecentlySent, etc.)
- `src/config.ts` — variáveis de ambiente (zod)
- `src/metrics.ts` — atividade recente / erros
- `src/settings.ts` — configurações do portal
- `src/botState.ts` — liga/desliga persistente do bot

### 2. Verificação cruzada obrigatória

**Sempre que alterar uma engine, verifique que a outra não quebrou:**
1. `npm run build:bot` — compila as duas (erro de tipo pega acoplamento)
2. `npm test` — roda os testes de REGRESSÃO das duas engines
3. Se mexeu em infraestrutura compartilhada, teste as duas manualmente

### 3. Workflow para grandes alterações (OBRIGATÓRIO)

Após qualquer alteração significativa (nova feature, refactor, mudança de fluxo):

```
1. npm test                        # testes unitários passando
2. npm run build                   # bot + portal compilam
3. Atualizar este CLAUDE.md        # se a arquitetura/fluxo mudou
4. Atualizar o Dashboard           # toda feature nova DEVE aparecer no portal (ver regra 4)
5. git add -A && git commit        # mensagem descritiva do que mudou
6. git push origin main            # dispara a pipeline CI do GitHub
7. npx tsc && pm2 restart bellaeconomia && pm2 save   # aplicar em produção
```

A pipeline (`.github/workflows/ci.yml`) roda build + testes a cada push/PR na main.
**Nunca dê push com testes falhando.**

### 4. Regra do Dashboard

**Toda adição de funcionalidade deve se refletir no Dashboard do portal** (`portal/src/`):
- Nova engine ou serviço → card de saúde em `getEnginesHealth()` (`src/engines/health.ts`)
  + endpoint `/api/engines/health` + `EngineCard` no `App.tsx`
- Nova métrica → adicionar em `/api/stats` ou nos `details` da engine correspondente
- Nova ação → botão/aba no portal

O Dashboard mostra a saúde de cada engine separada por status
(`ok` = operacional, `degraded` = degradada, `down` = fora do ar).

### 5. Segurança

- **NUNCA** compartilhe o conteúdo do `.env` nem o suba para o GitHub (já está no
  `.gitignore`). As credenciais ficam apenas no PC do usuário.
- `data/`, `dist/`, `.wwebjs_auth/` também não vão para o git.

---

## Mapa de arquivos (referência para saber onde alterar)

### Engine Forwarder (repasse) — ZONA CONGELADA
| Arquivo | Responsabilidade |
|---|---|
| `src/whatsapp/client.ts` | Conexão WhatsApp (whatsapp-web.js + LocalAuth), QR code, comandos `!ping` `!status` `!id` `!grupos`, listeners de mensagem |
| `src/whatsapp/sourceMonitor.ts` | `handleSourceMessage()` — fluxo completo de repasse: filtros → dedup → taxa por grupo → cap → silêncio → substituição de link → envio |
| `src/whatsapp/forwarder.ts` | `replaceAffiliateLinks()` — troca links por afiliados (Amazon tag, Shopee, ML headless) |
| `src/whatsapp/sender.ts` | `sendDealToGroups()` — envia deals estruturados da fila (APIs) |
| `src/whatsapp/formatter.ts` | `formatDeal()` / `formatCoupon()` — formatação de deals de API |
| `src/scheduler/cron.ts` | `startScheduler()` — fetch de APIs a cada N min, flush da fila a cada 1 min, sugestões Shopee às 8h |
| `src/scheduler/queue.ts` | Fila em memória + `canSendNow()` (delay entre envios) |
| `src/deals/providers/*.ts` | Fetchers: pelando, promobit, amazon, mercadolivre, shopee |
| `src/deals/providers/mercadolivre-headless.ts` | Chrome headless p/ gerar link afiliado ML (sessão em `data/ml-session.json`; relogin: `npx tsx src/ml-login-manual.ts`) |

### Engine Creator (criação de anúncios)
| Arquivo | Responsabilidade |
|---|---|
| `src/engines/creator/types.ts` | `CreatorHealth` (+ re-exporta AdTemplate/AdInput da camada shared) |
| `src/engines/creator/publisher.ts` | `publishAd()` — renderiza + envia aos grupos destino; `previewAd()`; contadores de saúde |
| `src/engines/creator/index.ts` | API pública da engine (só importe daqui) |

### Camada compartilhada de templates e padronização (`src/shared/`)
Usada pelas DUAS engines — módulos puros ou de I/O local, sem tocar em WhatsApp:
| Arquivo | Responsabilidade |
|---|---|
| `src/shared/templates/types.ts` | `AdTemplate`, `AdInput` |
| `src/shared/templates/renderer.ts` | `renderTemplate()` — substitui placeholders, remove linhas com placeholder vazio (puro) |
| `src/shared/templates/store.ts` | CRUD de templates em `data/templates.json` (template "Padrão" auto-criado; nunca remove o último) |
| `src/shared/adExtractor.ts` | `extractAdInput()` — texto livre → dados estruturados (título, preços, cupom, loja). Retorna null se incerto |
| `src/shared/standardizer.ts` | `standardizeForward()` — extrai + renderiza no template padrão, **com fallback garantido** para o texto processado |

**Placeholders suportados:** `{titulo}` `{preco}` `{preco_original}` `{desconto}`
`{cupom}` `{loja}` `{link}` — linhas cujo placeholder ficar vazio são removidas.

### Curadoria de cupons (`src/curation/`)
Cupons detectados pelo forwarder (sem item fixo) NÃO são enviados automaticamente:
| Arquivo | Responsabilidade |
|---|---|
| `src/curation/publisher.ts` | `approveCurationItem()` envia item aprovado aos grupos destino; `rejectCurationItem()` |

Fluxo: forwarder detecta cupom (`isCouponAnnouncement`) → troca links por afiliados →
salva em `curation_items` (SQLite) com mídia em `data/media/` → aba **Curadoria** do
portal permite EDITAR o texto, aprovar (envia) ou rejeitar. Itens decididos são
limpos após 7 dias no boot (`cleanOldCurationItems`).

### Saúde / Dashboard
| Arquivo | Responsabilidade |
|---|---|
| `src/engines/health.ts` | `getEnginesHealth()` — agrega status das duas engines (read-only, não modifica nenhuma) |
| `portal/src/App.tsx` | Dashboard React: abas dashboard/shopee/fila, `EngineCard` de saúde |
| `portal/src/api.ts` | Cliente HTTP do portal (tipos + fetches) |
| `portal/src/App.css` | Estilos (dark theme, CSS vars em `index.css`) |

### Infra compartilhada
| Arquivo | Responsabilidade |
|---|---|
| `src/index.ts` | Composition root: Express + todas as rotas API + inicialização (`main()`) |
| `src/config.ts` | Env vars validadas com zod (grupos, caps, chaves de API) |
| `src/database/index.ts` | better-sqlite3 com wrapper async (`setImmediate`) — todas as funções retornam Promise |
| `src/settings.ts` | Configurações do portal (`data/portal-settings.json`) + `isCouponAnnouncement()` + `detectSourceFromText()` |
| `src/botState.ts` | Liga/desliga persistente (`data/bot-state.json`) |
| `src/metrics.ts` | Atividade recente em memória (últimas 100) |
| `src/calendar/specialDates.ts` | Datas especiais (cap maior de envios) |

### Rotas API (src/index.ts)
| Rota | Engine | O que faz |
|---|---|---|
| `GET /api/stats` | — | Estatísticas gerais do dashboard |
| `GET /api/engines/health` | ambas | Saúde por engine (dashboard) |
| `GET/PATCH /api/settings` | forwarder | Configurações do portal |
| `POST /api/bot/start` `/stop` | forwarder | Liga/pausa o repasse |
| `GET /api/activity` | — | Atividade recente |
| `GET /api/queue` · `DELETE /api/queue/:id` | forwarder | Fila de deals |
| `GET/POST/PUT/DELETE /api/creator/templates[/:id]` | creator | CRUD de templates custom |
| `POST /api/creator/preview` | creator | Renderiza sem enviar |
| `POST /api/creator/ads` | creator | Cria e publica anúncio nos grupos destino |
| `GET /api/curation` | curadoria | Lista cupons pendentes + contagens |
| `PATCH /api/curation/:id` | curadoria | Edita texto de item pendente |
| `POST /api/curation/:id/approve` | curadoria | Envia aos grupos e marca aprovado |
| `POST /api/curation/:id/reject` | curadoria | Rejeita (apaga mídia local) |
| `GET /api/curation/:id/image` | curadoria | Serve a imagem local do item |
| `/api/shopee/suggestions*` | forwarder | Aprovação de sugestões Shopee |
| `GET/PATCH /api/source-groups*` | forwarder | Grupos fonte + taxa de repasse |

### Fluxos principais

**Repasse em tempo real (Forwarder) — PRODUTOS:**
`client.ts on('message')` → `handleSourceMessage()` → bot ativo? → grupo fonte? →
tem URL/preço? → dedup texto (6h) → dedup URL produto (12h) → taxa do grupo →
cap diário → horário de silêncio → filtro loja/tipo → **é cupom? → desvia p/ curadoria** →
`canSendNow()` (se não: entra na fila) → `replaceAffiliateLinks()` →
**`standardizeForward()` se "Padronizar repasses" ativo (fallback: texto processado)** →
envia aos grupos destino → `markSent()`

**Repasse de CUPONS (curadoria manual):** cupom detectado → `replaceAffiliateLinks()` →
`saveCurationItem()` (com mídia local) → aba Curadoria do portal → usuário edita/aprova/rejeita →
aprovado = `approveCurationItem()` envia aos grupos → `markSent(type='curation')`

**Fila agendada (Forwarder):** cron 1/min → `flushQueue()` → `sendDealToGroups()`
(produtos de grupos fonte também são padronizados aqui quando o toggle está ativo)

**Criação de anúncio (Creator):** portal/API → `POST /api/creator/ads` →
`validateAdInput()` → `renderTemplate()` → envia aos grupos destino → contadores de saúde

**Template padrão:** o primeiro template de `data/templates.json` ("Padrão") é usado
tanto pela padronização de repasses quanto como default do Creator. Editável via
`PUT /api/creator/templates/:id`.

---

## Testes

```
npm test           # roda tudo (vitest)
npm run test:watch # watch mode
```

| Pasta | Cobre |
|---|---|
| `tests/forwarder/` | REGRESSÃO da engine validada: `formatter` (templates de deal/cupom) e `settings` (classificação cupom×produto — inclui o caso real THAUTEC com short links) |
| `tests/shared/` | Camada compartilhada: renderer (placeholders, desconto, remoção de linhas), templateStore (CRUD, persistência), adExtractor (extração de título/preços/cupom de mensagens reais) e standardizer (garantia de fallback) |

Regras:
- Teste novo acompanha feature nova.
- Se um teste de `tests/forwarder/` quebrar, você quebrou a engine validada — **reverta ou corrija antes de qualquer push**.
- Os testes usam apenas funções puras/arquivo temporário — não precisam de WhatsApp nem banco.

## Comandos

```
npm run dev          # desenvolvimento (tsx watch)
npm run build        # compila bot (tsc) + portal (vite)
npm run build:bot    # só o bot
npm test             # testes unitários
pm2 restart bellaeconomia && pm2 save   # aplicar mudanças em produção
pm2 logs bellaeconomia --lines 50 --nostream  # ver logs
npx tsx src/ml-login-manual.ts          # renovar sessão ML (abre Chrome headful)
```

## Produção / Boot

- Processo roda no **PM2** (`bellaeconomia`), logs em `C:\Users\leand\.pm2\logs\`.
- Inicia com o PC via **Task Scheduler** (tarefa "BellaEconomia Bot") → `start-bot.bat`.
- **Armadilhas do Task Scheduler já diagnosticadas (NÃO regredir):**
  - `timeout` falha em sessão não interativa → usar `ping -n 21 127.0.0.1` como delay.
  - O contexto da tarefa **não enxerga `C:\Users\...\AppData\Roaming\npm`**
    (node dá `MODULE_NOT_FOUND` num caminho que existe) → por isso o pm2 é
    **devDependency local** do projeto e o .bat usa caminhos absolutos:
    `"C:\Program Files\nodejs\node.exe" node_modules\pm2\bin\pm2 resurrect`.
  - O .bat loga cada passo em `boot-log.txt` (sobrescrito a cada boot) — é o
    primeiro lugar para olhar se o portal não subir com o PC.
  - Se o resurrect não trouxer o processo, o .bat faz `pm2 start dist\index.js` de fallback.
- Sempre rodar `pm2 save` após mudar o processo (o resurrect restaura do `dump.pm2`).
- Estado do bot (ligado/pausado) persiste em `data/bot-state.json` — sobrevive a restart.
- Grupos fonte/destino configurados no `.env` (`SOURCE_GROUP_IDS`, `WHATSAPP_GROUP_IDS`).

## Limitações conhecidas

- THAUTEC posta links `meli.la` que resolvem para página de perfil (`/social/thautec`) —
  impossível identificar produto único; são descartados corretamente.
- Amazon PA-API em standby (requer 30 vendas qualificadas) — chaves ausentes no `.env` é intencional.
- Sessão ML expira periodicamente (reCAPTCHA) — renovar com `npx tsx src/ml-login-manual.ts`.
