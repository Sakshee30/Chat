import {
  ArrowUp,
  ExternalLink,
  MessageSquareText,
  Mic,
  MoreVertical,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import type { Agent, ChatMessage, WidgetSession } from '@/types';

interface WidgetProps {
  agent: Agent;
  embedded?: boolean;
  startOpen?: boolean;
  publicMode?: boolean;
  initialSession?: WidgetSession;
  requestNewSession?: () => Promise<WidgetSession>;
  onClose?: () => void;
}

export function ChatWidget({
  agent,
  embedded = false,
  startOpen = true,
  publicMode = false,
  initialSession,
  requestNewSession,
  onClose,
}: WidgetProps) {
  const [open, setOpen] = useState(startOpen || embedded);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [resetting, setResetting] = useState(false);

  const [conversationId, setConversationId] = useState<string | undefined>(
    initialSession?.conversationId,
  );

  const [widgetToken, setWidgetToken] = useState<string | undefined>(
    initialSession?.sessionToken,
  );

  const [feedbackMessageId, setFeedbackMessageId] = useState<string | null>(
    null,
  );
  const [feedbackReason, setFeedbackReason] = useState('');
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController>();

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, streaming]);

  useEffect(() => {
    return () => controller.current?.abort();
  }, []);

  const reset = async () => {
    controller.current?.abort();

    setMessages([]);
    setConversationId(undefined);
    setWidgetToken(undefined);
    setStreaming(false);

    setFeedbackOpen(false);
    setFeedbackMessageId(null);

    if (!requestNewSession) return;

    setResetting(true);

    try {
      const created = await requestNewSession();

      setConversationId(created.conversationId);
      setWidgetToken(created.sessionToken);
    } catch {
      setMessages([
        {
          id: `session-error-${Date.now()}`,
          role: 'assistant',
          content:
            'I could not start a new conversation. Please try again.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setResetting(false);
    }
  };

  const submitPositiveFeedback = async (messageId: string) => {
    try {
      await api.feedback(messageId, 1);
    } catch (error) {
      console.error('Positive feedback failed:', error);
    }
  };

  const openNegativeFeedback = (messageId: string) => {
    setFeedbackMessageId(messageId);
    setFeedbackReason('');
    setFeedbackComment('');
    setFeedbackOpen(true);
  };

  const submitNegativeFeedback = async () => {
  if (!feedbackMessageId) return;

  const reason = feedbackReason.trim();
  const comment = feedbackComment.trim();

  if (!reason) return;

  const feedbackText = comment
    ? `${reason}: ${comment}`
    : reason;

  try {
    await api.feedback(
      feedbackMessageId,
      -1,
      feedbackText,
    );

    setFeedbackOpen(false);
    setFeedbackMessageId(null);
    setFeedbackReason('');
    setFeedbackComment('');
  } catch (error) {
    console.error('Negative feedback failed:', error);

    window.alert(
      error instanceof Error
        ? error.message
        : 'Could not submit feedback.',
    );
  }
};

  const send = async (
    value: string,
    replaceAssistantId?: string,
  ) => {
    const content = value.trim();

    if (!content || streaming) return;

    setInput('');

    const responseId = replaceAssistantId ?? `response-${Date.now()}`;
    let currentResponseId = responseId;

    if (replaceAssistantId) {
      setMessages((current) =>
        current.map((message) =>
          message.id === replaceAssistantId
            ? {
                ...message,
                content: '',
                citations: [],
              }
            : message,
        ),
      );
    } else {
      const userMessage: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content,
        createdAt: new Date().toISOString(),
      };

      setMessages((current) => [
        ...current,
        userMessage,
        {
          id: responseId,
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
          citations: [],
        },
      ]);
    }

    setStreaming(true);
    controller.current = new AbortController();

    try {
      let activeConversationId = conversationId;
      let activeWidgetToken = widgetToken;

      if (
        publicMode &&
        (!activeConversationId || !activeWidgetToken)
      ) {
        const created = requestNewSession
          ? await requestNewSession()
          : await api.widget.createSession(agent.publicId);

        activeConversationId = created.conversationId;
        activeWidgetToken = created.sessionToken;

        setConversationId(activeConversationId);
        setWidgetToken(activeWidgetToken);
      }

      const events =
        publicMode &&
        activeConversationId &&
        activeWidgetToken
          ? api.widget.streamChat(
              {
                conversationId: activeConversationId,
                sessionToken: activeWidgetToken,
                message: content,
              },
              controller.current.signal,
            )
          : api.streamChat(
              {
                agentId: agent.id,
                message: content,
                conversationId,
              },
              controller.current.signal,
            );

      for await (const event of events) {
  if (event.type === 'start') {
    setConversationId(event.conversationId);

    if ('messageId' in event && event.messageId) {
      currentResponseId = event.messageId;

      setMessages((current) =>
        current.map((message) =>
          message.id === responseId
            ? {
                ...message,
                id: event.messageId,
              }
            : message,
        ),
      );
    }
  }

  if (event.type === 'token') {
    setMessages((current) =>
      current.map((message) =>
        message.id === currentResponseId
          ? {
              ...message,
              content: message.content + event.content,
            }
          : message,
      ),
    );
  }

  if (event.type === 'citation') {
    setMessages((current) =>
      current.map((message) =>
        message.id === currentResponseId
          ? {
              ...message,
              citations: [
                ...(message.citations ?? []),
                {
                  title: event.title,
                  url: event.url,
                },
              ],
            }
          : message,
      ),
    );
  }

  if (event.type === 'error') {S
    setMessages((current) =>
      current.map((message) =>
        message.id === currentResponseId
          ? {
              ...message,
              content: `I’m sorry, I couldn’t complete that response. ${event.message}`,
            }
          : message,
      ),
    );
  }
}
    } catch (error) {
      setMessages((current) =>
        current.map((message) =>
          message.id === responseId
            ? {
                ...message,
                content: `I could not complete that response. ${
                  error instanceof Error
                    ? error.message
                    : 'Please try again.'
                }`,
              }
            : message,
        ),
      );
    } finally {
      setStreaming(false);
    }
  };

  const regenerate = async (messageIndex: number) => {
    if (streaming) return;

    const assistantMessage = messages[messageIndex];

    const previousMessage = messages[messageIndex - 1];

    if (
      !assistantMessage ||
      assistantMessage.role !== 'assistant' ||
      !previousMessage ||
      previousMessage.role !== 'user'
    ) {
      return;
    }

    await send(
      previousMessage.content,
      assistantMessage.id,
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(input);
  };

  if (!open && !embedded) {
    return (
      <button
        className="widget-launcher"
        style={{
          background: agent.appearance.primaryColor,
        }}
        onClick={() => setOpen(true)}
        aria-label={`Open chat with ${agent.name}`}
      >
        {agent.appearance.launcherStyle === 'bubble' ? (
          <MessageSquareText />
        ) : agent.appearance.launcherStyle === 'avatar' ? (
          <span className="widget-launcher__avatar">
            {agent.avatar.slice(0, 2)}
          </span>
        ) : (
          <Sparkles />
        )}
      </button>
    );
  }

  return (
    <section
      className={`chat-widget ${
        embedded ? 'chat-widget--embedded' : ''
      }`}
      style={
        {
          '--widget-primary':
            agent.appearance.primaryColor,
          '--widget-surface':
            agent.appearance.surfaceColor,
        } as React.CSSProperties
      }
      aria-label={`Chat with ${agent.name}`}
    >
      <header className="widget-header">
        <div className="widget-wordmark">
          <span className="widget-logo">
            <Sparkles />
          </span>

          <strong>
            northstar<span>ai</span>
          </strong>
        </div>

        <div>
          <button
            onClick={() => void reset()}
            disabled={resetting || streaming}
            aria-label="Start a new conversation"
            title="New conversation"
          >
            <RefreshCw />
          </button>

          <button
            aria-label="More options"
          >
            <MoreVertical />
          </button>

          {!embedded && onClose ? (
            <button
              onClick={onClose}
              aria-label="Close chat"
            >
              <X />
            </button>
          ) : null}
        </div>
      </header>

      <div
        className="widget-body"
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <div className="widget-welcome">
            <span className="widget-orb">
              <Sparkles />
            </span>

            <h2>
              {agent.appearance.welcomeTitle}
            </h2>

            <p>
              {agent.appearance.welcomeMessage}
            </p>

            <div className="suggestion-list">
              {agent.appearance.suggestedQuestions
                .filter(Boolean)
                .map((question) => (
                  <button
                    key={question}
                    onClick={() => void send(question)}
                  >
                    {question}
                    <ArrowUp />
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="message-list">
            <div className="message-day">
              <span>Today</span>
            </div>

            {messages.map((message, index) => (
              <div
                key={message.id}
                className={`chat-message chat-message--${message.role}`}
              >
                {message.role === 'assistant' ? (
                  <span className="message-avatar">
                    <Sparkles />
                  </span>
                ) : null}

                <div className="message-bubble">
                  {message.content ||
                    (streaming &&
                    index === messages.length - 1 ? (
                      <span className="typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null)}

                  {message.citations?.length ? (
                    <div className="citations">
                      {message.citations.map(
                        (citation) => (
                          <span
                            key={citation.title}
                          >
                            <ExternalLink />
                            {citation.title}
                          </span>
                        ),
                      )}
                    </div>
                  ) : null}

                  {message.role === 'assistant' ? (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        marginTop: '5px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          void submitPositiveFeedback(
                            message.id,
                          )
                        }
                        aria-label="Positive feedback"
                        title="Helpful"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color:
                            'var(--widget-primary)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <ThumbsUp
                          size={8} 
                          strokeWidth={2}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          openNegativeFeedback(
                            message.id,
                          )
                        }
                        aria-label="Negative feedback"
                        title="Not helpful"
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color:
                            'var(--widget-primary)',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <ThumbsDown
                          size={8}
                          strokeWidth={2}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          void regenerate(index)
                        }
                        aria-label="Regenerate answer"
                        title="Regenerate"
                        disabled={streaming}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          color:
                            'var(--widget-primary)',
                          cursor: streaming
                            ? 'not-allowed'
                            : 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center',
                        }}
                      >
                        <RefreshCw
                          size={8}
                          strokeWidth={2}
                        />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="widget-footer">
        <form onSubmit={submit}>
          <textarea
            rows={1}
            value={input}
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                !event.shiftKey
              ) {
                event.preventDefault();
                void send(input);
              }
            }}
            placeholder={agent.appearance.placeholder}
            aria-label="Message"
          />

          <div className="composer-actions">
            <button
              type="button"
              aria-label="Voice input"
              title="Voice input"
            >
              <Mic />
            </button>

            <span />

            <button
              type="submit"
              className="send-button"
              disabled={!input.trim() || streaming}
              aria-label="Send message"
            >
              <ArrowUp />
            </button>
          </div>
        </form>

        <p>
          <ShieldCheck />
          AI can make mistakes. Check important
          information.
        </p>

        {agent.appearance.showBranding ? (
          <small>
            Powered by{' '}
            <strong>
              <Sparkles /> Northstar AI
            </strong>
          </small>
        ) : null}
      </footer>

      {feedbackOpen ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              width: 'min(480px, 100%)',
              background:
                'var(--widget-surface, #ffffff)',
              borderRadius: '14px',
              padding: '22px',
              boxShadow:
                '0 16px 50px rgba(0, 0, 0, 0.22)',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: '20px',
                }}
              >
                Help us improve
              </h2>

              <button
                type="button"
                onClick={() =>
                  setFeedbackOpen(false)
                }
                aria-label="Close feedback"
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '20px',
                  color:
                    'var(--widget-primary)',
                }}
              >
                ×
              </button>
            </div>

            <p
              style={{
                marginTop: '4px',
                marginBottom: '18px',
              }}
            >
              What was wrong with this answer?
            </p>

            <label
              htmlFor="feedback-reason"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: 600,
              }}
            >
              Reason
            </label>

            <select
              id="feedback-reason"
              value={feedbackReason}
              onChange={(event) =>
                setFeedbackReason(
                  event.target.value,
                )
              }
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #d9dfe8',
                marginBottom: '16px',
                boxSizing: 'border-box',
              }}
            >
              <option value="">
                Select a reason
              </option>

              <option value="Incorrect Answer">
                Incorrect Answer
              </option>

              <option value="Incomplete Answer">
                Incomplete Answer
              </option>

              <option value="Hallucinated Response">
                Hallucinated Response
              </option>

              <option value="Irrelevant Answer">
                Irrelevant Answer
              </option>

              <option value="Other">
                Other
              </option>
            </select>

            <label
              htmlFor="feedback-comment"
              style={{
                display: 'block',
                marginBottom: '6px',
                fontWeight: 600,
              }}
            >
              Additional comments
            </label>

            <textarea
              id="feedback-comment"
              value={feedbackComment}
              onChange={(event) =>
                setFeedbackComment(
                  event.target.value,
                )
              }
              placeholder="Tell us more (optional)"
              rows={4}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border:
                  '1px solid #d9dfe8',
                resize: 'vertical',
                boxSizing: 'border-box',
                marginBottom: '18px',
              }}
            />

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '10px',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setFeedbackOpen(false)
                }
                style={{
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border:
                    '1px solid #d9dfe8',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!feedbackReason}
                onClick={() =>
                  void submitNegativeFeedback()
                }
                style={{
                  padding: '9px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background:
                    'var(--widget-primary)',
                  color: '#ffffff',
                  cursor: feedbackReason
                    ? 'pointer'
                    : 'not-allowed',
                  opacity: feedbackReason
                    ? 1
                    : 0.55,
                }}
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function WidgetPreview({
  agent,
}: {
  agent: Agent;
}) {
  return (
    <aside className="widget-preview">
      <div className="preview-toolbar">
        <span>
          <i className="status-dot status-dot--success" />
          Live preview
        </span>

        <button
          aria-label="Open preview options"
        >
          <MoreVertical />
        </button>
      </div>

      <div className="phone-frame">
        <div className="phone-speaker" />
        <ChatWidget
          agent={agent}
          embedded
        />
      </div>

      <p>
        Changes appear here before you publish.
      </p>
    </aside>
  );
}