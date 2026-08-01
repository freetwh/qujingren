import { Camera, Settings, BarChart3, Keyboard } from 'lucide-react';
import { ServerSelector } from './ServerSelector';
import type { Server } from '../types';

interface NavbarProps {
  currentPage: 'dashboard' | 'settings';
  onNavigate: (page: 'dashboard' | 'settings') => void;
  servers: Server[];
  currentServer: string;
  onServerSelect: (server: string) => void;
  onServerAdd: (name: string) => void;
  onServerDelete: (id: string) => void;
  onManualCapture: () => void;
  capturing: boolean;
  shortcut: string;
}

export function Navbar({
  currentPage,
  onNavigate,
  servers,
  currentServer,
  onServerSelect,
  onServerAdd,
  onServerDelete,
  onManualCapture,
  capturing,
  shortcut,
}: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-30 h-14 bg-background/80 backdrop-blur-xl border-b border-white/10">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center neon-glow-sm">
              <BarChart3 size={18} className="text-white" />
            </div>
            <span className="text-base font-bold text-text-primary">梦幻西游商品库</span>
          </div>

          <div className="flex items-center gap-1 ml-4">
            <button
              onClick={() => onNavigate('dashboard')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                currentPage === 'dashboard'
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              数据看板
            </button>
            <button
              onClick={() => onNavigate('settings')}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
                currentPage === 'settings'
                  ? 'bg-primary-600/20 text-primary-400'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <Settings size={14} className="inline mr-1" />
              设置
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ServerSelector
            servers={servers}
            currentServer={currentServer}
            onSelect={onServerSelect}
            onAdd={onServerAdd}
            onDelete={onServerDelete}
          />

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-xs text-text-muted">
            <Keyboard size={12} />
            <span>{shortcut}</span>
          </div>

          <button
            onClick={onManualCapture}
            disabled={capturing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              capturing
                ? 'bg-primary-600/50 text-white/50 cursor-not-allowed'
                : 'bg-primary-600 text-white hover:bg-primary-500 neon-glow-sm'
            }`}
          >
            <Camera size={14} />
            {capturing ? '识别中...' : '手动截图'}
          </button>
        </div>
      </div>
    </nav>
  );
}
