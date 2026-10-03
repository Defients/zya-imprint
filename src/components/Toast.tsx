import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: "text-emerald-300",
  error: "text-red-300",
  info: "text-pink-300",
  warning: "text-gold-300",
};

const TOAST_BORDER: Record<ToastType, string> = {
  success: "border-emerald-300/30",
  error: "border-red-300/30",
  info: "border-pink-300/25",
  warning: "border-gold-300/35",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = `toast-${++idCounter.current}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2.5"
        aria-live="assertive"
        role="region"
        aria-label="Notifications"
      >
        {toasts.map((item) => (
          <ToastView key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const Icon = TOAST_ICONS[item.type];

  const startLeave = useCallback(() => {
    setLeaving(true);
    setTimeout(() => onDismiss(item.id), 200);
  }, [item.id, onDismiss]);

  useEffect(() => {
    timerRef.current = setTimeout(startLeave, item.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [item.duration, startLeave]);

  return (
    <div
      className={`glass-panel animate-slide-up flex items-start gap-3 rounded-2xl border ${TOAST_BORDER[item.type]} px-4 py-3.5 shadow-2xl transition-all duration-200 ${
        leaving ? "translate-y-2 opacity-0" : "opacity-100"
      }`}
      role={item.type === "error" ? "alert" : "status"}
    >
      <Icon size={18} className={`mt-0.5 flex-shrink-0 ${TOAST_COLORS[item.type]}`} />
      <p className="flex-1 text-sm leading-5 text-slate-100">{item.message}</p>
      <button
        className="flex-shrink-0 text-slate-400 transition-colors hover:text-white"
        onClick={startLeave}
        aria-label="Dismiss notification"
      >
        <X size={15} />
      </button>
    </div>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
