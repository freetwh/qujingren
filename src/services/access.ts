import { invoke } from '@tauri-apps/api/core';
import { getRemoteApiConfig } from './env';

const ACCESS_KEY = 'mhxy_client_access_v1';

interface StoredAccess {
  inviteCode: string;
  machineId: string;
}

export type AuthorizationResult =
  { status: 'authorized'; offline: boolean } | { status: 'denied' | 'unavailable'; offline: false };

let machineIdentityPromise: Promise<string> | undefined;

function normalizeInviteCode(value: string): string {
  return value.trim().toUpperCase();
}

function readStoredAccess(): StoredAccess | undefined {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? 'null');
    if (!value || typeof value !== 'object') return undefined;
    const access = value as Partial<StoredAccess>;
    if (!access.inviteCode || !access.machineId) return undefined;
    return {
      inviteCode: normalizeInviteCode(access.inviteCode),
      machineId: access.machineId,
    };
  } catch {
    return undefined;
  }
}

export function getStoredInviteCode(): string {
  return readStoredAccess()?.inviteCode ?? '';
}

export function getMachineIdentity(): Promise<string> {
  machineIdentityPromise ??= invoke<string>('get_machine_identity');
  return machineIdentityPromise;
}

export async function getAccessHeaders(): Promise<Record<string, string>> {
  const access = readStoredAccess();
  if (!access) throw new Error('client access is not activated');
  const machineId = await getMachineIdentity();
  if (machineId !== access.machineId) throw new Error('client machine identity changed');
  return {
    'x-invite-code': access.inviteCode,
    'x-machine-id': machineId,
  };
}

export async function authorizeDevice(inviteCodeInput: string): Promise<AuthorizationResult> {
  const inviteCode = normalizeInviteCode(inviteCodeInput);
  if (inviteCode.length < 16 || inviteCode.length > 128) {
    return { status: 'denied', offline: false };
  }

  let machineId: string;
  try {
    machineId = await getMachineIdentity();
  } catch {
    return { status: 'unavailable', offline: false };
  }

  const stored = readStoredAccess();
  const canUseOffline = stored?.inviteCode === inviteCode && stored.machineId === machineId;
  const { url } = getRemoteApiConfig();
  if (!url) {
    return canUseOffline
      ? { status: 'authorized', offline: true }
      : { status: 'unavailable', offline: false };
  }

  try {
    const response = await fetch(`${url}/devices/authorize`, {
      method: 'POST',
      headers: {
        'x-invite-code': inviteCode,
        'x-machine-id': machineId,
      },
    });
    if (!response.ok) {
      if ([401, 403, 409].includes(response.status)) {
        localStorage.removeItem(ACCESS_KEY);
        return { status: 'denied', offline: false };
      }
      return canUseOffline
        ? { status: 'authorized', offline: true }
        : { status: 'unavailable', offline: false };
    }

    localStorage.setItem(ACCESS_KEY, JSON.stringify({ inviteCode, machineId }));
    return { status: 'authorized', offline: false };
  } catch {
    return canUseOffline
      ? { status: 'authorized', offline: true }
      : { status: 'unavailable', offline: false };
  }
}
