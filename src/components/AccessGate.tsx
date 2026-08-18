import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { KeyRound } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/shadcn-card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { authorizeDevice, getStoredInviteCode, type AuthorizationResult } from '../services/access';

interface AccessGateProps {
  children: ReactNode;
}

export function AccessGate({ children }: AccessGateProps) {
  const [inviteCode, setInviteCode] = useState(getStoredInviteCode());
  const [checking, setChecking] = useState(Boolean(inviteCode));
  const [authorized, setAuthorized] = useState(false);
  const [message, setMessage] = useState('');

  const applyResult = async (result: AuthorizationResult) => {
    if (result.status === 'authorized') {
      setAuthorized(true);
      setMessage(result.offline ? '当前处于离线状态，部分功能将在联网后恢复' : '');
      await invoke('set_client_authorized', { authorized: true }).catch(console.error);
      return;
    }

    await invoke('set_client_authorized', { authorized: false }).catch(console.error);
    setAuthorized(false);
    setMessage(
      result.status === 'denied'
        ? '邀请码无效、已停用或已绑定其他设备'
        : '验证服务暂不可用，请检查网络后重试'
    );
  };

  const verify = async (code: string) => {
    setChecking(true);
    setMessage('');
    try {
      await applyResult(await authorizeDevice(code));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (inviteCode) void verify(inviteCode);
    else void invoke('set_client_authorized', { authorized: false }).catch(console.error);
    // 首次挂载时检查已保存的邀请码；用户输入由表单提交处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!checking) void verify(inviteCode);
  };

  if (authorized) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary-600/20 p-3 text-primary-400">
              <KeyRound size={24} />
            </div>
            <div>
              <CardTitle className="text-xl">客户端激活</CardTitle>
              <CardDescription className="mt-1">邀请码首次验证后将与本机绑定</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="invite-code">邀请码</Label>
              <Input
                id="invite-code"
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="请输入邀请码"
                className="h-11 font-mono uppercase placeholder:font-sans placeholder:normal-case"
              />
            </div>
            {message && <p className="text-sm text-warning">{message}</p>}
            <Button
              type="submit"
              size="lg"
              disabled={checking || !inviteCode.trim()}
              className="w-full"
            >
              {checking ? '正在验证...' : '激活并进入'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
