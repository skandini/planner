"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import type { TimelineRowData } from "@/types/common.types";
import type { EventRecord } from "@/types/event.types";
import { inputToDate, parseUTC, getTimeInTimeZone, MOSCOW_TIMEZONE } from "@/lib/utils/dateUtils";
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
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  organizations?: Array<{ id: string; name: string; slug: string }>;
  departments?: Array<{ id: string; name: string }>;
  apiBaseUrl?: string;
  onTimeRangeSelect?: (start: Date, end: Date) => void;
  onRemoveParticipant?: (participantId: string) => void;
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
  onTimeRangeSelect,
  onRemoveParticipant,
}: EnhancedTimelineProps) {
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [currentSelectionSlot, setCurrentSelectionSlot] = useState<number | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  
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
      const label = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return { index, hour, minute, label };
    });
  }, []);

  const resourceRows = useMemo(
    () => rows.filter((row) => row.id !== "placeholder"),
    [rows],
  );

  if (resourceRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100">
          <svg className="h-8 w-8 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">Добавьте участников или переговорку</p>
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
  ): "free" | "busy" | "selected" | "conflict" | "selecting" | "unavailable" | "available" => {
    const { slotStart, slotEnd } = buildSlotTimes(slotIndex);
    const rowConflictSlots = conflictMap?.get(row.id) ?? [];
    
    const conflicting = rowConflictSlots.some(
      (conflict) => conflict.start < slotEnd && conflict.end > slotStart,
    );

    const eventInSlot = row.availability.find((event) => {
      const eventStart = parseUTC(event.starts_at);
      const eventEnd = parseUTC(event.ends_at);
      return eventStart < slotEnd && eventEnd > slotStart;
    });
    
    const isUnavailable = eventInSlot && eventInSlot.status === "unavailable";
    const isAvailable = eventInSlot && eventInSlot.status === "available";

    const selected =
      selectionRange.start &&
      selectionRange.end &&
      selectionRange.start < slotEnd &&
      selectionRange.end > slotStart;

    const inSelection = isSelecting && selectionStart !== null && currentSelectionSlot !== null &&
      ((slotIndex >= Math.min(selectionStart, currentSelectionSlot) && 
        slotIndex <= Math.max(selectionStart, currentSelectionSlot)));

    if (inSelection && isSelecting) return "selecting";
    if (selected) return "selected";
    if (conflicting) return "conflict";
    if (isUnavailable) return "unavailable";
    if (isAvailable) return "available";
    if (eventInSlot) return "busy";
    return "free";
  };

  const isSlotBusy = useCallback((slotIndex: number): boolean => {
    if (slotIndex < 0 || slotIndex >= timeSlots.length) return true;
    
    const { slotStart, slotEnd } = buildSlotTimes(slotIndex);
    
    return resourceRows.some((row) => {
      const eventInSlot = row.availability.find((event) => {
        if (event.status === "available") {
          return false;
        }
        const eventStart = parseUTC(event.starts_at);
        const eventEnd = parseUTC(event.ends_at);
        return eventStart < slotEnd && eventEnd > slotStart;
      });
      return eventInSlot && eventInSlot.status !== "available";
    });
  }, [resourceRows, timeSlots, baseDate]);

  const handleSlotMouseDown = useCallback((slotIndex: number, e: React.MouseEvent) => {
    if (!onTimeRangeSelect) return;
    
    if (isSlotBusy(slotIndex)) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    setHasMoved(false);
    setSelectionStart(slotIndex);
    setCurrentSelectionSlot(slotIndex);
    setMouseDownPos({ x: e.clientX, y: e.clientY });
    setIsSelecting(true);
  }, [onTimeRangeSelect, isSlotBusy]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isSelecting || selectionStart === null || !timelineRef.current || !mouseDownPos) return;
    
    const moveDistance = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y);
    if (moveDistance < 10) {
      setCurrentSelectionSlot(selectionStart);
      return;
    }
    
    setHasMoved(true);
    
    const timeSlotsContainer = timelineRef.current.querySelector('[style*="grid-template-columns"]') as HTMLElement;
    if (!timeSlotsContainer) return;
    
    const slotsRect = timeSlotsContainer.getBoundingClientRect();
    const relativeX = e.clientX - slotsRect.left;
    
    const computedStyle = window.getComputedStyle(timeSlotsContainer);
    const gridTemplateColumns = computedStyle.gridTemplateColumns;
    
    let firstColumnWidth = 180;
    if (gridTemplateColumns) {
      const parts = gridTemplateColumns.split(' ');
      if (parts.length > 0) {
        const firstCol = parts[0];
        const match = firstCol.match(/(\d+)px/);
        if (match) {
          firstColumnWidth = parseInt(match[1], 10);
        }
      }
    }
    
    const slotsAreaWidth = slotsRect.width - firstColumnWidth;
    const slotWidth = slotsAreaWidth / timeSlots.length;
    const slotAreaX = relativeX - firstColumnWidth;
    let targetSlot = Math.floor(slotAreaX / slotWidth);
    
    if (targetSlot < 0) targetSlot = 0;
    if (targetSlot >= timeSlots.length) targetSlot = timeSlots.length - 1;
    
    const direction = targetSlot > selectionStart ? 1 : -1;
    let finalSlot = targetSlot;
    
    if (direction > 0) {
      for (let i = selectionStart; i <= targetSlot; i++) {
        if (isSlotBusy(i)) {
          finalSlot = Math.max(selectionStart, i - 1);
          break;
        }
      }
    } else {
      for (let i = selectionStart; i >= targetSlot; i--) {
        if (isSlotBusy(i)) {
          finalSlot = Math.min(selectionStart, i + 1);
          break;
        }
      }
    }
    
    if (!isSlotBusy(finalSlot)) {
      setCurrentSelectionSlot(finalSlot);
    } else {
      setCurrentSelectionSlot(selectionStart);
    }
  }, [isSelecting, selectionStart, timeSlots.length, isSlotBusy, mouseDownPos]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || selectionStart === null || !onTimeRangeSelect) {
      setIsSelecting(false);
      setSelectionStart(null);
      setCurrentSelectionSlot(null);
      setHasMoved(false);
      setMouseDownPos(null);
      return;
    }

    const endSlot = currentSelectionSlot !== null ? currentSelectionSlot : selectionStart;
    
    if (endSlot >= 0 && endSlot < timeSlots.length) {
      const startSlot = Math.min(selectionStart, endSlot);
      const finalEndSlot = Math.max(selectionStart, endSlot);
      
      if (!hasMoved) {
        const { slotStart, slotEnd } = buildSlotTimes(startSlot);
        const dayStart = new Date(baseDate);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(baseDate);
        dayEnd.setHours(20, 0, 0, 0);
        
        if (slotStart >= dayStart && slotEnd <= dayEnd) {
          onTimeRangeSelect(slotStart, slotEnd);
        }
      } else {
        const { slotStart } = buildSlotTimes(startSlot);
        const { slotEnd } = buildSlotTimes(finalEndSlot);
        
        const dayStart = new Date(baseDate);
        dayStart.setHours(8, 0, 0, 0);
        const dayEnd = new Date(baseDate);
        dayEnd.setHours(20, 0, 0, 0);
        
        if (slotStart >= dayStart && slotEnd <= dayEnd) {
          onTimeRangeSelect(slotStart, slotEnd);
        }
      }
    }
    
    setIsSelecting(false);
    setSelectionStart(null);
    setCurrentSelectionSlot(null);
    setHasMoved(false);
    setMouseDownPos(null);
  }, [isSelecting, selectionStart, currentSelectionSlot, hasMoved, onTimeRangeSelect, timeSlots, baseDate]);

  useEffect(() => {
    if (isSelecting) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isSelecting, handleMouseMove, handleMouseUp]);

  const templateColumns = useMemo(
    () => `180px repeat(${timeSlots.length}, minmax(10px, 1fr))`,
    [timeSlots.length],
  );

  return (
    <div className="space-y-4">
      {/* Минималистичная легенда */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-slate-300 to-slate-400 shadow-sm" />
          <span className="text-xs font-medium text-slate-600">Занято</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded border-2 border-indigo-400 bg-gradient-to-r from-indigo-50 to-indigo-100" />
          <span className="text-xs font-medium text-slate-600">Выбрано</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded bg-gradient-to-r from-white to-slate-50 border border-slate-200" />
          <span className="text-xs font-medium text-slate-600">Свободно</span>
        </div>
      </div>

      {/* Современный таймлайн */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm" ref={timelineRef}>
        <div className="min-w-full space-y-2 p-4">
          {/* Заголовок времени */}
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: templateColumns }}
          >
            <div />
            {timeSlots.map((slot) =>
              slot.minute === 0 ? (
                <div key={slot.index} className="text-center text-xs font-semibold text-slate-500 py-1">
                  {slot.label}
                </div>
              ) : (
                <div key={slot.index} />
              ),
            )}
          </div>

          {/* Строки ресурсов */}
          {resourceRows.map((row) => {
            const rowConflictSlots = conflictMap?.get(row.id) ?? [];
            const hasConflict = rowConflictSlots.length > 0;
            
            return (
              <div
                key={row.id}
                className={`grid gap-1.5 rounded-xl border transition-all ${
                  hasConflict
                    ? "border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 shadow-sm"
                    : "border-slate-200 bg-gradient-to-br from-white to-slate-50/50 hover:shadow-md"
                }`}
                style={{ gridTemplateColumns: templateColumns }}
              >
                {/* Название ресурса */}
                <div className="flex items-center gap-3 rounded-lg px-3 py-3">
                  {row.avatarUrl ? (
                    <img
                      src={apiBaseUrl && !row.avatarUrl.startsWith("http") ? `${apiBaseUrl}${row.avatarUrl}` : row.avatarUrl}
                      alt={row.label}
                      className="h-10 w-10 rounded-full object-cover border-2 border-white shadow-md ring-2 ring-slate-100"
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
                    className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white shadow-md ring-2 ring-slate-100 ${
                      row.type === "room" 
                        ? "from-blue-500 to-blue-600" 
                        : "from-indigo-500 to-purple-600"
                    } ${row.avatarUrl ? "hidden" : ""}`}
                  >
                    {row.type === "room" ? "🏢" : row.label[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-semibold truncate ${
                        hasConflict ? "text-amber-900" : "text-slate-900"
                      }`}>
                        {row.label}
                      </p>
                      {hasConflict && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-200 text-amber-900 border border-amber-300 flex-shrink-0">
                          Конфликт
                        </span>
                      )}
                    </div>
                    {row.meta && (
                      <p className={`text-xs truncate mt-0.5 ${
                        hasConflict ? "text-amber-700" : "text-slate-500"
                      }`}>
                        {row.meta}
                      </p>
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

                  let slotClassName = "h-10 rounded-lg transition-all cursor-pointer border ";
                  
                  if (state === "conflict") {
                    slotClassName += "bg-gradient-to-br from-amber-200 to-orange-200 border-amber-400 shadow-sm animate-pulse";
                  } else if (state === "unavailable") {
                    slotClassName += "bg-gradient-to-br from-red-100 via-red-200 to-red-300 border-red-400 cursor-not-allowed relative overflow-hidden";
                    slotClassName += " before:absolute before:inset-0 before:bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(220,38,38,0.3)_4px,rgba(220,38,38,0.3)_8px)]";
                  } else if (state === "available") {
                    slotClassName += "bg-gradient-to-br from-emerald-50 to-green-50 border-emerald-300";
                  } else if (state === "busy") {
                    slotClassName += "bg-gradient-to-br from-slate-300 to-slate-400 border-slate-500 cursor-not-allowed shadow-inner";
                  } else if (state === "selected") {
                    slotClassName += "bg-gradient-to-br from-indigo-200 to-purple-200 border-indigo-400 shadow-md ring-2 ring-indigo-300/50";
                  } else if (state === "selecting") {
                    slotClassName += "bg-gradient-to-br from-blue-200 to-cyan-200 border-blue-400 shadow-md ring-2 ring-blue-300/50";
                  } else {
                    slotClassName += "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm";
                  }

                  return (
                    <div
                      key={`${row.id}-${slot.index}`}
                      className={slotClassName}
                      onMouseDown={(e) => {
                        if (state === "unavailable" || state === "busy") {
                          e.preventDefault();
                          return;
                        }
                        if (!isSlotBusy(slot.index) && onTimeRangeSelect) {
                          handleSlotMouseDown(slot.index, e);
                        }
                      }}
                      title={
                        eventInSlot
                          ? `${eventInSlot.title} (${slot.label})`
                          : state === "busy" || state === "unavailable"
                            ? "Занято"
                            : state === "available"
                              ? "Доступно"
                              : "Кликните для выбора времени"
                      }
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-gradient-to-r from-red-50 to-red-100 p-3 text-xs text-red-700 shadow-sm">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
