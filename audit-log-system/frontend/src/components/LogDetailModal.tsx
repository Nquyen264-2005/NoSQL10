import React, { useState } from 'react';
import { AuditLog } from '../types';
import { LevelBadge } from './LevelBadge';
import { X, Copy, Check, Clock, Server, User, Globe, Hash, ShieldAlert } from 'lucide-react';

interface LogDetailModalProps {
  log: AuditLog | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({ log, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !log) return null;

  const handleCopyId = () => {
    navigator.clipboard.writeText(log.log_id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  let formattedDetails = log.details;
  try {
    if (log.details && typeof log.details === 'string') {
      const parsed = JSON.parse(log.details);
      formattedDetails = JSON.stringify(parsed, null, 2);
    }
  } catch {
    // Keep as string
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] transition-colors duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-950/50">
          <div className="flex items-center gap-3">
            <LevelBadge level={log.level} size="lg" />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{log.action}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-normal border border-slate-200 dark:border-slate-700">
                  {log.service_name}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                {new Date(log.log_time).toLocaleString()}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm">
          {/* TTL Alert if present */}
          {log.remaining_ttl !== undefined && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-2 text-xs">
              <Clock className="w-4 h-4 shrink-0 text-amber-500 dark:text-amber-400" />
              <span>
                <strong>Cassandra Native TTL Active:</strong> This record will automatically expire from database storage in{' '}
                <span className="font-mono font-bold text-amber-800 dark:text-amber-200">{log.remaining_ttl} seconds</span>.
              </span>
            </div>
          )}

          {/* Primary Key / Metadata Grid */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 font-mono text-xs">
            <div>
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1 font-sans">
                <Hash className="w-3.5 h-3.5 text-slate-400" /> Log UUID
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-slate-800 dark:text-slate-200 truncate">{log.log_id}</span>
                <button
                  onClick={handleCopyId}
                  className="text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition"
                  title="Copy UUID"
                  aria-label="Copy UUID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1 font-sans">
                <Server className="w-3.5 h-3.5 text-slate-400" /> Service Partition
              </span>
              <span className="text-slate-800 dark:text-slate-200">{log.service_name} (Date: {log.log_date})</span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1 font-sans">
                <User className="w-3.5 h-3.5 text-slate-400" /> Actor / User ID
              </span>
              <span className="text-slate-800 dark:text-slate-200">{log.user_id || 'System / Anonymous'}</span>
            </div>

            <div>
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1 font-sans">
                <Globe className="w-3.5 h-3.5 text-slate-400" /> Source IP Address
              </span>
              <span className="text-slate-800 dark:text-slate-200">{log.ip_address || '127.0.0.1'}</span>
            </div>
          </div>

          {/* Message Box */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
              Event Message
            </label>
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-medium">
              {log.message}
            </div>
          </div>

          {/* Details / Payload Box */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
              Payload & Metadata Details
            </label>
            {formattedDetails ? (
              <pre className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-300 font-mono text-xs overflow-x-auto leading-relaxed">
                {formattedDetails}
              </pre>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 italic">No additional payload attached.</p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/50 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>Stored in keyspace <code className="text-slate-700 dark:text-slate-300 font-semibold">audit_log_system</code></span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-transparent transition font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
