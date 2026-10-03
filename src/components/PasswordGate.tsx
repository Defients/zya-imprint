import { useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { isUnlocked, setUnlocked, verifyPassword } from "../utils/password";

interface PasswordGateProps {
  children: ReactNode;
}

export function PasswordGate({ children }: PasswordGateProps) {
  const [unlocked, setUnlockedState] = useState(() => isUnlocked());
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input || checking) return;
    setChecking(true);
    setError(false);
    const ok = await verifyPassword(input);
    if (ok) {
      setUnlocked();
      setUnlockedState(true);
    } else {
      setError(true);
      setInput("");
    }
    setChecking(false);
  };

  if (unlocked) return <>{children}</>;

  return (
    <div className="password-gate min-h-screen flex items-center justify-center px-4">
      <div className="glass-panel w-full max-w-sm rounded-[28px] p-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="brand-sigil" aria-hidden="true"><span>Z</span></div>
          <div>
            <p className="eyebrow">DEFFY // ZYA SYSTEMS</p>
            <h1 className="brand-title mt-1">SIGNAL VAULT</h1>
          </div>

          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="field-label text-left" htmlFor="pwd">Access Key</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  id="pwd"
                  type="password"
                  className="cosmo-input w-full rounded-2xl px-10 py-3 text-sm"
                  placeholder="Enter access key"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setError(false); }}
                  autoFocus
                  autoComplete="off"
                />
              </div>
            </div>

            {error && (
              <p className={`text-sm text-red-400 ${error ? "animate-shake" : ""}`}>
                Access denied. Try again.
              </p>
            )}

            <button
              type="submit"
              className="cosmo-btn cosmo-btn-primary rounded-2xl px-5 py-3 text-sm font-bold"
              disabled={checking || !input}
            >
              {checking ? "Verifying…" : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
