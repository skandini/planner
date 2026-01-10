"use client";

import { useMemo, useEffect, useState } from "react";
import type { EventRecord } from "@/types/event.types";
import { parseUTC, formatDate, formatTimeInTimeZone, getTimeInTimeZone } from "@/lib/utils/dateUtils";

interface UpcomingEventsProps {
  events: EventRecord[];
  currentUserEmail?: string;
  onEventClick: (event: EventRecord) => void;
  users?: Array<{ id: string; email: string; avatar_url: string | null; full_name: string | null }>;
  apiBaseUrl?: string;
  getUserOrganizationAbbreviation?: (userId: string | null | undefined) => string;
}

export function UpcomingEvents({
  events,
  currentUserEmail,
  onEventClick,
  users = [],
  apiBaseUrl = "http://localhost:8000",
  getUserOrganizationAbbreviation,
}: UpcomingEventsProps) {
  const [now, setNow] = useState<Date>(new Date());

  // Обновляем «текущее время» каждые 30 секунд, чтобы гасить просроченные live-индикаторы
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  
  // Фильтруем события: только будущие и сегодняшние, которые еще не закончились
  const upcomingEvents = useMemo(() => {
    return events
      .filter((event) => {
        const eventStart = parseUTC(event.starts_at);
        const eventEnd = parseUTC(event.ends_at);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Показываем события, которые:
        // 1. Начинаются сегодня или позже
        // 2. Еще не закончились (если сегодня)
        const isToday = eventStart.toDateString() === now.toDateString();
        const isFuture = eventStart > now;
        const isTodayAndNotEnded = isToday && eventEnd > now;
        
        return isFuture || isTodayAndNotEnded;
      })
      .sort((a, b) => {
        const startA = parseUTC(a.starts_at);
        const startB = parseUTC(b.starts_at);
        return startA.getTime() - startB.getTime();
      })
      .slice(0, 10); // Показываем только ближайшие 10 событий
  }, [events, now]);

  const getEventStatus = (event: EventRecord) => {
    if (!currentUserEmail || !event.participants) {
      return null;
    }
    const participant = event.participants.find((p) => p.email === currentUserEmail);
    return participant?.response_status;
  };

  const formatEventTime = (event: EventRecord) => {
    const start = parseUTC(event.starts_at);
    const end = parseUTC(event.ends_at);
    
    // Конвертируем время в московское для отображения
    const startMoscow = getTimeInTimeZone(start, 'Europe/Moscow');
    const today = new Date();
    const todayMoscow = getTimeInTimeZone(today, 'Europe/Moscow');
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowMoscow = getTimeInTimeZone(tomorrow, 'Europe/Moscow');
    
    if (event.all_day) {
      if (startMoscow.year === todayMoscow.year && startMoscow.month === todayMoscow.month && startMoscow.day === todayMoscow.day) {
        return "Сегодня, весь день";
      } else if (startMoscow.year === tomorrowMoscow.year && startMoscow.month === tomorrowMoscow.month && startMoscow.day === tomorrowMoscow.day) {
        return "Завтра, весь день";
      } else {
        const dateStr = `${String(startMoscow.day).padStart(2, '0')}.${String(startMoscow.month + 1).padStart(2, '0')}.${startMoscow.year}`;
        return dateStr;
      }
    }
    
    const timeStr = formatTimeInTimeZone(start, 'Europe/Moscow');
    
    if (startMoscow.year === todayMoscow.year && startMoscow.month === todayMoscow.month && startMoscow.day === todayMoscow.day) {
      return `Сегодня, ${timeStr}`;
    } else if (startMoscow.year === tomorrowMoscow.year && startMoscow.month === tomorrowMoscow.month && startMoscow.day === tomorrowMoscow.day) {
      return `Завтра, ${timeStr}`;
    } else {
      const dateStr = `${String(startMoscow.day).padStart(2, '0')}.${String(startMoscow.month + 1).padStart(2, '0')}`;
      return `${dateStr}, ${timeStr}`;
    }
  };

  if (upcomingEvents.length === 0) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Ближайшие события
        </h3>
        <p className="text-sm text-slate-400">Нет предстоящих событий</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
        Ближайшие события
      </h3>
      <div className="space-y-2">
        {upcomingEvents.map((event) => {
          const status = getEventStatus(event);
          const isAccepted = status === "accepted";
          const isPending = status === "needs_action" || status === "pending" || !status;
          const start = parseUTC(event.starts_at);
          const end = parseUTC(event.ends_at);
          const isToday = start.toDateString() === now.toDateString();
          const isStartingSoon = isToday && start.getTime() - now.getTime() < 30 * 60 * 1000 && start > now;
          const isLive = start <= now && end >= now;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onEventClick(event)}
              className="w-full text-left group"
            >
              <div className="flex items-start gap-3 p-2 rounded-lg transition-colors hover:bg-slate-50/50">
                {/* Минималистичный индикатор времени */}
                <div className="flex-shrink-0 pt-0.5">
                  <div className={`w-1 h-full rounded-full ${
                    isLive 
                      ? "bg-red-500" 
                      : isStartingSoon 
                        ? "bg-amber-400" 
                        : isPending
                          ? "bg-slate-300"
                          : isAccepted
                            ? "bg-lime-500"
                            : "bg-slate-200"
                  }`} style={{ minHeight: '40px' }} />
                </div>
                
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Заголовок события */}
                  <h4 className={`text-sm font-medium truncate ${
                    isLive 
                      ? "text-red-600" 
                      : "text-slate-900"
                  }`}>
                    {event.title}
                  </h4>
                  
                  {/* Время события - минималистично */}
                  <p className="text-xs text-slate-500">
                    {formatEventTime(event)}
                  </p>
                  
                  {/* Компактные участники - только аватары */}
                  {event.participants && event.participants.length > 0 && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <div className="flex -space-x-1.5">
                        {event.participants.slice(0, 4).map((participant) => {
                          const user = users.find((u) => u.id === participant.user_id || u.email === participant.email);
                          const avatarUrl = user?.avatar_url;
                          const displayName = participant.full_name || participant.email.split("@")[0];
                          const initials = displayName.charAt(0).toUpperCase();
                          
                          return (
                            <div
                              key={participant.user_id || participant.email}
                              className="relative"
                              title={displayName}
                            >
                              {avatarUrl ? (
                                <img
                                  src={avatarUrl.startsWith('http') ? avatarUrl : `${apiBaseUrl}${avatarUrl.startsWith('/') ? '' : '/'}${avatarUrl}`}
                                  alt={displayName}
                                  className="w-5 h-5 rounded-full object-cover border border-white"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLElement;
                                    if (fallback) fallback.classList.remove('hidden');
                                  }}
                                />
                              ) : null}
                              <div className={`w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center border border-white ${avatarUrl ? 'hidden' : ''}`}>
                                <span className="text-[0.5rem] font-medium text-slate-600">
                                  {initials}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                        {event.participants.length > 4 && (
                          <div className="w-5 h-5 rounded-full bg-slate-100 border border-white flex items-center justify-center">
                            <span className="text-[0.5rem] font-medium text-slate-500">
                              +{event.participants.length - 4}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Минималистичные индикаторы статуса */}
                <div className="flex-shrink-0 pt-0.5">
                  {isLive && (
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  )}
                  {!isLive && isStartingSoon && (
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

