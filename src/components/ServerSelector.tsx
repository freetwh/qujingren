import { useEffect, useMemo, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { AlertTriangle, Check, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import {
  formatServerSelection,
  hasCompleteServerSelection,
  loadServerCatalog,
} from '../services/serverCatalog';
import type {
  GameServer,
  ServerCatalog,
  ServerRegion,
  ServerSelection,
  ServerType,
  ServerTypeId,
} from '../types';

interface ServerSelectorProps {
  selection?: ServerSelection;
  onSelect: (selection?: ServerSelection) => void;
}

interface CascadeOptionProps {
  active: boolean;
  hasNext?: boolean;
  label: string;
  onClick: () => void;
}

function CascadeOption({ active, hasNext = false, label, onClick }: CascadeOptionProps) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors ${
        active
          ? 'bg-primary-600/25 text-primary-300'
          : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active && !hasNext ? (
        <Check size={14} className="shrink-0" />
      ) : hasNext ? (
        <ChevronRight size={14} className="shrink-0 opacity-70" />
      ) : null}
    </button>
  );
}

function hasImplicitRegion(type?: ServerType): boolean {
  return type?.id === 'free' && type.regions.length === 1;
}

function formatUpdatedAt(value: string): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0] ?? '未知';
}

export function ServerSelector({ selection, onSelect }: ServerSelectorProps) {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<ServerCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [typeId, setTypeId] = useState<ServerTypeId | ''>(selection?.typeId ?? '');
  const [regionId, setRegionId] = useState(selection?.regionId ?? '');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setCatalog(await loadServerCatalog());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setTypeId(selection?.typeId ?? '');
    setRegionId(selection?.regionId ?? '');
  }, [selection]);

  useEffect(() => {
    if (catalog && selection && !hasCompleteServerSelection(selection)) {
      onSelect(undefined);
    }
  }, [catalog, onSelect, selection]);

  const selectedType = useMemo(
    () => catalog?.types.find((type) => type.id === typeId),
    [catalog, typeId]
  );
  const selectedRegion = useMemo(
    () => selectedType?.regions.find((region) => region.id === regionId),
    [selectedType, regionId]
  );
  const isTwoLevel = hasImplicitRegion(selectedType);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setTypeId(selection?.typeId ?? '');
      setRegionId(selection?.regionId ?? '');
    }
    setOpen(nextOpen);
  };

  const handleTypeSelect = (type: ServerType) => {
    setTypeId(type.id);
    setRegionId(hasImplicitRegion(type) ? type.regions[0].id : '');
  };

  const handleRegionSelect = (region: ServerRegion) => {
    setRegionId(region.id);
  };

  const handleServerSelect = (server: GameServer) => {
    if (!selectedType || !selectedRegion) return;
    onSelect({
      typeId: selectedType.id,
      typeName: selectedType.name,
      regionId: selectedRegion.id,
      regionName: selectedRegion.name,
      serverId: server.id,
      serverName: server.name,
    });
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`flex max-w-md items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
            selection
              ? 'border-white/10 bg-white/5 hover:bg-white/10'
              : 'border-danger/60 bg-danger/10 text-danger'
          }`}
        >
          <span className="shrink-0 text-text-secondary">
            区服<span className="text-danger">*</span>:
          </span>
          <span className="truncate font-medium">{formatServerSelection(selection)}</span>
          <ChevronDown
            size={14}
            className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="z-50 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-[#18182a] shadow-2xl outline-none"
        >
          {loading && !catalog ? (
            <div className="w-64 px-4 py-6 text-center text-sm text-text-muted">
              正在加载公共区服数据...
            </div>
          ) : (
            <div className="flex max-w-full overflow-x-auto p-2">
              <div className="w-32 shrink-0 border-r border-white/10 pr-2">
                <div className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-text-muted">服类型</div>
                <div role="listbox" aria-label="服类型" className="space-y-0.5">
                  {catalog?.types.map((type) => (
                    <CascadeOption
                      key={type.id}
                      label={type.name}
                      active={type.id === typeId}
                      hasNext
                      onClick={() => handleTypeSelect(type)}
                    />
                  ))}
                </div>
              </div>

              {selectedType && !isTwoLevel && (
                <div className="w-44 shrink-0 border-r border-white/10 px-2">
                  <div className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-text-muted">大区</div>
                  <div
                    role="listbox"
                    aria-label="大区"
                    className="widget-scroll max-h-80 space-y-0.5 overflow-y-auto pr-1"
                  >
                    {selectedType.regions.map((region) => (
                      <CascadeOption
                        key={`${region.id}-${region.name}`}
                        label={region.name}
                        active={region.id === regionId}
                        hasNext
                        onClick={() => handleRegionSelect(region)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedType && selectedRegion && (
                <div className="w-48 shrink-0 pl-2">
                  <div className="px-2.5 pb-1.5 pt-1 text-xs font-medium text-text-muted">小区</div>
                  <div
                    role="listbox"
                    aria-label="小区"
                    className="widget-scroll max-h-80 space-y-0.5 overflow-y-auto pr-1"
                  >
                    {selectedRegion.servers.map((server) => (
                      <CascadeOption
                        key={`${server.id}-${server.name}`}
                        label={server.name}
                        active={
                          selection?.typeId === selectedType.id &&
                          selection.regionId === selectedRegion.id &&
                          selection.serverId === server.id &&
                          selection.serverName === server.name
                        }
                        onClick={() => handleServerSelect(server)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(error || catalog) && (
            <div className="border-t border-white/10 px-3 py-2">
              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-danger/10 p-2 text-xs text-danger">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button type="button" onClick={() => void load()} title="重新加载">
                    <RefreshCw size={14} />
                  </button>
                </div>
              )}
              {catalog && (
                <div className="text-right text-[11px] text-text-muted">
                  更新时间：{formatUpdatedAt(catalog.updatedAt)}
                </div>
              )}
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
