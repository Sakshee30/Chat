import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@/components/providers';
import { demoAgents } from '@/lib/demo-data';
import { AgentsPage } from '@/pages/AgentsPage';
import type { Agent, CreateAgentInput, DuplicateAgentInput } from '@/types';

const apiMocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<Agent[]>>(),
  create: vi.fn<(input: CreateAgentInput) => Promise<Agent>>(),
  duplicate: vi.fn<(agentId: string, input: DuplicateAgentInput) => Promise<Agent>>(),
  remove: vi.fn<(agentId: string) => Promise<void>>(),
}));

vi.mock('@/lib/api', () => ({
  api: { agents: apiMocks },
}));

describe('AgentsPage duplicate flow', () => {
  let source: Agent;

  beforeEach(() => {
    source = structuredClone(demoAgents[0]!);
    source.appearance.deploymentChannel = 'website';
    apiMocks.list.mockResolvedValue([source]);
    apiMocks.remove.mockResolvedValue();
    apiMocks.create.mockImplementation(async (input) => ({
      ...structuredClone(source),
      id: 'agent-created',
      publicId: 'created-public',
      name: input.name,
      description: input.description,
      tone: input.tone ?? 'friendly',
      language: input.language ?? 'English',
      status: 'draft',
      appearance: { ...structuredClone(source.appearance), deploymentChannel: input.deploymentChannel ?? 'website' },
    }));
    apiMocks.duplicate.mockImplementation(async (_agentId, input) => ({
      ...structuredClone(source),
      id: 'agent-duplicate',
      publicId: 'duplicate-public',
      name: input.name,
      status: 'draft',
      appearance: { ...structuredClone(source.appearance), deploymentChannel: input.deploymentChannel },
    }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('asks for a deployment channel and duplicates the complete bot template', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ToastProvider><AgentsPage /></ToastProvider></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: `Actions for ${source.name}` }));
    await user.click(screen.getByRole('button', { name: 'Duplicate' }));

    expect(screen.getByRole('heading', { name: 'Duplicate AI agent' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Website/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /WhatsApp/ }));
    await user.click(screen.getByRole('button', { name: 'Duplicate agent' }));

    await waitFor(() => expect(apiMocks.duplicate).toHaveBeenCalledWith(source.id, {
      name: `${source.name} copy`,
      deploymentChannel: 'whatsapp',
    }));
  });

  it('guides a first-time user through language and channel selection', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><ToastProvider><AgentsPage /></ToastProvider></MemoryRouter>);

    await user.click(await screen.findByRole('button', { name: 'Create agent' }));
    await user.type(screen.getByLabelText('Agent name'), 'Hindi Support');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByText('Customer support'));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.selectOptions(screen.getByLabelText('Primary language'), 'Hindi');
    expect(screen.getByText('मैं आपकी कैसे मदद कर सकता हूँ?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await user.click(screen.getByRole('radio', { name: /WhatsApp/ }));
    await user.click(screen.getAllByRole('button', { name: 'Create agent' }).at(-1)!);

    await waitFor(() => expect(apiMocks.create).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Hindi Support',
      template: 'support',
      language: 'Hindi',
      deploymentChannel: 'whatsapp',
    })));
  });
});
