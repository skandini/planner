"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import type { Ticket, TicketCreate } from "@/types/ticket.types";
import type { UserProfile } from "@/types/user.types";
import { TICKETS_ENDPOINT } from "@/lib/constants";
import { TicketDetail } from "./TicketDetail";

interface TicketTrackerProps {
  authFetch: AuthenticatedFetch;
  apiBaseUrl: string;
  users?: UserProfile[];
  organizations?: Array<{ id: string; name: string; slug: string }>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  currentUserId?: string | null;
  onClose?: () => void;
}

export function TicketTracker({
  authFetch,
  apiBaseUrl,
  users = [],
  organizations = [],
  getUserOrganizationAbbreviation,
  currentUserId,
  onClose,
}: TicketTrackerProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [formData, setFormData] = useState<TicketCreate>({
    title: "",
    description: "",
    priority: "medium",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toasts, setToasts] = useState<
    { id: string; message: string; type: "info" | "success" | "error" }[]
  >([]);

  const generateId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  };

  const addToast = useCallback(
    (message: string, type: "info" | "success" | "error" = "info") => {
      setToasts((prev) => [...prev, { id: generateId(), message, type }]);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (priorityFilter !== "all") params.append("priority", priorityFilter);
      
      const url = `${TICKETS_ENDPOINT}${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await authFetch(url, { cache: "no-store" });
      
      if (!response.ok) {
        throw new Error("Не удалось загрузить тикеты");
      }
      
      const data = await response.json();
      setTickets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки тикетов");
    } finally {
      setLoading(false);
    }
  }, [authFetch, statusFilter, priorityFilter]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    
    try {
      if (!formData.title.trim() || !formData.description.trim()) {
        setError("Заполните все обязательные поля");
        setIsSubmitting(false);
        return;
      }

      const response = await authFetch(TICKETS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось создать тикет");
      }

      await loadTickets();
      setIsCreating(false);
      setFormData({ title: "", description: "", priority: "medium" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания тикета");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col z-50 overflow-hidden" style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-lg font-bold">Техподдержка</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition text-sm font-semibold"
          >
            + Создать тикет
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Закрыть
            </button>
          )}
        </div>
      </div>

      {/* Content with scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-500">Загрузка...</div>
          </div>
        ) : error && !isCreating ? (
          <div className="text-red-600">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-slate-400 text-lg mb-2">Нет тикетов</div>
            <div className="text-slate-500 text-sm">Создайте первый тикет для начала работы</div>
          </div>
        ) : (
          <div className="space-y-4">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="bg-white border border-slate-200 rounded-lg p-4 hover:shadow-md transition cursor-pointer"
                onClick={() => setSelectedTicket(ticket)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-900">{ticket.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{ticket.description}</p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                      ticket.status === "open" ? "bg-green-100 text-green-700" :
                      ticket.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                      ticket.status === "waiting_response" ? "bg-red-50 text-red-700 ring-1 ring-red-200" :
                      ticket.status === "resolved" ? "bg-purple-100 text-purple-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {ticket.status === "waiting_response" && (
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                      {ticket.status === "open" ? "Открыт" :
                       ticket.status === "in_progress" ? "В работе" :
                       ticket.status === "waiting_response" ? "Ожидание ответа" :
                       ticket.status === "resolved" ? "Решен" : "Закрыт"}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ticket.priority === "urgent" ? "bg-red-100 text-red-700" :
                      ticket.priority === "high" ? "bg-orange-100 text-orange-700" :
                      ticket.priority === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {ticket.priority === "urgent" ? "Срочно" :
                       ticket.priority === "high" ? "Высокий" :
                       ticket.priority === "medium" ? "Средний" : "Низкий"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Модальное окно детального просмотра тикета */}
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          authFetch={authFetch}
          apiBaseUrl={apiBaseUrl}
          users={users}
          organizations={organizations}
          getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
          currentUserId={currentUserId}
          onClose={() => {
            setSelectedTicket(null);
            loadTickets();
          }}
          onUpdate={loadTickets}
          onNotify={(msg, type) => addToast(msg, type)}
        />
      )}

      {/* Модальное окно создания тикета */}
      {isCreating && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-modal-enter">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-modal-enter">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h2 className="text-xl font-bold text-slate-900">Создать тикет</h2>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setFormData({ title: "", description: "", priority: "medium" });
                  setError(null);
                }}
                className="text-slate-500 hover:text-slate-700 transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Заголовок <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 transition"
                    placeholder="Краткое описание проблемы"
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Описание <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 transition resize-none"
                    placeholder="Подробное описание проблемы..."
                    rows={6}
                    required
                    disabled={isSubmitting}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Приоритет
                  </label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as TicketCreate["priority"] })}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 transition"
                    disabled={isSubmitting}
                  >
                    <option value="low">Низкий</option>
                    <option value="medium">Средний</option>
                    <option value="high">Высокий</option>
                    <option value="urgent">Срочно</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setFormData({ title: "", description: "", priority: "medium" });
                    setError(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 transition"
                  disabled={isSubmitting}
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Создание..." : "Создать тикет"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toasts без автозакрытия */}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : toast.type === "error"
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-slate-200 bg-white text-slate-800"
            }`}
          >
            <span className="mt-0.5 h-2 w-2 rounded-full bg-current opacity-70" />
            <div className="flex-1 text-sm">{toast.message}</div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

