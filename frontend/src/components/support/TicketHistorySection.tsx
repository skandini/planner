"use client";

import { useState, useEffect } from "react";
import type { TicketHistory } from "@/types/ticket.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { TICKET_HISTORY_ENDPOINT } from "@/lib/constants";

interface TicketHistorySectionProps {
  ticketId: string | null;
  authFetch: AuthenticatedFetch;
  apiBaseUrl?: string;
}

const ACTION_LABELS: Record<string, string> = {
  created: "Создал тикет",
  status_changed: "Изменил статус",
  priority_changed: "Изменил приоритет",
  assigned: "Назначил исполнителя",
  unassigned: "Снял назначение",
  reassigned: "Переназначил",
  category_changed: "Изменил категорию",
  title_changed: "Изменил заголовок",
  description_changed: "Изменил описание",
  comment_added: "Добавил комментарий",
  attachment_added: "Добавил вложение",
  attachment_removed: "Удалил вложение",
  internal_note_added: "Добавил внутреннюю заметку",
};

const ACTION_ICONS: Record<string, string> = {
  created: "🎫",
  status_changed: "🔄",
  priority_changed: "⚡",
  assigned: "👤",
  unassigned: "👤",
  reassigned: "🔀",
  category_changed: "🏷️",
  title_changed: "✏️",
  description_changed: "📝",
  comment_added: "💬",
  attachment_added: "📎",
  attachment_removed: "🗑️",
  internal_note_added: "📌",
};

export function TicketHistorySection({
  ticketId,
  authFetch,
  apiBaseUrl = "",
}: TicketHistorySectionProps) {
  const [history, setHistory] = useState<TicketHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const loadHistory = async () => {
    if (!ticketId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(TICKET_HISTORY_ENDPOINT(ticketId), {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      } else if (response.status === 403) {
        // Staff only - hide section for non-staff
        setHistory([]);
      } else {
        throw new Error("Не удалось загрузить историю");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки истории");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      loadHistory();
    }
  }, [ticketId]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} д. назад`;

    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (!ticketId || history.length === 0) return null;

  const displayHistory = expanded ? history : history.slice(0, 5);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
          <span className="text-sm">📋</span>
          История изменений
        </h3>
        <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
          Только для сотрудников
        </span>
      </div>

      {loading ? (
        <div className="text-center py-3 text-xs text-slate-500">Загрузка...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200" />

          <div className="space-y-2">
            {displayHistory.map((entry, index) => (
              <div key={entry.id} className="relative flex gap-3 pl-1">
                {/* Timeline dot */}
                <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white border-2 border-slate-200 text-sm flex-shrink-0">
                  {ACTION_ICONS[entry.action] || "•"}
                </div>

                <div className="flex-1 min-w-0 pt-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-slate-900">
                      {entry.user_full_name || entry.user_email || "Система"}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {formatDate(entry.created_at)}
                    </span>
                  </div>

                  {/* Change details */}
                  {(entry.old_value || entry.new_value) && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                      {entry.old_value && (
                        <span className="px-1.5 py-0.5 rounded bg-red-50 text-red-700 line-through">
                          {entry.old_value}
                        </span>
                      )}
                      {entry.old_value && entry.new_value && (
                        <span className="text-slate-400">→</span>
                      )}
                      {entry.new_value && (
                        <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                          {entry.new_value}
                        </span>
                      )}
                    </div>
                  )}

                  {entry.details && (
                    <p className="mt-0.5 text-[11px] text-slate-500 italic">
                      {entry.details}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {history.length > 5 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-2 w-full text-center text-xs text-indigo-600 hover:text-indigo-700 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
            >
              {expanded ? "Свернуть" : `Показать ещё ${history.length - 5} записей`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

