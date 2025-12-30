"use client";

import { useEffect, useState, useCallback } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import { AVAILABILITY_SLOTS_ENDPOINT } from "@/lib/constants";
import { AvailabilitySlotsTable } from "./AvailabilitySlotsTable";

interface AvailabilitySlot {
  id: string;
  user_id: string;
  process_name: string;
  starts_at: string;
  ends_at: string;
  description?: string;
  status: "available" | "booked" | "cancelled";
  booked_by?: string;
  booked_at?: string;
  event_id?: string;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email: string;
  user_department?: string;
  booked_by_user_name?: string;
  booked_by_user_email?: string;
}

interface AvailabilitySlotsManagerProps {
  authFetch: AuthenticatedFetch;
  currentUserId?: string;
  currentUserRole?: string;
  selectedCalendarId?: string;
  onSlotBooked?: () => void;
  onClose?: () => void;
  onOpenEventModal?: (slot: AvailabilitySlot) => void;
  hasAccessToStatistics?: boolean;
}

export function AvailabilitySlotsManager({
  authFetch,
  currentUserId,
  currentUserRole,
  selectedCalendarId,
  onSlotBooked,
  onClose,
  onOpenEventModal,
  hasAccessToStatistics = false,
}: AvailabilitySlotsManagerProps) {
  const [activeTab, setActiveTab] = useState<"offer" | "browse" | "my" | "table">("table");
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [mySlots, setMySlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [processNames, setProcessNames] = useState<string[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string>("");
  const [filterMySlots, setFilterMySlots] = useState(false);

  // Form state for offering a slot
  const [offerForm, setOfferForm] = useState({
    process_name: "",
    starts_at: "",
    ends_at: "",
    description: "",
  });

  // Form state for booking a slot
  const [bookingForm, setBookingForm] = useState({
    slotId: "",
    title: "",
    description: "",
    room_id: "",
    participant_ids: [] as string[],
  });

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedProcess) {
        params.append("process_name", selectedProcess);
      }
      params.append("status", "available");
      if (filterMySlots) {
        params.append("my_slots_only", "true");
      }

      const response = await authFetch(
        `${AVAILABILITY_SLOTS_ENDPOINT}?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Не удалось загрузить слоты");
      }
      const data = await response.json();
      setSlots(data);
    } catch (err) {
      console.error("Failed to load slots:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, selectedProcess, filterMySlots]);

  const loadMySlots = useCallback(async () => {
    try {
      const response = await authFetch(
        `${AVAILABILITY_SLOTS_ENDPOINT}?my_slots_only=true`
      );
      if (!response.ok) {
        throw new Error("Не удалось загрузить мои слоты");
      }
      const data = await response.json();
      setMySlots(data);
    } catch (err) {
      console.error("Failed to load my slots:", err);
    }
  }, [authFetch]);

  const loadProcessNames = useCallback(async () => {
    try {
      const response = await authFetch(`${AVAILABILITY_SLOTS_ENDPOINT}processes/list`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить процессы");
      }
      const data = await response.json();
      setProcessNames(data);
    } catch (err) {
      console.error("Failed to load process names:", err);
    }
  }, [authFetch]);

  useEffect(() => {
    if (activeTab === "browse") {
      loadSlots();
    } else {
      loadMySlots();
    }
    loadProcessNames();
  }, [activeTab, loadSlots, loadMySlots, loadProcessNames]);

  const handleOfferSlot = async () => {
    if (!offerForm.process_name || !offerForm.starts_at || !offerForm.ends_at) {
      alert("Заполните все обязательные поля");
      return;
    }

    try {
      const response = await authFetch(AVAILABILITY_SLOTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          process_name: offerForm.process_name,
          starts_at: new Date(offerForm.starts_at).toISOString(),
          ends_at: new Date(offerForm.ends_at).toISOString(),
          description: offerForm.description || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Не удалось создать слот");
      }

      // Reset form
      setOfferForm({
        process_name: "",
        starts_at: "",
        ends_at: "",
        description: "",
      });

      // Reload slots
      loadMySlots();
      loadProcessNames();
      
      alert("Слот успешно создан!");
    } catch (err) {
      console.error("Failed to offer slot:", err);
      alert(err instanceof Error ? err.message : "Ошибка создания слота");
    }
  };

  const handleBookSlot = (slot: AvailabilitySlot) => {
    if (!selectedCalendarId) {
      alert("Сначала выберите календарь");
      return;
    }
    
    if (onOpenEventModal) {
      onOpenEventModal(slot);
    }
  };

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm("Вы уверены, что хотите удалить этот слот?")) {
      return;
    }

    try {
      const response = await authFetch(`${AVAILABILITY_SLOTS_ENDPOINT}${slotId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Не удалось удалить слот");
      }

      // Reload slots
      loadMySlots();
      loadSlots();
      
      alert("Слот успешно удален!");
    } catch (err) {
      console.error("Failed to delete slot:", err);
      alert(err instanceof Error ? err.message : "Ошибка удаления слота");
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  };

  // Предустановленные процессы
  const predefinedProcesses = [
    "Ст-1 // АЭ",
    "Краны/ Станки/ Прицепы",
    "СТ-1 / АЭ / ВТ / ТОРП/ Медицина"
  ];

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header with close button */}
      {onClose && (
        <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm px-6 py-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Предложения слотов доступности</h2>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-50 transition shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Закрыть
          </button>
        </div>
      )}
      {/* Tabs */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm px-6">
        <div className="flex gap-2">
          <button
          onClick={() => setActiveTab("table")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "table"
              ? "border-b-2 border-indigo-500 text-indigo-600"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Сводная таблица
          </button>
          <button
            onClick={() => setActiveTab("browse")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "browse"
              ? "border-b-2 border-indigo-500 text-indigo-600"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Просмотр предложений
          </button>
          <button
            onClick={() => setActiveTab("offer")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "offer"
              ? "border-b-2 border-indigo-500 text-indigo-600"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Предложить слот
          </button>
          <button
            onClick={() => setActiveTab("my")}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === "my"
              ? "border-b-2 border-indigo-500 text-indigo-600"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          Мои предложения
          </button>
        </div>
      </div>

      {/* Table Tab */}
      {activeTab === "table" && (
        <div className="flex-1 overflow-hidden">
          <AvailabilitySlotsTable
            authFetch={authFetch}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            selectedCalendarId={selectedCalendarId}
            onSlotBooked={() => {
              loadSlots();
              if (onSlotBooked) {
                onSlotBooked();
              }
            }}
            onOpenEventModal={onOpenEventModal}
            hasAccessToStatistics={hasAccessToStatistics}
          />
        </div>
      )}

      {/* Browse Tab */}
      {activeTab === "browse" && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-4 items-center">
              <div className="flex-1">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Фильтр по процессу
              </label>
              <select
                value={selectedProcess}
                onChange={(e) => setSelectedProcess(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="">Все процессы</option>
                {processNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="filterMySlots"
                checked={filterMySlots}
                onChange={(e) => setFilterMySlots(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <label htmlFor="filterMySlots" className="text-sm text-slate-700">
                Только мои слоты
              </label>
            </div>
            </div>

            {/* Slots List */}
            {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Нет доступных слотов
            </div>
          ) : (
            <div className="space-y-3">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-lg border border-slate-200 bg-white p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {slot.process_name}
                        </h3>
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                          Доступен
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <p>
                          <span className="font-medium">Время:</span>{" "}
                          {formatDateTime(slot.starts_at)} - {formatDateTime(slot.ends_at)}
                        </p>
                        <p>
                          <span className="font-medium">Предложил:</span>{" "}
                          {slot.user_name || slot.user_email}
                          {slot.user_department && ` (${slot.user_department})`}
                        </p>
                        {slot.description && (
                          <p>
                            <span className="font-medium">Описание:</span> {slot.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {slot.user_id !== currentUserId && (
                      <button
                        onClick={() => handleBookSlot(slot)}
                        disabled={!selectedCalendarId}
                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Забронировать
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}

      {/* Offer Tab */}
      {activeTab === "offer" && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Предложить слот доступности
              </h3>
              <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Название процесса/типа встречи *
                </label>
                <input
                  type="text"
                  list="process-options"
                  value={offerForm.process_name}
                  onChange={(e) =>
                    setOfferForm({ ...offerForm, process_name: e.target.value })
                  }
                  placeholder="Выберите из списка или введите вручную"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
                <datalist id="process-options">
                  {predefinedProcesses.map((process) => (
                    <option key={process} value={process} />
                  ))}
                  {processNames
                    .filter((name) => !predefinedProcesses.includes(name))
                    .map((name) => (
                      <option key={name} value={name} />
                    ))}
                </datalist>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Начало *
                  </label>
                  <input
                    type="datetime-local"
                    value={offerForm.starts_at}
                    onChange={(e) =>
                      setOfferForm({ ...offerForm, starts_at: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Конец *
                  </label>
                  <input
                    type="datetime-local"
                    value={offerForm.ends_at}
                    onChange={(e) =>
                      setOfferForm({ ...offerForm, ends_at: e.target.value })
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Описание (необязательно)
                </label>
                <textarea
                  value={offerForm.description}
                  onChange={(e) =>
                    setOfferForm({ ...offerForm, description: e.target.value })
                  }
                  rows={3}
                  placeholder="Дополнительная информация о слоте"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              <button
                onClick={handleOfferSlot}
                className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm font-semibold shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-600"
              >
                Предложить слот
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* My Slots Tab */}
      {activeTab === "my" && (
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            </div>
          ) : mySlots.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Вы еще не предложили ни одного слота
            </div>
          ) : (
            <div className="space-y-3">
              {mySlots.map((slot) => (
                <div
                  key={slot.id}
                  className="rounded-lg border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-slate-900">
                          {slot.process_name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${
                            slot.status === "available"
                              ? "bg-green-100 text-green-700"
                              : slot.status === "booked"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {slot.status === "available"
                            ? "Доступен"
                            : slot.status === "booked"
                            ? "Забронирован"
                            : "Отменен"}
                        </span>
                      </div>
                      <div className="text-sm text-slate-600 space-y-1">
                        <p>
                          <span className="font-medium">Время:</span>{" "}
                          {formatDateTime(slot.starts_at)} - {formatDateTime(slot.ends_at)}
                        </p>
                        {slot.description && (
                          <p>
                            <span className="font-medium">Описание:</span> {slot.description}
                          </p>
                        )}
                        {slot.status === "booked" && slot.booked_at && (
                          <p>
                            <span className="font-medium">Забронирован:</span>{" "}
                            {formatDateTime(slot.booked_at)}
                          </p>
                        )}
                      </div>
                    </div>
                    {slot.status === "available" && (
                      <button
                        onClick={() => handleDeleteSlot(slot.id)}
                        className="px-4 py-2 rounded-lg border border-red-200 bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </div>
      )}
    </div>
  );
}

