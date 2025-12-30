"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import { AVAILABILITY_SLOTS_ENDPOINT, WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES, USERS_ENDPOINT } from "@/lib/constants";

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

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
}

interface AvailabilitySlotsTableProps {
  authFetch: AuthenticatedFetch;
  currentUserId?: string;
  currentUserRole?: string;
  selectedCalendarId?: string;
  onSlotBooked?: () => void;
  onOpenEventModal?: (slot: AvailabilitySlot) => void;
  hasAccessToStatistics?: boolean;
}

interface TimeSlot {
  index: number;
  hour: number;
  minute: number;
  label: string;
}

interface TableRow {
  day: Date;
  userId: string;
  userName: string;
  userEmail: string;
  userDepartment?: string;
  slots: AvailabilitySlot[];
}

// Утилита для получения даты в формате YYYY-MM-DD (локальное время)
const getDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

// Утилита для проверки, попадает ли дата в день (локальное время)
const isSameDay = (date1: Date, date2: Date): boolean => {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
};

// Утилита для получения времени в минутах от начала дня
const getTimeInMinutes = (date: Date): number => {
  return date.getHours() * 60 + date.getMinutes();
};

export function AvailabilitySlotsTable({
  authFetch,
  currentUserId,
  currentUserRole,
  selectedCalendarId,
  onSlotBooked,
  onOpenEventModal,
  hasAccessToStatistics = false,
}: AvailabilitySlotsTableProps) {
  const isAdmin = currentUserRole === "admin" || currentUserRole === "it";
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedProcess, setSelectedProcess] = useState<string>("");
  const [processNames, setProcessNames] = useState<string[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  // Состояние для выделения времени
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ rowIndex: number; timeSlotIndex: number; day: Date; userId: string } | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{ rowIndex: number; timeSlotIndex: number } | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [slotFormData, setSlotFormData] = useState<{
    day: Date;
    startTime: string;
    endTime: string;
    process_name: string;
    description: string;
  } | null>(null);
  
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserFullName, setNewUserFullName] = useState("");

  // Генерируем временные слоты
  const timeSlots: TimeSlot[] = useMemo(() => {
    const totalSlots = ((WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60) / SLOT_DURATION_MINUTES;
    return Array.from({ length: totalSlots }, (_, index) => {
      const totalMinutes = WORKDAY_START_HOUR * 60 + index * SLOT_DURATION_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  // Генерируем дни недели
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const startOfWeek = new Date(selectedDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
    startOfWeek.setDate(diff);
    startOfWeek.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  }, [selectedDate]);

  // Загрузка слотов
  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = new Date(weekDays[0]);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekDays[6]);
      weekEnd.setHours(23, 59, 59, 999);

      const params = new URLSearchParams();
      params.append("from", weekStart.toISOString());
      params.append("to", weekEnd.toISOString());
      if (selectedProcess) {
        params.append("process_name", selectedProcess);
      }

      const response = await authFetch(`${AVAILABILITY_SLOTS_ENDPOINT}?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить слоты");
      }
      const data = await response.json();
      const filteredSlots = data.filter((slot: AvailabilitySlot) => slot.status !== "cancelled");
      setSlots(filteredSlots);
    } catch (err) {
      console.error("Failed to load slots:", err);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [authFetch, weekDays, selectedProcess]);

  // Загрузка пользователей
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const response = await authFetch(USERS_ENDPOINT, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Не удалось загрузить пользователей");
      }
      const data = await response.json();
      const usersList = Array.isArray(data) ? data : (data.items || []);
      setUsers(usersList);
    } catch (err) {
      console.error("Failed to load users:", err);
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [authFetch]);

  // Загрузка названий процессов
  const loadProcessNames = useCallback(async () => {
    try {
      const response = await authFetch(`${AVAILABILITY_SLOTS_ENDPOINT}?from=${new Date(0).toISOString()}&to=${new Date().toISOString()}`);
      if (response.ok) {
        const data = await response.json();
        const names = Array.from(new Set(data.map((slot: AvailabilitySlot) => slot.process_name).filter(Boolean))) as string[];
        setProcessNames(names.sort());
      }
    } catch (err) {
      console.error("Failed to load process names:", err);
    }
  }, [authFetch]);

  useEffect(() => {
    loadSlots();
    loadUsers();
    loadProcessNames();
  }, [loadSlots, loadUsers, loadProcessNames]);

  // Формируем строки таблицы, сгруппированные по дням
  const tableRowsByDay = useMemo(() => {
    const rowsByDay = new Map<string, TableRow[]>();
    
    weekDays.forEach((day) => {
      const dayKey = getDateKey(day);
      const dayRows: TableRow[] = [];
      
      // Фильтруем слоты для этого дня
      const daySlots = slots.filter((slot) => {
        const slotDate = new Date(slot.starts_at);
        return isSameDay(slotDate, day);
      });
      
      // Группируем слоты по пользователю
      const slotsByUser = new Map<string, AvailabilitySlot[]>();
      daySlots.forEach((slot) => {
        if (!slotsByUser.has(slot.user_id)) {
          slotsByUser.set(slot.user_id, []);
        }
        slotsByUser.get(slot.user_id)!.push(slot);
      });
      
      // Создаем строки для каждого пользователя
      slotsByUser.forEach((userSlots, userId) => {
        const firstSlot = userSlots[0];
        const user = users.find(u => u.id === userId);
        const userName = firstSlot.user_name || user?.full_name || firstSlot.user_email.split("@")[0];
        
        dayRows.push({
          day,
          userId,
          userName,
          userEmail: firstSlot.user_email,
          userDepartment: firstSlot.user_department,
          slots: userSlots,
        });
      });
      
      // Добавляем строку для выбранного пользователя, если его нет
      if (selectedUserId && !dayRows.find(r => r.userId === selectedUserId)) {
        const selectedUser = users.find(u => u.id === selectedUserId);
        if (selectedUser) {
          dayRows.push({
            day,
            userId: selectedUser.id,
            userName: selectedUser.full_name || selectedUser.email.split("@")[0],
            userEmail: selectedUser.email,
            userDepartment: undefined,
            slots: [],
          });
        }
      }
      
      // Фильтруем по выбранному пользователю
      const filteredRows = selectedUserId 
        ? dayRows.filter(r => r.userId === selectedUserId)
        : dayRows;
      
      rowsByDay.set(dayKey, filteredRows);
    });
    
    return rowsByDay;
  }, [slots, weekDays, users, selectedUserId]);

  // Проверяем, попадает ли слот в временной интервал
  const getSlotForTime = (timeSlot: TimeSlot, rowSlots: AvailabilitySlot[]): AvailabilitySlot | null => {
    if (!rowSlots || rowSlots.length === 0) return null;
    
    const slotStartMinutes = timeSlot.hour * 60 + timeSlot.minute;
    const slotEndMinutes = slotStartMinutes + SLOT_DURATION_MINUTES;
    
    return rowSlots.find((slot) => {
      const eventStart = new Date(slot.starts_at);
      const eventEnd = new Date(slot.ends_at);
      const eventStartMinutes = getTimeInMinutes(eventStart);
      const eventEndMinutes = getTimeInMinutes(eventEnd);
      
      // Проверяем пересечение интервалов
      return eventStartMinutes < slotEndMinutes && eventEndMinutes > slotStartMinutes;
    }) || null;
  };

  // Обработчики для выделения времени
  const getCellKey = (rowIndex: number, timeSlotIndex: number) => `${rowIndex}-${timeSlotIndex}`;

  const handleCellMouseDown = (e: React.MouseEvent, rowIndex: number, timeSlotIndex: number, row: TableRow) => {
    e.preventDefault();
    const targetUserId = isAdmin && selectedUserId ? selectedUserId : currentUserId;
    if (targetUserId && row.userId === targetUserId && !getSlotForTime(timeSlots[timeSlotIndex], row.slots)) {
      setIsSelecting(true);
      setSelectionStart({ rowIndex, timeSlotIndex, day: row.day, userId: row.userId });
      setSelectionEnd({ rowIndex, timeSlotIndex });
      setSelectedCells(new Set([getCellKey(rowIndex, timeSlotIndex)]));
    }
  };

  const handleCellMouseEnter = (rowIndex: number, timeSlotIndex: number, row: TableRow) => {
    if (isSelecting && selectionStart && selectionStart.userId === row.userId) {
      setSelectionEnd({ rowIndex, timeSlotIndex });
      const startIdx = Math.min(selectionStart.timeSlotIndex, timeSlotIndex);
      const endIdx = Math.max(selectionStart.timeSlotIndex, timeSlotIndex);
      const cells = new Set<string>();
      for (let i = startIdx; i <= endIdx; i++) {
        cells.add(getCellKey(selectionStart.rowIndex, i));
      }
      setSelectedCells(cells);
    }
  };

  const handleCellMouseUp = () => {
    if (isSelecting && selectionStart && selectionEnd) {
      const startIdx = Math.min(selectionStart.timeSlotIndex, selectionEnd.timeSlotIndex);
      const endIdx = Math.max(selectionStart.timeSlotIndex, selectionEnd.timeSlotIndex);
      
      if (startIdx !== endIdx) {
        const startTimeSlot = timeSlots[startIdx];
        const endTimeSlot = timeSlots[endIdx];
        
        const startDate = new Date(
          selectionStart.day.getFullYear(),
          selectionStart.day.getMonth(),
          selectionStart.day.getDate(),
          startTimeSlot.hour,
          startTimeSlot.minute,
          0,
          0
        );
        
        const endDate = new Date(
          selectionStart.day.getFullYear(),
          selectionStart.day.getMonth(),
          selectionStart.day.getDate(),
          endTimeSlot.hour,
          endTimeSlot.minute + SLOT_DURATION_MINUTES,
          0,
          0
        );
        
        const formatForInput = (date: Date) => {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const hours = String(date.getHours()).padStart(2, '0');
          const minutes = String(date.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        };
        
        setSlotFormData({
          day: selectionStart.day,
          startTime: formatForInput(startDate),
          endTime: formatForInput(endDate),
          process_name: "",
          description: "",
        });
        setShowSlotForm(true);
      }
      
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
      setSelectedCells(new Set());
    }
  };

  // Создание слота
  const handleCreateSlot = useCallback(async () => {
    if (!slotFormData || !slotFormData.process_name) {
      alert("Заполните название процесса");
      return;
    }

    const targetUserId = isAdmin && selectedUserId ? selectedUserId : currentUserId;
    if (!targetUserId) {
      alert("Не выбран пользователь");
      return;
    }

    const startDate = new Date(slotFormData.startTime);
    const endDate = new Date(slotFormData.endTime);

    const requestBody: any = {
      process_name: slotFormData.process_name,
      starts_at: startDate.toISOString(),
      ends_at: endDate.toISOString(),
      description: slotFormData.description || undefined,
    };

    if (isAdmin && selectedUserId && selectedUserId !== currentUserId) {
      requestBody.user_id = selectedUserId;
    }

    try {
      const response = await authFetch(AVAILABILITY_SLOTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || "Не удалось создать слот");
      }

      setShowSlotForm(false);
      setSlotFormData(null);
      await loadSlots();
      alert("Слот успешно создан!");
    } catch (err) {
      console.error("Failed to create slot:", err);
      alert(err instanceof Error ? err.message : "Ошибка создания слота");
    }
  }, [slotFormData, authFetch, loadSlots, isAdmin, selectedUserId, currentUserId]);

  // Бронирование слота
  const handleBookSlot = (slot: AvailabilitySlot) => {
    if (!selectedCalendarId) {
      alert("Выберите календарь для создания события");
      return;
    }
    if (onOpenEventModal) {
      onOpenEventModal(slot);
    }
  };

  const getBookedByDisplayName = (slot: AvailabilitySlot): string => {
    if (slot.booked_by_user_name) return slot.booked_by_user_name;
    if (slot.booked_by_user_email) return slot.booked_by_user_email.split("@")[0];
    return "Неизвестно";
  };

  const formatDay = (date: Date): string => {
    return date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Заголовок и фильтры */}
      <div className="flex-shrink-0 p-4 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-slate-900">Предложение слотов</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedDate(new Date(selectedDate.getTime() - 7 * 24 * 60 * 60 * 1000))}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              ← Предыдущая неделя
            </button>
            <button
              onClick={() => setSelectedDate(new Date())}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              Сегодня
            </button>
            <button
              onClick={() => setSelectedDate(new Date(selectedDate.getTime() + 7 * 24 * 60 * 60 * 1000))}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            >
              Следующая неделя →
            </button>
          </div>
        </div>
        
        <div className="flex items-center gap-4 flex-wrap">
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              {isAdmin ? "Сотрудник" : "Показать строку сотрудника"}
            </label>
            <div className="flex gap-2">
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
                disabled={loadingUsers}
              >
                <option value="">{isAdmin ? "Все сотрудники" : "Все сотрудники"}</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.full_name || user.email}
                  </option>
                ))}
              </select>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(true)}
                  className="px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-600 transition"
                  title="Добавить нового сотрудника"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          
          <div className="min-w-[200px]">
            <label className="block text-xs font-medium text-slate-700 mb-1">Процесс</label>
            <select
              value={selectedProcess}
              onChange={(e) => setSelectedProcess(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm"
            >
              <option value="">Все процессы</option>
              {processNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Таблица */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-slate-500">Загрузка...</div>
          </div>
        ) : (
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-20 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-30 bg-white border-r-2 border-slate-300 px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[140px]">
                  День
                </th>
                <th className="sticky left-[140px] z-30 bg-white border-r-2 border-slate-300 px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[200px]">
                  Сотрудник
                </th>
                <th className="sticky left-[340px] z-30 bg-white border-r-2 border-slate-300 px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[220px]">
                  Процессы
                </th>
                {timeSlots.map((timeSlot) => (
                  <th
                    key={timeSlot.label}
                    className="px-3 py-4 text-center text-xs font-bold text-slate-700 uppercase tracking-wider border-r border-slate-200 last:border-r-0 min-w-[60px] bg-white"
                  >
                    {timeSlot.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDays.map((day, dayIndex) => {
                const dayKey = getDateKey(day);
                const dayRows = tableRowsByDay.get(dayKey) || [];

                return dayRows.map((row, rowIndex) => {
                  const globalRowIndex = dayIndex * 1000 + rowIndex;
                  const showDay = rowIndex === 0;
                  const uniqueProcesses = Array.from(new Set(row.slots.map(s => s.process_name)));

                  return (
                    <tr
                      key={`${dayKey}-${row.userId}`}
                      className="border-b border-slate-100 hover:bg-slate-50 transition"
                    >
                      {showDay && (
                        <td
                          rowSpan={dayRows.length}
                          className="sticky left-0 z-10 bg-white border-r-2 border-slate-300 px-6 py-4 align-top shadow-lg"
                        >
                          <div className="min-w-[140px]">
                            <p className="text-sm font-bold text-slate-900">
                              {formatDay(row.day)}
                            </p>
                          </div>
                        </td>
                      )}
                      <td className="sticky left-[140px] z-10 bg-white border-r-2 border-slate-300 px-6 py-4">
                        <div className="min-w-[200px]">
                          <p className="text-sm font-semibold text-slate-900">
                            {row.userName}
                          </p>
                          {row.userDepartment && (
                            <p className="text-xs text-slate-500 mt-1">
                              {row.userDepartment}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="sticky left-[340px] z-10 bg-white border-r-2 border-slate-300 px-6 py-4">
                        <div className="min-w-[220px]">
                          <div className="flex flex-wrap gap-1">
                            {uniqueProcesses.map((process, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-100 text-indigo-800"
                              >
                                {process}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>
                      {timeSlots.map((timeSlot, timeSlotIndex) => {
                        const slot = getSlotForTime(timeSlot, row.slots);
                        const isMySlot = slot && slot.user_id === currentUserId;
                        const isBooked = slot && slot.status === "booked";
                        const cellKey = getCellKey(globalRowIndex, timeSlotIndex);
                        const isSelected = selectedCells.has(cellKey);
                        const targetUserId = isAdmin && selectedUserId ? selectedUserId : currentUserId;
                        const canSelect = !slot && targetUserId && row.userId === targetUserId;

                        return (
                          <td
                            key={timeSlot.label}
                            className="px-1 py-1 text-center border-r border-slate-100 last:border-r-0"
                            onMouseDown={(e) => canSelect && handleCellMouseDown(e, globalRowIndex, timeSlotIndex, row)}
                            onMouseEnter={() => canSelect && handleCellMouseEnter(globalRowIndex, timeSlotIndex, row)}
                            onMouseUp={handleCellMouseUp}
                            style={{ cursor: canSelect ? 'crosshair' : 'default' }}
                          >
                            {slot ? (
                              <div
                                className={`w-full h-12 rounded-lg transition-all flex flex-col items-center justify-center text-xs font-medium ${
                                  isBooked
                                    ? "bg-gradient-to-br from-blue-100 to-blue-200 border-2 border-blue-400 shadow-md cursor-default"
                                    : isMySlot
                                    ? "bg-gradient-to-br from-green-100 to-green-200 border-2 border-green-400 shadow-sm cursor-default"
                                    : "bg-gradient-to-br from-green-100 to-green-200 border-2 border-green-400 shadow-sm hover:from-green-200 hover:to-green-300 cursor-pointer"
                                }`}
                                onClick={() => !isMySlot && !isBooked && handleBookSlot(slot)}
                                title={
                                  isBooked
                                    ? `Зарезервировано: ${getBookedByDisplayName(slot)}`
                                    : isMySlot
                                    ? "Мой слот"
                                    : `${slot.process_name} (${new Date(slot.starts_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} - ${new Date(slot.ends_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })})`
                                }
                              >
                                {isBooked ? (
                                  <>
                                    <span className="text-blue-800 font-semibold text-[10px] leading-tight">
                                      {getBookedByDisplayName(slot)}
                                    </span>
                                    <span className="text-blue-600 text-[9px] mt-0.5">
                                      {slot.process_name}
                                    </span>
                                  </>
                                ) : isMySlot ? (
                                  <>
                                    <span className="text-green-800 font-semibold text-[10px] leading-tight">
                                      Мой
                                    </span>
                                    <span className="text-green-700 text-[9px] mt-0.5">
                                      {slot.process_name}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-green-700 text-[10px]">{slot.process_name}</span>
                                )}
                              </div>
                            ) : (
                              <div
                                className={`w-full h-12 rounded-lg border transition-all ${
                                  isSelected
                                    ? "bg-blue-200 border-blue-500 border-2 shadow-md"
                                    : canSelect
                                    ? "bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200 hover:bg-slate-200"
                                    : "bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200"
                                }`}
                              >
                                {isSelected && (
                                  <div className="h-full flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-blue-700">Выбрано</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Модальное окно создания слота */}
      {showSlotForm && slotFormData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Создать слот</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Название процесса *
                </label>
                <input
                  type="text"
                  value={slotFormData.process_name}
                  onChange={(e) => setSlotFormData({ ...slotFormData, process_name: e.target.value })}
                  placeholder="Введите название процесса"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Время начала
                </label>
                <input
                  type="datetime-local"
                  value={slotFormData.startTime}
                  onChange={(e) => setSlotFormData({ ...slotFormData, startTime: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Время окончания
                </label>
                <input
                  type="datetime-local"
                  value={slotFormData.endTime}
                  onChange={(e) => setSlotFormData({ ...slotFormData, endTime: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Описание (необязательно)
                </label>
                <textarea
                  value={slotFormData.description}
                  onChange={(e) => setSlotFormData({ ...slotFormData, description: e.target.value })}
                  rows={3}
                  placeholder="Дополнительная информация"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSlotForm(false);
                  setSlotFormData(null);
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 transition"
              >
                Отмена
              </button>
              <button
                onClick={handleCreateSlot}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-600 transition"
              >
                Создать слот
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно добавления нового пользователя */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Добавить нового сотрудника</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ФИО
                </label>
                <input
                  type="text"
                  value={newUserFullName}
                  onChange={(e) => setNewUserFullName(e.target.value)}
                  placeholder="Иванов Иван Иванович"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Пароль *
                </label>
                <input
                  type="password"
                  id="newUserPassword"
                  placeholder="Минимум 8 символов"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserEmail("");
                  setNewUserFullName("");
                  const passwordInput = document.getElementById("newUserPassword") as HTMLInputElement;
                  if (passwordInput) passwordInput.value = "";
                }}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 font-medium hover:bg-slate-50 transition"
              >
                Отмена
              </button>
              <button
                onClick={async () => {
                  const passwordInput = document.getElementById("newUserPassword") as HTMLInputElement;
                  const password = passwordInput?.value || "";
                  
                  if (!newUserEmail || !password) {
                    alert("Заполните email и пароль");
                    return;
                  }

                  if (password.length < 8) {
                    alert("Пароль должен быть не менее 8 символов");
                    return;
                  }

                  try {
                    const response = await authFetch(`${USERS_ENDPOINT}admin-create`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        email: newUserEmail,
                        full_name: newUserFullName || undefined,
                        password: password,
                        role: "employee",
                      }),
                    });

                    if (!response.ok) {
                      const error = await response.json().catch(() => ({}));
                      throw new Error(error.detail || "Не удалось создать пользователя");
                    }

                    const newUser = await response.json();
                    await loadUsers();
                    setSelectedUserId(newUser.id);
                    
                    setShowAddUserModal(false);
                    setNewUserEmail("");
                    setNewUserFullName("");
                    if (passwordInput) passwordInput.value = "";
                    
                    alert("Сотрудник успешно создан! Теперь вы можете создать для него слот.");
                  } catch (err) {
                    console.error("Failed to create user:", err);
                    alert(err instanceof Error ? err.message : "Ошибка создания пользователя");
                  }
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold shadow-lg hover:from-indigo-600 hover:to-purple-600 transition"
              >
                Создать сотрудника
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
