"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { EventDraft, EventRecord, ConflictEntry } from "@/types/event.types";
import type { CalendarMember } from "@/types/calendar.types";
import type { Room } from "@/types/room.types";
import type { UserProfile, ParticipantProfile } from "@/types/user.types";
import type { TimelineRowData } from "@/types/common.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { EnhancedTimeline } from "@/components/availability/EnhancedTimeline";
import { inputToDate, toLocalString } from "@/lib/utils/dateUtils";
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
  currentUserEmail?: string;
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
  currentUserEmail,
}: ResourcePanelProps) {
  const [participantAvailability, setParticipantAvailability] = useState<
    Record<string, EventRecord[]>
  >({});
  const [participantAvailabilityLoading, setParticipantAvailabilityLoading] =
    useState(false);
  const [participantAvailabilityError, setParticipantAvailabilityError] =
    useState<string | null>(null);
  const [allDepartments, setAllDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const availabilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
    // Всегда используем selectedDate (viewDate) для загрузки доступности
    // Это гарантирует, что загружается доступность для дня, который отображается в таймлайне
    const targetDate = new Date(selectedDate);
    targetDate.setHours(0, 0, 0, 0);
    
    // Загружаем доступность для всего дня (00:00 - 23:59:59)
    const rangeStart = new Date(targetDate);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(targetDate);
    rangeEnd.setHours(23, 59, 59, 999);

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
                // Если ошибка, возвращаем пустой список
                return [participant.user_id, []] as const;
              }
              
              const data: EventRecord[] = await response.json();
              // Фильтруем события: исключаем те, где текущий пользователь отклонил участие
              // Если это доступность для текущего пользователя, исключаем отклоненные события
              const filteredData = data.filter((event) => {
                // Если это событие расписания доступности (unavailable, available), всегда показываем
                if (event.status === "unavailable" || event.status === "available" || event.status === "booked_slot") {
                  return true;
                }
                // Если есть текущий пользователь, проверяем его статус участия
                if (currentUserEmail && event.participants) {
                  const userParticipant = event.participants.find((p) => p.email === currentUserEmail);
                  // Если пользователь отклонил событие, не показываем его как занятость
                  if (userParticipant && userParticipant.response_status === "declined") {
                    return false;
                  }
                }
                return true;
              });
              return [participant.user_id, filteredData] as const;
            } catch (err) {
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
            // Если промис был отклонен, возвращаем пустой список
            const participant = selectedParticipantProfiles[index];
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

    // Debounce 500ms - загружаем доступность только после остановки изменений
    if (availabilityTimeoutRef.current) {
      clearTimeout(availabilityTimeoutRef.current);
    }
    availabilityTimeoutRef.current = setTimeout(() => {
      fetchAvailability();
    }, 500);

    return () => {
      cancelled = true;
      if (availabilityTimeoutRef.current) {
        clearTimeout(availabilityTimeoutRef.current);
      }
    };
  }, [
    authFetch,
    form.all_day,
    form.ends_at,
    form.starts_at,
    selectedCalendarId,
    selectedParticipantProfiles,
    selectedDate, // Добавляем selectedDate в зависимости, чтобы перезагружать доступность при изменении дня просмотра
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

  return (
    <div className="flex flex-col gap-3">
      {/* Компактный выбор переговорки */}
      <div>
        {roomsLoading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-lime-500"></div>
            Загрузка...
          </div>
        ) : (
          <select
            value={form.room_id || ""}
            disabled={readOnly}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                room_id: e.target.value || null,
              }))
            }
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-lime-500 focus:ring-1 focus:ring-lime-500/20 hover:border-slate-300"
          >
            <option value="" className="bg-white text-slate-900">
              Без переговорки
            </option>
            {rooms.length === 0 ? (
              <option disabled className="bg-white text-slate-400">
                Нет доступных переговорок
              </option>
            ) : (
              rooms.map((room) => (
                <option
                  key={room.id}
                  value={room.id}
                  className="bg-white text-slate-900"
                >
                  {room.name}
                  {room.capacity > 1 ? ` (до ${room.capacity} чел.)` : ""}
                  {room.location ? ` — ${room.location}` : ""}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      {/* Таймлайн - основной элемент */}
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
        onRemoveParticipant={(participantId) => {
          setForm((prev) => ({
            ...prev,
            participant_ids: prev.participant_ids.filter((id) => id !== participantId),
          }));
        }}
        onTimeRangeSelect={(start, end) => {
          // start и end уже в UTC, конвертируем их в часовой пояс организации для отображения в форме
          // Важно: сохраняем дату из selectedDate (viewDate), чтобы не менять день при клике на слот
          const localStart = toLocalString(start);
          const localEnd = toLocalString(end);
          
          // Получаем дату из selectedDate в правильном формате (локальное время)
          const selectedDateLocal = new Date(selectedDate);
          selectedDateLocal.setHours(0, 0, 0, 0);
          const selectedDateStr = `${selectedDateLocal.getFullYear()}-${String(selectedDateLocal.getMonth() + 1).padStart(2, "0")}-${String(selectedDateLocal.getDate()).padStart(2, "0")}`;
          
          // Извлекаем только время из конвертированных значений
          const startTime = localStart.split("T")[1];
          const endTime = localEnd.split("T")[1];
          
          // Всегда используем дату из selectedDate, чтобы избежать проблем с конвертацией
          const finalStart = `${selectedDateStr}T${startTime}`;
          const finalEnd = `${selectedDateStr}T${endTime}`;
          
          setForm((prev) => ({
            ...prev,
            starts_at: finalStart,
            ends_at: finalEnd,
          }));
        }}
      />

    </div>
  );
}

