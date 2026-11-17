import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { History, Activity, Database, RefreshCw, CheckCircle2 } from 'lucide-react';

export function SystemAudit() {
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [offsets, setOffsets] = useState<any[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [entityFilter, setEntityFilter] = useState<string>('');

  const fetchData = async () => {
    try {
      const logs = await apiRequest<any[]>(`/system/audit-log${entityFilter ? `?entityType=${entityFilter}` : ''}`);
      setAuditLogs(logs);
      const off = await apiRequest<any[]>('/system/engine-offsets');
      setOffsets(off);
      const h = await apiRequest<any>('/system/health');
      setHealth(h);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchData();
  }, [entityFilter]);

  return (
    <div className="space-y-4">
      {/* Top Engine Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-semibold uppercase mb-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span>Database Engine</span>
          </div>
          <div className="text-lg font-bold font-mono text-white flex items-center space-x-2">
            <span>{health?.database?.engine || 'PostgreSQL Engine'}</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            Uptime: {health ? `${Math.floor(health.uptime_seconds)}s` : '---'} | Status: {health?.status}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl md:col-span-2">
          <div className="flex items-center space-x-2 text-slate-400 text-xs font-semibold uppercase mb-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            <span>Matching Engine High-Watermark Offsets</span>
          </div>
          <div className="grid grid-cols-3 gap-2 font-mono text-xs">
            {offsets.map((o, idx) => (
              <div key={idx} className="p-2 rounded bg-slate-950 border border-slate-800">
                <div className="text-slate-400 text-[10px] truncate" title={o.consumer}>{o.consumer}</div>
                <div className="text-sm font-bold text-indigo-400 mt-0.5">Seq: #{o.last_seq}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center space-x-2">
            <History className="w-4 h-4 text-slate-400" />
            <h3 className="font-semibold text-white tracking-wide text-xs">
              IMMUTABLE AUDIT TRAIL (TRANSACTION LOG)
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={entityFilter}
              onChange={e => setEntityFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-300 font-mono focus:outline-none"
            >
              <option value="">All Entities</option>
              <option value="orders">Orders</option>
              <option value="alerts">Alerts</option>
              <option value="accounts">Accounts</option>
            </select>
            <button
              onClick={fetchData}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto font-mono text-xs">
          <table className="w-full text-left">
            <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 pb-1">
              <tr>
                <th className="py-2">Audit ID</th>
                <th className="py-2">Timestamp</th>
                <th className="py-2">Actor</th>
                <th className="py-2">Action</th>
                <th className="py-2">Entity</th>
                <th className="py-2">State Delta (Old vs New JSON)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {auditLogs.map(log => (
                <tr key={log.audit_id} className="hover:bg-slate-800/40">
                  <td className="py-2 text-slate-400 font-semibold">#{log.audit_id}</td>
                  <td className="py-2 text-slate-500 text-[10px]">
                    {new Date(log.occurred_at).toLocaleTimeString()}
                  </td>
                  <td className="py-2 text-slate-300 font-semibold">{log.actor || 'SYSTEM'}</td>
                  <td className="py-2">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-blue-300 border border-slate-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2 text-slate-400">
                    {log.entity_type} (#{log.entity_id})
                  </td>
                  <td className="py-2 max-w-md truncate text-[11px] text-slate-400">
                    <span className="text-rose-400/80">{log.old_data ? JSON.stringify(log.old_data) : 'null'}</span>
                    {' -> '}
                    <span className="text-emerald-400/80">{log.new_data ? JSON.stringify(log.new_data) : 'null'}</span>
                  </td>
                </tr>
              ))}
              {auditLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No audit records match the filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
