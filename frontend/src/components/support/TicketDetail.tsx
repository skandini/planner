"use client";

import { useState, useEffect, useCallback } from "react";
import type { Ticket, TicketUpdate } from "@/types/ticket.types";
import type { UserProfile } from "@/types/user.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { TICKETS_ENDPOINT, API_BASE_URL } from "@/lib/constants";
import { TicketCommentsSection } from "./TicketCommentsSection";
import { TicketAttachmentsSection } from "./TicketAttachmentsSection";

interface TicketDetailProps {
  ticket: Ticket | null;
  authFetch: AuthenticatedFetch;
  apiBaseUrl: string;
  users: UserProfile[];
  organizations?: Array<{ id: string; name: string; slug: string }>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  currentUserId?: string | null;
  onClose: () => void;
  onUpdate: () => void;
  onNotify?: (message: string, type?: "info" | "success" | "error") => void;
}

export function TicketDetail({
  ticket,
  authFetch,
  apiBaseUrl,
  users,
  organizations = [],
  getUserOrganizationAbbreviation,
  currentUserId,
  onClose,
  onUpdate,
  onNotify,
}: TicketDetailProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketData, setTicketData] = useState<Ticket | null>(ticket);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setTicketData(ticket);
  }, [ticket]);

  const loadTicket = useCallback(async () => {
    if (!ticket?.id) return;

    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`${TICKETS_ENDPOINT}${ticket.id}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Не удалось загрузить тикет");
      }

      const data = await response.json();
      setTicketData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки тикета");
    } finally {
      setLoading(false);
    }
  }, [ticket?.id, authFetch]);

  useEffect(() => {
    if (ticket?.id) {
      loadTicket();
    }
  }, [ticket?.id, loadTicket]);

  const handleUpdate = async (updates: Partial<TicketUpdate>) => {
    if (!ticketData?.id) return;

    setIsUpdating(true);
    setError(null);

    try {
      const response = await authFetch(`${TICKETS_ENDPOINT}${ticketData.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось обновить тикет");
      }

      const updated = await response.json();
      setTicketData(updated);
      onUpdate();
      if (updates.status) {
        onNotify?.(`Статус: ${getStatusLabel(updates.status)}`, updates.status === "waiting_response" ? "error" : "success");
      } else {
        onNotify?.("Тикет обновлен", "success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления тикета");
      onNotify?.("Ошибка обновления тикета", "error");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    const updates: Partial<TicketUpdate> = { status: newStatus };
    
    if (newStatus === "resolved") {
      updates.resolved_at = new Date().toISOString();
    } else if (newStatus === "closed") {
      updates.closed_at = new Date().toISOString();
    }

    handleUpdate(updates);
  };

  const handleAssign = (userId: string | null) => {
    handleUpdate({ assigned_to: userId || null });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "bg-green-100 text-green-700 border-green-200";
      case "in_progress":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "waiting_response":
        return "bg-red-50 text-red-700 border-red-200";
      case "resolved":
        return "bg-purple-100 text-purple-700 border-purple-200";
      case "closed":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open":
        return "Открыт";
      case "in_progress":
        return "В работе";
      case "waiting_response":
        return "Ожидание ответа";
      case "resolved":
        return "Решен";
      case "closed":
        return "Закрыт";
      default:
        return status;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "bg-red-100 text-red-700 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-700 border-orange-200";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-200";
      case "low":
        return "bg-gray-100 text-gray-700 border-gray-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "urgent":
        return "Срочно";
      case "high":
        return "Высокий";
      case "medium":
        return "Средний";
      case "low":
        return "Низкий";
      default:
        return priority;
    }
  };

  if (!ticketData) return null;

  const createdByUser = users.find(u => u.id === ticketData.created_by);
  const assignedToUser = ticketData.assigned_to ? users.find(u => u.id === ticketData.assigned_to) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-modal-enter">
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl flex flex-col animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-50">
          <div className="px-6 py-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{ticketData.title}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${getStatusColor(ticketData.status)}`}>
                    {ticketData.status === "waiting_response" && (
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                    {getStatusLabel(ticketData.status)}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getPriorityColor(ticketData.priority)}`}>
                    {getPriorityLabel(ticketData.priority)}
                  </span>
                  <span className="text-xs text-slate-500">
                    Создан: {new Date(ticketData.created_at).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="ml-4 rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Управление статусом и назначением */}
            <div className="flex items-center gap-3 flex-wrap border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Статус:</label>
                <select
                  value={ticketData.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={isUpdating}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 transition disabled:opacity-50"
                >
                  <option value="open">Открыт</option>
                  <option value="in_progress">В работе</option>
                  <option value="waiting_response">Ожидание ответа</option>
                  <option value="resolved">Решен</option>
                  <option value="closed">Закрыт</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Исполнитель:</label>
                <select
                  value={ticketData.assigned_to || ""}
                  onChange={(e) => handleAssign(e.target.value || null)}
                  disabled={isUpdating}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 transition disabled:opacity-50 min-w-[150px]"
                >
                  <option value="">Не назначен</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.full_name || user.email}
                    </option>
                  ))}
                </select>
              </div>

              {ticketData.status !== "closed" && (
                <button
                  onClick={() => handleStatusChange("closed")}
                  disabled={isUpdating}
                  className="ml-auto rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  Закрыть тикет
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Контент */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Описание */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Описание</h3>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
              {ticketData.description}
            </div>
          </div>

          {/* Информация о создателе и исполнителе */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Создатель</h3>
              <div className="flex items-center gap-2">
                {createdByUser?.avatar_url ? (
                  <img
                    src={apiBaseUrl && !createdByUser.avatar_url.startsWith('http') ? `${apiBaseUrl}${createdByUser.avatar_url}` : createdByUser.avatar_url}
                    alt={createdByUser.full_name || createdByUser.email}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                    {(createdByUser?.full_name || createdByUser?.email || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-sm font-medium text-slate-900">
                    {createdByUser?.full_name || createdByUser?.email || "Неизвестно"}
                  </div>
                  {createdByUser?.email && (
                    <div className="text-xs text-slate-500">{createdByUser.email}</div>
                  )}
                </div>
              </div>
            </div>

            {assignedToUser && (
              <div>
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Исполнитель</h3>
                <div className="flex items-center gap-2">
                  {assignedToUser.avatar_url ? (
                    <img
                      src={apiBaseUrl && !assignedToUser.avatar_url.startsWith('http') ? `${apiBaseUrl}${assignedToUser.avatar_url}` : assignedToUser.avatar_url}
                      alt={assignedToUser.full_name || assignedToUser.email}
                      className="w-8 h-8 rounded-full"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                      {(assignedToUser.full_name || assignedToUser.email || "?").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      {assignedToUser.full_name || assignedToUser.email}
                    </div>
                    {assignedToUser.email && (
                      <div className="text-xs text-slate-500">{assignedToUser.email}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Вложения */}
          <div className="border-t border-slate-200 pt-4">
            <TicketAttachmentsSection
              ticketId={ticketData.id}
              authFetch={authFetch}
              onAttachmentsChange={loadTicket}
            />
          </div>

          {/* Комментарии */}
          <div className="border-t border-slate-200 pt-4">
            <TicketCommentsSection
              ticketId={ticketData.id}
              authFetch={authFetch}
              currentUserId={currentUserId}
              users={users}
              getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
              organizations={organizations}
              apiBaseUrl={apiBaseUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

