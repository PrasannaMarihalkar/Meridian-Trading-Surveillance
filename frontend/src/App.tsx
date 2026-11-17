import React, { useState, useEffect } from 'react';
import { apiRequest, clearStoredToken } from './api';
import { TradingTerminal } from './components/TradingTerminal';
import { SurveillanceConsole } from './components/SurveillanceConsole';
import { SystemAudit } from './components/SystemAudit';
import { CollegeShowcase } from './components/CollegeShowcase';
import { AuthModal } from './components/AuthModal';
import { Shield, TrendingUp, History, BookOpen, LogOut, User as UserIcon, Radio } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'TRADING' | 'SURVEILLANCE' | 'SYSTEM' | 'COLLEGE'>('TRADING');
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  const fetchCurrentUser = async () => {
    try {
      const profile = await apiRequest('/auth/me');
      setUser(profile);
    } catch (e) {
      setUser(null);
    }
  };

  useEffect(() => {
    fetchCurrentUser();

    // Setup WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || 'localhost:4000';
    const wsUrl = `${protocol}//${host}/ws`;

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        setWsConnected(true);
        console.log('[WS] Connected to live exchange stream');
      };
      ws.onclose = () => {
        setWsConnected(false);
      };
      ws.onerror = () => {
        setWsConnected(false);
      };
    } catch (err) {
      setWsConnected(false);
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  const handleLogout = () => {
    clearStoredToken();
    setUser(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo & Platform Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-lg shadow-blue-900/50">
              <span className="font-mono font-black text-white text-lg tracking-tighter">M</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-white text-base tracking-wider">MERIDIAN</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  v1.0.0
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block -mt-0.5 font-mono">
                Trading Core & Market Surveillance
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex space-x-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800/80">
            <button
              onClick={() => setActiveTab('TRADING')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'TRADING' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Trading Terminal</span>
            </button>
            <button
              onClick={() => setActiveTab('SURVEILLANCE')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'SURVEILLANCE' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Surveillance</span>
            </button>
            <button
              onClick={() => setActiveTab('SYSTEM')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'SYSTEM' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Audit Trail</span>
            </button>
            <button
              onClick={() => setActiveTab('COLLEGE')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeTab === 'COLLEGE'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>College Showcase</span>
            </button>
          </nav>

          {/* User Status & Fast Demo Login */}
          <div className="flex items-center space-x-3 font-mono text-xs">
            {/* Live Feed Status Pill */}
            <div className="hidden sm:flex items-center space-x-1.5 px-2 py-1 rounded-full bg-slate-950 border border-slate-800 text-[10px]">
              <Radio className={`w-3 h-3 ${wsConnected ? 'text-emerald-400 animate-pulse' : 'text-slate-600'}`} />
              <span className={wsConnected ? 'text-emerald-400' : 'text-slate-500'}>
                {wsConnected ? 'LOB FEED LIVE' : 'REST MODE'}
              </span>
            </div>

            {user ? (
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <span className="font-bold text-white block text-xs">{user.username}</span>
                  <span className="text-[10px] text-indigo-400 block font-semibold">{user.role}</span>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
                  title="Sign Out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-md shadow-blue-900/30"
              >
                Sign In / Demo
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Simulation Notice Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-1.5 text-center text-[11px] text-amber-300 font-mono flex items-center justify-center space-x-2">
        <span>⚠️ <strong>SIMULATED TRADING ENVIRONMENT</strong> — Demonstration & Academic Learning Lab (PES University Level 3). No Real Capital at Risk.</span>
      </div>

      {/* Mobile Navigation Tabs */}
      <div className="flex md:hidden bg-slate-900 border-b border-slate-800 px-3 py-1.5 overflow-x-auto space-x-1 font-sans">
        <button
          onClick={() => setActiveTab('TRADING')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs whitespace-nowrap font-medium transition ${
            activeTab === 'TRADING' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Trading</span>
        </button>
        <button
          onClick={() => setActiveTab('SURVEILLANCE')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs whitespace-nowrap font-medium transition ${
            activeTab === 'SURVEILLANCE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Surveillance</span>
        </button>
        <button
          onClick={() => setActiveTab('SYSTEM')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs whitespace-nowrap font-medium transition ${
            activeTab === 'SYSTEM' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Audit Trail</span>
        </button>
        <button
          onClick={() => setActiveTab('COLLEGE')}
          className={`flex items-center space-x-1 px-3 py-1 rounded-lg text-xs whitespace-nowrap font-medium transition ${
            activeTab === 'COLLEGE' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>Showcase</span>
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4">
        {activeTab === 'TRADING' && <TradingTerminal user={user} />}
        {activeTab === 'SURVEILLANCE' && <SurveillanceConsole user={user} />}
        {activeTab === 'SYSTEM' && <SystemAudit />}
        {activeTab === 'COLLEGE' && <CollegeShowcase />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-3 text-center text-xs font-mono text-slate-500">
        <p>MERIDIAN Trading & Surveillance System | PES University DBMS Experiential Learning Project (Level 3) | USN: PES1UG24CS684</p>
      </footer>

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onLoginSuccess={newUser => {
          setUser(newUser);
        }}
      />
    </div>
  );
}
