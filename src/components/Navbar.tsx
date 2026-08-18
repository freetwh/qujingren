import { Camera, Settings, BarChart3, Keyboard, PanelTop, CircleHelp } from 'lucide-react';
import { ServerSelector } from './ServerSelector';
import { SCREENSHOT_TIP } from '../constants/tips';
import type { ServerSelection } from '../types';

interface NavbarProps {
  currentPage: 'dashboard' | 'settings';
  onNavigate: (page: 'dashboard' | 'settings') => void;
  serverSelection?: ServerSelection;
  onServerSelect: (selection?: ServerSelection) => void;
  onManualCapture: () => void;
  capturing: boolean;
  shortcut: string;
  widgetOn: boolean;
  onToggleWidget: () => void;
}

export function Navbar({
  currentPage,
  onNavigate,
  serverSelection,
  onServerSelect,
  onManualCapture,
  capturing,
  shortcut,
  widgetOn,
  onToggleWidget,
}: NavbarProps) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-30 h-14 bg-background/80 backdrop-blur-xl border-b border-white/10">
      <div className="h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center neon-glow-sm">
              <BarChart3 size={18} className="text-white" />
            </div>
            <span className="text-base font-bold text-text-primary">取经人</span>
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
            <span className="group relative flex items-center" title={SCREENSHOT_TIP}>
              <CircleHelp
                size={15}
                aria-label="截图提示"
                className="cursor-help text-text-muted transition-colors group-hover:text-primary-400"
              />
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-72 -translate-x-1/2 rounded-lg border border-white/10 bg-background-100 px-3 py-2 text-xs leading-5 text-text-primary opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
              >
                {SCREENSHOT_TIP}
              </span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <ServerSelector selection={serverSelection} onSelect={onServerSelect} />

          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-xs text-text-muted">
            <Keyboard size={12} />
            <span>{shortcut}</span>
          </div>

          <button
            onClick={onToggleWidget}
            title={widgetOn ? '关闭桌面悬浮挂件' : '开启桌面悬浮挂件'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors cursor-pointer ${
              widgetOn
                ? 'bg-primary-600/20 text-primary-400'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            <PanelTop size={14} />
            桌面挂件
          </button>

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
