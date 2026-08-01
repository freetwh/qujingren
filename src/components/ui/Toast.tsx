import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
}

const icons = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

const colors = {
  success: 'border-success/30 bg-success/10 text-success',
  error: 'border-danger/30 bg-danger/10 text-danger',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
};

export function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  const [visible, setVisible] = useState(true);
  const Icon = icons[type];

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md transition-all duration-300 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      } ${colors[type]}`}
    >
      <Icon size={18} />
      <span className="text-sm font-medium">{message}</span>
      <button
        onClick={() => {
          setVisible(false);
          setTimeout(onClose, 300);
        }}
        className="ml-2 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
      >
        <X size={14} />
      </button>
    </div>
  );
}

/** Toast 管理器 */
export function useToast() {
  const [toasts, setToasts] = useState<
    Array<{ id: number; message: string; type: ToastType }>
  >([]);

  const show = (message: string, type: ToastType = 'info') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const remove = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return { toasts, show, remove };
}
