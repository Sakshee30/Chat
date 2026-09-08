import { readStorage, writeStorage } from '@/lib/storage';

export type DnsStatus = 'not-configured' | 'pending' | 'verified';

export interface WorkspacePreferences {
  timezone: string;
  defaultLanguage: string;
  dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
}

export interface WhiteLabelSettings {
  companyName: string;
  logoDataUrl: string;
  faviconDataUrl: string;
  appIconDataUrl: string;
  primaryColor: string;
  secondaryColor: string;
  supportEmail: string | null;
  supportUrl: string;
  browserTitle: string;
  customDomain: string;
  dnsStatus: DnsStatus;
  brandedLogin: boolean;
  brandedDashboard: boolean;
  brandedWidget: boolean;
  brandedEmails: boolean;
  removePlatformBranding: boolean;
}

export interface WorkspaceSettings {
  id: string;
  name: string;
  slug: string;
  plan: string;
  memberCount: number;
  preferences: WorkspacePreferences;
  whiteLabel: WhiteLabelSettings;
}

export type WorkspacePatch = Partial<Pick<WorkspaceSettings, 'name' | 'slug' | 'preferences' | 'whiteLabel'>>;

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api/v1';
const STORAGE_KEY = 'northstar.workspace';
const SESSION_KEY = 'northstar.session';

class WorkspaceRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'WorkspaceRequestError'; }
}

const defaults: WorkspaceSettings = {
  id: 'workspace-demo',
  name: 'Northstar Workspace',
  slug: 'northstar',
  plan: 'business',
  memberCount: 1,
  preferences: { timezone: 'Asia/Calcutta', defaultLanguage: 'English', dateFormat: 'DD/MM/YYYY' },
  whiteLabel: {
    companyName: 'Northstar AI', logoDataUrl: '', faviconDataUrl: '', appIconDataUrl: '',
    primaryColor: '#146cf6', secondaryColor: '#705cf6', supportEmail: 'support@northstar.ai',
    supportUrl: 'https://northstar.ai/support', browserTitle: 'Northstar AI', customDomain: '',
    dnsStatus: 'not-configured', brandedLogin: true, brandedDashboard: true, brandedWidget: true,
    brandedEmails: true, removePlatformBranding: false,
  },
};

function localWorkspace(): WorkspaceSettings {
  const saved = readStorage<Partial<WorkspaceSettings>>(STORAGE_KEY, {});
  return {
    ...defaults,
    ...saved,
    preferences: { ...defaults.preferences, ...saved.preferences },
    whiteLabel: { ...defaults.whiteLabel, ...saved.whiteLabel },
  };
}

function bearer(): string | undefined {
  return readStorage<{ accessToken?: string } | null>(SESSION_KEY, null)?.accessToken;
}

async function remote<T>(method: 'GET' | 'PATCH', body?: unknown): Promise<T> {
  const token = bearer();
  const response = await fetch(`${API_URL}/workspace`, {
    method,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new WorkspaceRequestError(payload?.error?.message ?? `Workspace request failed (${response.status})`, response.status);
  }
  return response.json() as Promise<T>;
}

export const workspaceApi = {
  async get(): Promise<WorkspaceSettings> {
    try {
      const value = await remote<WorkspaceSettings>('GET');
      writeStorage(STORAGE_KEY, value);
      return value;
    } catch {
      return localWorkspace();
    }
  },
  async update(patch: WorkspacePatch): Promise<WorkspaceSettings> {
    const current = localWorkspace();
    const optimistic: WorkspaceSettings = {
      ...current,
      ...patch,
      preferences: { ...current.preferences, ...patch.preferences },
      whiteLabel: { ...current.whiteLabel, ...patch.whiteLabel },
    };
    writeStorage(STORAGE_KEY, optimistic);
    try {
      const value = await remote<WorkspaceSettings>('PATCH', patch);
      writeStorage(STORAGE_KEY, value);
      window.dispatchEvent(new CustomEvent('northstar:workspace-changed', { detail: value }));
      return value;
    } catch (error) {
      if (error instanceof WorkspaceRequestError && error.status >= 400 && error.status < 500) throw error;
      window.dispatchEvent(new CustomEvent('northstar:workspace-changed', { detail: optimistic }));
      return optimistic;
    }
  },
};

export const workspaceDefaults = defaults;
