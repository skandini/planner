"use client";

import { useMemo, useState } from "react";
import type { TimelineRowData } from "@/types/common.types";
import type { EventRecord } from "@/types/event.types";
import type { UserProfile } from "@/types/user.types";
import { inputToDate, parseUTC } from "@/lib/utils/dateUtils";
import { WORKDAY_START_HOUR, WORKDAY_END_HOUR, SLOT_DURATION_MINUTES } from "@/lib/constants";

interface EnhancedTimelineProps {
  rows: TimelineRowData[];
  referenceDate: Date;
  selectedStart: string;
  selectedEnd: string;
  isAllDay: boolean;
  errorMessage: string | null;
  conflictMap?: Map<string, Array<{ start: Date; end: Date }>>;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
  users?: UserProfile[];
  organizations?: Array<{ id: string; name: string; slug: string }>;
  departments?: Array<{ id: string; name: string }>;
  apiBaseUrl?: string;
}

export function EnhancedTimeline({
  rows,
  referenceDate,
  selectedStart,
  selectedEnd,
  isAllDay,
  errorMessage,
  conflictMap,
  getUserOrganizationAbbreviation,
  users = [],
  organizations = [],
  departments = [],
  apiBaseUrl = "",
}: EnhancedTimelineProps) {
  const [hoveredUser, setHoveredUser] = useState<UserProfile | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const selectionRange = useMemo(() => {
    const start = inputToDate(selectedStart, { allDay: isAllDay });
    const end = inputToDate(selectedEnd, { allDay: isAllDay, endOfDay: true });
    return { start, end };
  }, [selectedEnd, selectedStart, isAllDay]);

  const baseDate = useMemo(() => {
    if (selectionRange.start) {
      const normalized = new Date(selectionRange.start);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    }
    const fallback = new Date(referenceDate);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }, [referenceDate, selectionRange.start]);

  const timeSlots = useMemo(() => {
    const totalSlots =
      ((WORKDAY_END_HOUR - WORKDAY_START_HOUR) * 60) / SLOT_DURATION_MINUTES;
    return Array.from({ length: totalSlots }, (_, index) => {
      const totalMinutes =
        WORKDAY_START_HOUR * 60 + index * SLOT_DURATION_MINUTES;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      const label = `${String(hour).padStart(2, "0")}:${minute
        .toString()
        .padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-600">Добавьте участников или переговорку</p>
        <p className="mt-1 text-xs text-slate-500">чтобы увидеть таймлайн занятости</p>
      </div>
    );
  }

  const buildSlotTimes = (slotIndex: number) => {
    const slot = timeSlots[slotIndex];
    const slotStart = new Date(baseDate);
    slotStart.setHours(slot.hour, slot.minute, 0, 0);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + SLOT_DURATION_MINUTES);
    return { slotStart, slotEnd };
  };

  const getSlotState = (
    row: TimelineRowData,
    slotIndex: number,
  ): "free" | "busy" | "selected" | "conflict" => {
    const { slotStart, slotEnd } = buildSlotTimes(slotIndex);
    const rowConflictSlots = conflictMap?.get(row.id) ?? [];
    
    // Проверяем конфликт
    const conflicting = rowConflictSlots.some(
      (conflict) => conflict.start < slotEnd && conflict.end > slotStart,
    );

    // Проверяем занятость
    const eventInSlot = row.availability.find((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });

    // Проверяем выбранный интервал
    const selected =
      selectionRange.start &&
      selectionRange.end &&
      selectionRange.start < slotEnd &&
      selectionRange.end > slotStart;

    if (conflicting && !selected) return "conflict";
    if (eventInSlot) return "busy";
    if (selected) return "selected";
    return "free";
  };

  return (
    <div className="space-y-4">
      {/* Легенда */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-red-400 to-red-500 shadow-sm" />
          <span className="text-xs font-medium text-slate-700">Занято</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded border-2 border-lime-400 bg-lime-50" />
          <span className="text-xs font-medium text-slate-700">Выбранное время</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-amber-300 to-amber-400 shadow-sm" />
          <span className="text-xs font-medium text-slate-700">Конфликт</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-slate-100 to-slate-200" />
          <span className="text-xs font-medium text-slate-700">Свободно</span>
        </div>
      </div>

      {/* Таймлайн */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <div className="space-y-3">
          {/* Заголовок времени */}
          <div className="grid gap-2" style={{ gridTemplateColumns: `200px repeat(${timeSlots.length}, minmax(8px, 1fr))` }}>
            <div />
            {timeSlots.map((slot) =>
              slot.minute === 0 ? (
                <div key={slot.index} className="text-center text-[0.65rem] font-semibold text-slate-500">
                  {slot.label}
                </div>
              ) : (
                <div key={slot.index} />
              ),
            )}
          </div>

          {/* Строки ресурсов */}
          {rows.map((row) => (
            <div
              key={row.id}
              className="grid gap-2"
              style={{ gridTemplateColumns: `200px repeat(${timeSlots.length}, minmax(8px, 1fr))` }}
            >
              {/* Название ресурса */}
              <div 
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-3 transition-all hover:border-lime-300 hover:shadow-sm"
                onMouseEnter={(e) => {
                  if (row.type === "participant") {
                    const userId = row.id.startsWith("participant-") ? row.id.replace("participant-", "") : row.id;
                    const userProfile = users.find(u => u.id === userId);
                    if (userProfile) {
                      setHoveredUser(userProfile);
                      setHoverPos({ x: e.clientX, y: e.clientY });
                    }
                  }
                }}
                onMouseMove={(e) => {
                  if (row.type === "participant" && hoveredUser) {
                    setHoverPos({ x: e.clientX, y: e.clientY });
                  }
                }}
                onMouseLeave={() => {
                  if (row.type === "participant") {
                    setHoveredUser(null);
                  }
                }}
              >
                {row.avatarUrl ? (
                  <img
                    src={apiBaseUrl && !row.avatarUrl.startsWith("http") ? `${apiBaseUrl}${row.avatarUrl}` : row.avatarUrl}
                    alt={row.label}
                    className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-md"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = "flex";
                      }
                    }}
                  />
                ) : null}
                <div 
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${row.type === "room" ? "from-blue-400 to-blue-600" : "from-lime-400 to-lime-600"} text-sm font-bold text-white shadow-md ${row.avatarUrl ? "hidden" : ""}`}
                >
                  {row.type === "room" ? "🏢" : row.label[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">{row.label}</p>
                    {row.type === "participant" && getUserOrganizationAbbreviation && (
                      (() => {
                        const rawId = row.id.startsWith("participant-") ? row.id.replace("participant-", "") : row.id;
                        const orgAbbr = getUserOrganizationAbbreviation(rawId);
                        return orgAbbr ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-lime-100 text-lime-800 border border-lime-200 flex-shrink-0">
                            {orgAbbr}
                          </span>
                        ) : null;
                      })()
                    )}
                  </div>
                  {row.meta && (
                    <p className="text-xs text-slate-500 truncate">{row.meta}</p>
                  )}
                </div>
              </div>

              {/* Слоты времени */}
              {timeSlots.map((slot) => {
                const state = getSlotState(row, slot.index);
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const eventInSlot = row.availability.find((event) => {
                  const eventStart = parseUTC(event.starts_at);
                  const eventEnd = parseUTC(event.ends_at);
                  return eventStart < slotEnd && eventEnd > slotStart;
                });

                return (
                  <div
                    key={`${row.id}-${slot.index}`}
                    className={`h-8 rounded-md transition-all ${
                      state === "conflict"
                        ? "bg-gradient-to-r from-amber-200 to-amber-300 border border-amber-400 shadow-sm"
                        : state === "busy"
                          ? "bg-gradient-to-r from-red-300 to-red-400 border border-red-500 shadow-sm"
                          : state === "selected"
                            ? "bg-gradient-to-r from-lime-100 to-lime-200 border-2 border-lime-400 shadow-md"
                            : "bg-gradient-to-r from-slate-50 to-slate-100 border border-slate-200"
                    }`}
                    title={
                      eventInSlot
                        ? `${eventInSlot.title} (${parseUTC(eventInSlot.starts_at).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })} - ${parseUTC(eventInSlot.ends_at).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })})`
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ))}

          {/* Строка "Все свободны" */}
          {resourceRows.length > 0 && (
            <div
              key="all-free"
              className="grid gap-2"
              style={{ gridTemplateColumns: `200px repeat(${timeSlots.length}, minmax(8px, 1fr))` }}
            >
              {/* Название ресурса - аналогично переговоркам и участникам */}
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-3 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-lime-400 to-lime-600 text-white shadow-md">
                  ✓
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold text-slate-900 truncate">Все свободны</p>
                  </div>
                  <p className="text-xs text-slate-500 truncate">Переговорка и участники доступны</p>
                  {/* Аватары участников */}
                  {resourceRows.filter((r) => r.type === "participant").length > 0 && (
                    <div className="mt-1.5 flex -space-x-2">
                      {resourceRows
                        .filter((r) => r.type === "participant")
                        .slice(0, 6)
                        .map((row) => {
                          const avatar = row.avatarUrl;
                          const initial = row.label[0]?.toUpperCase() || "U";
                          return (
                            <div key={row.id} className="relative">
                              {avatar ? (
                                <img
                                  src={apiBaseUrl && !avatar.startsWith("http") ? `${apiBaseUrl}${avatar}` : avatar}
                                  alt={row.label}
                                  className="h-6 w-6 rounded-full object-cover border-2 border-white shadow"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = "none";
                                    const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                    if (fallback) {
                                      fallback.style.display = "flex";
                                    }
                                  }}
                                />
                              ) : null}
                              <div 
                                className={`h-6 w-6 rounded-full bg-gradient-to-br from-lime-400 to-lime-600 flex items-center justify-center border-2 border-white shadow text-[0.65rem] font-semibold text-white ${avatar ? "hidden" : ""}`}
                              >
                                {initial}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              </div>

              {/* Слоты времени */}
              {timeSlots.map((slot) => {
                const { slotStart, slotEnd } = buildSlotTimes(slot.index);
                const slotBusy = resourceRows.some((row) =>
                  row.availability.some((event) => {
                    const eventStart = parseUTC(event.starts_at);
                    const eventEnd = parseUTC(event.ends_at);
                    return eventStart < slotEnd && eventEnd > slotStart;
                  }),
                );
                const selected =
                  selectionRange.start &&
                  selectionRange.end &&
                  selectionRange.start < slotEnd &&
                  selectionRange.end > slotStart;

                return (
                  <div
                    key={`combined-${slot.index}`}
                    className={`h-8 rounded-md transition-all ${
                      slotBusy
                        ? "bg-gradient-to-r from-red-300 to-red-400 border border-red-500 shadow-sm"
                        : selected
                          ? "bg-gradient-to-r from-lime-100 to-lime-200 border-2 border-lime-400 shadow-md"
                          : "bg-gradient-to-r from-lime-200 to-emerald-300 border border-lime-400"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Tooltip с информацией о пользователе (как в оргструктуре) */}
      {hoveredUser && (() => {
        // Get all departments user belongs to
        const userDeptIds = hoveredUser.department_ids || (hoveredUser.department_id ? [hoveredUser.department_id] : []);
        const userDepts = userDeptIds
          .map(deptId => departments.find(d => d.id === deptId))
          .filter(Boolean) as Array<{ id: string; name: string }>;
        
        // Get all organizations user belongs to
        const userOrgIds = hoveredUser.organization_ids || (hoveredUser.organization_id ? [hoveredUser.organization_id] : []);
        const userOrgs = userOrgIds
          .map(orgId => organizations.find(o => o.id === orgId))
          .filter(Boolean);
        
        return (
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-2xl px-4 py-3 w-72 pointer-events-none"
            style={{ left: hoverPos.x + 12, top: hoverPos.y + 12 }}
          >
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden border border-white shadow flex-shrink-0">
                {hoveredUser.avatar_url ? (
                  <img
                    src={apiBaseUrl && !hoveredUser.avatar_url.startsWith('http') ? `${apiBaseUrl}${hoveredUser.avatar_url}` : hoveredUser.avatar_url}
                    alt={hoveredUser.full_name || hoveredUser.email}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-600 font-semibold">
                    {(hoveredUser.full_name || hoveredUser.email).charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 truncate">{hoveredUser.full_name || hoveredUser.email}</div>
                {hoveredUser.position && (
                  <div className="text-xs text-slate-600 truncate mt-0.5">{hoveredUser.position}</div>
                )}
                {hoveredUser.email && (
                  <div className="text-xs text-slate-500 truncate mt-0.5">{hoveredUser.email}</div>
                )}
                
                {userDepts.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Отделы</div>
                    <div className="flex flex-wrap gap-1">
                      {userDepts.map(dept => (
                        <span key={dept.id} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          {dept.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {userOrgs.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <div className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-1">Организации</div>
                    <div className="flex flex-wrap gap-1">
                      {userOrgs.map(org => (
                        <span key={org.id} className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          🏢 {org.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

