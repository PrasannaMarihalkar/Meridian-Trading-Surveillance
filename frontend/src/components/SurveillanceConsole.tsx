import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { ShieldAlert, AlertTriangle, CheckCircle, Search, UserCheck, FileText, Send, Eye, RefreshCw, Cpu } from 'lucide-react';

export function SurveillanceConsole({ user }: { user: any }) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNoteBody, setNewNoteBody] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evalMessage, setEvalMessage] = useState<string | null>(null);

  const fetchAlerts = async () => {
    try {
      const data = await apiRequest<any[]>('/surveillance/alerts');
      setAlerts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPatterns = async () => {
    try {
      const data = await apiRequest<any[]>('/surveillance/patterns');
      setPatterns(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAlertDetails = async (alertId: number) => {
    try {
      const data = await apiRequest<any>(`/surveillance/alerts/${alertId}`);
      setSelectedAlert(data.alert);
      setNotes(data.notes || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchAlerts();
    fetchPatterns();
  }, []);

  const handleSelectAlert = (al: any) => {
    fetchAlertDetails(al.alert_id);
  };

  const handleUpdateStatus = async (status: string) => {
    if (!selectedAlert) return;
    try {
      await apiRequest(`/surveillance/alerts/${selectedAlert.alert_id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      fetchAlertDetails(selectedAlert.alert_id);
      fetchAlerts();
    } catch (err: any) {
      alert(`Status update failed: ${err.message}`);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedAlert || !user) return;
    try {
      await apiRequest(`/surveillance/alerts/${selectedAlert.alert_id}/assign`, {
        method: 'PUT',
        body: JSON.stringify({ analystId: user.userId })
      });
      fetchAlertDetails(selectedAlert.alert_id);
      fetchAlerts();
    } catch (err: any) {
      alert(`Assignment failed: ${err.message}`);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert || !newNoteBody.trim()) return;

    try {
      await apiRequest(`/surveillance/alerts/${selectedAlert.alert_id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: newNoteBody.trim() })
      });
      setNewNoteBody('');
      fetchAlertDetails(selectedAlert.alert_id);
    } catch (err: any) {
      alert(`Failed to add note: ${err.message}`);
    }
  };

  const handleSearchNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    try {
      const res = await apiRequest<any[]>(`/surveillance/notes/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(res);
    } catch (err: any) {
      alert(`Search failed: ${err.message}`);
    }
  };

  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setEvalMessage(null);
    try {
      // Evaluate Account 1003 (vikram_algo) on RELIANCE (1)
      const res = await apiRequest<any>('/surveillance/evaluate', {
        method: 'POST',
        body: JSON.stringify({ accountId: 1003, instrumentId: 1 })
      });
      setEvalMessage(
        `Surveillance scan complete: Window #${res.session.session_id} evaluated. Cancel ratio: ${(
          res.session.order_cancel_ratio * 100
        ).toFixed(1)}%. ${res.alert ? `Alert #${res.alert.alert_id} raised!` : 'No alert triggered.'}`
      );
      fetchAlerts();
    } catch (err: any) {
      setEvalMessage(`Evaluation failed: ${err.message}`);
    } finally {
      setEvaluating(false);
    }
  };

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;
  const inReviewCount = alerts.filter(a => a.status === 'IN_REVIEW').length;
  const openCount = alerts.filter(a => a.status === 'OPEN').length;

  return (
    <div className="space-y-4">
      {/* Top Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center space-x-3">
          <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-400">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{criticalCount}</div>
            <div className="text-xs text-slate-400">CRITICAL ALERTS</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center space-x-3">
          <div className="p-3 rounded-lg bg-amber-950/60 border border-amber-800 text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{openCount}</div>
            <div className="text-xs text-slate-400">OPEN TRIAGE QUEUE</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl flex items-center space-x-3">
          <div className="p-3 rounded-lg bg-blue-950/60 border border-blue-800 text-blue-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold font-mono text-white">{inReviewCount}</div>
            <div className="text-xs text-slate-400">ACTIVE INVESTIGATIONS</div>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-col justify-center">
          <button
            onClick={handleRunEvaluation}
            disabled={evaluating}
            className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold tracking-wider flex items-center justify-center space-x-2 transition shadow-lg shadow-indigo-950/50 disabled:opacity-50"
          >
            <Cpu className="w-4 h-4" />
            <span>{evaluating ? 'ANALYZING ORDER-FLOW...' : 'TRIGGER SURVEILLANCE SCAN'}</span>
          </button>
          {evalMessage && (
            <span className="text-[10px] text-slate-300 font-mono mt-1 text-center truncate" title={evalMessage}>
              {evalMessage}
            </span>
          )}
        </div>
      </div>

      {/* Main Grid: Left = Alerts Table & Full-text Search, Right = Investigation Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Alerts List & Full-Text Search (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Full-Text Search on Notes Card */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-xl">
            <form onSubmit={handleSearchNotes} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="PostgreSQL tsvector search over analyst notes (e.g. 'spoofing', 'cancelled orders')..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
              >
                Search
              </button>
              {searchResults && (
                <button
                  type="button"
                  onClick={() => setSearchResults(null)}
                  className="px-2 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  Clear
                </button>
              )}
            </form>

            {searchResults && (
              <div className="mt-3 p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs font-mono max-h-40 overflow-y-auto space-y-2">
                <div className="text-[10px] text-slate-400 uppercase font-semibold">
                  Found {searchResults.length} matching note(s):
                </div>
                {searchResults.map((sr, idx) => (
                  <div key={idx} className="p-2 rounded bg-slate-900/60 border border-slate-800/80">
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Note #{sr.note_id} (Alert #{sr.alert_id})</span>
                      <span className="text-indigo-400">Author: {sr.author}</span>
                    </div>
                    <p className="text-slate-200 text-xs mt-1">{sr.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alerts Blotter */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-white tracking-wide text-xs">
                SURVEILLANCE ALERTS QUEUE (PATTERN CLASSIFICATION)
              </h3>
              <button
                onClick={fetchAlerts}
                className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="overflow-x-auto font-mono text-xs">
              <table className="w-full text-left">
                <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 pb-1">
                  <tr>
                    <th className="py-2">Alert ID</th>
                    <th className="py-2">Pattern</th>
                    <th className="py-2">Similarity</th>
                    <th className="py-2">Severity</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Subject</th>
                    <th className="py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {alerts.map(al => {
                    const isSelected = selectedAlert?.alert_id === al.alert_id;
                    const simPct = (parseFloat(al.similarity) * 100).toFixed(1);
                    return (
                      <tr
                        key={al.alert_id}
                        className={`hover:bg-slate-800/40 cursor-pointer transition ${
                          isSelected ? 'bg-indigo-950/30 border-l-2 border-indigo-500' : ''
                        }`}
                        onClick={() => handleSelectAlert(al)}
                      >
                        <td className="py-2 text-slate-400 font-semibold">#{al.alert_id}</td>
                        <td className="py-2 font-bold text-white max-w-[140px] truncate" title={al.pattern_name}>
                          {al.pattern_name}
                        </td>
                        <td className="py-2">
                          <span className="font-bold text-indigo-400">{simPct}%</span>
                        </td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            al.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                            al.severity === 'HIGH' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                            'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}>
                            {al.severity}
                          </span>
                        </td>
                        <td className="py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            al.status === 'RESOLVED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                            al.status === 'IN_REVIEW' ? 'bg-blue-950 text-blue-400 border border-blue-800' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {al.status}
                          </span>
                        </td>
                        <td className="py-2 text-slate-300">{al.subject_trader} ({al.subject_symbol})</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleSelectAlert(al);
                            }}
                            className="text-indigo-400 hover:text-indigo-300 font-semibold text-[11px]"
                          >
                            Examine
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {alerts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No surveillance alerts raised. System operating cleanly!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column: Alert Investigation Drawer & Note Form (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col min-h-[500px]">
          {selectedAlert ? (
            <div className="space-y-4 flex-1 flex flex-col">
              {/* Alert Header */}
              <div className="border-b border-slate-800 pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400 uppercase">
                      CASE FILE #{selectedAlert.alert_id}
                    </span>
                    <h3 className="font-bold text-white text-base mt-0.5">{selectedAlert.pattern_name}</h3>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                    selectedAlert.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                    selectedAlert.severity === 'HIGH' ? 'bg-orange-950 text-orange-400 border border-orange-800' :
                    'bg-amber-950 text-amber-400 border border-amber-800'
                  }`}>
                    {selectedAlert.severity}
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-1.5">{selectedAlert.pattern_description}</p>
              </div>

              {/* 8-Dimensional Metric Breakdown */}
              <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs font-mono space-y-1.5">
                <div className="text-[10px] text-slate-400 uppercase font-semibold pb-1 border-b border-slate-800">
                  8-D BEHAVIORAL FEATURE METRICS
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-300">
                  <div>Cancel Ratio: <span className="text-rose-400 font-bold">{(parseFloat(selectedAlert.order_cancel_ratio || '0') * 100).toFixed(1)}%</span></div>
                  <div>Quote/Trade: <span className="text-white font-bold">{parseFloat(selectedAlert.quote_to_trade_ratio || '0').toFixed(1)}x</span></div>
                  <div>Median Lifetime: <span className="text-amber-400 font-bold">{parseFloat(selectedAlert.median_lifetime_ms || '0').toFixed(0)} ms</span></div>
                  <div>Message Rate: <span className="text-white font-bold">{parseFloat(selectedAlert.msg_rate_per_s || '0').toFixed(1)} /s</span></div>
                </div>
                <div className="pt-1.5 text-slate-400 border-t border-slate-800 flex justify-between">
                  <span>Cosine Similarity Match:</span>
                  <span className="text-indigo-400 font-bold text-sm">
                    {(parseFloat(selectedAlert.similarity || '0') * 100).toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* Workflow Actions: Assignment & Status */}
              <div className="flex gap-2">
                <button
                  onClick={handleAssignToMe}
                  className="flex-1 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center space-x-1"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Assign to Me</span>
                </button>
                {(['IN_REVIEW', 'RESOLVED', 'FALSE_POSITIVE'] as const).map(st => (
                  <button
                    key={st}
                    onClick={() => handleUpdateStatus(st)}
                    className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border transition ${
                      selectedAlert.status === st
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {st.replace('_', ' ')}
                  </button>
                ))}
              </div>

              {/* Analyst Investigation Notes */}
              <div className="flex-1 flex flex-col space-y-2 border-t border-slate-800 pt-3">
                <span className="text-[10px] text-slate-400 uppercase font-semibold font-mono">
                  INVESTIGATION NOTES ({notes.length})
                </span>

                <div className="flex-1 max-h-48 overflow-y-auto space-y-2 pr-1">
                  {notes.map(n => (
                    <div key={n.note_id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs">
                      <div className="flex justify-between text-[10px] font-mono text-slate-400">
                        <span className="text-indigo-400 font-semibold">{n.author}</span>
                        <span>{new Date(n.created_at).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-slate-200 mt-1 leading-relaxed">{n.body}</p>
                    </div>
                  ))}
                  {notes.length === 0 && (
                    <div className="text-slate-600 py-4 text-center text-xs">
                      No investigation notes appended yet.
                    </div>
                  )}
                </div>

                {/* Add Note Input */}
                <form onSubmit={handleAddNote} className="flex gap-2 pt-2 border-t border-slate-800">
                  <input
                    type="text"
                    placeholder="Append compliance finding / regulatory note..."
                    value={newNoteBody}
                    onChange={e => setNewNoteBody(e.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1"
                  >
                    <Send className="w-3 h-3" />
                    <span>Save</span>
                  </button>
                </form>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-16 text-center space-y-2">
              <ShieldAlert className="w-8 h-8 text-slate-600" />
              <p className="text-xs">Select any alert from the queue to view its 8-D behavioral features, inspect cosine similarity, and append investigation notes.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
