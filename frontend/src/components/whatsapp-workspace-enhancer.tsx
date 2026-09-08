import {
  BookOpen, Facebook, Hash, Instagram, MessageCircle, MessageSquareText, MoreVertical,
  RefreshCw, SendHorizontal, Terminal, Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import { getWidgetLocale } from '@/lib/widget-localization';
import type { Agent, Conversation, DeploymentChannel, WhatsAppConnection } from '@/types';

type PreviewMode = 'test' | 'live';
type PreviewMessage = { id: string; role: 'user' | 'assistant'; content: string };
type Labels = { test: string; live: string; connected: string; notConnected: string; thinking: string; noAnswer: string; failed: string };

const channelNames: Record<DeploymentChannel, string> = {
  website: 'Website', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook Messenger', slack: 'Slack',
  teams: 'Microsoft Teams', api: 'Developer API', notion: 'Notion', zapier: 'Zapier',
};
const liveConversationChannel: Partial<Record<DeploymentChannel, Conversation['channel']>> = {
  website: 'widget', whatsapp: 'whatsapp', slack: 'slack', api: 'api',
};
const labels: Record<string, Labels> = {
  English: { test: 'Test', live: 'Live', connected: 'connected', notConnected: 'not connected', thinking: 'Thinking…', noAnswer: 'No answer was returned.', failed: 'Could not reach this agent.' },
  Hindi: { test: 'परीक्षण', live: 'लाइव', connected: 'कनेक्टेड', notConnected: 'कनेक्ट नहीं है', thinking: 'सोच रहा है…', noAnswer: 'कोई जवाब नहीं मिला।', failed: 'इस एजेंट से संपर्क नहीं हो सका।' },
  Spanish: { test: 'Prueba', live: 'En vivo', connected: 'conectado', notConnected: 'no conectado', thinking: 'Pensando…', noAnswer: 'No se recibió ninguna respuesta.', failed: 'No se pudo contactar con este agente.' },
  French: { test: 'Test', live: 'En direct', connected: 'connecté', notConnected: 'non connecté', thinking: 'Réflexion…', noAnswer: 'Aucune réponse reçue.', failed: 'Impossible de joindre cet agent.' },
  German: { test: 'Test', live: 'Live', connected: 'verbunden', notConnected: 'nicht verbunden', thinking: 'Denkt nach…', noAnswer: 'Keine Antwort erhalten.', failed: 'Dieser Agent konnte nicht erreicht werden.' },
  Arabic: { test: 'اختبار', live: 'مباشر', connected: 'متصل', notConnected: 'غير متصل', thinking: 'جارٍ التفكير…', noAnswer: 'لم يتم إرجاع إجابة.', failed: 'تعذر الوصول إلى هذا الوكيل.' },
};

const cacheKey = (agentId: string) => `northstar-preview-channel:${agentId}`;
const isChannel = (value: string): value is DeploymentChannel => value in channelNames;
function routeAgentId() {
  const match = window.location.pathname.match(/^\/agents\/([^/]+)\/(?:instructions|knowledge|settings|embeddings)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
function deployAgentId() {
  return document.querySelector<HTMLSelectElement>('select[aria-label="Select deploy agent"]')?.value ?? null;
}
function rememberedChannel(agentId: string | null): DeploymentChannel | null {
  if (!agentId) return null;
  try { const value = localStorage.getItem(cacheKey(agentId)); return value && isChannel(value) ? value : null; } catch { return null; }
}
function rememberChannel(agentId: string, channel: DeploymentChannel) {
  try { localStorage.setItem(cacheKey(agentId), channel); } catch { /* ignore storage errors */ }
}
function channelFromTarget(target: HTMLElement | null): DeploymentChannel | null {
  if (!target) return null;
  if (target.classList.contains('whatsapp-template')) return 'whatsapp';
  if (target.classList.contains('instagram-template')) return 'instagram';
  if (target.classList.contains('messenger-template')) return 'facebook';
  for (const channel of ['slack', 'teams', 'api', 'notion', 'zapier'] as const) if (target.classList.contains(`generic-channel-template--${channel}`)) return channel;
  return null;
}
function newestConversation(items: Conversation[], agentId: string, channel: DeploymentChannel) {
  const liveChannel = liveConversationChannel[channel];
  if (!liveChannel) return null;
  return items.filter((item) => item.agentId === agentId && item.channel === liveChannel)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0] ?? null;
}
function ChannelIcon({ channel }: { channel: DeploymentChannel }) {
  const Icon = channel === 'whatsapp' ? MessageCircle : channel === 'instagram' ? Instagram : channel === 'facebook' ? Facebook
    : channel === 'slack' ? Hash : channel === 'teams' ? MessageSquareText : channel === 'api' ? Terminal
      : channel === 'notion' ? BookOpen : channel === 'zapier' ? Workflow : MessageCircle;
  return <Icon />;
}
async function persistChannel(agentId: string, channel: DeploymentChannel) {
  try {
    const agent = await api.agents.get(agentId);
    if ((agent.appearance.deploymentChannel ?? 'website') !== channel) {
      await api.agents.update(agentId, { appearance: { ...agent.appearance, deploymentChannel: channel } });
    }
  } catch { /* preview still changes immediately; persistence can retry */ }
}

export function WhatsAppWorkspaceEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [channel, setChannel] = useState<DeploymentChannel | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>('.builder-workspace .agent-template-preview .channel-frame')
        ?? document.querySelector<HTMLElement>('.deploy-preview .channel-frame');
      const nextAgent = nextTarget ? (routeAgentId() ?? deployAgentId()) : null;
      setTarget(nextTarget);
      setAgentId(nextAgent);
      setChannel(rememberedChannel(nextAgent) ?? channelFromTarget(nextTarget));
      setLanguage(document.querySelector<HTMLSelectElement>('.builder-editor select#language')?.value
        ?? document.querySelector<HTMLSelectElement>('select#ui-language')?.value
        ?? null);
    };
    const onChange = (event: Event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      if (event.target.id === 'language' || event.target.id === 'ui-language') {
        setLanguage(event.target.value);
        queueMicrotask(sync);
        return;
      }
      if (event.target.getAttribute('aria-label') === 'Select deployment channel') {
        const nextAgent = deployAgentId();
        const nextChannel = event.target.value;
        if (!nextAgent || !isChannel(nextChannel)) return;
        rememberChannel(nextAgent, nextChannel);
        setAgentId(nextAgent);
        setChannel(nextChannel);
        void persistChannel(nextAgent, nextChannel);
        queueMicrotask(sync);
      }
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    document.addEventListener('change', onChange, true);
    window.addEventListener('popstate', sync);
    return () => { observer.disconnect(); document.removeEventListener('change', onChange, true); window.removeEventListener('popstate', sync); };
  }, []);

  useEffect(() => {
    if (!target || !channel) return;
    const previous = target.style.position;
    target.style.position = 'relative';
    const toolbar = target.closest('.agent-template-preview')?.querySelector<HTMLElement>('.preview-toolbar span')
      ?? target.closest('.deploy-preview')?.querySelector<HTMLElement>('.preview-heading span');
    const oldText = toolbar?.textContent ?? '';
    if (toolbar) toolbar.textContent = `${channelNames[channel]} preview`;
    return () => { target.style.position = previous; if (toolbar && oldText) toolbar.textContent = oldText; };
  }, [target, channel]);

  if (!target || !agentId || !channel) return null;
  return createPortal(<InteractiveChannelWorkspace agentId={agentId} channel={channel} language={language ?? undefined} />, target);
}

export function InteractiveChannelWorkspace({ agentId, channel, language }: { agentId: string; channel: DeploymentChannel; language?: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [mode, setMode] = useState<PreviewMode>('test');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [conversationId, setConversationId] = useState<string>();
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [connected, setConnected] = useState(false);
  const [liveConversation, setLiveConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const activeLanguage = language ?? agent?.appearance.interfaceLanguage ?? agent?.language ?? 'English';
  const locale = getWidgetLocale(activeLanguage);
  const copy = labels[activeLanguage] ?? labels.English!;
  const appearance = agent ? {
    ...agent.appearance,
    interfaceLanguage: activeLanguage,
    textDirection: activeLanguage === 'Arabic' ? 'rtl' as const : 'ltr' as const,
    welcomeTitle: locale.welcomeTitle,
    welcomeMessage: locale.welcomeMessage,
    placeholder: locale.placeholder,
    suggestedQuestions: [...locale.suggestedQuestions],
    translations: { ...locale.translations },
  } : null;

  useEffect(() => {
    let active = true;
    void api.agents.get(agentId).then((item) => { if (active) setAgent(item); }).catch(() => { if (active) setError(copy.failed); });
    return () => { active = false; };
  }, [agentId, copy.failed]);
  useEffect(() => {
    abortRef.current?.abort();
    setDraft(''); setSending(false); setConversationId(undefined); setConnection(null); setConnected(false); setLiveConversation(null); setError('');
    setMessages([{ id: 'welcome', role: 'assistant', content: locale.welcomeMessage }]);
  }, [agentId, channel, activeLanguage, locale.welcomeMessage]);
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    const load = async () => {
      try {
        const conversationsPromise = api.conversations.list();
        if (channel === 'whatsapp') {
          const [status, conversations] = await Promise.all([api.integrations.whatsapp.status(), conversationsPromise]);
          if (!active) return;
          const connections = status.connections?.length ? status.connections : status.connection ? [status.connection] : [];
          const selected = connections.find((item) => item.agentId === agentId) ?? null;
          setConnection(selected); setConnected(selected?.status.toLowerCase() === 'connected');
          setLiveConversation(newestConversation(conversations.items, agentId, channel));
        } else {
          const [integrations, conversations] = await Promise.all([api.integrations.list(), conversationsPromise]);
          if (!active) return;
          setConnection(null); setConnected(Boolean(integrations.find((item) => item.id === channel)?.connected));
          setLiveConversation(newestConversation(conversations.items, agentId, channel));
        }
        setError('');
      } catch { if (active) setError(copy.failed); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [agentId, channel, copy.failed, mode, refresh]);

  const sendTest = async (text: string) => {
    const userId = `preview-user-${Date.now()}`;
    const assistantId = `preview-assistant-${Date.now()}`;
    setMessages((current) => [...current, { id: userId, role: 'user', content: text }, { id: assistantId, role: 'assistant', content: '' }]);
    setSending(true); setError('');
    const controller = new AbortController(); abortRef.current?.abort(); abortRef.current = controller;
    let answer = '';
    try {
      const stream = api.streamChat as unknown as (input: { agentId: string; message: string; conversationId?: string; visitorId?: string; language?: string }, signal?: AbortSignal) => AsyncGenerator<{ type: string; conversationId?: string; content?: string; message?: string }>;
      for await (const event of stream({ agentId, message: text, conversationId, visitorId: `workspace-${channel}-preview`, language: activeLanguage }, controller.signal)) {
        if (event.type === 'start' && event.conversationId) setConversationId(event.conversationId);
        if (event.type === 'user_translation' && event.content?.trim()) setMessages((current) => current.map((item) => item.id === userId ? { ...item, content: event.content!.trim() } : item));
        if (event.type === 'token') { answer += event.content ?? ''; setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: answer } : item)); }
        if (event.type === 'error') throw new Error(event.message ?? copy.failed);
      }
      if (!answer.trim()) setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: copy.noAnswer } : item));
    } catch (reason) {
      if (!controller.signal.aborted) { const message = reason instanceof Error ? reason.message : copy.failed; setError(message); setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: message } : item)); }
    } finally { if (abortRef.current === controller) abortRef.current = null; setSending(false); }
  };
  const sendLive = async (text: string) => {
    if (!liveConversation) return;
    setSending(true); setError('');
    try { await api.conversations.reply(liveConversation.id, text); const conversations = await api.conversations.list(); setLiveConversation(newestConversation(conversations.items, agentId, channel)); }
    catch { setError(copy.failed); } finally { setSending(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); const text = draft.trim(); if (!text || sending) return; setDraft(''); if (mode === 'test') void sendTest(text); else void sendLive(text); };

  const visibleMessages: PreviewMessage[] = mode === 'test' ? messages : (liveConversation?.messages ?? []).filter((item) => item.role !== 'system').map((item) => ({ id: item.id, role: item.role === 'user' ? 'user' : 'assistant', content: item.content }));
  const hasLiveRoute = Boolean(liveConversationChannel[channel]);
  const liveDisabled = mode === 'live' && (!connected || !liveConversation || !hasLiveRoute);
  const status = mode === 'test' ? `${copy.test} · ${activeLanguage}` : connected ? `${channel === 'whatsapp' && connection?.displayPhoneNumber ? `${connection.displayPhoneNumber} · ` : ''}${copy.connected}` : copy.notConnected;
  const background = channel === 'whatsapp' ? '#efeae2' : channel === 'facebook' ? '#f7f9ff' : '#fff';

  return <div dir={appearance?.textDirection ?? 'ltr'} data-channel-preview={channel} style={{ position: 'absolute', inset: 0, zIndex: 8, background, borderRadius: 'inherit', overflow: 'hidden' }}>
    <form className="channel-conversation" onSubmit={submit} style={{ width: '100%', height: '100%' }}>
      <header><span style={{ background: appearance?.primaryColor ?? '#146cf6' }}>{agent?.avatar ?? 'N'}</span><div><strong>{agent?.name ?? 'Northstar agent'}</strong><small>{channelNames[channel]} · {status}</small></div><div className="device-toggle" aria-label="Channel preview mode" style={{ flex: '0 0 auto' }}><button type="button" className={mode === 'test' ? 'is-active' : ''} onClick={() => setMode('test')}>{copy.test}</button><button type="button" className={mode === 'live' ? 'is-active' : ''} onClick={() => setMode('live')}>{copy.live}</button></div><span aria-hidden="true"><ChannelIcon channel={channel} /></span><MoreVertical /></header>
      <main className={channel === 'whatsapp' ? 'whatsapp-wallpaper' : undefined}><time>{locale.today}</time>{mode === 'live' && !connected && !error ? <div className="channel-bubble channel-bubble--in">{channelNames[channel]} · {copy.notConnected}</div> : null}{mode === 'live' && connected && !liveConversation ? <div className="channel-bubble channel-bubble--in">{hasLiveRoute ? copy.connected : `${copy.test} ready`}</div> : null}{visibleMessages.map((message) => <div key={message.id} className={`channel-bubble ${message.role === 'user' ? 'channel-bubble--out' : 'channel-bubble--in'}`}>{message.content || (sending ? copy.thinking : '')}</div>)}{error ? <div className="channel-bubble channel-bubble--in">{error}</div> : null}</main>
      <footer><button type="button" aria-label="Refresh" onClick={() => mode === 'live' ? setRefresh((value) => value + 1) : setMessages([{ id: 'welcome', role: 'assistant', content: locale.welcomeMessage }])}><RefreshCw /></button><span><input aria-label={mode === 'test' ? 'Test channel message' : 'Live channel reply'} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={liveDisabled ? copy.notConnected : appearance?.placeholder ?? locale.placeholder} disabled={sending || liveDisabled || !agent} style={{ width: '100%', border: 0, outline: 0, background: 'transparent' }} /></span><button type="submit" aria-label={mode === 'test' ? 'Send test message' : 'Send live reply'} disabled={!draft.trim() || sending || liveDisabled || !agent}><SendHorizontal /></button></footer>
    </form>
  </div>;
}

export function InteractiveWhatsAppWorkspace({ agentId }: { agentId: string }) {
  return <InteractiveChannelWorkspace agentId={agentId} channel="whatsapp" />;
}
