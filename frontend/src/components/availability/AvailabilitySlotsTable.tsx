"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import { AVAILABILITY_SLOTS_ENDPOINT, WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES } from "@/lib/constants";

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

interface AvailabilitySlotsTableProps {
  authFetch: AuthenticatedFetch;
  currentUserId?: string;
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
  slots: AvailabilitySlot[]; // Все слоты сотрудника в этот день (все процессы)
}

interface SlotStatistics {
  userId: string;
  userName: string;
  totalHours: number;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
}

export function AvailabilitySlotsTable({
  authFetch,
  currentUserId,
  selectedCalendarId,
  onSlotBooked,
  onOpenEventModal,
  hasAccessToStatistics = false,
}: AvailabilitySlotsTableProps) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedProcess, setSelectedProcess] = useState<string>("");
  const [processNames, setProcessNames] = useState<string[]>([]);
  const [showStatistics, setShowStatistics] = useState(false);

  // Генерируем временные слоты (как в EnhancedTimeline)
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

  // Генерируем дни недели для выбранной даты
  const weekDays = useMemo(() => {
    const days: Date[] = [];
    const startOfWeek = new Date(selectedDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Понедельник
    startOfWeek.setDate(diff);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      days.push(date);
    }
    return days;
  }, [selectedDate]);

  const loadSlots = useCallback(async () => {
    setLoading(true);
    try {
      const weekStart = new Date(weekDays[0]);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekDays[6]);
      weekEnd.setHours(23, 59, 59, 999);

      // Загружаем все слоты (available и booked, cancelled не показываем)
      const params = new URLSearchParams();
      params.append("from", weekStart.toISOString());
      params.append("to", weekEnd.toISOString());
      // Не передаем status, чтобы загрузить все слоты
      if (selectedProcess) {
        params.append("process_name", selectedProcess);
      }

      const response = await authFetch(
        `${AVAILABILITY_SLOTS_ENDPOINT}?${params.toString()}`
      );
      if (!response.ok) {
        throw new Error("Не удалось загрузить слоты");
      }
      const data = await response.json();
      // Фильтруем только available и booked (cancelled не показываем)
      setSlots(data.filter((slot: AvailabilitySlot) => slot.status !== "cancelled"));
    } catch (err) {
      console.error("Failed to load slots:", err);
    } finally {
      setLoading(false);
    }
  }, [authFetch, weekDays, selectedProcess]);

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
    loadSlots();
    loadProcessNames();
  }, [loadSlots, loadProcessNames]);

  // Формируем строки таблицы: день + сотрудник (объединяем все процессы)
  const tableRows = useMemo(() => {
    const rows: TableRow[] = [];
    
    // Группируем слоты по дню и пользователю
    weekDays.forEach((day) => {
      const daySlots = slots.filter((slot) => {
        const slotDate = new Date(slot.starts_at);
        slotDate.setHours(0, 0, 0, 0);
        const dayDate = new Date(day);
        dayDate.setHours(0, 0, 0, 0);
        return slotDate.getTime() === dayDate.getTime();
      });

      // Группируем по пользователю (объединяем все процессы)
      const groups = new Map<string, AvailabilitySlot[]>();
      daySlots.forEach((slot) => {
        const key = slot.user_id;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(slot);
      });

      // Создаем строки для каждого пользователя
      groups.forEach((slotList, userId) => {
        const firstSlot = slotList[0];
        
        // Исправляем отображение имени
        const cleanUserName = firstSlot.user_name && !firstSlot.user_name.includes(firstSlot.user_id)
          ? firstSlot.user_name
          : firstSlot.user_email.split("@")[0];
        
        rows.push({
          day,
          userId,
          userName: cleanUserName,
          userEmail: firstSlot.user_email,
          userDepartment: firstSlot.user_department,
          slots: slotList, // Все слоты сотрудника в этот день
        });
      });
    });

    return rows;
  }, [slots, weekDays]);

  // Вычисляем статистику
  const statistics = useMemo(() => {
    const statsMap = new Map<string, SlotStatistics>();
    
    slots.forEach((slot) => {
      if (!statsMap.has(slot.user_id)) {
        const cleanUserName = slot.user_name && !slot.user_name.includes(slot.user_id)
          ? slot.user_name
          : slot.user_email.split("@")[0];
        
        statsMap.set(slot.user_id, {
          userId: slot.user_id,
          userName: cleanUserName,
          totalHours: 0,
          totalSlots: 0,
          bookedSlots: 0,
          availableSlots: 0,
        });
      }
      
      const stat = statsMap.get(slot.user_id)!;
      const duration = (new Date(slot.ends_at).getTime() - new Date(slot.starts_at).getTime()) / (1000 * 60 * 60);
      
      stat.totalHours += duration;
      stat.totalSlots += 1;
      
      if (slot.status === "booked") {
        stat.bookedSlots += 1;
      } else if (slot.status === "available") {
        stat.availableSlots += 1;
      }
    });
    
    return Array.from(statsMap.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [slots]);

  // Проверяем, попадает ли слот в временной интервал
  const getSlotForTime = (timeSlot: TimeSlot, rowSlots: AvailabilitySlot[]): AvailabilitySlot | null => {
    return rowSlots.find((slot) => {
      const eventStart = new Date(slot.starts_at);
      const eventEnd = new Date(slot.ends_at);
      
      // Извлекаем только время из даты события
      const eventStartTime = eventStart.getHours() * 60 + eventStart.getMinutes();
      const eventEndTime = eventEnd.getHours() * 60 + eventEnd.getMinutes();
      const slotStartTime = timeSlot.hour * 60 + timeSlot.minute;
      const slotEndTime = slotStartTime + SLOT_DURATION_MINUTES;
      
      // Проверяем пересечение временных интервалов
      return eventStartTime < slotEndTime && eventEndTime > slotStartTime;
    }) || null;
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

  const formatDay = (date: Date) => {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "short",
      weekday: "short",
    }).format(date);
  };

  const changeWeek = (weeks: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + weeks * 7);
    setSelectedDate(newDate);
  };

  const getBookedByDisplayName = (slot: AvailabilitySlot): string => {
    if (slot.booked_by_user_name) {
      // Извлекаем фамилию (первое слово)
      const parts = slot.booked_by_user_name.trim().split(/\s+/);
      return parts[0] || (slot.booked_by_user_email ? slot.booked_by_user_email.split("@")[0] : "Неизвестно");
    }
    if (slot.booked_by_user_email) {
      return slot.booked_by_user_email.split("@")[0];
    }
    return "Неизвестно";
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Заголовок и панель управления */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Сводная таблица слотов</h1>
                <p className="text-sm text-slate-500">Управление доступностью и бронирование встреч</p>
              </div>
            </div>
            {hasAccessToStatistics && (
              <button
                onClick={() => setShowStatistics(!showStatistics)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium shadow-lg hover:from-indigo-600 hover:to-purple-700 transition-all"
              >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
                {showStatistics ? "Скрыть статистику" : "Показать статистику"}
              </button>
            )}
          </div>

          {/* Фильтры и навигация */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeWeek(-1)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium transition hover:bg-slate-50 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                Предыдущая неделя
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium transition hover:bg-slate-50 shadow-sm"
              >
                Сегодня
              </button>
              <button
                onClick={() => changeWeek(1)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium transition hover:bg-slate-50 shadow-sm"
              >
                Следующая неделя
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            <div className="flex-1 min-w-[200px]">
              <select
                value={selectedProcess}
                onChange={(e) => setSelectedProcess(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
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
      </div>

      {/* Статистика */}
      {hasAccessToStatistics && showStatistics && (
        <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 mb-3 flex items-center gap-2">
            <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Статистика по сотрудникам
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {statistics.map((stat) => (
              <div key={stat.userId} className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-900">{stat.userName}</h3>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Всего часов:</span>
                    <span className="font-semibold text-indigo-600">{stat.totalHours.toFixed(1)} ч</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Зарезервировано:</span>
                    <span className="font-semibold text-green-600">{stat.bookedSlots} слотов</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Доступно:</span>
                    <span className="font-semibold text-slate-600">{stat.availableSlots} слотов</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Таблица */}
      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="h-full overflow-auto bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gradient-to-r from-slate-50 to-slate-100 border-b-2 border-slate-300 sticky top-0 z-20">
                  <th className="sticky left-0 z-30 bg-gradient-to-r from-slate-50 to-slate-100 border-r-2 border-slate-300 px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[140px] shadow-lg">
                    День
                  </th>
                  <th className="sticky left-[140px] z-30 bg-gradient-to-r from-slate-50 to-slate-100 border-r-2 border-slate-300 px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[200px] shadow-lg">
                    Сотрудник
                  </th>
                  <th className="sticky left-[340px] z-30 bg-gradient-to-r from-slate-50 to-slate-100 border-r-2 border-slate-300 px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider min-w-[220px] shadow-lg">
                    Процесс
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
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={timeSlots.length + 3}
                      className="px-6 py-12 text-center text-sm text-slate-500"
                    >
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        Нет доступных слотов на выбранную неделю
                      </div>
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row, rowIndex) => {
                    // Показываем день только для первой строки каждого дня
                    const showDay = rowIndex === 0 || 
                      tableRows[rowIndex - 1].day.getTime() !== row.day.getTime();
                    const dayRowSpan = tableRows.filter(
                      (r) => r.day.getTime() === row.day.getTime()
                    ).length;

                    // Получаем уникальные процессы для этого сотрудника в этот день
                    const uniqueProcesses = Array.from(new Set(row.slots.map(s => s.process_name)));

                    return (
                      <tr
                        key={`${row.day.toISOString()}-${row.userId}`}
                        className="border-b border-slate-100 hover:bg-gradient-to-r hover:from-slate-50/50 hover:to-transparent transition-all duration-200"
                      >
                        {showDay && (
                          <td
                            rowSpan={dayRowSpan}
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
                        {timeSlots.map((timeSlot) => {
                          const slot = getSlotForTime(timeSlot, row.slots);
                          const isMySlot = slot && slot.user_id === currentUserId;
                          const isBooked = slot && slot.status === "booked";
                          
                          return (
                            <td
                              key={timeSlot.label}
                              className="px-1.5 py-1.5 text-center border-r border-slate-100 last:border-r-0"
                            >
                              {slot ? (
                                <div
                                  className={`group relative w-full h-14 rounded-xl transition-all duration-300 ease-out flex flex-col items-center justify-center text-xs font-medium overflow-hidden ${
                                    isBooked
                                      ? "bg-gradient-to-br from-blue-50 via-blue-100 to-indigo-100 border border-blue-300/50 shadow-lg shadow-blue-200/50 cursor-default hover:shadow-xl hover:shadow-blue-300/60 hover:scale-[1.02]"
                                      : isMySlot
                                      ? "bg-gradient-to-br from-emerald-50 via-emerald-100 to-teal-100 border border-emerald-300/50 shadow-md shadow-emerald-200/40 cursor-default hover:shadow-lg hover:shadow-emerald-300/50"
                                      : "bg-gradient-to-br from-lime-50 via-emerald-50 to-green-50 border border-emerald-300/40 shadow-sm shadow-emerald-100/30 cursor-pointer hover:from-emerald-100 hover:via-green-100 hover:to-lime-100 hover:border-emerald-400/60 hover:shadow-lg hover:shadow-emerald-300/40 hover:scale-[1.03] hover:-translate-y-0.5 active:scale-[0.98]"
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
                                  {/* Декоративный фон для доступных слотов */}
                                  {!isBooked && !isMySlot && (
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                      <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent"></div>
                                      <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-300/50 to-transparent"></div>
                                    </div>
                                  )}
                                  
                                  {/* Иконка для забронированных слотов */}
                                  {isBooked && (
                                    <div className="absolute top-1 right-1 opacity-60 group-hover:opacity-100 transition-opacity">
                                      <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                  
                                  {/* Иконка для моих слотов */}
                                  {isMySlot && (
                                    <div className="absolute top-1 right-1 opacity-60">
                                      <svg className="w-3 h-3 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                      </svg>
                                    </div>
                                  )}
                                  
                                  {/* Контент */}
                                  <div className="relative z-10 flex flex-col items-center justify-center gap-0.5 px-1">
                                    {isBooked ? (
                                      <>
                                        <span className="text-blue-700 font-bold text-[10px] leading-tight group-hover:text-blue-800 transition-colors">
                                          {getBookedByDisplayName(slot)}
                                        </span>
                                        <span className="text-blue-600/80 text-[9px] font-medium mt-0.5 opacity-90 group-hover:opacity-100 transition-opacity">
                                          {slot.process_name}
                                        </span>
                                      </>
                                    ) : isMySlot ? (
                                      <span className="text-emerald-700 font-bold text-[10px]">Мой</span>
                                    ) : (
                                      <>
                                        <span className="text-emerald-700 font-semibold text-[10px] group-hover:text-emerald-800 group-hover:font-bold transition-all">
                                          {slot.process_name}
                                        </span>
                                        <div className="w-4 h-0.5 bg-emerald-400/40 rounded-full group-hover:bg-emerald-500/60 group-hover:w-6 transition-all"></div>
                                      </>
                                    )}
                                  </div>
                                  
                                  {/* Эффект свечения при hover для доступных слотов */}
                                  {!isBooked && !isMySlot && (
                                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                      <div className="absolute inset-0 bg-gradient-to-br from-emerald-200/20 to-transparent blur-sm"></div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="w-full h-14 rounded-xl bg-gradient-to-br from-slate-50/50 to-slate-100/50 border border-slate-200/30 backdrop-blur-sm"></div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
