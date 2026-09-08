import { MoreVertical, RefreshCw, Search, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/lib/api';
import type { Agent, Conversation, WhatsAppConnection } from '@/types';

type PreviewMode = 'test' | 'live';
type PreviewMessage = { id: string; role: 'user' | 'assistant'; content: string };

function newestWhatsAppConversation(items: Conversation[], agentId: string): Conversation | null {
  return items
    .filter((item) => item.agentId === agentId && item.channel === 'whatsapp')
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())[0] ?? null;
}

function routeAgentId(): string | null {
  const match = window.location.pathname.match(/^\/agents\/([^/]+)\/(?:instructions|knowledge|settings|embeddings)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function WhatsAppWorkspaceEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => {
      const nextTarget = document.querySelector<HTMLElement>('.builder-workspace .agent-template-preview .whatsapp-template');
      const nextAgentId = nextTarget ? routeAgentId() : null;
      setTarget((current) => current === nextTarget ? current : nextTarget);
      setAgentId((current) => current === nextAgentId ? current : nextAgentId);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('popstate', sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    if (!target) return;
    const previous = target.style.position;
    target.style.position = 'relative';
    return () => { target.style.position = previous; };
  }, [target]);

  if (!target || !agentId) return null;
  return createPortal(<InteractiveWhatsAppWorkspace agentId={agentId} />, target);
}

export function InteractiveWhatsAppWorkspace({ agentId }: { agentId: string }) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [mode, setMode] = useState<PreviewMode>('test');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [testError, setTestError] = useState('');
  const [liveError, setLiveError] = useState('');
  const [conversationId, setConversationId] = useState<string>();
  const [connection, setConnection] = useState<WhatsAppConnection | null>(null);
  const [liveConversation, setLiveConversation] = useState<Conversation | null>(null);
  const [testMessages, setTestMessages] = useState<PreviewMessage[]>([]);
  const requestAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    let active = true;
    setAgent(null);
    setTestError('');
    void api.agents.get(agentId)
      .then((item) => {
        if (!active) return;
        setAgent(item);
        setTestMessages([{ id: 'welcome', role: 'assistant', content: item.appearance.welcomeMessage || item.appearance.welcomeTitle }]);
      })
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
    setLiveConversation(null);
    setLiveError('');
  }, [agentId]);

  useEffect(() => {
    if (mode !== 'live') return;
    let active = true;
    const refresh = async () => {
      try {
        const [status, conversations] = await Promise.all([api.integrations.whatsapp.status(), api.conversations.list()]);
        if (!active) return;
        const connections = status.connections?.length ? status.connections : status.connection ? [status.connection] : [];
        setConnection(connections.find((item) => item.agentId === agentId) ?? null);
        setLiveConversation(newestWhatsAppConversation(conversations.items, agentId));
        setLiveError('');
      } catch (reason) {
        if (!active) return;
        setConnection(null);
        setLiveError(reason instanceof Error ? reason.message : 'Could not load the WhatsApp connection.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [agentId, mode]);

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
      for await (const event of api.streamChat({ agentId, message, conversationId, visitorId: 'workspace-whatsapp-preview' }, controller.signal)) {
        if (event.type === 'start') setConversationId(event.conversationId);
        if (event.type === 'token') {
          answer += event.content;
          setTestMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: answer } : item));
        }
        if (event.type === 'error') throw new Error(event.message);
      }
      if (!answer.trim()) {
        setTestMessages((current) => current.map((item) => item.id === assistantId ? { ...item, content: 'No answer was returned. Try again.' } : item));
      }
    } catch (reason) {
      if (!controller.signal.aborted) {
        const messageText = reason instanceof Error ? reason.message : 'Could not reach this agent.';
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
      setLiveConversation(newestWhatsAppConversation(conversations.items, agentId));
    } catch (reason) {
      setLiveError(reason instanceof Error ? reason.message : 'Could not send the WhatsApp reply.');
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

  const connected = connection?.status.toLowerCase() === 'connected';
  const messages: PreviewMessage[] = mode === 'test'
    ? testMessages
    : (liveConversation?.messages ?? []).filter((item) => item.role !== 'system').map((item) => ({
      id: item.id,
      role: item.role === 'user' ? 'user' : 'assistant',
      content: item.content,
    }));
  const liveComposerDisabled = mode === 'live' && (!connected || !liveConversation);
  const error = mode === 'test' ? testError : liveError;
  const appearance = agent?.appearance;
  const avatar = agent?.avatar ?? 'N';
  const name = agent?.name ?? 'Northstar agent';

  return <div style={{ position: 'absolute', inset: 0, zIndex: 8, background: '#fff', borderRadius: 'inherit', overflow: 'hidden' }}>
    <form className="channel-conversation" onSubmit={submit} style={{ width: '100%', height: '100%' }}>
      <header>
        <span style={{ background: appearance?.primaryColor ?? '#146cf6' }}>{avatar}</span>
        <div>
          <strong>{name}</strong>
          <small>{mode === 'test' ? 'Test mode · chat with this AI agent' : connected ? `${connection?.displayPhoneNumber || 'WhatsApp Business'} · connected` : 'WhatsApp not connected'}</small>
        </div>
        <div className="device-toggle" aria-label="WhatsApp preview mode" style={{ flex: '0 0 auto' }}>
          <button type="button" className={mode === 'test' ? 'is-active' : ''} onClick={() => setMode('test')}>Test</button>
          <button type="button" className={mode === 'live' ? 'is-active' : ''} onClick={() => setMode('live')}>Live</button>
        </div>
        <Search />
        <MoreVertical />
      </header>
      <main className="whatsapp-wallpaper">
        <time>Today</time>
        {mode === 'live' && !connected && !liveError ? <div className="channel-bubble channel-bubble--in">WhatsApp is not connected for this bot. Open Integrations → WhatsApp, connect a number, then return here.</div> : null}
        {mode === 'live' && connected && !liveConversation ? <div className="channel-bubble channel-bubble--in">Connected to {connection?.displayPhoneNumber || 'WhatsApp Business'}. Send a real WhatsApp message to this number and it will appear here automatically.</div> : null}
        {messages.map((message) => <div key={message.id} className={`channel-bubble ${message.role === 'user' ? 'channel-bubble--out' : 'channel-bubble--in'}`}>{message.content || (sending ? 'Thinking…' : '')}</div>)}
        {error ? <div className="channel-bubble channel-bubble--in">{error}</div> : null}
      </main>
      <footer>
        <button type="button" aria-label="Refresh WhatsApp preview" onClick={() => mode === 'live' && setMode('test')}><RefreshCw /></button>
        <span><input
          aria-label={mode === 'test' ? 'Test WhatsApp message' : 'WhatsApp reply'}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={liveComposerDisabled ? 'Waiting for a live WhatsApp conversation…' : appearance?.placeholder ?? 'Ask me anything...'}
          disabled={sending || liveComposerDisabled || !agent}
          style={{ width: '100%', border: 0, outline: 0, background: 'transparent', color: 'inherit', fontSize: 'inherit' }}
        /></span>
        <button type="submit" aria-label={mode === 'test' ? 'Send test message' : 'Send WhatsApp reply'} disabled={!draft.trim() || sending || liveComposerDisabled || !agent}><SendHorizontal /></button>
      </footer>
    </form>
  </div>;
}
