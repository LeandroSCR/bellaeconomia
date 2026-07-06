import { useState, useEffect, useCallback } from 'react';
import {
  fetchStats, fetchSettings, fetchActivity, patchSettings, setBotState, formatUptime, formatTime,
  fetchShopeeSuggestions, refreshShopeeSuggestions, approveShopeeSuggestion, rejectShopeeSuggestion,
  fetchQueue, deleteQueueItem, fetchEnginesHealth,
  fetchCuration, updateCurationItemText, approveCuration, rejectCuration, curationImageUrl,
  fetchWhatsAppQr, reconnectWhatsApp,
} from './api';
import type {
  Stats, Settings, Activity, ShopeeSuggestion, ShopeeSuggestionsResponse, QueueItem,
  EngineHealth, CurationItem, WhatsAppQr,
} from './api';
import './App.css';

type TabId = 'dashboard' | 'shopee' | 'queue' | 'curation';

const STORE_LABELS: Record<string, string> = {
  amazon: '🛒 Amazon',
  shopee: '🟠 Shopee',
  mercadolivre: '🟡 Mercado Livre',
  pelando: '🔥 Pelando',
  promobit: '💥 Promobit',
};

const SOURCE_LABELS: Record<string, string> = {
  amazon: 'Amazon',
  shopee: 'Shopee',
  mercadolivre: 'ML',
  pelando: 'Pelando',
  promobit: 'Promobit',
  source_forward: 'Forward',
  deal: 'Agendado',
};

const ACTIVITY_COLORS: Record<string, string> = {
  sent: '#3fb950',
  discarded: '#8b949e',
  filtered: '#e3b341',
  error: '#f85149',
};

const ACTIVITY_ICONS: Record<string, string> = {
  sent: '✅',
  discarded: '🗑️',
  filtered: '🚫',
  error: '❌',
};

export default function App() {
  const [tab, setTab] = useState<TabId>('dashboard');
  const [stats, setStats] = useState<Stats | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [engines, setEngines] = useState<EngineHealth[]>([]);
  const [curationPending, setCurationPending] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, cfg, act, eng, cur] = await Promise.all([
        fetchStats(), fetchSettings(), fetchActivity(), fetchEnginesHealth(), fetchCuration(),
      ]);
      setStats(s);
      setSettings(cfg);
      setActivity(act);
      setEngines(eng);
      setCurationPending(cur.counts.pending ?? 0);
      setLastUpdate(new Date());
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleStore = async (key: string) => {
    if (!settings) return;
    const next = { ...settings, stores: { ...settings.stores, [key]: !settings.stores[key] } };
    setSettings(next);
    await patchSettings({ stores: next.stores });
  };

  const toggleType = async (key: 'product' | 'coupon') => {
    if (!settings) return;
    const next = { ...settings, types: { ...settings.types, [key]: !settings.types[key] } };
    setSettings(next);
    await patchSettings({ types: next.types });
  };

  const updateNumber = async (key: 'maxDailyAds' | 'delayMinutes', value: number) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    await patchSettings({ [key]: value });
  };

  const updateHour = async (key: 'quietHourStart' | 'quietHourEnd', value: number) => {
    if (!settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    await patchSettings({ [key]: value });
  };

  const isOnline = stats?.whatsappStatus === 'online';
  const botEnabled = stats?.botEnabled ?? true;

  const toggleBot = async () => {
    await setBotState(!botEnabled);
    await load();
  };

  return (
    <div className="layout">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <span className="logo">🤖 BellaEconomia</span>
          <span
            className={`status-badge ${isOnline ? 'online' : 'offline clickable'}`}
            onClick={() => { if (!isOnline) setQrOpen(true); }}
            title={isOnline ? undefined : 'Clique para conectar via QR code'}
          >
            <span className="status-dot" />
            {isOnline ? 'WhatsApp Online' : 'WhatsApp Offline — conectar'}
          </span>
        </div>
        <div className="header-right">
          {lastUpdate && (
            <span className="last-update">
              Atualizado {lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {stats && (
            <span className="uptime-badge">⏱ {formatUptime(stats.uptimeMs)}</span>
          )}
          <button
            className={`bot-toggle-btn ${botEnabled ? 'running' : 'stopped'}`}
            onClick={toggleBot}
          >
            {botEnabled ? '⏸ Pausar Bot' : '▶ Ligar Bot'}
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <div className="tab-bar">
        <button className={`tab-btn ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          📊 Dashboard
        </button>
        <button className={`tab-btn ${tab === 'shopee' ? 'active' : ''}`} onClick={() => setTab('shopee')}>
          🟠 Shopee
        </button>
        <button className={`tab-btn ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
          ⏳ Fila {stats && stats.queueSize > 0 ? `(${stats.queueSize})` : ''}
        </button>
        <button className={`tab-btn ${tab === 'curation' ? 'active' : ''}`} onClick={() => setTab('curation')}>
          🏷️ Curadoria {curationPending > 0 ? `(${curationPending})` : ''}
        </button>
      </div>

      {tab === 'shopee' && <ShopeeTab />}
      {tab === 'queue' && <QueueTab />}
      {tab === 'curation' && <CurationTab onChanged={load} />}

      {qrOpen && <QrModal onClose={() => { setQrOpen(false); load(); }} />}

      <main className="main" style={{ display: tab === 'dashboard' ? undefined : 'none' }}>
        {/* Saúde das Engines */}
        {engines.length > 0 && (
          <section className="engines-grid">
            {engines.map(engine => <EngineCard key={engine.id} engine={engine} />)}
          </section>
        )}

        {/* Stats */}
        <section className="stats-grid">
          <StatCard
            label="Enviados hoje"
            value={stats ? `${stats.sentToday} / ${stats.dailyLimit}` : '—'}
            sub={stats?.dailyLimitReached ? 'Limite atingido' : stats ? `${stats.dailyLimit - stats.sentToday} restantes` : ''}
            accent={stats?.dailyLimitReached ? 'red' : 'green'}
            icon="📨"
          />
          <StatCard
            label="Total enviados"
            value={stats?.sentTotal ?? '—'}
            sub="desde o início"
            icon="📊"
          />
          <StatCard
            label="Erros hoje"
            value={stats?.errorsToday ?? '—'}
            accent={(stats?.errorsToday ?? 0) > 0 ? 'red' : 'default'}
            icon="⚠️"
          />
          <StatCard
            label="Fila pendente"
            value={stats?.queueSize ?? '—'}
            sub="deals aguardando"
            accent={(stats?.queueSize ?? 0) > 0 ? 'blue' : 'default'}
            icon="⏳"
            onClick={() => setTab('queue')}
          />
        </section>

        <div className="two-col">
          {/* Filtros */}
          <div className="panel">
            <div className="panel-section">
              <h2 className="section-title">Lojas</h2>
              <p className="section-desc">Selecione quais marketplaces encaminhar</p>
              <div className="filter-list">
                {settings && Object.entries(STORE_LABELS).map(([key, label]) => (
                  <FilterRow
                    key={key}
                    label={label}
                    checked={settings.stores[key] ?? true}
                    onChange={() => toggleStore(key)}
                  />
                ))}
              </div>
            </div>

            <div className="divider" />

            <div className="panel-section">
              <h2 className="section-title">Tipo de conteúdo</h2>
              <p className="section-desc">Filtre por produto ou cupom</p>
              <div className="filter-list">
                <FilterRow
                  label="📦 Produtos"
                  checked={settings?.types.product ?? true}
                  onChange={() => toggleType('product')}
                />
                <FilterRow
                  label="🏷️ Cupons"
                  checked={settings?.types.coupon ?? true}
                  onChange={() => toggleType('coupon')}
                />
              </div>
              <p className="section-desc" style={{ marginTop: 10 }}>
                Cupons não são enviados direto — vão para a aba Curadoria para aprovação manual.
              </p>
            </div>

            <div className="divider" />

            <div className="panel-section">
              <h2 className="section-title">Padronização do canal</h2>
              <p className="section-desc">Reescreve repasses de produto no template padrão do canal</p>
              <div className="filter-list">
                <FilterRow
                  label="✨ Padronizar repasses"
                  checked={settings?.standardizeForwards ?? true}
                  onChange={async () => {
                    if (!settings) return;
                    const next = { ...settings, standardizeForwards: !settings.standardizeForwards };
                    setSettings(next);
                    await patchSettings({ standardizeForwards: next.standardizeForwards });
                  }}
                />
              </div>
            </div>

            <div className="divider" />

            <div className="panel-section">
              <h2 className="section-title">Configurações de envio</h2>
              <p className="section-desc">Limites e intervalo da fila</p>
              <div className="number-settings">
                <NumberSetting
                  label="Máx. anúncios por dia"
                  icon="📅"
                  value={settings?.maxDailyAds ?? 20}
                  min={1}
                  max={1000}
                  onChange={v => updateNumber('maxDailyAds', v)}
                />
                <NumberSetting
                  label="Delay entre envios (min)"
                  icon="⏱"
                  value={settings?.delayMinutes ?? 1}
                  min={0}
                  max={120}
                  onChange={v => updateNumber('delayMinutes', v)}
                />
              </div>
            </div>

            <div className="divider" />

            <div className="panel-section">
              <h2 className="section-title">Horário de funcionamento</h2>
              <p className="section-desc">Bot não envia promoções durante o silêncio</p>
              <div className="number-settings">
                <TimeSetting
                  label="Ativa a partir das"
                  icon="🌅"
                  value={settings?.quietHourEnd ?? 8}
                  onChange={v => updateHour('quietHourEnd', v)}
                />
                <TimeSetting
                  label="Silêncio a partir das"
                  icon="🌙"
                  value={settings?.quietHourStart ?? 22}
                  onChange={v => updateHour('quietHourStart', v)}
                />
              </div>
              {settings && settings.quietHourStart !== settings.quietHourEnd && (
                <p className="quiet-hours-preview">
                  Silêncio das {String(settings.quietHourStart).padStart(2,'0')}h às {String(settings.quietHourEnd).padStart(2,'0')}h
                </p>
              )}
              {settings && settings.quietHourStart === settings.quietHourEnd && (
                <p className="quiet-hours-preview quiet-hours-off">Sem silêncio — bot ativo 24h</p>
              )}
            </div>

            {/* Por fonte hoje */}
            {stats && Object.keys(stats.sentBySource).length > 0 && (
              <>
                <div className="divider" />
                <div className="panel-section">
                  <h2 className="section-title">Enviados hoje por origem</h2>
                  <div className="source-bars">
                    {Object.entries(stats.sentBySource)
                      .sort((a, b) => b[1] - a[1])
                      .map(([src, count]) => (
                        <div key={src} className="source-row">
                          <span className="source-name">{SOURCE_LABELS[src] ?? src}</span>
                          <div className="bar-wrap">
                            <div
                              className="bar"
                              style={{ width: `${Math.min(100, (count / (stats.sentToday || 1)) * 100)}%` }}
                            />
                          </div>
                          <span className="source-count">{count}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Atividade */}
          <div className="panel">
            <div className="panel-section">
              <h2 className="section-title">Atividade recente</h2>
              <p className="section-desc">Últimas 30 ações do bot</p>
            </div>
            <div className="activity-list">
              {activity.length === 0 && (
                <div className="empty-state">Nenhuma atividade registrada ainda</div>
              )}
              {activity.map((a, i) => (
                <div key={i} className="activity-item">
                  <span className="activity-icon">{ACTIVITY_ICONS[a.type]}</span>
                  <div className="activity-body">
                    <span className="activity-msg" style={{ color: ACTIVITY_COLORS[a.type] }}>
                      {a.message}
                    </span>
                    <div className="activity-tags">
                      {a.source && <span className="activity-source">{SOURCE_LABELS[a.source] ?? a.source}</span>}
                      {a.group && <span className="activity-group" title={a.group}>📢 {a.group}</span>}
                    </div>
                  </div>
                  <span className="activity-time">{formatTime(a.ts)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Modal de QR do WhatsApp ─────────────────────────────────────────────────

function QrModal({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<WhatsAppQr | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const poll = useCallback(async () => {
    try { setData(await fetchWhatsAppQr()); } catch {}
  }, []);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 4000);
    return () => clearInterval(interval);
  }, [poll]);

  const handleReconnect = async () => {
    setReconnecting(true);
    try { await reconnectWhatsApp(); } catch {}
    // A reinicialização demora — o polling pega o QR quando ele sair
    setTimeout(() => setReconnecting(false), 8000);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Conectar WhatsApp</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {data?.status === 'online' && (
          <div className="qr-state">
            <div className="qr-success">✅ WhatsApp conectado!</div>
            <button className="s-approve" onClick={onClose}>Fechar</button>
          </div>
        )}

        {data?.status === 'waiting_qr' && data.qr && (
          <div className="qr-state">
            <img src={data.qr} alt="QR code do WhatsApp" className="qr-img" />
            <ol className="qr-steps">
              <li>Abra o WhatsApp no celular do bot</li>
              <li>Toque em <b>⋮ &gt; Dispositivos conectados</b></li>
              <li>Toque em <b>Conectar dispositivo</b> e escaneie</li>
            </ol>
            <p className="qr-hint">O QR se renova sozinho — mantenha esta janela aberta.</p>
          </div>
        )}

        {data?.status === 'connecting' && (
          <div className="qr-state">
            <div className="qr-waiting">⏳ Inicializando o WhatsApp...</div>
            <p className="qr-hint">
              Se a sessão salva ainda for válida, conecta sozinho sem QR.
              Se ficar preso aqui, force uma reconexão para gerar o QR.
            </p>
            <button className="curation-save" onClick={handleReconnect} disabled={reconnecting}>
              {reconnecting ? '⏳ Reiniciando...' : '🔄 Forçar reconexão / novo QR'}
            </button>
          </div>
        )}

        {!data && <div className="qr-state"><div className="qr-waiting">Carregando...</div></div>}
      </div>
    </div>
  );
}

// ── Saúde das Engines ───────────────────────────────────────────────────────

const ENGINE_STATUS_LABELS: Record<string, string> = {
  ok: 'Operacional',
  degraded: 'Degradada',
  down: 'Fora do ar',
};

const ENGINE_ICONS: Record<string, string> = {
  forwarder: '📡',
  creator: '🛠️',
};

const ENGINE_DETAIL_LABELS: Record<string, string> = {
  whatsappOnline: 'WhatsApp',
  botEnabled: 'Bot ativo',
  enviadosHoje: 'Enviados hoje',
  limiteAtingido: 'Limite atingido',
  errosRecentes: 'Erros recentes',
  errosHoje: 'Erros hoje',
  filaPendente: 'Fila',
  ultimoEnvio: 'Último envio',
  templates: 'Templates',
  anunciosHoje: 'Anúncios hoje',
  ultimoAnuncio: 'Último anúncio',
  ultimoErro: 'Último erro',
};

function formatEngineDetail(key: string, value: string | number | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if ((key === 'ultimoEnvio' || key === 'ultimoAnuncio') && typeof value === 'number') {
    return formatTime(value);
  }
  return String(value);
}

function EngineCard({ engine }: { engine: EngineHealth }) {
  return (
    <div className={`engine-card engine-${engine.status}`}>
      <div className="engine-header">
        <span className="engine-icon">{ENGINE_ICONS[engine.id] ?? '⚙️'}</span>
        <span className="engine-name">{engine.name}</span>
        <span className={`engine-status-badge engine-badge-${engine.status}`}>
          <span className="status-dot" />
          {ENGINE_STATUS_LABELS[engine.status] ?? engine.status}
        </span>
      </div>
      <div className="engine-details">
        {Object.entries(engine.details).map(([key, value]) => (
          <div key={key} className="engine-detail">
            <span className="engine-detail-label">{ENGINE_DETAIL_LABELS[key] ?? key}</span>
            <span className="engine-detail-value" title={String(value ?? '')}>
              {formatEngineDetail(key, value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, accent = 'default', icon, onClick }: {
  label: string; value: number | string; sub?: string; accent?: 'green' | 'red' | 'blue' | 'default'; icon: string; onClick?: () => void;
}) {
  return (
    <div className={`stat-card accent-${accent}${onClick ? ' stat-card-clickable' : ''}`} onClick={onClick}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

function FilterRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="filter-row">
      <span className="filter-label">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        className={`toggle ${checked ? 'on' : 'off'}`}
        onClick={onChange}
      >
        <span className="toggle-thumb" />
      </button>
    </label>
  );
}

// ── Aba Fila ──────────────────────────────────────────────────────────────

function QueueTab() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchQueue();
      setItems(data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleDelete = async (id: string) => {
    await deleteQueueItem(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="shopee-tab">
      <div className="shopee-toolbar">
        <div className="shopee-counts">
          <span className="sc-badge sc-pending">{items.length} na fila</span>
        </div>
        <button className="refresh-btn" onClick={load}>🔄 Atualizar</button>
      </div>

      {loading && <div className="empty-state">Carregando fila...</div>}

      {!loading && items.length === 0 && (
        <div className="empty-state">Fila vazia — nenhuma promoção aguardando envio.</div>
      )}

      <div className="queue-list">
        {items.map(item => (
          <QueueCard key={item.id} item={item} onDelete={handleDelete} />
        ))}
      </div>
    </div>
  );
}

function QueueCard({ item, onDelete }: { item: QueueItem; onDelete: (id: string) => void }) {
  const ago = Math.round((Date.now() - item.createdAt) / 60000);
  const preview = item.rawText
    ? item.rawText.split('\n').slice(0, 3).join(' ').slice(0, 120)
    : item.title;

  return (
    <div className="queue-card">
      {item.imageUrl && !item.imageUrl.startsWith('local:') && (
        <img src={item.imageUrl} alt="" className="suggestion-img" />
      )}
      {(!item.imageUrl || item.imageUrl.startsWith('local:')) && (
        <div className="suggestion-img-placeholder">
          {item.imageUrl?.startsWith('local:') ? '🖼️' : '📦'}
        </div>
      )}
      <div className="suggestion-body">
        <div className="suggestion-title" title={item.title}>{item.title}</div>
        <div className="queue-preview">{preview}</div>
        <div className="suggestion-meta-row">
          <span className="activity-source">{SOURCE_LABELS[item.source] ?? item.source}</span>
          <span className="s-meta">⏱ há {ago < 1 ? '<1' : ago}min</span>
          {item.price > 0 && <span className="s-price">R$ {item.price.toFixed(2)}</span>}
        </div>
      </div>
      <div className="suggestion-actions">
        <button className="s-reject" onClick={() => onDelete(item.id)}>✕ Remover</button>
      </div>
    </div>
  );
}

// ── Aba Curadoria (cupons aguardando aprovação) ────────────────────────────

function CurationTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<CurationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await fetchCuration();
      setItems(data.items.filter(i => i.status === 'pending'));
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const handleApprove = async (id: string) => {
    const result = await approveCuration(id);
    if (result.ok) {
      setItems(prev => prev.filter(i => i.id !== id));
      onChanged();
    } else {
      alert(`Falha ao enviar: ${result.errors?.join(', ') ?? 'erro desconhecido'}`);
    }
  };

  const handleReject = async (id: string) => {
    await rejectCuration(id);
    setItems(prev => prev.filter(i => i.id !== id));
    onChanged();
  };

  return (
    <div className="shopee-tab">
      <div className="shopee-toolbar">
        <div className="shopee-counts">
          <span className="sc-badge sc-pending">{items.length} cupons aguardando</span>
        </div>
        <button className="refresh-btn" onClick={load}>🔄 Atualizar</button>
      </div>

      {loading && <div className="empty-state">Carregando curadoria...</div>}

      {!loading && items.length === 0 && (
        <div className="empty-state">
          Nenhum cupom aguardando aprovação. Cupons detectados nos grupos fonte
          aparecem aqui com os links já trocados pelos seus links de afiliado.
        </div>
      )}

      <div className="curation-list">
        {items.map(item => (
          <CurationCard key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} />
        ))}
      </div>
    </div>
  );
}

function CurationCard({ item, onApprove, onReject }: {
  item: CurationItem;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const [text, setText] = useState(item.processedText);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const edited = text !== item.processedText;
  const ago = Math.round((Date.now() - item.createdAt) / 60000);

  const handleSave = async () => {
    setSaving(true);
    try { await updateCurationItemText(item.id, text); item.processedText = text; }
    finally { setSaving(false); }
  };

  const handleApprove = async () => {
    setSending(true);
    try {
      if (edited) await handleSave();
      await onApprove(item.id);
    } finally { setSending(false); }
  };

  return (
    <div className="curation-card">
      <div className="curation-main">
        {item.hasImage && (
          <img src={curationImageUrl(item.id)} alt="" className="curation-img" />
        )}
        <div className="curation-body">
          <div className="suggestion-meta-row">
            <span className="activity-source">{SOURCE_LABELS[item.source ?? ''] ?? item.source ?? 'cupom'}</span>
            {item.groupName && <span className="activity-group">📢 {item.groupName}</span>}
            <span className="s-meta">⏱ há {ago < 1 ? '<1' : ago}min</span>
          </div>
          <textarea
            className="curation-editor"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={Math.min(12, Math.max(4, text.split('\n').length + 1))}
            spellCheck={false}
          />
        </div>
      </div>
      <div className="curation-actions">
        {edited && (
          <button className="curation-save" onClick={handleSave} disabled={saving}>
            {saving ? '💾 Salvando...' : '💾 Salvar edição'}
          </button>
        )}
        <button className="s-approve" onClick={handleApprove} disabled={sending}>
          {sending ? '⏳ Enviando...' : '✓ Aprovar e enviar'}
        </button>
        <button className="s-reject" onClick={() => onReject(item.id)} disabled={sending}>
          ✗ Rejeitar
        </button>
      </div>
    </div>
  );
}

// ── Aba Shopee ────────────────────────────────────────────────────────────

function ShopeeTab() {
  const [data, setData] = useState<ShopeeSuggestionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetchShopeeSuggestions();
      setData(res);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refreshShopeeSuggestions(); await load(); } finally { setRefreshing(false); }
  };

  const handleApprove = async (id: number) => {
    await approveShopeeSuggestion(id);
    setData(prev => prev ? {
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, status: 'approved' as const } : i),
      counts: { ...prev.counts, pending: (prev.counts.pending ?? 1) - 1, approved: (prev.counts.approved ?? 0) + 1 },
    } : prev);
  };

  const handleReject = async (id: number) => {
    await rejectShopeeSuggestion(id);
    setData(prev => prev ? {
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, status: 'rejected' as const } : i),
      counts: { ...prev.counts, pending: (prev.counts.pending ?? 1) - 1, rejected: (prev.counts.rejected ?? 0) + 1 },
    } : prev);
  };

  const pending = data?.items.filter(i => i.status === 'pending') ?? [];

  return (
    <div className="shopee-tab">
      <div className="shopee-toolbar">
        <div className="shopee-counts">
          <span className="sc-badge sc-pending">{data?.counts.pending ?? 0} pendentes</span>
          <span className="sc-badge sc-approved">{data?.counts.approved ?? 0} aprovados</span>
          <span className="sc-badge sc-rejected">{data?.counts.rejected ?? 0} rejeitados</span>
        </div>
        <button className="refresh-btn" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? '⏳ Buscando...' : '🔄 Buscar 50 novos'}
        </button>
      </div>

      {loading && <div className="empty-state">Carregando sugestões...</div>}

      {!loading && pending.length === 0 && (
        <div className="empty-state">
          Nenhum produto pendente. Clique em "Buscar 50 novos" para carregar sugestões com comissão ≥ 10%.
        </div>
      )}

      <div className="suggestion-list">
        {pending.map(item => (
          <SuggestionCard key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} />
        ))}
      </div>
    </div>
  );
}

function SuggestionCard({
  item, onApprove, onReject,
}: { item: ShopeeSuggestion; onApprove: (id: number) => void; onReject: (id: number) => void }) {
  const commPct = Math.round(item.commissionRate * 100);
  const commValue = (item.price * item.commissionRate).toFixed(2);

  return (
    <div className="suggestion-card">
      {item.imageUrl
        ? <img src={item.imageUrl} alt="" className="suggestion-img" />
        : <div className="suggestion-img-placeholder">📦</div>
      }
      <div className="suggestion-body">
        <div className="suggestion-title" title={item.title}>{item.title}</div>

        <div className="suggestion-price-row">
          {item.originalPrice && item.originalPrice > item.price ? (
            <>
              <span className="s-original">R$ {item.originalPrice.toFixed(2)}</span>
              <span className="s-price">R$ {item.price.toFixed(2)}</span>
              <span className="s-discount">-{item.discount}%</span>
            </>
          ) : (
            <span className="s-price">R$ {item.price.toFixed(2)}</span>
          )}
        </div>

        <div className="suggestion-meta-row">
          <span className="s-commission">💰 {commPct}% · ~R$ {commValue}</span>
          {item.ratingStar && <span className="s-meta">⭐ {item.ratingStar}</span>}
          {item.sales != null && <span className="s-meta">{item.sales.toLocaleString('pt-BR')} vendas</span>}
        </div>

        <div className="suggestion-shop">🛒 {item.shopName}</div>
      </div>

      <div className="suggestion-actions">
        <button className="s-approve" onClick={() => onApprove(item.id)}>✓ Aprovar</button>
        <button className="s-reject" onClick={() => onReject(item.id)}>✗ Rejeitar</button>
      </div>
    </div>
  );
}

function NumberSetting({ label, icon, value, min, max, onChange }: {
  label: string; icon: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  const handleChange = (delta: number) => {
    const next = Math.max(min, Math.min(max, value + delta));
    if (next !== value) onChange(next);
  };
  return (
    <div className="number-setting">
      <span className="number-setting-icon">{icon}</span>
      <span className="number-setting-label">{label}</span>
      <div className="number-control">
        <button className="num-btn" onClick={() => handleChange(-1)}>−</button>
        <input
          className="num-input"
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const v = parseInt(e.target.value, 10);
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
          }}
        />
        <button className="num-btn" onClick={() => handleChange(1)}>+</button>
      </div>
    </div>
  );
}

function TimeSetting({ label, icon, value, onChange }: {
  label: string; icon: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="number-setting">
      <span className="number-setting-icon">{icon}</span>
      <span className="number-setting-label">{label}</span>
      <select
        className="time-select"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
      >
        {Array.from({ length: 48 }, (_, i) => {
          const v = i * 0.5;
          const h = Math.floor(v);
          const m = v % 1 ? '30' : '00';
          return <option key={v} value={v}>{String(h).padStart(2, '0')}:{m}</option>;
        })}
      </select>
    </div>
  );
}
