import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Check, Trash2 } from 'lucide-react';
import type { Server } from '../types';

interface ServerSelectorProps {
  servers: Server[];
  currentServer: string;
  onSelect: (server: string) => void;
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
}

export function ServerSelector({
  servers,
  currentServer,
  onSelect,
  onAdd,
  onDelete,
}: ServerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAdd = () => {
    if (newName.trim()) {
      onAdd(newName.trim());
      setNewName('');
      setAdding(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer text-sm"
      >
        <span className="text-text-secondary">区服:</span>
        <span className="text-text-primary font-medium">{currentServer}</span>
        <ChevronDown
          size={14}
          className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 glass-card z-40 py-1 max-h-64 overflow-y-auto">
          {servers.map((server) => (
            <div
              key={server.id}
              className="flex items-center justify-between px-3 py-2 hover:bg-white/5 cursor-pointer group"
              onClick={() => {
                onSelect(server.name);
                setOpen(false);
              }}
            >
              <div className="flex items-center gap-2">
                {server.name === currentServer && (
                  <Check size={14} className="text-primary-400" />
                )}
                <span
                  className={`text-sm ${
                    server.name === currentServer ? 'text-primary-400' : 'text-text-primary'
                  }`}
                >
                  {server.name}
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(server.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all cursor-pointer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}

          {adding ? (
            <div className="px-3 py-2 flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="输入区服名称"
                className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-text-primary outline-none focus:border-primary-500"
              />
              <button
                onClick={handleAdd}
                className="text-primary-400 hover:text-primary-300 cursor-pointer"
              >
                <Check size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAdding(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>添加区服</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
