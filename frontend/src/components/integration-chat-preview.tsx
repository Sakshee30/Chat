import {
  BookOpen,
  Facebook,
  Hash,
  Instagram,
  MessageSquareText,
  MoreVertical,
  Paperclip,
  RefreshCw,
  Search,
  SendHorizontal,
  Terminal,
  ThumbsDown,
  ThumbsUp,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { getChatUiLocale, getWidgetLocale } from '@/lib/widget-localization';
import type { Agent } from '@/types';

interface PreviewMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rawContent?: string;
  feedback?: 1 | -1;
}

const channelDetails = {
  whatsapp: { name: 'WhatsApp', icon: MessageSquareText, accent: '#1fa855' },
  instagram: { name: 'Instagram', icon: Instagram, accent: '#d946ef' },
  facebook: { name: 'Facebook Messenger', icon: Facebook, accent: '#0866ff' },
  slack: { name: 'Slack', icon: Hash, accent: '#611f69' },
  teams: { name: 'Microsoft Teams', icon: MessageSquareText, accent: '#6264a7' },
  api: { name: 'Developer API', icon: Terminal, accent: '#146cf6' },
  notion: { name: 'Notion', icon: BookOpen, accent: '#111827' },
  zapier: { name: 'Zapier', icon: Workflow, accent: '#ff4f00' },
} as const;

type ChannelId = keyof typeof channelDetails;

export function IntegrationChatPreview({
  agent,
  integrationId,
  device,
}: {
  agent: Agent;
  integrationId: string;
  device: 'desktop' | 'mobile';
}) {
  const channelId = (integrationId in channelDetails ? integrationId : 'slack') as ChannelId;
  const details = channelDetails[channelId];
  const Icon = details.icon;
  const selectedLanguage = agent.appearance.interfaceLanguage || agent.language || 'English';
  const locale = getWidgetLocale(selectedLanguage);
  const chatUi = getChatUiLocale(selectedLanguage);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<PreviewMessage[]>([]);
  const [conversationId, setConversationId] = useState<string>();
  const [streaming, setStreaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const controller = useRef<AbortController>();
  const messageArea = useRef<HTMLElement>(null);

  useEffect(() => {
    controller.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setMenuOpen(false);
    setSearchOpen(false);
    setAttachmentOpen(false);
    setStreaming(false);
  }, [agent.id, channelId, selectedLanguage]);

  useEffect(() => {
    if (typeof messageArea.current?.scrollTo === 'function') {
      messageArea.current.scrollTo({ top: messageArea.current.scrollHeight, behavior: 'smooth' });
    }
  }, [messages, streaming]);

  useEffect(() => () => controller.current?.abort(), []);

  const reset = () => {
    controller.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setInput('');
    setStreaming(false);
    setMenuOpen(false);
  };

  const send = async (value: string, replaceAssistantId?: string) => {
    const rawContent = value.trim();
    if (!rawContent || streaming) return;

    const localUserId = replaceAssistantId ? undefined : `preview-user-${Date.now()}`;
    const localAssistantId = replaceAssistantId ?? `preview-assistant-${Date.now()}`;
    let activeAssistantId = localAssistantId;
    setInput('');
    setAttachmentOpen(false);

    if (replaceAssistantId) {
      setMessages((current) => current.map((message) => message.id === replaceAssistantId
        ? { ...message, content: '', feedback: undefined }
        : message));
    } else {
      setMessages((current) => [
        ...current,
        { id: localUserId!, role: 'user', content: rawContent, rawContent },
        { id: localAssistantId, role: 'assistant', content: '' },
      ]);
    }

    setStreaming(true);
    controller.current = new AbortController();

    try {
      const events = api.streamChat({
        agentId: agent.id,
        conversationId,
        message: rawContent,
        language: selectedLanguage,
      }, controller.current.signal);

      for await (const event of events) {
        if (event.type === 'start') {
          setConversationId(event.conversationId);
          activeAssistantId = event.messageId;
          setMessages((current) => current.map((message) => message.id === localAssistantId
            ? { ...message, id: event.messageId }
            : message));
        } else if (event.type === 'user_translation' && localUserId && event.content.trim()) {
          setMessages((current) => current.map((message) => message.id === localUserId
            ? { ...message, content: event.content.trim() }
            : message));
        } else if (event.type === 'token') {
          setMessages((current) => current.map((message) => message.id === activeAssistantId
            ? { ...message, content: message.content + event.content }
            : message));
        } else if (event.type === 'error') {
          setMessages((current) => current.map((message) => message.id === activeAssistantId
            ? { ...message, content: selectedLanguage === 'English' ? `${chatUi.responseError} ${event.message}` : `${chatUi.responseError} ${chatUi.tryAgain}` }
            : message));
        }
      }
    } catch (error) {
      setMessages((current) => current.map((message) => message.id === activeAssistantId
        ? { ...message, content: selectedLanguage === 'English' && error instanceof Error ? `${chatUi.responseError} ${error.message}` : `${chatUi.responseError} ${chatUi.tryAgain}` }
        : message));
    } finally {
      setStreaming(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  const rate = async (messageId: string, value: 1 | -1) => {
    setMessages((current) => current.map((message) => message.id === messageId
      ? { ...message, feedback: value }
      : message));
    try {
      await api.feedback(messageId, value, value === -1 ? chatUi.notHelpful : undefined);
    } catch {
      setMessages((current) => current.map((message) => message.id === messageId
        ? { ...message, feedback: undefined }
        : message));
    }
  };

  const regenerate = (messageIndex: number) => {
    const assistant = messages[messageIndex];
    const question = messages[messageIndex - 1];
    if (!assistant || !question || assistant.role !== 'assistant' || question.role !== 'user') return;
    void send(question.rawContent || question.content, assistant.id);
  };

  const starters = agent.appearance.suggestedQuestions.length
    ? agent.appearance.suggestedQuestions
    : locale.suggestedQuestions;

  const previewLabel = channelId === 'whatsapp'
    ? 'WhatsApp conversation preview'
    : channelId === 'instagram'
      ? 'Instagram direct-message preview'
      : channelId === 'facebook'
        ? 'Facebook Messenger preview'
        : `${details.name} preview`;
  const channelContext = channelId === 'whatsapp'
    ? chatUi.businessAccount
    : channelId === 'instagram'
      ? chatUi.professionalAccount
      : channelId === 'slack'
        ? '#support'
        : chatUi.livePreview;

  return <section
    className={`channel-frame channel-frame--${device} ${channelId}-template interactive-channel-template`}
    style={{ '--channel-accent': details.accent } as CSSProperties}
    aria-label={previewLabel}
    dir={agent.appearance.textDirection ?? (selectedLanguage === 'Arabic' ? 'rtl' : 'ltr')}
  >
    <aside className="channel-list">
      <div className="channel-list__brand"><strong>{details.name}</strong><Icon /></div>
      <button type="button" className="channel-search" onClick={() => setSearchOpen((current) => !current)}><Search /> {channelId === 'whatsapp' ? chatUi.searchChats : chatUi.searchMessages}</button>
      <div className="channel-contact is-active"><span className={channelId === 'instagram' ? 'instagram-avatar' : ''} style={{ background: agent.appearance.primaryColor }}>{agent.avatar}</span><div><strong>{agent.name}</strong><small>{agent.appearance.welcomeTitle}</small></div><i>{chatUi.activeNow}</i></div>
    </aside>

    <div className="channel-conversation">
      <header>
        <span className={channelId === 'instagram' ? 'instagram-avatar' : ''} style={{ background: agent.appearance.primaryColor }}>{agent.avatar}</span>
        <div><strong>{agent.name}</strong><small>{channelContext} · {chatUi.online}</small></div>
        <button type="button" className="channel-icon-button" onClick={() => setSearchOpen((current) => !current)} aria-label={channelId === 'whatsapp' ? chatUi.searchChats : chatUi.searchMessages}><Search /></button>
        <div className="channel-preview-menu">
          <button type="button" className="channel-icon-button" onClick={() => setMenuOpen((current) => !current)} aria-label={locale.moreOptions} aria-expanded={menuOpen}><MoreVertical /></button>
          {menuOpen ? <div role="menu"><button type="button" role="menuitem" onClick={reset}><RefreshCw />{agent.appearance.translations?.newConversation ?? locale.translations.newConversation}</button></div> : null}
        </div>
      </header>

      {searchOpen ? <div className="channel-preview-search"><Search /><input autoFocus aria-label={channelId === 'whatsapp' ? chatUi.searchChats : chatUi.searchMessages} placeholder={channelId === 'whatsapp' ? chatUi.searchChats : chatUi.searchMessages} /></div> : null}

      <main ref={messageArea} className={channelId === 'whatsapp' ? 'whatsapp-wallpaper' : ''}>
        <time>{locale.today}</time>
        {messages.length === 0 ? <>
          <div className="channel-bubble channel-bubble--in">{agent.appearance.welcomeTitle}<small>{agent.appearance.welcomeMessage}</small></div>
          <div className="channel-starters">{starters.slice(0, 3).map((starter) => <button type="button" key={starter} onClick={() => void send(starter)}>{starter}<SendHorizontal /></button>)}</div>
        </> : messages.map((message, index) => <div key={message.id} className={`channel-bubble channel-bubble--${message.role === 'user' ? 'out' : 'in'}`}>
          {message.content || (streaming && index === messages.length - 1 ? <span className="channel-typing"><i /><i /><i /></span> : null)}
          {message.role === 'assistant' && message.content ? <div className="channel-feedback-actions">
            <button type="button" className={message.feedback === 1 ? 'is-active' : ''} onClick={() => void rate(message.id, 1)} aria-label={chatUi.positiveFeedback} title={chatUi.helpful}><ThumbsUp /></button>
            <button type="button" className={message.feedback === -1 ? 'is-active' : ''} onClick={() => void rate(message.id, -1)} aria-label={chatUi.negativeFeedback} title={chatUi.notHelpful}><ThumbsDown /></button>
            <button type="button" disabled={streaming} onClick={() => regenerate(index)} aria-label={chatUi.regenerateAnswer} title={chatUi.regenerate}><RefreshCw /></button>
          </div> : null}
        </div>)}
      </main>

      {attachmentOpen ? <div className="channel-attachment-note"><Paperclip /> {chatUi.message}</div> : null}
      <footer>
        <button type="button" onClick={() => setAttachmentOpen((current) => !current)} aria-label="Attach file"><Paperclip /></button>
        <form onSubmit={submit}>
          <input value={input} onChange={(event) => setInput(event.target.value)} aria-label={chatUi.message} placeholder={agent.appearance.placeholder || locale.placeholder} />
          <button type="submit" disabled={!input.trim() || streaming} aria-label={agent.appearance.translations?.sendButton ?? locale.translations.sendButton}><SendHorizontal /></button>
        </form>
      </footer>
    </div>
  </section>;
}
