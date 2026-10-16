import { invoke } from '@tauri-apps/api/core';

let machineIdentityPromise: Promise<string> | undefined;

function resolveMachineIdentity(): Promise<string> {
  machineIdentityPromise ??= invoke<string>('get_machine_identity');
  return machineIdentityPromise;
}

/**
 * 上报时附带的设备指纹头。
 * 拿不到机器指纹（非 Windows / 命令失败）时退化为不带头的上报，不影响数据提交。
 */
export async function getDeviceHeaders(): Promise<Record<string, string>> {
  try {
    return { 'x-machine-id': await resolveMachineIdentity() };
  } catch {
    return {};
  }
}
