import React, { useState, useEffect } from 'react';
import { apiRequest } from '../api';
import { BookOpen, Database, Code, CheckCircle, Play, FileText, ChevronRight } from 'lucide-react';

export function CollegeShowcase() {
  const [selectedQueryId, setSelectedQueryId] = useState<number>(1);
  const [queryData, setQueryData] = useState<any>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'QUERIES' | 'CHEN_ERD' | 'SCHEMA_DICTIONARY'>('QUERIES');

  const fetchQuery = async (id: number) => {
    setIsRunning(true);
    try {
      const res = await apiRequest(`/system/college-queries?q=${id}`);
      setQueryData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    fetchQuery(selectedQueryId);
  }, [selectedQueryId]);

  return (
    <div className="space-y-4">
      {/* College Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-900 text-indigo-300 border border-indigo-700">
                PES UNIVERSITY CSE
              </span>
              <span className="text-xs text-slate-400 font-mono">DBMS Experiential Learning — Level 3</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              MERIDIAN College Submission & Academic Showcase
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Course Instructor: Dr. Nagasundari S | Student: Prasanna Marihalkar (USN: PES1UG24CS684)
            </p>
          </div>

          <div className="flex space-x-1.5 p-1 bg-slate-950 rounded-lg border border-slate-800">
            <button
              onClick={() => setActiveSubTab('QUERIES')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                activeSubTab === 'QUERIES' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              17 Demo Queries
            </button>
            <button
              onClick={() => setActiveSubTab('CHEN_ERD')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                activeSubTab === 'CHEN_ERD' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Chen ER Model
            </button>
            <button
              onClick={() => setActiveSubTab('SCHEMA_DICTIONARY')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                activeSubTab === 'SCHEMA_DICTIONARY' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Data Dictionary
            </button>
          </div>
        </div>
      </div>

      {/* SubTab 1: 17 Demo Queries Live Runner */}
      {activeSubTab === 'QUERIES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Query Selector List (4 cols) */}
          <div className="lg:col-span-4 bg-slate-900/80 border border-slate-800 rounded-xl p-3 shadow-xl max-h-[600px] overflow-y-auto space-y-1">
            <div className="text-[10px] font-mono text-slate-400 uppercase font-semibold pb-2 border-b border-slate-800">
              OFFICIAL COLLEGE QUERIES (Q1 — Q17)
            </div>
            {queryData?.allQueriesList?.map((q: any) => {
              const isSelected = selectedQueryId === q.id;
              return (
                <button
                  key={q.id}
                  onClick={() => setSelectedQueryId(q.id)}
                  className={`w-full text-left p-2 rounded-lg text-xs font-mono transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-indigo-950 border border-indigo-600 text-white font-semibold'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  <span className="truncate">{q.title}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              );
            })}
          </div>

          {/* Query Execution & Result View (8 cols) */}
          <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-xl flex flex-col space-y-4">
            <div className="flex justify-between items-start border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] font-mono text-indigo-400 uppercase font-semibold">
                  LIVE SQL RUNNER
                </span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {queryData?.selectedQuery?.title}
                </h3>
              </div>
              <button
                onClick={() => fetchQuery(selectedQueryId)}
                disabled={isRunning}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 shadow transition"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>{isRunning ? 'RUNNING...' : 'EXECUTE SQL'}</span>
              </button>
            </div>

            {/* SQL Snippet */}
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-indigo-300 overflow-x-auto whitespace-pre-wrap">
              {queryData?.selectedQuery?.sql}
            </div>

            {/* Dynamic Results Table */}
            <div className="flex-1 overflow-x-auto font-mono text-xs max-h-80">
              <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2">
                EXECUTION OUTPUT ({queryData?.resultCount || 0} ROWS RETURNED)
              </div>
              {queryData?.rows && queryData.rows.length > 0 ? (
                <table className="w-full text-left">
                  <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                    <tr>
                      {Object.keys(queryData.rows[0]).map(col => (
                        <th key={col} className="py-1.5 px-2">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {queryData.rows.map((row: any, rIdx: number) => (
                      <tr key={rIdx} className="hover:bg-slate-800/40">
                        {Object.values(row).map((val: any, cIdx: number) => (
                          <td key={cIdx} className="py-1.5 px-2 text-slate-300 truncate max-w-[180px]">
                            {typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="py-8 text-center text-slate-500">
                  {isRunning ? 'Executing database query...' : 'Query returned 0 rows.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SubTab 2: Chen ER Model Overview */}
      {activeSubTab === 'CHEN_ERD' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-base">Peter Chen Entity-Relationship Model (7 Subsystem Pages)</h3>
            <p className="text-xs text-slate-400 mt-1">
              Complies strictly with PES University DBMS specifications using rectangles (entities), diamonds (relationships), ovals (attributes), and underlined primary keys.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { page: 1, title: 'Identity & Accounts', desc: 'USERS, SESSIONS, ACCOUNTS, RISK_LIMITS with 1:N and 1:0..1 cardinalities' },
              { page: 2, title: 'Order Management', desc: 'ACCOUNTS, ORDERS, INSTRUMENTS with 1:N order placement and N:1 instrument references' },
              { page: 3, title: 'Trade Execution & Fills', desc: 'TRADES matched from buyer/seller orders, settling into 2 FILLS via UNIQUE(trade_id, side)' },
              { page: 4, title: 'Portfolio & Watchlists', desc: 'M:N associative relations for user WATCHLISTS and account POSITIONS with mark-to-market metrics' },
              { page: 5, title: 'Market Surveillance', desc: 'SURVEILLANCE_SESSIONS 8-D vectors matched to PATTERNS via cosine similarity raising ALERTS' },
              { page: 6, title: 'Alert Notes & Systems', desc: 'ALERT_NOTES full-text search, AUDIT_LOG transaction ledger, and ENGINE_OFFSETS' },
            ].map(item => (
              <div key={item.page} className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg">
                <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase">Page {item.page} of 7</span>
                <h4 className="font-semibold text-white text-sm mt-0.5">{item.title}</h4>
                <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-3 bg-indigo-950/40 border border-indigo-800/80 rounded-lg text-xs text-indigo-300">
            <strong>Verified Chen Submission Document:</strong> PDF diagram pack available at{' '}
            <code className="bg-slate-950 px-1 py-0.5 rounded text-white">docs/college/MERIDIAN_ER_Diagram_Chen_Notation.pdf</code>.
          </div>
        </div>
      )}

      {/* SubTab 3: Schema & Data Dictionary */}
      {activeSubTab === 'SCHEMA_DICTIONARY' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="font-bold text-white text-base">Relational Schema & BCNF Normalization Proofs</h3>
            <p className="text-xs text-slate-400 mt-1">
              17 tables normalized to Boyce-Codd Normal Form (BCNF), eliminating insert, update, and deletion anomalies while maintaining strict referential integrity.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-bold">Domain 1: Identity & Accounts (4 tables)</span>
              <div className="text-slate-300">users, sessions, accounts, risk_limits</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-bold">Domain 2: Trading & Master Data (6 tables)</span>
              <div className="text-slate-300">instruments, orders, trades, fills, positions, watchlists</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-bold">Domain 3: Market Surveillance (5 tables)</span>
              <div className="text-slate-300">surveillance_sessions, surveillance_patterns, alerts, alert_notes, surveillance_feature_stats</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-indigo-400 font-bold">Domain 4: System Tables (2 tables)</span>
              <div className="text-slate-300">audit_log, engine_offsets</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
