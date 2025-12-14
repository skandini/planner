"use client";

import { useState, useEffect } from "react";
import type { UserProfile } from "@/types/user.types";
import { USERS_ENDPOINT } from "@/lib/constants";
import type { AuthenticatedFetch } from "@/types/common.types";

interface BirthdayReminderProps {
  authFetch: AuthenticatedFetch;
  apiBaseUrl: string;
}

export function BirthdayReminder({ authFetch, apiBaseUrl }: BirthdayReminderProps) {
  const [todayBirthdays, setTodayBirthdays] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    loadTodayBirthdays();
    // Обновляем каждую минуту, чтобы показывать актуальные дни рождения
    const interval = setInterval(() => {
      loadTodayBirthdays();
    }, 60000); // Каждую минуту
    
    return () => clearInterval(interval);
  }, []);

  const loadTodayBirthdays = async () => {
    try {
      setLoading(true);
      const resp = await authFetch(`${USERS_ENDPOINT}birthdays`);
      if (resp.ok) {
        const data = await resp.json();
        console.log('Today birthdays loaded:', data);
        setTodayBirthdays(data);
      } else {
        console.error('Failed to load birthdays:', resp.status, resp.statusText);
      }
    } catch (err) {
      console.error("Ошибка загрузки дней рождения:", err);
    } finally {
      setLoading(false);
    }
  };

  // Показываем кнопку только если есть дни рождения или идет загрузка
  if (loading) {
    return (
      <div className="fixed top-4 right-4 z-40">
        <div className="rounded-full bg-gradient-to-r from-pink-500 to-red-500 p-4 shadow-lg">
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (todayBirthdays.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative rounded-full bg-gradient-to-r from-pink-500 to-red-500 p-4 shadow-lg hover:shadow-xl transition-all hover:scale-105"
        aria-label="Дни рождения"
      >
        <span className="text-2xl">🎂</span>
        <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-white text-xs font-bold text-red-600 shadow animate-pulse">
          {todayBirthdays.length}
        </span>
      </button>

      {isOpen && (
        <div className="absolute top-16 right-0 w-80 rounded-2xl border border-slate-200 bg-white shadow-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900">🎂 Дни рождения сегодня</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {todayBirthdays.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition"
              >
                <div className="relative w-10 h-10 flex-shrink-0">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url.startsWith('http') 
                        ? user.avatar_url 
                        : `${apiBaseUrl}${user.avatar_url.startsWith('/') ? '' : '/'}${user.avatar_url}`}
                      alt={user.full_name || user.email}
                      className="w-full h-full rounded-full object-cover border-2 border-pink-200"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-pink-200 to-red-200 flex items-center justify-center text-sm font-semibold text-slate-700 border-2 border-pink-200">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute -top-1 -right-1 text-lg">🎂</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {user.full_name || user.email}
                  </div>
                  {user.position && (
                    <div className="text-xs text-slate-600 truncate">{user.position}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

