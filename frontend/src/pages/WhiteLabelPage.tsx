import {
  ArrowLeft, Check, Copy, Globe2, Image, LayoutDashboard, Mail, MessageSquare,
  Monitor, RefreshCw, Save, ShieldCheck, Upload, UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { WorkspaceNavigation } from '@/components/workspace-navigation';
import { useToast } from '@/components/providers';
import { Badge, Button, Card, Field, PageLoader, Switch } from '@/components/ui';
import { workspaceApi, type WhiteLabelSettings, type WorkspaceSettings } from '@/lib/workspace-api';

type Preview = 'dashboard' | 'login' | 'widget' | 'email';

const previewTabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'login', label: 'Login', icon: UserRound },
  { id: 'widget', label: 'Widget', icon: MessageSquare },
  { id: 'email', label: 'Email', icon: Mail },
] as const;

export function WhiteLabelPage() {
  const { pushToast } = useToast();
  const [workspace, setWorkspace] = useState<WorkspaceSettings | null>(null);
  const [saved, setSaved] = useState<WhiteLabelSettings | null>(null);
  const [preview, setPreview] = useState<Preview>('dashboard');
  const [saving, setSaving] = useState(false);
  const [checkingDomain, setCheckingDomain] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    void workspaceApi.get().then((value) => { setWorkspace(value); setSaved(value.whiteLabel); });
    return () => window.clearTimeout(timeoutRef.current);
  }, []);

  if (!workspace || !saved) return <PageLoader />;
  const brand = workspace.whiteLabel;
  const dirty = JSON.stringify(brand) !== JSON.stringify(saved);
  const setBrand = (patch: Partial<WhiteLabelSettings>) => setWorkspace({ ...workspace, whiteLabel: { ...brand, ...patch } });
  const previewStyle = { '--wl-primary': brand.primaryColor, '--wl-secondary': brand.secondaryColor } as CSSProperties;

  async function save(event?: FormEvent) {
    event?.preventDefault(); setSaving(true);
    try {
      const next = await workspaceApi.update({ whiteLabel: brand });
      setWorkspace(next); setSaved(next.whiteLabel); pushToast('White Label settings saved');
    } catch (error) {
      pushToast(error instanceof Error ? error.message : 'White Label settings could not be saved', 'error');
    } finally { setSaving(false); }
  }

  function reset() {
    setWorkspace({ ...workspace!, whiteLabel: saved! });
    pushToast('Unsaved White Label changes reset', 'info');
  }

  function imageChange(key: 'logoDataUrl' | 'faviconDataUrl' | 'appIconDataUrl') {
    return (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 350_000) {
        pushToast('Use a PNG, JPG, or WebP image smaller than 350 KB', 'error'); return;
      }
      const reader = new FileReader();
      reader.onload = () => setBrand({ [key]: String(reader.result) });
      reader.readAsDataURL(file);
    };
  }

  function checkDomain() {
    if (!brand.customDomain || !brand.customDomain.includes('.')) { pushToast('Enter a valid custom domain first', 'error'); return; }
    setCheckingDomain(true); setBrand({ dnsStatus: 'pending' });
    timeoutRef.current = window.setTimeout(() => { setCheckingDomain(false); pushToast('DNS check complete. Add the records shown below, then check again.', 'info'); }, 700);
  }

  return <div className="page workspace-console-page white-label-page" style={previewStyle}>
    <div className="page-heading page-heading--split white-label-title"><div><Link to="/workspace" className="white-label-back"><ArrowLeft />Workspace</Link><h2>White Label</h2><p>Make every customer-facing touchpoint feel like your own product.</p></div><div className="white-label-heading-actions"><Badge tone={dirty ? 'warning' : 'success'}>{dirty ? 'Unsaved changes' : <><Check /> All changes saved</>}</Badge><Button type="button" variant="secondary" onClick={reset} disabled={!dirty}><RefreshCw />Reset</Button><Button type="button" onClick={() => void save()} disabled={saving || !dirty}><Save />{saving ? 'Saving…' : 'Save changes'}</Button></div></div>
    <div className="workspace-console-layout white-label-layout">
      <WorkspaceNavigation active="white-label" onSelect={(id) => { window.location.href = id === 'workspace' ? '/workspace' : `/workspace?section=${id}`; }} />
      <form className="white-label-editor" onSubmit={save}>
        <Card className="workspace-panel"><WhiteLabelHeading icon={Image} title="Brand identity" description="Your logo and product name appear across enabled branded experiences." /><div className="workspace-panel__body">
          <div className="white-label-assets">
            <AssetUpload label="Primary logo" hint="PNG, JPG or WebP · max 350 KB" value={brand.logoDataUrl} fallback={brand.companyName.charAt(0)} onChange={imageChange('logoDataUrl')} onClear={() => setBrand({ logoDataUrl: '' })} wide />
            <AssetUpload label="Favicon" hint="Recommended 64 × 64" value={brand.faviconDataUrl} fallback={brand.companyName.charAt(0)} onChange={imageChange('faviconDataUrl')} onClear={() => setBrand({ faviconDataUrl: '' })} />
            <AssetUpload label="App icon" hint="Recommended 512 × 512" value={brand.appIconDataUrl} fallback={brand.companyName.charAt(0)} onChange={imageChange('appIconDataUrl')} onClear={() => setBrand({ appIconDataUrl: '' })} />
          </div>
          <div className="two-fields"><Field label="Company or product name" htmlFor="wl-company-name"><input id="wl-company-name" value={brand.companyName} onChange={(event) => setBrand({ companyName: event.target.value })} required /></Field><Field label="Browser title" htmlFor="wl-browser-title"><input id="wl-browser-title" value={brand.browserTitle} onChange={(event) => setBrand({ browserTitle: event.target.value })} required /></Field></div>
          <div className="two-fields"><Field label="Support email" htmlFor="wl-support-email"><input id="wl-support-email" type="email" value={brand.supportEmail ?? ''} onChange={(event) => setBrand({ supportEmail: event.target.value || null })} placeholder="support@yourcompany.com" /></Field><Field label="Support URL" htmlFor="wl-support-url"><input id="wl-support-url" type="url" value={brand.supportUrl} onChange={(event) => setBrand({ supportUrl: event.target.value })} placeholder="https://yourcompany.com/help" /></Field></div>
        </div></Card>

        <Card className="workspace-panel"><WhiteLabelHeading icon={Monitor} title="Brand theme" description="Colors update every preview instantly while you edit." /><div className="workspace-panel__body"><div className="white-label-colors"><ColorField label="Primary color" value={brand.primaryColor} onChange={(value) => setBrand({ primaryColor: value })} /><ColorField label="Secondary color" value={brand.secondaryColor} onChange={(value) => setBrand({ secondaryColor: value })} /></div><div className="white-label-swatches"><button type="button" onClick={() => setBrand({ primaryColor: '#146cf6', secondaryColor: '#705cf6' })}><i style={{ background: '#146cf6' }} /><i style={{ background: '#705cf6' }} />Ocean</button><button type="button" onClick={() => setBrand({ primaryColor: '#7c3aed', secondaryColor: '#ec4899' })}><i style={{ background: '#7c3aed' }} /><i style={{ background: '#ec4899' }} />Aurora</button><button type="button" onClick={() => setBrand({ primaryColor: '#0f766e', secondaryColor: '#d97706' })}><i style={{ background: '#0f766e' }} /><i style={{ background: '#d97706' }} />Forest</button><button type="button" onClick={() => setBrand({ primaryColor: '#111827', secondaryColor: '#475569' })}><i style={{ background: '#111827' }} /><i style={{ background: '#475569' }} />Mono</button></div></div></Card>

        <Card className="workspace-panel"><WhiteLabelHeading icon={Globe2} title="Custom domain" description="Serve the branded experience from a domain you control." action={<Badge tone={brand.dnsStatus === 'verified' ? 'success' : brand.dnsStatus === 'pending' ? 'warning' : 'neutral'}>{brand.dnsStatus.replace('-', ' ')}</Badge>} /><div className="workspace-panel__body"><div className="white-label-domain"><Field label="Branded domain" htmlFor="wl-custom-domain" hint="Enter a hostname without https://"><input id="wl-custom-domain" value={brand.customDomain} onChange={(event) => setBrand({ customDomain: event.target.value.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''), dnsStatus: event.target.value ? 'pending' : 'not-configured' })} placeholder="chat.yourcompany.com" /></Field><Button type="button" variant="secondary" onClick={checkDomain} disabled={checkingDomain}>{checkingDomain ? 'Checking…' : 'Check DNS'}</Button></div>{brand.customDomain ? <div className="dns-record"><div><small>Type</small><strong>CNAME</strong></div><div><small>Name</small><code>{brand.customDomain.split('.')[0]}</code></div><div><small>Value</small><code>domains.northstar.ai</code></div><button type="button" className="icon-button" aria-label="Copy DNS value" onClick={() => void navigator.clipboard.writeText('domains.northstar.ai').then(() => pushToast('DNS value copied'))}><Copy /></button></div> : null}</div></Card>

        <Card className="workspace-panel"><WhiteLabelHeading icon={ShieldCheck} title="Branded experiences" description="Choose where customers see your identity." /><div className="workspace-panel__body"><Switch checked={brand.brandedLogin} onChange={(value) => setBrand({ brandedLogin: value })} label="Branded login" description="Use your identity on the client sign-in experience." /><Switch checked={brand.brandedDashboard} onChange={(value) => setBrand({ brandedDashboard: value })} label="Branded dashboard" description="Apply your logo and colors to client workspaces." /><Switch checked={brand.brandedWidget} onChange={(value) => setBrand({ brandedWidget: value })} label="Branded widget" description="Apply your identity to website and integration chat surfaces." /><Switch checked={brand.brandedEmails} onChange={(value) => setBrand({ brandedEmails: value })} label="Branded email" description="Use your sender identity in invitations and notifications." /><Switch checked={brand.removePlatformBranding} onChange={(value) => setBrand({ removePlatformBranding: value })} label="Remove “Powered by Northstar”" description="Hide the platform badge from customer-facing experiences." /></div></Card>
        <div className="white-label-mobile-save"><Button type="submit" disabled={saving || !dirty}><Save />Save changes</Button></div>
      </form>

      <aside className="white-label-preview" aria-label="Live White Label preview"><div className="white-label-preview__top"><span><i />Live preview</span><div>{previewTabs.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={preview === id ? 'is-active' : ''} onClick={() => setPreview(id)} title={label} aria-label={`${label} preview`}><Icon /></button>)}</div></div><div className="white-label-preview__canvas"><div className="white-label-browser"><div className="white-label-browser__bar"><i /><i /><i /><span>{brand.customDomain || 'app.yourcompany.com'}</span></div>{preview === 'dashboard' ? <DashboardPreview brand={brand} /> : null}{preview === 'login' ? <LoginPreview brand={brand} /> : null}{preview === 'widget' ? <WidgetPreview brand={brand} /> : null}{preview === 'email' ? <EmailPreview brand={brand} /> : null}</div></div><p>Preview updates instantly. Save when the brand is ready.</p></aside>
    </div>
  </div>;
}

function WhiteLabelHeading({ icon: Icon, title, description, action }: { icon: typeof Image; title: string; description: string; action?: ReactNode }) { return <div className="workspace-panel__heading"><span><Icon /></span><div><h3>{title}</h3><p>{description}</p></div>{action}</div>; }
function AssetUpload({ label, hint, value, fallback, onChange, onClear, wide = false }: { label: string; hint: string; value: string; fallback: string; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void; wide?: boolean }) { return <div className={`white-label-asset ${wide ? 'white-label-asset--wide' : ''}`}><div>{value ? <img src={value} alt="" /> : <span>{fallback}</span>}</div><section><strong>{label}</strong><small>{hint}</small><label><Upload />Upload<input type="file" accept="image/png,image/jpeg,image/webp" onChange={onChange} /></label>{value ? <button type="button" onClick={onClear}>Remove</button> : null}</section></div>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { const id = `wl-${label.toLowerCase().replaceAll(' ', '-')}`; return <Field label={label} htmlFor={id}><div className="white-label-color"><input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={`${label} picker`} /><input id={id} value={value} onChange={(event) => onChange(event.target.value)} pattern="#[0-9a-fA-F]{6}" /></div></Field>; }
function BrandMark({ brand, compact = false }: { brand: WhiteLabelSettings; compact?: boolean }) { return <div className={`white-label-brand ${compact ? 'is-compact' : ''}`}>{brand.logoDataUrl ? <img src={brand.logoDataUrl} alt="" /> : <i>{brand.companyName.charAt(0)}</i>}<strong>{brand.companyName}</strong></div>; }
function PoweredBy({ brand }: { brand: WhiteLabelSettings }) { return brand.removePlatformBranding ? null : <small className="white-label-powered">Powered by Northstar</small>; }
function DashboardPreview({ brand }: { brand: WhiteLabelSettings }) { return <div className="wl-dashboard"><aside><BrandMark brand={brand} compact /><span className="is-active" /><span /><span /><span /></aside><main><header><div><small>Workspace</small><strong>Good morning</strong></div><i /></header><section><div><small>Conversations</small><strong>1,892</strong><em>+12.4%</em></div><div><small>Resolution rate</small><strong>87%</strong><em>+4.2%</em></div></section><article><div><strong>Conversation activity</strong><small>Last 7 days</small></div><svg viewBox="0 0 320 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 86 C45 78, 52 48, 91 59 S150 90, 176 49 S236 18, 320 33" /></svg></article><PoweredBy brand={brand} /></main></div>; }
function LoginPreview({ brand }: { brand: WhiteLabelSettings }) { return <div className="wl-login"><div><BrandMark brand={brand} /><h3>Welcome back</h3><p>Sign in to continue to your workspace.</p><label>Email address<span>you@company.com</span></label><label>Password<span>••••••••••••</span></label><button type="button">Sign in</button><PoweredBy brand={brand} /></div></div>; }
function WidgetPreview({ brand }: { brand: WhiteLabelSettings }) { return <div className="wl-widget"><div className="wl-widget-card"><header><BrandMark brand={brand} compact /><button type="button">•••</button></header><main><div className="wl-message is-agent">Hi! How can I help you today?</div><div className="wl-message is-user">Tell me about your services.</div><div className="wl-message is-agent">I can help you find the right answer from our trusted knowledge.</div></main><footer><span>Ask anything…</span><button type="button">↑</button></footer><PoweredBy brand={brand} /></div></div>; }
function EmailPreview({ brand }: { brand: WhiteLabelSettings }) { return <div className="wl-email"><div><BrandMark brand={brand} /><hr /><h3>You’re invited</h3><p>Your team has invited you to collaborate in their AI workspace.</p><button type="button">Accept invitation</button><small>Need help? {brand.supportEmail || 'Contact support'}</small><PoweredBy brand={brand} /></div></div>; }
