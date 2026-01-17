"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import type { Ticket, TicketCreate, TicketCategory, TicketFilters, TicketBulkUpdate } from "@/types/ticket.types";
import type { UserProfile } from "@/types/user.types";
import { TICKETS_ENDPOINT, TICKET_CATEGORIES_ENDPOINT, TICKET_BULK_UPDATE_ENDPOINT } from "@/lib/constants";
import { TicketDetail } from "./TicketDetail";
import { TicketStatsDashboard } from "./TicketStatsDashboard";

interface TicketTrackerProps {
  authFetch: AuthenticatedFetch;
  apiBaseUrl: string;
  users?: UserProfile[];
  organizations?: Array<{ id: string; name: string; slug: string }>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  currentUserId?: string | null;
  currentUserRole?: string;
  onClose?: () => void;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Открыт", color: "bg-green-100 text-green-700" },
  { value: "in_progress", label: "В работе", color: "bg-blue-100 text-blue-700" },
  { value: "waiting_response", label: "Ожидание ответа", color: "bg-red-50 text-red-700" },
  { value: "waiting_third_party", label: "Ожидание 3-й стороны", color: "bg-orange-100 text-orange-700" },
  { value: "on_hold", label: "Отложен", color: "bg-gray-100 text-gray-700" },
  { value: "resolved", label: "Решён", color: "bg-purple-100 text-purple-700" },
  { value: "closed", label: "Закрыт", color: "bg-slate-100 text-slate-700" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Низкий", color: "bg-gray-100 text-gray-700" },
  { value: "medium", label: "Средний", color: "bg-yellow-100 text-yellow-700" },
  { value: "high", label: "Высокий", color: "bg-orange-100 text-orange-700" },
  { value: "urgent", label: "Срочный", color: "bg-red-100 text-red-700" },
  { value: "critical", label: "Критический", color: "bg-red-200 text-red-800" },
];

export function TicketTracker({
  authFetch,
  apiBaseUrl,
  users = [],
  organizations = [],
  getUserOrganizationAbbreviation,
  currentUserId,
  currentUserRole,
  onClose,
}: TicketTrackerProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Selection for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Filters
  const [filters, setFilters] = useState<TicketFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [hideClosed, setHideClosed] = useState(true); // Hide closed tickets by default
  
  // Create form
  const [formData, setFormData] = useState<TicketCreate>({
    title: "",
    description: "",
    priority: "medium",
    category_id: null,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Toasts
  const [toasts, setToasts] = useState<
    { id: string; message: string; type: "info" | "success" | "error" }[]
  >([]);

  const isStaff = currentUserRole === "admin" || currentUserRole === "it";

  const generateId = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  };

  const addToast = useCallback(
    (message: string, type: "info" | "success" | "error" = "info") => {
      const id = generateId();
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    [],
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const response = await authFetch(TICKET_CATEGORIES_ENDPOINT, { cache: "no-store" });
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }, [authFetch]);

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      
      if (filters.status) params.append("status", filters.status);
      if (filters.priority) params.append("priority", filters.priority);
      if (filters.category_id) params.append("category_id", filters.category_id);
      if (filters.assigned_to_me) params.append("assigned_to_me", "true");
      if (filters.created_by_me) params.append("created_by_me", "true");
      if (filters.unassigned) params.append("unassigned", "true");
      if (searchQuery.trim().length >= 2) params.append("search", searchQuery.trim());
      if (filters.sla_breach !== undefined) params.append("sla_breach", String(filters.sla_breach));
      
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
  }, [authFetch, filters, searchQuery]);

  useEffect(() => {
    loadTickets();
    loadCategories();
  }, [loadTickets, loadCategories]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length === 0 || searchQuery.length >= 2) {
        loadTickets();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

      addToast("Тикет успешно создан", "success");
      await loadTickets();
      setIsCreating(false);
      setFormData({ title: "", description: "", priority: "medium", category_id: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания тикета");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter tickets (hide closed by default)
  const displayedTickets = useMemo(() => {
    let filtered = tickets;
    
    // Hide closed tickets if enabled
    if (hideClosed) {
      filtered = filtered.filter(t => t.status !== "closed");
    }
    
    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query) ||
        t.created_by_full_name?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [tickets, hideClosed, searchQuery]);

  // Bulk operations
  const handleSelectAll = () => {
    if (selectedIds.size === displayedTickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(displayedTickets.map(t => t.id)));
    }
  };

  const handleSelectTicket = (ticketId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(ticketId)) {
      newSelected.delete(ticketId);
    } else {
      newSelected.add(ticketId);
    }
    setSelectedIds(newSelected);
  };

  const handleBulkUpdate = async (updates: Partial<TicketBulkUpdate>) => {
    if (selectedIds.size === 0) return;

    try {
      const response = await authFetch(TICKET_BULK_UPDATE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket_ids: Array.from(selectedIds),
          ...updates,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось обновить тикеты");
      }

      const result = await response.json();
      addToast(`Обновлено ${result.updated_count} тикетов`, "success");
      setSelectedIds(new Set());
      setShowBulkActions(false);
      await loadTickets();
    } catch (err) {
      addToast(err instanceof Error ? err.message : "Ошибка обновления", "error");
    }
  };

  const getStatusOption = (status: string) => 
    STATUS_OPTIONS.find(s => s.value === status) || STATUS_OPTIONS[0];
  
  const getPriorityOption = (priority: string) => 
    PRIORITY_OPTIONS.find(p => p.value === priority) || PRIORITY_OPTIONS[1];

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filters.status) count++;
    if (filters.priority) count++;
    if (filters.category_id) count++;
    if (filters.assigned_to_me) count++;
    if (filters.created_by_me) count++;
    if (filters.unassigned) count++;
    if (filters.sla_breach !== undefined) count++;
    return count;
  }, [filters]);

  const clearFilters = () => {
    setFilters({});
    setSearchQuery("");
  };

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col z-50 overflow-hidden" style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-lg font-bold text-slate-900">🎫 Техподдержка</h2>
          <span className="text-sm text-slate-500">
            {displayedTickets.length === tickets.length 
              ? `(${tickets.length})` 
              : `(${displayedTickets.length} из ${tickets.length})`}
          </span>
          
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск тикетов..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Hide closed toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideClosed}
              onChange={(e) => setHideClosed(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-600 whitespace-nowrap">Скрыть закрытые</span>
          </label>

          {/* Filter button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-lg border text-sm font-medium transition ${
              showFilters || activeFiltersCount > 0
                ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Фильтры
              {activeFiltersCount > 0 && (
                <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {activeFiltersCount}
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk actions for staff */}
          {isStaff && selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mr-2">
              <span className="text-xs text-slate-500">
                Выбрано: {selectedIds.size}
              </span>
              <button
                onClick={() => setShowBulkActions(!showBulkActions)}
                className="px-3 py-1.5 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-medium hover:bg-indigo-200"
              >
                Действия
              </button>
            </div>
          )}

          {/* Stats button for staff */}
          {isStaff && (
            <button
              onClick={() => setShowStats(true)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition text-sm"
            >
              📊 Статистика
            </button>
          )}

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

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Status filter */}
            <select
              value={filters.status || ""}
              onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="">Все статусы</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>

            {/* Priority filter */}
            <select
              value={filters.priority || ""}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value || undefined })}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            >
              <option value="">Все приоритеты</option>
              {PRIORITY_OPTIONS.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            {/* Category filter */}
            {categories.length > 0 && (
              <select
                value={filters.category_id || ""}
                onChange={(e) => setFilters({ ...filters, category_id: e.target.value || undefined })}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
              >
                <option value="">Все категории</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}

            {/* Quick filters */}
            <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.assigned_to_me || false}
                onChange={(e) => setFilters({ ...filters, assigned_to_me: e.target.checked || undefined })}
                className="rounded border-slate-300"
              />
              Назначены мне
            </label>

            <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.created_by_me || false}
                onChange={(e) => setFilters({ ...filters, created_by_me: e.target.checked || undefined })}
                className="rounded border-slate-300"
              />
              Созданы мной
            </label>

            {isStaff && (
              <>
                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.unassigned || false}
                    onChange={(e) => setFilters({ ...filters, unassigned: e.target.checked || undefined })}
                    className="rounded border-slate-300"
                  />
                  Не назначены
                </label>

                <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.sla_breach === true}
                    onChange={(e) => setFilters({ ...filters, sla_breach: e.target.checked ? true : undefined })}
                    className="rounded border-slate-300"
                  />
                  Нарушение SLA
                </label>
              </>
            )}

            {activeFiltersCount > 0 && (
              <button
                onClick={clearFilters}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bulk actions dropdown */}
      {showBulkActions && selectedIds.size > 0 && (
        <div className="absolute right-24 top-16 z-20 bg-white rounded-xl shadow-xl border border-slate-200 p-3 w-64">
          <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Массовые действия</div>
          
          <div className="space-y-2">
            <div>
              <label className="text-xs text-slate-600 mb-1 block">Изменить статус</label>
              <select
                onChange={(e) => e.target.value && handleBulkUpdate({ status: e.target.value as any })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                defaultValue=""
              >
                <option value="">Выберите...</option>
                {STATUS_OPTIONS.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">Изменить приоритет</label>
              <select
                onChange={(e) => e.target.value && handleBulkUpdate({ priority: e.target.value as any })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                defaultValue=""
              >
                <option value="">Выберите...</option>
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-600 mb-1 block">Назначить исполнителя</label>
              <select
                onChange={(e) => handleBulkUpdate({ assigned_to: e.target.value || null })}
                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                defaultValue=""
              >
                <option value="">Не назначен</option>
                {users.filter(u => u.role === "admin" || u.role === "it").map(u => (
                  <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              setSelectedIds(new Set());
              setShowBulkActions(false);
            }}
            className="mt-3 w-full text-xs text-slate-500 hover:text-slate-700"
          >
            Отменить выбор
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
        {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" />
                <span className="text-slate-500">Загрузка...</span>
              </div>
          </div>
        ) : error && !isCreating ? (
            <div className="text-red-600 text-center py-8">{error}</div>
        ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="text-4xl mb-3">🎫</div>
            <div className="text-slate-400 text-lg mb-2">Нет тикетов</div>
              <div className="text-slate-500 text-sm">
                {activeFiltersCount > 0 
                  ? "Попробуйте изменить параметры фильтрации"
                  : "Создайте первый тикет для начала работы"}
              </div>
          </div>
        ) : (
            <div className="space-y-3">
              {/* Select all checkbox for staff */}
              {isStaff && tickets.length > 0 && (
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === tickets.length && tickets.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300"
                  />
                  <span className="text-xs text-slate-500">
                    {selectedIds.size === displayedTickets.length ? "Снять выделение" : "Выделить все"}
                  </span>
                </div>
              )}

              {displayedTickets.map((ticket) => {
                const statusOpt = getStatusOption(ticket.status);
                const priorityOpt = getPriorityOption(ticket.priority);
                const isSelected = selectedIds.has(ticket.id);

                return (
              <div
                key={ticket.id}
                    className={`bg-white border rounded-xl p-4 hover:shadow-md transition cursor-pointer ${
                      isSelected ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200"
                    } ${ticket.sla_breach ? "border-l-4 border-l-red-500" : ""}`}
                onClick={() => setSelectedTicket(ticket)}
              >
                    <div className="flex items-start gap-3">
                      {/* Checkbox for staff */}
                      {isStaff && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleSelectTicket(ticket.id)}
                            className="rounded border-slate-300 mt-1"
                          />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                    <h3 className="font-semibold text-slate-900">{ticket.title}</h3>
                    <p className="text-sm text-slate-600 mt-1 line-clamp-2">{ticket.description}</p>
                  </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusOpt.color}`}>
                      {ticket.status === "waiting_response" && (
                        <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                      )}
                              {statusOpt.label}
                    </span>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityOpt.color}`}>
                              {priorityOpt.label}
                    </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                          {ticket.category_name && (
                            <span className="flex items-center gap-1">
                              <span 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: ticket.category_color || "#6366f1" }}
                              />
                              {ticket.category_name}
                            </span>
                          )}
                          <span>#{ticket.id.slice(0, 8)}</span>
                          <span>Создан: {new Date(ticket.created_at).toLocaleDateString("ru-RU")}</span>
                          {ticket.assigned_to_full_name && (
                            <span className="flex items-center gap-1">
                              <span className="text-indigo-600">→</span>
                              {ticket.assigned_to_full_name}
                            </span>
                          )}
                          {ticket.comments_count > 0 && (
                            <span className="flex items-center gap-1">
                              💬 {ticket.comments_count}
                            </span>
                          )}
                          {ticket.attachments_count > 0 && (
                            <span className="flex items-center gap-1">
                              📎 {ticket.attachments_count}
                            </span>
                          )}
                          {isStaff && ticket.internal_notes_count !== undefined && ticket.internal_notes_count > 0 && (
                            <span className="flex items-center gap-1 text-amber-600">
                              📌 {ticket.internal_notes_count}
                            </span>
                          )}
                          {ticket.sla_breach && (
                            <span className="text-red-600 font-medium">⚠️ SLA</span>
                          )}
                        </div>
                  </div>
                </div>
              </div>
                );
              })}
          </div>
        )}
        </div>
      </div>

      {/* Ticket detail modal */}
      {selectedTicket && (
        <TicketDetail
          ticket={selectedTicket}
          authFetch={authFetch}
          apiBaseUrl={apiBaseUrl}
          users={users}
          organizations={organizations}
          getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          categories={categories}
          onClose={() => {
            setSelectedTicket(null);
            loadTickets();
          }}
          onUpdate={loadTickets}
          onNotify={(msg, type) => addToast(msg, type)}
        />
      )}

      {/* Create ticket modal */}
      {isCreating && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 animate-modal-enter">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-modal-enter">
            <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-purple-50">
              <h2 className="text-xl font-bold text-slate-900">Создать тикет</h2>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setFormData({ title: "", description: "", priority: "medium", category_id: null });
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

                <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-900 mb-2">
                    Приоритет
                  </label>
                  <select
                    value={formData.priority}
                      onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                      className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 transition"
                      disabled={isSubmitting}
                    >
                      {PRIORITY_OPTIONS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  {categories.length > 0 && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Категория
                      </label>
                      <select
                        value={formData.category_id || ""}
                        onChange={(e) => setFormData({ ...formData, category_id: e.target.value || null })}
                    className="w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-indigo-500 transition"
                    disabled={isSubmitting}
                  >
                        <option value="">Без категории</option>
                        {categories.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                  </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    setFormData({ title: "", description: "", priority: "medium", category_id: null });
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

      {/* Stats dashboard modal */}
      {showStats && (
        <TicketStatsDashboard
          authFetch={authFetch}
          onClose={() => setShowStats(false)}
        />
      )}

      {/* Toasts */}
      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-slide-in ${
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

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
