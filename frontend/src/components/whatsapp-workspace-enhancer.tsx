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

type WorkspaceLabels = {
  test: string;
  live: string;
  testMode: string;
  connected: string;
  notConnected: string;
  waitingForConversation: string;
  noLiveRouting: string;
  thinking: string;
  noAnswer: string;
  sendFailed: string;
  refresh: string;
};

const labelsByLanguage: Record<string, WorkspaceLabels> = {
  English: {
    test: 'Test', live: 'Live', testMode: 'Test mode · chat with this AI agent', connected: 'connected', notConnected: 'not connected',
    waitingForConversation: 'Connected. Send a real message on this channel and it will appear here automatically.',
    noLiveRouting: 'No live conversation has arrived for this channel yet. Test mode is ready now.',
    thinking: 'Thinking…', noAnswer: 'No answer was returned. Try again.', sendFailed: 'Could not reach this agent.', refresh: 'Refresh',
  },
  Hindi: {
    test: 'परीक्षण', live: 'लाइव', testMode: 'परीक्षण मोड · इस एआई एजेंट से चैट करें', connected: 'कनेक्टेड', notConnected: 'कनेक्ट नहीं है',
    waitingForConversation: 'कनेक्टेड है। इस चैनल पर वास्तविक संदेश भेजें, वह यहाँ अपने-आप दिखाई देगा।',
    noLiveRouting: 'इस चैनल पर अभी कोई लाइव बातचीत नहीं आई है। परीक्षण मोड अभी तैयार है।',
    thinking: 'सोच रहा है…', noAnswer: 'कोई जवाब नहीं मिला। फिर से कोशिश करें।', sendFailed: 'इस एजेंट से संपर्क नहीं हो सका।', refresh: 'रीफ़्रेश',
  },
  Spanish: {
    test: 'Prueba', live: 'En vivo', testMode: 'Modo de prueba · chatea con este agente de IA', connected: 'conectado', notConnected: 'no conectado',
    waitingForConversation: 'Conectado. Envía un mensaje real por este canal y aparecerá aquí automáticamente.',
    noLiveRouting: 'Todavía no ha llegado una conversación en vivo para este canal. El modo de prueba está listo.',
    thinking: 'Pensando…', noAnswer: 'No se recibió ninguna respuesta. Inténtalo de nuevo.', sendFailed: 'No se pudo contactar con este agente.', refresh: 'Actualizar',
  },
  French: {
    test: 'Test', live: 'En direct', testMode: 'Mode test · discutez avec cet agent IA', connected: 'connecté', notConnected: 'non connecté',
    waitingForConversation: 'Connecté. Envoyez un vrai message sur ce canal et il apparaîtra ici automatiquement.',
    noLiveRouting: 'Aucune conversation en direct n’est encore arrivée sur ce canal. Le mode test est prêt.',
    thinking: 'Réflexion…', noAnswer: 'Aucune réponse reçue. Réessayez.', sendFailed: 'Impossible de joindre cet agent.', refresh: 'Actualiser',
  },
  German: {
    test: 'Test', live: 'Live', testMode: 'Testmodus · mit diesem KI-Agenten chatten', connected: 'verbunden', notConnected: 'nicht verbunden',
    waitingForConversation: 'Verbunden. Senden Sie eine echte Nachricht über diesen Kanal; sie erscheint automatisch hier.',
    noLiveRouting: 'Für diesen Kanal ist noch keine Live-Unterhaltung eingegangen. Der Testmodus ist bereit.',
    thinking: 'Denkt nach…', noAnswer: 'Keine Antwort erhalten. Bitte erneut versuchen.', sendFailed: 'Dieser Agent konnte nicht erreicht werden.', refresh: 'Aktualisieren',
  },
  Arabic: {
    test: 'اختبار', live: 'مباشر', testMode: 'وضع الاختبار · تحدث مع وكيل الذكاء الاصطناعي', connected: 'متصل', notConnected: 'غير متصل',
    waitingForConversation: 'تم الاتصال. أرسل رسالة حقيقية عبر هذه القناة وستظهر هنا تلقائيًا.',
    noLiveRouting: 'لم تصل محادثة مباشرة لهذه القناة بعد. وضع الاختبار جاهز الآن.',
    thinking: 'جارٍ التفكير…', noAnswer: 'لم يتم إرجاع إجابة. حاول مرة أخرى.', sendFailed: 'تعذر الوصول إلى هذا الوكيل.', refresh: 'تحديث',
  },
};

const channelNames: Record<DeploymentChannel, string> = {
  website: 'Website', whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook Messenger', slack: 'Slack',
  teams: 'Microsoft Teams', api: 'Developer API', notion: 'Notion', zapier: 'Zapier',
};

const liveConversationChannel: Partial<Record<DeploymentChannel, Conversation['channel']>> = {
  website: 'widget', whatsapp: 'whatsapp', slack: 'slack', api: 'api',
};

function newestChannelConversation(items: Conversation[], agentId: string, channel: DeploymentChannel): Conversation | null {
  const conversationChannel = liveConversationChannel[channel];
  if (!conversationChannel) return null;
  return items
    .filter((item) => item.agentId === agentId && item.channel === conversationChannel)
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null;
}

function routeAgentId(): string | null {
  const match = window.location.pathname.match(/^\/agents\/([^/]+)\/(?:instructions|knowledge|settings|embeddings)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function channelFromTarget(target: HTMLElement | null): DeploymentChannel | null {
  if (!target) return null;
  if (target.classList.contains('whatsapp-template')) return 'whatsapp';
  if (target.classList.contains('instagram-template')) return 'instagram';
  if (target.classList.contains('messenger-template')) return 'facebook';
  for (const channel of ['slack', 'teams', 'api', 'notion', 'zapier'] as const) {
    if (target.classList.contains(`generic-channel-template--${channel}`)) return channel;
  }
  return null;
}

function currentBuilderLanguage(): string | null {
  const select = document.querySelector<HTMLSelectElement>('.builder-editor select#language');
  return select?.value || null;
}

function ChannelIcon({ channel }: { channel: DeploymentChannel }) {
  const Icon = channel === 'whatsapp' ? MessageCircle
    : channel === 'instagram' ? Instagram
      : channel === 'facebook' ? Facebook
        : channel === 'slack' ? Hash
          : channel === 'teams' ? MessageSquareText
            : channel === 'api' ? Terminal
              : channel === 'notion' ? BookOpen
                : channel === 'zapier' ? Workflow
                  : MessageCircle;
  return <Icon />;
}

export function WhatsAppWorkspaceEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [channel, setChannel] = useState<DeploymentChannel | null>(null);
  const [language, setLanguage] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>('.builder-workspace .agent-template-preview .channel-frame');
      const nextAgentId = nextTarget ? routeAgentId() : null;
      const nextChannel = channelFromTarget(nextTarget);
      const nextLanguage = currentBuilderLanguage();
      setTarget((current) => current === nextTarget ? current : nextTarget);
      setAgentId((current) => current === nextAgentId ? current : nextAgentId);
      setChannel((current) => current === nextChannel ? current : nextChannel);
      setLanguage((current) => current === nextLanguage ? current : nextLanguage);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    const onChange = (event: Event) => {
      if (event.target instanceof HTMLSelectElement && event.target.id === 'language') sync();
    };
    document.addEventListener('change', onChange, true);
    window.addEventListener('popstate', sync);
    return () => {
      observer.disconnect();
      document.removeEventListener('change', onChange, true);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const previous = target.style.position;
    target.style.position = 'relative';
    return () => { target.style.position = previous; };
  }, [target]);

  if (!target || !agentId || !channel) return null;
  return createPortal(<InteractiveChannelWorkspace agentId={agentId} channel={channel} language={language ?? undefined} />, target);
}

export function InteractiveChannelWorkspace({ agentId, channel, language }: { agentId: string; channel: DeploymentChannel; language?: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [mode, setMode] = useState<PreviewMode>('test');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState('');
  const [liveError, setLiveError] = useState('');
  const [conversationId, setConversationId] = useState<string>();
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [integrationConnected, setIntegrationConnected] = useState(false);
  const [liveConversation, setLiveConversation] = useState<Conversation | null>(null);
  const [testMessages, setTestMessages] = useState<PreviewMessage[]>([]);
  const [refreshTick, setRefreshTick] = useState(0);
  const requestAbort = useRef<AbortController | null>(null);

  const activeLanguage = language ?? agent?.appearance.interfaceLanguage ?? agent?.language ?? 'English';
  const locale = getWidgetLocale(activeLanguage);
  const labels = labelsByLanguage[activeLanguage] ?? labelsByLanguage.English!;
  const localizedAgent = agent ? {
    ...agent,
    language: activeLanguage,
    appearance: {
      ...agent.appearance,
      interfaceLanguage: activeLanguage,
      textDirection: activeLanguage === 'Arabic' ? 'rtl' as const : 'ltr' as const,
      welcomeTitle: locale.welcomeTitle,
      welcomeMessage: locale.welcomeMessage,
      placeholder: locale.placeholder,
      suggestedQuestions: [...locale.suggestedQuestions],
      translations: { ...locale.translations },
    },
  } : null;
  const appearance = localizedAgent?.appearance;

  useEffect(() => {
    let active = true;
    setAgent(null);
    setTestError('');
    void api.agents.get(agentId)
      .then((item) => { if (active) setAgent(item); })
      .catch((reason: unknown) => {
        if (active) setTestError(reason instanceof Error ? reason.message : 'Could not load this agent.');
      });
    return () => { active = false; };
  }, [agentId]);

  useEffect(() => {
    requestAbort.current?.abort();
    setDraft('');
    setSending(false);
    setConversationId(undefined);
    setConnection(null);
    setIntegrationConnected(false);
    setLiveConversation(null);
    setLiveError('');
    setTestMessages([{ id: 'welcome', role: 'assistant', content: locale.welcomeMessage }]);
  }, [agentId, channel, activeLanguage, locale.welcomeMessage]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    const refresh = async () => {
      try {
        const conversationsPromise = api.conversations.list();
        if (channel === 'whatsapp') {
          const [status, conversations] = await Promise.all([api.integrations.whatsapp.status(), conversationsPromise]);
          if (!active) return;
          const connections = status.connections?.length ? status.connections : status.connection ? [status.connection] : [];
          const selectedConnection = connections.find((item) => item.agentId === agentId) ?? null;
          setConnection(selectedConnection);
          setIntegrationConnected(selectedConnection?.status.toLowerCase() === 'connected');
          setLiveConversation(newestChannelConversation(conversations.items, agentId, channel));
        } else {
          const [integrations, conversations] = await Promise.all([api.integrations.list(), conversationsPromise]);
          if (!active) return;
          setConnection(null);
          setIntegrationConnected(Boolean(integrations.find((item) => item.id === channel)?.connected));
          setLiveConversation(newestChannelConversation(conversations.items, agentId, channel));
        }
        setLiveError('');
      } catch (reason) {
        if (!active) return;
        setConnection(null);
        setIntegrationConnected(false);
        setLiveError(reason instanceof Error ? reason.message : labels.sendFailed);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [agentId, channel, labels.sendFailed, mode, refreshTick]);

  useEffect(() => () => requestAbort.current?.abort(), []);

  const sendTestMessage = async (message: string) => {
    const userId = `preview-user-${Date.now()}`;
    const assistantId = `preview-assistant-${Date.now()}`;
    setTestMessages((current) => [...current, { id: userId, role: 'user', content: message }, { id: assistantId, role: 'assistant', content: '' }]);
    setSending(true);
    setTestError('');
    const controller = new AbortController();
    requestAbort.current?.abort();
    requestAbort.current = controller;
    let answer = '';
    try {
      const streamChat = api.streamChat as unknown as (input: { agentId: string; message: string; conversationId?: string; visitorId?: string; language?: string }, signal?: AbortSignal) => AsyncGenerator<{ type: string; conversationId?: string; content?: string; message?: string }>;
      for await (const event of streamChat({ agentId, message, conversationId, visitorId: `workspace-${channel}-preview`, language: activeLanguage }, controller.signal)) {
        if (event.type === 'start' && event.conversationId) setConversationId(event.conversationId);
        if (event.type === 'token') {
          answer += event.content ?? '';
          setTestMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: answer } : item));
        }
        if (event.type === 'error') throw new Error(event.message ?? labels.sendFailed);
      }
      if (!answer.trim()) {
        setTestMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: labels.noAnswer } : item));
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        const messageText = reason instanceof Error ? reason.message : labels.sendFailed;
        setTestError(messageText);
        setTestMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: messageText } : item));
      }
    } finally {
      if (requestAbort.current === controller) requestAbort.current = null;
      setSending(false);
    }
  };

  const sendLiveReply = async (message: string) => {
    if (!liveConversation) return;
    setSending(true);
    setLiveError('');
    try {
      await api.conversations.reply(liveConversation.id, message);
      const conversations = await api.conversations.list();
      setLiveConversation(newestChannelConversation(conversations.items, agentId, channel));
    } catch (reason) {
      setLiveError(reason instanceof Error ? reason.message : labels.sendFailed);
    } finally {
      setSending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setDraft('');
    if (mode === 'test') void sendTestMessage(message);
    else void sendLiveReply(message);
  };

  const messages: PreviewMessage[] = mode === 'test'
    ? testMessages
    : (liveConversation?.messages ?? []).filter((item) => item.role !== 'system').map((item) => ({
      id: item.id,
      role: item.role === 'user' ? 'user' : 'assistant',
      content: item.content,
    }));
  const hasLiveRoute = Boolean(liveConversationChannel[channel]);
  const liveComposerDisabled = mode === 'live' && (!integrationConnected || !liveConversation || !hasLiveRoute);
  const error = mode === 'test' ? testError : liveError;
  const avatar = localizedAgent?.avatar ?? 'N';
  const name = localizedAgent?.name ?? 'Northstar agent';
  const statusDetail = mode === 'test'
    ? labels.testMode
    : integrationConnected
      ? `${channel === 'whatsapp' && connection?.displayPhoneNumber ? `${connection.displayPhoneNumber} · ` : ''}${labels.connected}`
      : labels.notConnected;

  return <div
    dir={appearance?.textDirection === 'rtl' ? 'rtl' : 'ltr'}
    style={{ position: 'absolute', inset: 0, zIndex: 8, background: channel === 'whatsapp' ? '#efeae2' : '#fff', borderRadius: 'inherit', overflow: 'hidden' }}
  >
    <form className="channel-conversation" onSubmit={submit} style={{ width: '100%', height: '100%' }}>
      <header>
        <span style={{ background: appearance?.primaryColor ?? '#146cf6' }}>{avatar}</span>
        <div>
          <strong>{name}</strong>
          <small>{channelNames[channel]} · {statusDetail}</small>
        </div>
        <div className="device-toggle" aria-label="Channel preview mode" style={{ flex: '0 0 auto' }}>
          <button type="button" className={mode === 'test' ? 'is-active' : ''} onClick={() => setMode('test')}>{labels.test}</button>
          <button type="button" className={mode === 'live' ? 'is-active' : ''} onClick={() => setMode('live')}>{labels.live}</button>
        </div>
        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center' }}><ChannelIcon channel={channel} /></span>
        <MoreVertical />
      </header>
      <main className={channel === 'whatsapp' ? 'whatsapp-wallpaper' : undefined}>
        <time>{locale.today}</time>
        {mode === 'live' && integrationConnected && !liveConversation ? <div className="channel-bubble channel-bubble--in">{hasLiveRoute ? labels.waitingForConversation : labels.noLiveRouting}</div> : null}
        {mode === 'live' && !integrationConnected && !liveError ? <div className="channel-bubble channel-bubble--in">{channelNames[channel]} · {labels.notConnected}</div> : null}
        {messages.map((message) => <div key={message.id} className={`channel-bubble ${message.role === 'user' ? 'channel-bubble--out' : 'channel-bubble--in'}`}>{message.content || (sending ? labels.thinking : '')}</div>)}
        {error ? <div className="channel-bubble channel-bubble--in">{error}</div> : null}
      </main>
      <footer>
        <button type="button" aria-label={labels.refresh} onClick={() => mode === 'live' ? setRefreshTick((value) => value + 1) : setTestMessages([{ id: 'welcome', role: 'assistant', content: locale.welcomeMessage }])}><RefreshCw /></button>
        <span><input
          aria-label={mode === 'test' ? 'Test channel message' : 'Live channel reply'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={liveComposerDisabled ? labels.waitingForConversation : appearance?.placeholder ?? locale.placeholder}
          disabled={sending || liveComposerDisabled || !localizedAgent}
          style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'inherit', fontSize: 'inherit' }}
        /></span>
        <button type="submit" aria-label={mode === 'test' ? 'Send test message' : 'Send live reply'} disabled={!draft.trim() || sending || liveComposerDisabled || !localizedAgent}><SendHorizontal /></button>
      </footer>
    </form>
  </div>;
}

// Backward-compatible export for the focused WhatsApp tests and any external imports.
export function InteractiveWhatsAppWorkspace({ agentId }: { agentId: string }) {
  return <InteractiveChannelWorkspace agentId={agentId} channel="whatsapp" />;
}
