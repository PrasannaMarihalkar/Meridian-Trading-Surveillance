import React, { useState } from 'react';
import { apiRequest, setStoredToken } from '../api';
import { Shield, User, Key, LogIn, UserPlus, X } from 'lucide-react';

export function AuthModal({
  isOpen,
  onClose,
  onLoginSuccess
}: {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: any) => void;
}) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('Password123!');
  const [role, setRole] = useState<'TRADER' | 'ANALYST' | 'ADMIN'>('TRADER');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        const res = await apiRequest('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, username, password, role })
        });
        setStoredToken(res.token);
        onLoginSuccess({ ...res.user, accountId: res.accountId });
      } else {
        const res = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ identifier: username || email, password })
        });
        setStoredToken(res.token);
        onLoginSuccess({ ...res.user, accountId: res.accountId });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoLogin = async (demoUsername: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier: demoUsername, password: 'Password123!' })
      });
      setStoredToken(res.token);
      onLoginSuccess({ ...res.user, accountId: res.accountId });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 mb-4">
          <div className="p-2 rounded-lg bg-blue-600/20 border border-blue-500/40 text-blue-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">MERIDIAN AUTHENTICATION</h3>
            <p className="text-xs text-slate-400">Argon2id/Bcrypt & Role-Based Security Gateway</p>
          </div>
        </div>

        {/* Demo Fast Login Pills */}
        <div className="mb-4 p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5">
          <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase">
            Quick Viva Demo Sign-In
          </span>
          <div className="grid grid-cols-3 gap-1.5 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('prasanna_trader')}
              className="py-1 px-2 rounded bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-emerald-900/60 font-semibold"
            >
              Trader
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('asha_analyst')}
              className="py-1 px-2 rounded bg-slate-900 hover:bg-slate-800 text-indigo-400 border border-indigo-900/60 font-semibold"
            >
              Analyst
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemoLogin('sys_admin')}
              className="py-1 px-2 rounded bg-slate-900 hover:bg-slate-800 text-amber-400 border border-amber-900/60 font-semibold"
            >
              Admin
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">EMAIL ADDRESS</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="trader@meridian.internal"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              {isRegister ? 'USERNAME' : 'USERNAME OR EMAIL'}
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="e.g. prasanna_trader"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">PASSWORD</label>
            <input
              type="password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">SECURITY ROLE</label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as any)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
              >
                <option value="TRADER">TRADER (Trading Account & Risk Limits)</option>
                <option value="ANALYST">ANALYST (Surveillance & Pattern Triage)</option>
                <option value="ADMIN">ADMIN (System Logs & Parameter Tuning)</option>
              </select>
            </div>
          )}

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs font-mono">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 mt-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-sm tracking-wide transition shadow-lg shadow-blue-900/40 disabled:opacity-50"
          >
            {loading ? 'PROCESSING...' : isRegister ? 'CREATE ACCOUNT' : 'SECURE SIGN IN'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-slate-400 hover:text-white"
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Register as New Trader"}
          </button>
        </div>
      </div>
    </div>
  );
}
