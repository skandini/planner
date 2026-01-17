"use client";

import { useState, useEffect, useCallback } from "react";
import type { Ticket, TicketUpdate, TicketCategory } from "@/types/ticket.types";
import type { UserProfile } from "@/types/user.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { TICKETS_ENDPOINT, API_BASE_URL } from "@/lib/constants";
import { TicketCommentsSection } from "./TicketCommentsSection";
import { TicketAttachmentsSection } from "./TicketAttachmentsSection";
import { TicketHistorySection } from "./TicketHistorySection";
import { TicketInternalNotesSection } from "./TicketInternalNotesSection";

interface TicketDetailProps {
  ticket: Ticket | null;
  authFetch: AuthenticatedFetch;
  apiBaseUrl: string;
  users: UserProfile[];
  organizations?: Array<{ id: string; name: string; slug: string }>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  currentUserId?: string | null;
  currentUserRole?: string;
  categories?: TicketCategory[];
  onClose: () => void;
  onUpdate: () => void;
  onNotify?: (message: string, type?: "info" | "success" | "error") => void;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Открыт", color: "bg-green-100 text-green-700 border-green-200" },
  { value: "in_progress", label: "В работе", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "waiting_response", label: "Ожидание ответа", color: "bg-red-50 text-red-700 border-red-200" },
  { value: "waiting_third_party", label: "Ожидание 3-й стороны", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "on_hold", label: "Отложен", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "resolved", label: "Решён", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "closed", label: "Закрыт", color: "bg-slate-100 text-slate-700 border-slate-200" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Низкий", color: "bg-gray-100 text-gray-700 border-gray-200" },
  { value: "medium", label: "Средний", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  { value: "high", label: "Высокий", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "urgent", label: "Срочный", color: "bg-red-100 text-red-700 border-red-200" },
  { value: "critical", label: "Критический", color: "bg-red-200 text-red-800 border-red-300" },
];

export function TicketDetail({
  ticket,
  authFetch,
  apiBaseUrl,
  users,
  organizations = [],
  getUserOrganizationAbbreviation,
  currentUserId,
  currentUserRole,
  categories = [],
  onClose,
  onUpdate,
  onNotify,
}: TicketDetailProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketData, setTicketData] = useState<Ticket | null>(ticket);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "attachments" | "history" | "notes">("comments");

  const isStaff = currentUserRole === "admin" || currentUserRole === "it";

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
        const statusLabel = STATUS_OPTIONS.find(s => s.value === updates.status)?.label || updates.status;
        onNotify?.(`Статус: ${statusLabel}`, updates.status === "waiting_response" ? "error" : "success");
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
    const updates: Partial<TicketUpdate> = { status: newStatus as any };
    
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

  const handlePriorityChange = (priority: string) => {
    handleUpdate({ priority: priority as any });
  };

  const handleCategoryChange = (categoryId: string | null) => {
    handleUpdate({ category_id: categoryId });
  };

  const getStatusOption = (status: string) => 
    STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  
  const getPriorityOption = (priority: string) => 
    PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[1];

  if (!ticketData) return null;

  const createdByUser = users.find(u => u.id === ticketData.created_by);
  const assignedToUser = ticketData.assigned_to ? users.find(u => u.id === ticketData.assigned_to) : null;
  const statusOpt = getStatusOption(ticketData.status);
  const priorityOpt = getPriorityOption(ticketData.priority);

  // Staff users available for assignment
  const staffUsers = users.filter(u => u.role === "admin" || u.role === "it");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-modal-enter">
      <div
        className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl flex flex-col animate-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-50">
          <div className="px-6 py-4">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-slate-400 font-mono">#{ticketData.id.slice(0, 8)}</span>
                  {ticketData.sla_breach && (
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                      ⚠️ Нарушение SLA
                    </span>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">{ticketData.title}</h2>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${statusOpt.color}`}>
                    {ticketData.status === "waiting_response" && (
                      <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    )}
                    {statusOpt.label}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${priorityOpt.color}`}>
                    {priorityOpt.label}
                  </span>
                  {ticketData.category_name && (
                    <span 
                      className="px-3 py-1 rounded-full text-xs font-semibold border"
                      style={{ 
                        backgroundColor: `${ticketData.category_color}20`,
                        borderColor: ticketData.category_color,
                        color: ticketData.category_color
                      }}
                    >
                      {ticketData.category_name}
                    </span>
                  )}
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

            {/* Controls */}
            <div className="flex items-center gap-3 flex-wrap border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Статус:</label>
                <select
                  value={ticketData.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={isUpdating}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 transition disabled:opacity-50"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Приоритет:</label>
                <select
                  value={ticketData.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  disabled={isUpdating}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 transition disabled:opacity-50"
                >
                  {PRIORITY_OPTIONS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {isStaff && (
                <>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-700">Исполнитель:</label>
                    <select
                      value={ticketData.assigned_to || ""}
                      onChange={(e) => handleAssign(e.target.value || null)}
                      disabled={isUpdating}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 transition disabled:opacity-50 min-w-[150px]"
                    >
                      <option value="">Не назначен</option>
                      {staffUsers.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.full_name || user.email}
                        </option>
                      ))}
                    </select>
                  </div>

                  {categories.length > 0 && (
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-semibold text-slate-700">Категория:</label>
                      <select
                        value={ticketData.category_id || ""}
                        onChange={(e) => handleCategoryChange(e.target.value || null)}
                        disabled={isUpdating}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-indigo-500 transition disabled:opacity-50 min-w-[120px]"
                      >
                        <option value="">Без категории</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}

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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                {error}
              </div>
            )}

            {/* Description */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">Описание</h3>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                {ticketData.description}
              </div>
            </div>

            {/* Creator and Assignee info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
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
                      {createdByUser?.full_name || createdByUser?.email || ticketData.created_by_full_name || "Неизвестно"}
                    </div>
                    {(createdByUser?.email || ticketData.created_by_email) && (
                      <div className="text-xs text-slate-500">{createdByUser?.email || ticketData.created_by_email}</div>
                    )}
                  </div>
                </div>
              </div>

              {(assignedToUser || ticketData.assigned_to) && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Исполнитель</h3>
                  <div className="flex items-center gap-2">
                    {assignedToUser?.avatar_url ? (
                      <img
                        src={apiBaseUrl && !assignedToUser.avatar_url.startsWith('http') ? `${apiBaseUrl}${assignedToUser.avatar_url}` : assignedToUser.avatar_url}
                        alt={assignedToUser.full_name || assignedToUser.email}
                        className="w-8 h-8 rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-600">
                        {(assignedToUser?.full_name || assignedToUser?.email || ticketData.assigned_to_full_name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-slate-900">
                        {assignedToUser?.full_name || assignedToUser?.email || ticketData.assigned_to_full_name}
                      </div>
                      {(assignedToUser?.email || ticketData.assigned_to_email) && (
                        <div className="text-xs text-slate-500">{assignedToUser?.email || ticketData.assigned_to_email}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tabs */}
            <div className="border-b border-slate-200 mb-4">
              <div className="flex gap-1">
                <button
                  onClick={() => setActiveTab("comments")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === "comments"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  💬 Комментарии
                  {ticketData.comments_count > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-slate-100">
                      {ticketData.comments_count}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab("attachments")}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === "attachments"
                      ? "border-indigo-500 text-indigo-600"
                      : "border-transparent text-slate-500 hover:text-slate-700"
                  }`}
                >
                  📎 Вложения
                  {ticketData.attachments_count > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-slate-100">
                      {ticketData.attachments_count}
                    </span>
                  )}
                </button>
                {isStaff && (
                  <>
                    <button
                      onClick={() => setActiveTab("history")}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                        activeTab === "history"
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      📋 История
                    </button>
                    <button
                      onClick={() => setActiveTab("notes")}
                      className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
                        activeTab === "notes"
                          ? "border-amber-500 text-amber-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      📌 Заметки
                      {ticketData.internal_notes_count !== undefined && ticketData.internal_notes_count > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">
                          {ticketData.internal_notes_count}
                        </span>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tab content */}
            <div className="min-h-[200px]">
              {activeTab === "comments" && (
                <TicketCommentsSection
                  ticketId={ticketData.id}
                  authFetch={authFetch}
                  currentUserId={currentUserId}
                  users={users}
                  getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
                  organizations={organizations}
                  apiBaseUrl={apiBaseUrl}
                />
              )}

              {activeTab === "attachments" && (
                <TicketAttachmentsSection
                  ticketId={ticketData.id}
                  authFetch={authFetch}
                  onAttachmentsChange={loadTicket}
                />
              )}

              {activeTab === "history" && isStaff && (
                <TicketHistorySection
                  ticketId={ticketData.id}
                  authFetch={authFetch}
                  apiBaseUrl={apiBaseUrl}
                />
              )}

              {activeTab === "notes" && isStaff && (
                <TicketInternalNotesSection
                  ticketId={ticketData.id}
                  authFetch={authFetch}
                  currentUserId={currentUserId}
                  apiBaseUrl={apiBaseUrl}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
