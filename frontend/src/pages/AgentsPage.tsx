import { BookOpen, Bot, Check, ChevronLeft, ChevronRight, Code2, Copy, Ellipsis, Facebook, Globe2, Hash, Instagram, LayoutGrid, List, MessageSquare, MoreHorizontal, Plus, Search, Sparkles, Trash2, Users, Zap } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '@/components/providers';
import { Badge, Button, Card, EmptyState, Field, Modal, PageLoader } from '@/components/ui';
import { api } from '@/lib/api';
import { formatCompact, relativeTime } from '@/lib/format';
import { useApi } from '@/lib/use-api';
import { getWidgetLocale, supportedWidgetLanguages } from '@/lib/widget-localization';
import type { Agent, AgentTone, DeploymentChannel } from '@/types';

const templates = [
  { id: 'blank', icon: Sparkles, name: 'Start from scratch', description: 'Build a custom agent your way.' },
  { id: 'support', icon: MessageSquare, name: 'Customer support', description: 'Resolve product and account questions.' },
  { id: 'lead', icon: Bot, name: 'Lead qualification', description: 'Capture and qualify inbound leads.' },
];

const deploymentOptions: Array<{ id: DeploymentChannel; icon: typeof Globe2; name: string; description: string }> = [
  { id: 'website', icon: Globe2, name: 'Website', description: 'Use the website chat widget.' },
  { id: 'whatsapp', icon: MessageSquare, name: 'WhatsApp', description: 'Use the WhatsApp Business template.' },
  { id: 'instagram', icon: Instagram, name: 'Instagram', description: 'Use the Instagram DM template.' },
  { id: 'facebook', icon: Facebook, name: 'Facebook / Meta', description: 'Use the Messenger template.' },
  { id: 'slack', icon: Hash, name: 'Slack', description: 'Use the Slack conversation template.' },
  { id: 'teams', icon: Users, name: 'Microsoft Teams', description: 'Use the Teams conversation template.' },
  { id: 'api', icon: Code2, name: 'Developer API', description: 'Use the API response template.' },
  { id: 'notion', icon: BookOpen, name: 'Notion', description: 'Use the knowledge-sync template.' },
  { id: 'zapier', icon: Zap, name: 'Zapier', description: 'Use the workflow template.' },
];

export function AgentsPage() {
  const result = useApi(() => api.agents.list()); const { pushToast } = useToast(); const navigate = useNavigate();
  const [search, setSearch] = useState(''); const [view, setView] = useState<'grid' | 'list'>('grid'); const [createOpen, setCreateOpen] = useState(false); const [duplicateAgent, setDuplicateAgent] = useState<Agent | null>(null); const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const filtered = result.data?.filter((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const remove = async () => { if (!deleteAgent) return; await api.agents.remove(deleteAgent.id); pushToast(`${deleteAgent.name} deleted`); setDeleteAgent(null); result.reload(); };
  if (result.loading && !result.data) return <PageLoader />;
  return <div className="page agents-page">
    <div className="page-heading page-heading--split"><div><h2>AI agents</h2><p>Create focused experts, train them on trusted content, and deploy anywhere.</p></div><Button icon={Plus} onClick={() => setCreateOpen(true)}>Create agent</Button></div>
    <div className="list-toolbar"><div className="search-box"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agents…" aria-label="Search agents" /></div><div className="view-toggle" role="group" aria-label="View style"><button className={view === 'grid' ? 'is-active' : ''} onClick={() => setView('grid')} aria-label="Grid view"><LayoutGrid /></button><button className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')} aria-label="List view"><List /></button></div></div>
    {filtered.length ? <div className={`agent-cards agent-cards--${view}`}>{filtered.map((agent) => <AgentCard key={agent.id} agent={agent} onDuplicate={() => setDuplicateAgent(agent)} onDelete={() => setDeleteAgent(agent)} />)}</div> : <Card><EmptyState icon={Bot} title={search ? 'No matching agents' : 'Create your first agent'} description={search ? 'Try a different search term.' : 'Start with a focused job and teach your agent from trusted sources.'} action={!search ? <Button icon={Plus} onClick={() => setCreateOpen(true)}>Create agent</Button> : undefined} /></Card>}
    <CreateAgentModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(agent) => { setCreateOpen(false); result.reload(); pushToast('Agent created'); navigate(`/agents/${agent.id}/instructions`); }} />
    <DuplicateAgentModal source={duplicateAgent} onClose={() => setDuplicateAgent(null)} onCreated={(agent) => { setDuplicateAgent(null); result.reload(); pushToast('Agent duplicated with its complete template'); navigate(`/agents/${agent.id}/instructions`); }} />
    <Modal open={Boolean(deleteAgent)} onClose={() => setDeleteAgent(null)} title="Delete this agent?" description="This also removes its deployment settings. Conversation history is retained according to your data policy." size="sm" footer={<><Button variant="secondary" onClick={() => setDeleteAgent(null)}>Cancel</Button><Button variant="danger" icon={Trash2} onClick={() => void remove()}>Delete agent</Button></>}><div className="confirm-agent"><span className="agent-avatar" style={{ background: deleteAgent?.appearance.primaryColor }}>{deleteAgent?.avatar}</span><div><strong>{deleteAgent?.name}</strong><small>{deleteAgent?.knowledgeCount} knowledge sources · {deleteAgent?.conversations} conversations</small></div></div></Modal>
  </div>;
}

function AgentCard({ agent, onDuplicate, onDelete }: { agent: Agent; onDuplicate: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  return <Card className="agent-card">
    <div className="agent-card__top"><span className="agent-avatar agent-avatar--lg" style={{ background: agent.appearance.primaryColor }}>{agent.avatar}</span><Badge tone={agent.status === 'active' ? 'success' : agent.status === 'training' ? 'purple' : 'warning'}><i className="status-dot" /> {agent.status}</Badge><div className="more-menu" ref={ref}><button className="icon-button" onClick={() => setOpen((value) => !value)} aria-label={`Actions for ${agent.name}`}><MoreHorizontal /></button>{open ? <div className="menu-popover"><button onClick={() => { setOpen(false); onDuplicate(); }}><Copy />Duplicate</button><button className="danger" onClick={onDelete}><Trash2 />Delete</button></div> : null}</div></div>
    <Link to={`/agents/${agent.id}/instructions`} className="agent-card__link"><h3>{agent.name}</h3><p>{agent.description}</p></Link>
    <div className="agent-card__stats"><span><strong>{formatCompact(agent.conversations)}</strong><small>Conversations</small></span><span><strong>{agent.resolutionRate}%</strong><small>Resolved</small></span><span><strong>{agent.knowledgeCount}</strong><small>Sources</small></span></div>
    <div className="agent-card__footer"><span>Updated {relativeTime(agent.lastUpdated)}</span><Link to={`/agents/${agent.id}/instructions`}>Open <Ellipsis /></Link></div>
  </Card>;
}

function DuplicateAgentModal({ source, onClose, onCreated }: { source: Agent | null; onClose: () => void; onCreated: (agent: Agent) => void }) {
  const [name, setName] = useState(''); const [deploymentChannel, setDeploymentChannel] = useState<DeploymentChannel>('website'); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (source) { setName(`${source.name} copy`); setDeploymentChannel(source.appearance.deploymentChannel ?? 'website'); setError(''); } }, [source]);
  const submit = async (event?: FormEvent) => { event?.preventDefault(); if (!source || !name.trim()) return; setSaving(true); setError(''); try { onCreated(await api.agents.duplicate(source.id, { name: name.trim(), deploymentChannel })); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not duplicate this agent.'); } finally { setSaving(false); } };
  return <Modal open={Boolean(source)} onClose={onClose} title="Duplicate AI agent" description="Copy the complete bot template and choose where this version will be deployed." size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Copy} disabled={!name.trim() || saving} onClick={() => void submit()}>{saving ? 'Duplicating...' : 'Duplicate agent'}</Button></>}>
    <form onSubmit={(event) => void submit(event)}><Field label="Duplicate name" htmlFor="duplicate-agent-name"><input id="duplicate-agent-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus /></Field>
      <fieldset className="deployment-option-field"><legend>Where do you want to add this bot?</legend><p>The matching channel template will appear in the agent workspace and Deploy preview.</p><div className="deployment-option-grid">{deploymentOptions.map(({ id, icon: Icon, name: optionName, description }) => <label key={id} className={deploymentChannel === id ? 'is-selected' : ''}><input type="radio" name="deployment-channel" value={id} checked={deploymentChannel === id} onChange={() => setDeploymentChannel(id)} /><Icon /><span><strong>{optionName}</strong><small>{description}</small></span></label>)}</div></fieldset>
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </form>
  </Modal>;
}

function CreateAgentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (agent: Agent) => void }) {
  const [step, setStep] = useState(0); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [template, setTemplate] = useState('blank'); const [tone, setTone] = useState<AgentTone>('friendly'); const [language, setLanguage] = useState('English'); const [deploymentChannel, setDeploymentChannel] = useState<DeploymentChannel>('website'); const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const steps = ['Basics', 'Purpose', 'Voice', 'Channel'];
  const locale = getWidgetLocale(language);
  useEffect(() => { if (!open) { setStep(0); setName(''); setDescription(''); setTemplate('blank'); setTone('friendly'); setLanguage('English'); setDeploymentChannel('website'); setError(''); } }, [open]);
  const canContinue = step !== 0 || Boolean(name.trim());
  const submit = async () => { if (!name.trim()) return; setSaving(true); setError(''); try { onCreated(await api.agents.create({ name: name.trim(), description: description.trim() || 'A helpful AI agent', template, tone, language, deploymentChannel })); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this agent.'); } finally { setSaving(false); } };
  const advance = () => { if (!canContinue || saving) return; if (step < steps.length - 1) { setStep((current) => current + 1); setError(''); } else void submit(); };
  return <Modal open={open} onClose={onClose} title="Create an AI agent" description="Follow four simple steps. You can adjust every setting later." size="lg" footer={<><Button variant="secondary" onClick={step === 0 ? onClose : () => setStep((current) => current - 1)} icon={step === 0 ? undefined : ChevronLeft}>{step === 0 ? 'Cancel' : 'Back'}</Button><Button disabled={!canContinue || saving} icon={step === steps.length - 1 ? Check : ChevronRight} onClick={advance}>{saving ? 'Creating…' : step === steps.length - 1 ? 'Create agent' : 'Continue'}</Button></>}>
    <form className="agent-flow" onSubmit={(event) => { event.preventDefault(); advance(); }}>
      <ol className="agent-flow__steps" aria-label="Agent creation progress">{steps.map((label, index) => <li key={label} className={index === step ? 'is-active' : index < step ? 'is-complete' : ''}><span>{index < step ? <Check /> : index + 1}</span><small>{label}</small></li>)}</ol>
      {step === 0 ? <section className="agent-flow__panel"><div className="agent-flow__intro"><Sparkles /><div><h3>Let’s name your assistant</h3><p>Use a clear name so your team immediately knows what this bot does.</p></div></div><Field label="Agent name" htmlFor="agent-name"><input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product Guide" maxLength={64} autoFocus /></Field><Field label="What should it help with?" htmlFor="agent-description" hint="A short sentence is enough."><input id="agent-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Answer product and account questions" maxLength={120} /></Field></section> : null}
      {step === 1 ? <section className="agent-flow__panel"><div className="agent-flow__intro"><Bot /><div><h3>Choose its main job</h3><p>This gives the bot safe starter instructions. You can edit them later.</p></div></div><fieldset className="template-field"><legend>Starting point</legend><div className="template-grid">{templates.map(({ id, icon: Icon, name: templateName, description: text }) => <label key={id} className={template === id ? 'is-selected' : ''}><input type="radio" name="template" value={id} checked={template === id} onChange={() => setTemplate(id)} /><Icon /><strong>{templateName}</strong><small>{text}</small></label>)}</div></fieldset></section> : null}
      {step === 2 ? <section className="agent-flow__panel"><div className="agent-flow__intro"><MessageSquare /><div><h3>Choose how it communicates</h3><p>The language applies to labels, starter questions, typed conversations, and AI answers.</p></div></div><div className="two-fields"><Field label="Response tone" htmlFor="create-tone"><select id="create-tone" value={tone} onChange={(event) => setTone(event.target.value as AgentTone)}><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="concise">Concise</option><option value="empathetic">Empathetic</option><option value="playful">Playful</option></select></Field><Field label="Primary language" htmlFor="create-language"><select id="create-language" value={language} onChange={(event) => setLanguage(event.target.value)}>{supportedWidgetLanguages.map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="agent-flow__language-preview" dir={language === 'Arabic' ? 'rtl' : 'ltr'}><small>Visitor preview</small><strong>{locale.welcomeTitle}</strong><span>{locale.suggestedQuestions[0]}</span></div></section> : null}
      {step === 3 ? <section className="agent-flow__panel"><div className="agent-flow__intro"><Globe2 /><div><h3>Where will people use this bot?</h3><p>Choose a channel now. The correct preview and deployment tools will be ready automatically.</p></div></div><fieldset className="deployment-option-field"><legend>Deployment channel</legend><div className="deployment-option-grid">{deploymentOptions.map(({ id, icon: Icon, name: optionName, description: text }) => <label key={id} className={deploymentChannel === id ? 'is-selected' : ''}><input type="radio" name="create-deployment-channel" value={id} checked={deploymentChannel === id} onChange={() => setDeploymentChannel(id)} /><Icon /><span><strong>{optionName}</strong><small>{text}</small></span></label>)}</div></fieldset><div className="agent-flow__summary"><span><small>Agent</small><strong>{name}</strong></span><span><small>Language</small><strong>{language}</strong></span><span><small>Channel</small><strong>{deploymentOptions.find((item) => item.id === deploymentChannel)?.name}</strong></span></div></section> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}
    </form>
  </Modal>;
}
