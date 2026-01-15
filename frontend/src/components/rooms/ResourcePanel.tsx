"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { Room } from "@/types/room.types";
import type { UserProfile, ParticipantProfile } from "@/types/user.types";
import type { TimelineRowData } from "@/types/common.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { EnhancedTimeline } from "@/components/availability/EnhancedTimeline";
import { inputToDate, getTimeInTimeZone, MOSCOW_TIMEZONE, addDaysInMoscow } from "@/lib/utils/dateUtils";
import { CALENDAR_ENDPOINT } from "@/lib/constants";

interface ResourcePanelProps {
  rooms: Room[];
  roomsLoading: boolean;
  form: EventDraft;
  setForm: (form: EventDraft | ((prev: EventDraft) => EventDraft)) => void;
  selectedRoom: Room | null;
  selectedDate: Date;
  roomAvailability: EventRecord[];
  loadingAvailability: boolean;
  readOnly: boolean;
  members: CalendarMember[];
  membersLoading: boolean;
  users: UserProfile[];
  usersLoading: boolean;
  usersError: string | null;
  authFetch: AuthenticatedFetch;
  selectedCalendarId: string | null;
  isAllDay: boolean;
  onRefreshMembers: () => Promise<void> | void;
  conflicts: ConflictEntry[];
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl?: string;
  accentColor?: string; // Цвет календаря для занятого времени
  events?: EventRecord[]; // События из основного массива для отображения как в основной сетке
  currentUserEmail?: string; // Email текущего пользователя
  variant?: "default" | "modal";
  editingEventId?: string; // ID редактируемого события
  onNavigateDays?: (days: number) => void; // Функция навигации по дням
}

export function ResourcePanel({
  rooms,
  roomsLoading,
  form,
  setForm,
  selectedRoom,
  selectedDate,
  roomAvailability,
  loadingAvailability,
  readOnly,
  members,
  membersLoading,
  users,
  usersLoading,
  usersError,
  authFetch,
  selectedCalendarId,
  isAllDay,
  onRefreshMembers,
  conflicts = [],
  getUserOrganizationAbbreviation,
  organizations = [],
  apiBaseUrl = "",
  accentColor = "#6366f1", // По умолчанию indigo-500
  events = [], // События из основного массива
  currentUserEmail, // Email текущего пользователя
  variant = "default",
  editingEventId, // ID редактируемого события
  onNavigateDays, // Функция навигации по дням
}: ResourcePanelProps) {
  const [participantAvailability, setParticipantAvailability] = useState<
    Record<string, EventRecord[]>
  >({});
  const [participantAvailabilityLoading, setParticipantAvailabilityLoading] =
    useState(false);
  const [participantAvailabilityError, setParticipantAvailabilityError] =
    useState<string | null>(null);
  const [allDepartments, setAllDepartments] = useState<Array<{ id: string; name: string }>>([]);

  // Загружаем все отделы для tooltip
  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const { DEPARTMENTS_ENDPOINT } = await import("@/lib/constants");
        const response = await authFetch(DEPARTMENTS_ENDPOINT);
        if (response.ok) {
          const data = await response.json();
          // Flatten departments tree
          const flatten = (depts: any[]): Array<{ id: string; name: string }> => {
            const result: Array<{ id: string; name: string }> = [];
            depts.forEach(dept => {
              result.push({ id: dept.id, name: dept.name });
              if (dept.children && dept.children.length > 0) {
                result.push(...flatten(dept.children));
              }
            });
            return result;
          };
          setAllDepartments(flatten(data));
        }
      } catch (err) {
        console.error("Failed to load departments:", err);
      }
    };
    loadDepartments();
  }, [authFetch]);

  const membershipMap = useMemo(() => {
    const map = new Map<string, CalendarMember>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);

  const selectedParticipantProfiles = useMemo(() => {
    return form.participant_ids
      .map<ParticipantProfile | null>((userId) => {
        const profile = users.find((user) => user.id === userId);
        if (!profile) {
          return null;
        }
        return {
          user_id: userId,
          label: profile.full_name || profile.email,
          email: profile.email,
          membership: membershipMap.get(userId),
        };
      })
      .filter((item): item is ParticipantProfile => item !== null);
  }, [form.participant_ids, users, membershipMap]);

  const accessibleParticipants = useMemo(
    () =>
      selectedParticipantProfiles.filter((participant) =>
        membershipMap.has(participant.user_id),
      ),
    [selectedParticipantProfiles, membershipMap],
  );

  const ensureMembership = useCallback(
    async (userId: string) => {
      if (!selectedCalendarId) {
        throw new Error("Сначала выберите календарь");
      }
      if (membershipMap.has(userId)) {
        return;
      }
      const response = await authFetch(
        `${CALENDAR_ENDPOINT}${selectedCalendarId}/members`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, role: "viewer" }),
        },
      );
      if (!response.ok) {
        let detail = "Не удалось выдать доступ пользователю";
        try {
          const data = await response.json();
          if (typeof data?.detail === "string") {
            detail = data.detail;
          }
        } catch {
          // ignore
        }
        throw new Error(detail);
      }
      await onRefreshMembers();
    },
    [authFetch, membershipMap, onRefreshMembers, selectedCalendarId],
  );

  useEffect(() => {
    // Проверяем условия для загрузки доступности
    if (!selectedCalendarId || !authFetch) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    // Если нет выбранных участников, не загружаем доступность
    if (selectedParticipantProfiles.length === 0) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    // Загружаем доступность для всего дня, чтобы видеть всю занятость
    // Используем дату из starts_at или selectedDate (в московском времени)
    let targetDate: Date;
    if (form.starts_at) {
      // form.starts_at в формате "YYYY-MM-DDTHH:mm" представляет московское время
      const dateStr = form.starts_at.split("T")[0];
      const pad = (n: number) => String(n).padStart(2, '0');
      targetDate = new Date(`${dateStr}T00:00:00+03:00`);
    } else {
      // selectedDate уже должен быть в московском времени
      const selectedMoscow = getTimeInTimeZone(selectedDate, MOSCOW_TIMEZONE);
      const pad = (n: number) => String(n).padStart(2, '0');
      targetDate = new Date(`${selectedMoscow.year}-${pad(selectedMoscow.month + 1)}-${pad(selectedMoscow.day)}T00:00:00+03:00`);
    }
    
    // Загружаем доступность для всего дня (00:00 - 23:59:59) в московском времени
    // Получаем компоненты даты в московском времени
    const targetMoscow = getTimeInTimeZone(targetDate, MOSCOW_TIMEZONE);
    const pad = (n: number) => String(n).padStart(2, '0');
    // Создаем rangeStart и rangeEnd в московском времени
    const rangeStartStr = `${targetMoscow.year}-${pad(targetMoscow.month + 1)}-${pad(targetMoscow.day)}T00:00:00+03:00`;
    const rangeEndStr = `${targetMoscow.year}-${pad(targetMoscow.month + 1)}-${pad(targetMoscow.day)}T23:59:59+03:00`;
    const rangeStart = new Date(rangeStartStr);
    const rangeEnd = new Date(rangeEndStr);

    // Не требуем автоматического добавления в календарь
    // Участники могут быть добавлены в события без членства в календаре
    // Загружаем доступность для всех выбранных участников
    // Если участник не в календаре, его доступность просто не будет показана
    
    if (selectedParticipantProfiles.length === 0) {
      setParticipantAvailability({});
      setParticipantAvailabilityError(null);
      setParticipantAvailabilityLoading(false);
      return;
    }

    let cancelled = false;
    const fetchAvailability = async () => {
      setParticipantAvailabilityLoading(true);
      setParticipantAvailabilityError(null);
      try {
        // Загружаем доступность для всех выбранных участников
        // Backend позволяет проверять доступность любого пользователя, независимо от доступа к календарю
        if (!selectedCalendarId) {
          console.warn("Cannot fetch availability: no calendar selected");
          setParticipantAvailability({});
          setParticipantAvailabilityLoading(false);
          return;
        }
        
        const entries = await Promise.allSettled(
          selectedParticipantProfiles.map(async (participant) => {
            const url = `${CALENDAR_ENDPOINT}${selectedCalendarId}/members/${participant.user_id}/availability?from=${encodeURIComponent(rangeStart.toISOString())}&to=${encodeURIComponent(rangeEnd.toISOString())}`;
            try {
              const response = await authFetch(url, { cache: "no-store" });
              
              
              if (!response.ok) {
                // Если ошибка, логируем и возвращаем пустой список
                const errorText = await response.text().catch(() => "");
                console.warn(
                  `[Availability] Failed to load for ${participant.label}:\n` +
                  `  Status: ${response.status}\n` +
                  `  Error: ${errorText}\n` +
                  `  URL: ${url}`
                );
                return [participant.user_id, []] as const;
              }
              
              const data: EventRecord[] = await response.json();
              
              // Фильтруем события, где участник отклонил приглашение (response_status === "declined")
              // Такие события не должны влиять на доступность участника
              const filteredData = data.filter((event) => {
                // Если у события нет участников, оставляем его (может быть событие без участников)
                if (!event.participants || event.participants.length === 0) {
                  return true;
                }
                
                // Ищем участника в списке участников события
                const participantInEvent = event.participants.find(
                  (p) => p.user_id === participant.user_id
                );
                
                // Если участник не найден в событии, оставляем событие (может быть событие другого типа)
                if (!participantInEvent) {
                  return true;
                }
                
                // Исключаем события, где участник отклонил приглашение
                return participantInEvent.response_status !== "declined";
              });
              
              return [participant.user_id, filteredData] as const;
            } catch (err) {
              // Логируем ошибки при загрузке доступности
              const errorMessage = err instanceof Error ? err.message : String(err);
              
              console.error(
                `[Availability] Error for ${participant.label} (${participant.user_id}):\n` +
                `  Error: ${errorMessage}\n` +
                `  Type: ${err instanceof Error ? err.constructor.name : typeof err}\n` +
                `  URL: ${url}\n` +
                `  Full error:`, err
              );
              
              // Возвращаем пустой список, но не прерываем загрузку для других участников
              return [participant.user_id, []] as const;
            }
          }),
        );
        
        // Обрабатываем результаты Promise.allSettled
        const processedEntries: Array<[string, EventRecord[]]> = entries.map((result, index) => {
          if (result.status === "fulfilled") {
            return result.value;
          } else {
            // Если промис был отклонен, логируем и возвращаем пустой список
            const participant = selectedParticipantProfiles[index];
            console.error(`Promise rejected for participant ${participant?.label || 'unknown'}:`, result.reason);
            if (participant) {
              return [participant.user_id, []] as const;
            }
            return ["", []] as const;
          }
        }).filter((entry): entry is [string, EventRecord[]] => entry[0] !== "");

        if (!cancelled) {
          setParticipantAvailability(Object.fromEntries(processedEntries));
        }
      } catch {
        if (!cancelled) {
          setParticipantAvailabilityError(
            "Не удалось загрузить занятость участников",
          );
        }
      } finally {
        if (!cancelled) {
          setParticipantAvailabilityLoading(false);
        }
      }
    };

    fetchAvailability();
    return () => {
      cancelled = true;
    };
  }, [
    authFetch,
    isAllDay,
    selectedCalendarId,
    selectedParticipantProfiles,
    selectedDate, // Используем selectedDate вместо form.starts_at/ends_at для избежания лишних перезагрузок при редактировании
    form.starts_at, // Добавляем starts_at для обновления при изменении даты
  ]);

  // Определяем участников с конфликтами
  const participantsWithConflicts = useMemo(() => {
    const participantIds = new Set<string>();
    conflicts.forEach((conflict) => {
      if (conflict.type === "participant" && conflict.resource_id) {
        participantIds.add(conflict.resource_id);
      }
    });
    return participantIds;
  }, [conflicts]);

  const timelineRows = useMemo(() => {
    const rows: TimelineRowData[] = [];
    if (selectedRoom) {
      const roomHasConflict = conflicts.some(
        (c) => c.type === "room" && c.resource_id === selectedRoom.id
      );
      rows.push({
        id: `room-${selectedRoom.id}`,
        label: selectedRoom.name,
        meta: selectedRoom.location,
        avatarUrl: null,
        availability: roomAvailability,
        loading: loadingAvailability,
        type: "room",
        hasConflict: roomHasConflict,
      });
    }
    selectedParticipantProfiles.forEach((participant) => {
      const profile = users.find((u) => u.id === participant.user_id);
      const hasConflict = participantsWithConflicts.has(participant.user_id);
      rows.push({
        id: `participant-${participant.user_id}`,
        label: participant.label,
        meta: participant.email,
        avatarUrl: profile?.avatar_url ?? null,
        availability: participantAvailability[participant.user_id] ?? [],
        loading: participantAvailabilityLoading,
        type: "participant",
        hasConflict: hasConflict,
      });
    });
    if (rows.length === 0) {
      rows.push({
        id: "placeholder",
        label: "Временная сетка",
        meta: "Выберите ресурсы",
        availability: [],
        loading: false,
        type: "participant",
      });
    }
    return rows;
  }, [
    loadingAvailability,
    participantAvailability,
    participantAvailabilityLoading,
    roomAvailability,
    selectedParticipantProfiles,
    selectedRoom,
    membershipMap,
    conflicts,
    participantsWithConflicts,
  ]);

  const conflictMap = useMemo(() => {
    const map = new Map<string, Array<{ start: Date; end: Date }>>();
    conflicts.forEach((conflict) => {
      if (!conflict.resource_id) {
        return;
      }
      const key =
        conflict.type === "room"
          ? `room-${conflict.resource_id}`
          : `participant-${conflict.resource_id}`;
      const entry = map.get(key) ?? [];
      entry.push({
        start: new Date(conflict.slot_start),
        end: new Date(conflict.slot_end),
      });
      map.set(key, entry);
    });
    return map;
  }, [conflicts]);

  const participantsCount = form.participant_ids.length;
  const hasAnyConflicts = conflicts.length > 0;

  return (
    <div className={variant === "modal" ? "flex flex-col gap-3" : "flex flex-col gap-3"}>
      {variant === "modal" && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/70 px-2.5 py-1.5">
          <div className="text-xs font-semibold text-slate-800">
            Ресурсы участников
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 border border-slate-200">
              {participantsCount} уч.
            </span>
            {hasAnyConflicts && (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200">
                ⚠
              </span>
            )}
          </div>
        </div>
      )}


      {/* Навигация по дням */}
      {variant === "modal" && onNavigateDays && (
        <div className="flex items-center justify-center gap-3 py-2">
          <button
            type="button"
            onClick={() => onNavigateDays(-1)}
            className="rounded border border-slate-200 bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
            title="Предыдущий день"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <div className="px-5 py-1.5 text-sm font-semibold text-slate-900 min-w-[180px] text-center bg-white rounded border border-slate-200">
            {new Intl.DateTimeFormat('ru-RU', { 
              weekday: 'short', 
              day: 'numeric', 
              month: 'short',
              timeZone: MOSCOW_TIMEZONE 
            }).format(selectedDate)}
          </div>
          
          <button
            type="button"
            onClick={() => onNavigateDays(1)}
            className="rounded border border-slate-200 bg-white px-3 py-2 text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
            title="Следующий день"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      <EnhancedTimeline
        key={`timeline-${form.participant_ids.join(',')}-${conflicts.length}`}
        rows={timelineRows}
        referenceDate={selectedDate}
        selectedStart={form.starts_at}
        selectedEnd={form.ends_at}
        isAllDay={isAllDay}
        errorMessage={participantAvailabilityError}
        conflictMap={conflictMap}
        getUserOrganizationAbbreviation={getUserOrganizationAbbreviation}
        users={users}
        organizations={organizations}
        departments={allDepartments}
        apiBaseUrl={apiBaseUrl}
        accentColor={accentColor}
        events={events}
        rooms={rooms}
        currentUserEmail={currentUserEmail}
        editingEventId={editingEventId}
        onRemoveParticipant={(participantId) => {
          setForm((prev) => ({
            ...prev,
            participant_ids: prev.participant_ids.filter((id) => id !== participantId),
          }));
        }}
        onTimeRangeSelect={(start, end) => {
          // Форматируем даты для формы (в московском времени)
          // start и end уже в московском времени (созданы с +03:00)
          const formatDateTime = (date: Date) => {
            // Получаем компоненты в московском времени
            const moscow = getTimeInTimeZone(date, MOSCOW_TIMEZONE);
            const pad = (n: number) => String(n).padStart(2, '0');
            return `${moscow.year}-${pad(moscow.month + 1)}-${pad(moscow.day)}T${pad(moscow.hour)}:${pad(moscow.minute)}`;
          };
          setForm((prev) => ({
            ...prev,
            starts_at: formatDateTime(start),
            ends_at: formatDateTime(end),
          }));
        }}
      />
    </div>
  );
}

