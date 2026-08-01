import { type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  title: string;
  sortable?: boolean;
  render?: (value: unknown, row: T, index: number) => ReactNode;
  className?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  onRowClick?: (row: T, index: number) => void;
  sortKey?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  rowClassName?: (row: T, index: number) => string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading = false,
  emptyText = '暂无数据',
  onRowClick,
  sortKey,
  sortOrder,
  onSort,
  rowClassName,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="glass-card p-8">
        <div className="flex items-center justify-center gap-3 text-text-secondary">
          <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-sm font-semibold text-text-secondary ${
                    col.sortable ? 'cursor-pointer select-none hover:text-text-primary' : ''
                  } ${col.className || ''}`}
                  onClick={() => col.sortable && onSort?.(col.key)}
                >
                  <div className="flex items-center gap-1">
                    <span>{col.title}</span>
                    {col.sortable && (
                      <span className="text-text-muted">
                        {sortKey === col.key ? (
                          sortOrder === 'asc' ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )
                        ) : (
                          <ChevronsUpDown size={14} />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-text-muted"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((row, index) => (
                <tr
                  key={index}
                  className={`border-b border-white/5 transition-colors duration-150 ${
                    onRowClick ? 'cursor-pointer hover:bg-white/5' : ''
                  } ${rowClassName?.(row, index) || ''}`}
                  onClick={() => onRowClick?.(row, index)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-sm text-text-primary ${col.className || ''}`}
                    >
                      {col.render
                        ? col.render(row[col.key], row, index)
                        : String(row[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
