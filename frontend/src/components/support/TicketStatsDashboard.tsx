"use client";

import { useState, useEffect } from "react";
import type { TicketStatistics } from "@/types/ticket.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { TICKET_STATISTICS_ENDPOINT } from "@/lib/constants";

interface TicketStatsDashboardProps {
  authFetch: AuthenticatedFetch;
  onClose?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500",
  in_progress: "bg-blue-500",
  waiting_response: "bg-red-500",
  waiting_third_party: "bg-orange-500",
  on_hold: "bg-gray-500",
  resolved: "bg-purple-500",
  closed: "bg-slate-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-gray-400",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  urgent: "bg-red-500",
  critical: "bg-red-700",
};

export function TicketStatsDashboard({ authFetch, onClose }: TicketStatsDashboardProps) {
  const [stats, setStats] = useState<TicketStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(TICKET_STATISTICS_ENDPOINT, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else if (response.status === 403) {
        setError("Доступ к статистике только для сотрудников техподдержки");
      } else {
        throw new Error("Не удалось загрузить статистику");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки статистики");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const formatHours = (hours: number | null) => {
    if (hours === null) return "—";
    if (hours < 1) return `${Math.round(hours * 60)} мин.`;
    if (hours < 24) return `${hours.toFixed(1)} ч.`;
    return `${(hours / 24).toFixed(1)} д.`;
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
            <span className="text-slate-600">Загрузка статистики...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-2xl p-8 shadow-2xl max-w-md">
          <div className="text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <div className="text-red-600 mb-4">{error}</div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h2 className="text-xl font-bold text-slate-900">📊 Статистика техподдержки</h2>
            <p className="text-sm text-slate-500 mt-0.5">Обзор тикетов и производительности</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8">
            <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl p-4 text-white">
              <div className="text-3xl font-bold">{stats.total_tickets}</div>
              <div className="text-xs text-indigo-100 mt-1">Всего тикетов</div>
            </div>
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white">
              <div className="text-3xl font-bold">{stats.open_tickets}</div>
              <div className="text-xs text-green-100 mt-1">Открытых</div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white">
              <div className="text-3xl font-bold">{stats.in_progress_tickets}</div>
              <div className="text-xs text-blue-100 mt-1">В работе</div>
            </div>
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white">
              <div className="text-3xl font-bold">{stats.resolved_tickets}</div>
              <div className="text-xs text-purple-100 mt-1">Решённых</div>
            </div>
            <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white">
              <div className="text-3xl font-bold">{formatHours(stats.avg_resolution_time_hours)}</div>
              <div className="text-xs text-amber-100 mt-1">Ср. время решения</div>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 text-white">
              <div className="text-3xl font-bold">{stats.sla_breach_count}</div>
              <div className="text-xs text-red-100 mt-1">Нарушений SLA</div>
            </div>
          </div>

          {/* Time Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="text-2xl font-bold text-slate-900">{stats.created_today}</div>
              <div className="text-xs text-slate-500 mt-1">Создано сегодня</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="text-2xl font-bold text-slate-900">{stats.created_this_week}</div>
              <div className="text-xs text-slate-500 mt-1">За эту неделю</div>
            </div>
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
              <div className="text-2xl font-bold text-slate-900">{stats.created_this_month}</div>
              <div className="text-xs text-slate-500 mt-1">За этот месяц</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Status */}
            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">По статусу</h3>
              <div className="space-y-2">
                {stats.by_status.map((item) => {
                  const percent = stats.total_tickets > 0 
                    ? Math.round((item.count / stats.total_tickets) * 100) 
                    : 0;
                  return (
                    <div key={item.status} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${STATUS_COLORS[item.status] || "bg-gray-400"}`} />
                      <span className="text-xs text-slate-700 flex-1">{item.label}</span>
                      <span className="text-xs font-semibold text-slate-900">{item.count}</span>
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${STATUS_COLORS[item.status] || "bg-gray-400"} transition-all`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Priority */}
            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">По приоритету</h3>
              <div className="space-y-2">
                {stats.by_priority.map((item) => {
                  const percent = stats.total_tickets > 0 
                    ? Math.round((item.count / stats.total_tickets) * 100) 
                    : 0;
                  return (
                    <div key={item.priority} className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${PRIORITY_COLORS[item.priority] || "bg-gray-400"}`} />
                      <span className="text-xs text-slate-700 flex-1">{item.label}</span>
                      <span className="text-xs font-semibold text-slate-900">{item.count}</span>
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${PRIORITY_COLORS[item.priority] || "bg-gray-400"} transition-all`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Category */}
            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">По категориям</h3>
              <div className="space-y-2">
                {stats.by_category.map((item, idx) => {
                  const percent = stats.total_tickets > 0 
                    ? Math.round((item.count / stats.total_tickets) * 100) 
                    : 0;
                  return (
                    <div key={item.category_id || "uncategorized"} className="flex items-center gap-3">
                      <span className="text-xs text-slate-700 flex-1 truncate">{item.category_name}</span>
                      <span className="text-xs font-semibold text-slate-900">{item.count}</span>
                      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* By Assignee */}
            <div className="border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">По исполнителям</h3>
              <div className="space-y-2">
                {stats.by_assignee.map((item) => (
                  <div key={item.user_id || "unassigned"} className="flex items-center gap-2">
                    <span className="text-xs text-slate-700 flex-1 truncate">{item.user_name}</span>
                    <div className="flex gap-1 text-[10px]">
                      {item.open_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                          {item.open_count} откр.
                        </span>
                      )}
                      {item.in_progress_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                          {item.in_progress_count} в раб.
                        </span>
                      )}
                      {item.resolved_count > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                          {item.resolved_count} реш.
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-slate-900 ml-1">
                      {item.total_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="mt-6 border border-slate-200 rounded-xl p-4 bg-gradient-to-r from-slate-50 to-indigo-50">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">⏱️ Метрики производительности</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Среднее время первого ответа</div>
                <div className="text-xl font-bold text-indigo-600">
                  {formatHours(stats.avg_first_response_time_hours)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Среднее время решения</div>
                <div className="text-xl font-bold text-indigo-600">
                  {formatHours(stats.avg_resolution_time_hours)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

