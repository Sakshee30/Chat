import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { demoAgents } from '@/lib/demo-data';
import { InteractiveWhatsAppWorkspace } from '@/components/whatsapp-workspace-enhancer';
import type { ChatStreamEvent, Conversation, WhatsAppStatus } from '@/types';

const apiMocks = vi.hoisted(() => ({
  getAgent: vi.fn(),
  status: vi.fn(),
  conversationsList: vi.fn(),
  reply: vi.fn(),
  streamChat: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    agents: { get: apiMocks.getAgent },
    integrations: { whatsapp: { status: apiMocks.status } },
    conversations: { list: apiMocks.conversationsList, reply: apiMocks.reply },
    streamChat: apiMocks.streamChat,
  },
}));

function stream(events: ChatStreamEvent[]) {
  return (async function* () { for (const event of events) yield event; })();
}

describe('InteractiveWhatsAppWorkspace', () => {
  const agent = structuredClone(demoAgents[0]!);
  const liveConversation: Conversation = {
    id: 'conv-whatsapp',
    agentId: agent.id,
    visitorName: 'Student',
    channel: 'whatsapp',
    state: 'open',
    sentiment: 'neutral',
    preview: 'Real WhatsApp question',
    unread: 1,
    startedAt: '2026-09-08T06:00:00.000Z',
    updatedAt: '2026-09-08T06:01:00.000Z',
    messages: [{ id: 'msg-in', role: 'user', content: 'Real WhatsApp question', createdAt: '2026-09-08T06:01:00.000Z' }],
  };

  beforeEach(() => {
    agent.appearance.deploymentChannel = 'whatsapp';
    apiMocks.getAgent.mockResolvedValue(agent);
    apiMocks.status.mockResolvedValue({
      enabled: true,
      connected: true,
      connection: null,
      connections: [{
        wabaId: 'waba-1', phoneNumberId: 'phone-1', displayPhoneNumber: '+91 99999 11111', verifiedName: 'Northstar',
        agentId: agent.id, status: 'connected', connectedAt: '2026-09-08T06:00:00.000Z',
      }],
    } satisfies WhatsAppStatus);
    apiMocks.conversationsList.mockResolvedValue({ items: [liveConversation], total: 1, page: 1, pageSize: 50 });
    apiMocks.reply.mockResolvedValue({ id: 'agent-reply', role: 'agent', content: 'Human reply', createdAt: '2026-09-08T06:02:00.000Z' });
    apiMocks.streamChat.mockImplementation(() => stream([
      { type: 'start', conversationId: 'preview-conversation', messageId: 'preview-message' },
      { type: 'token', content: 'Hello ' },
      { type: 'token', content: 'from the bot' },
      { type: 'done', conversationId: 'preview-conversation' },
    ]));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lets the workspace owner chat with the selected agent in WhatsApp test mode', async () => {
    const user = userEvent.setup();
    render(<InteractiveWhatsAppWorkspace agentId={agent.id} />);

    const input = await screen.findByLabelText('Test WhatsApp message');
    await user.type(input, 'Can you help me?');
    await user.click(screen.getByRole('button', { name: 'Send test message' }));

    expect(await screen.findByText('Hello from the bot')).toBeInTheDocument();
    expect(apiMocks.streamChat).toHaveBeenCalledWith(expect.objectContaining({ agentId: agent.id, message: 'Can you help me?' }), expect.any(AbortSignal));
  });

  it('shows the newest real WhatsApp thread and sends a live reply', async () => {
    const user = userEvent.setup();
    render(<InteractiveWhatsAppWorkspace agentId={agent.id} />);

    await user.click(await screen.findByRole('button', { name: 'Live' }));
    expect(await screen.findByText('Real WhatsApp question')).toBeInTheDocument();
    expect(screen.getByText(/\+91 99999 11111/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('WhatsApp reply'), 'Human reply');
    await user.click(screen.getByRole('button', { name: 'Send WhatsApp reply' }));

    await waitFor(() => expect(apiMocks.reply).toHaveBeenCalledWith('conv-whatsapp', 'Human reply'));
  });
});
