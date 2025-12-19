"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { API_BASE_URL } from "@/lib/constants";

interface StatisticsProps {
  authFetch: AuthenticatedFetch;
}

interface DepartmentStatistics {
  department_id: string | null;
  department_name: string | null;
  total_meetings: number;
  total_minutes: number;
  total_hours: number;
}

interface EmployeeStatistics {
  user_id: string;
  user_name: string | null;
  user_email: string;
  department_id: string | null;
  department_name: string | null;
  total_meetings: number;
  total_minutes: number;
  total_hours: number;
}

interface RoomStatistics {
  room_id: string;
  room_name: string;
  total_bookings: number;
  total_minutes: number;
  total_hours: number;
  free_time_minutes: number;
  free_time_hours: number;
  utilization_percent: number;
}

interface StatisticsResponse {
  from_date: string;
  to_date: string;
  department_stats: DepartmentStatistics[];
  employee_stats: EmployeeStatistics[];
  room_stats: RoomStatistics[];
}

export function Statistics({ authFetch }: StatisticsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatisticsResponse | null>(null);
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(1); // Первое число текущего месяца
    date.setHours(0, 0, 0, 0);
    return date.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    date.setDate(0); // Последний день текущего месяца
    date.setHours(23, 59, 59, 999);
    return date.toISOString().split('T')[0];
  });

  const loadStatistics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const from = new Date(fromDate);
      from.setHours(0, 0, 0, 0);
      const to = new Date(toDate);
      to.setHours(23, 59, 59, 999);
      
      const url = `${API_BASE_URL}/statistics/?from_date=${from.toISOString()}&to_date=${to.toISOString()}`;
      const res = await authFetch(url);
      
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Не удалось загрузить статистику");
      }
      
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки статистики");
    } finally {
      setLoading(false);
    }
  }, [authFetch, fromDate, toDate]);

  useEffect(() => {
    loadStatistics();
  }, [loadStatistics]);

  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Статистика</h2>
        <p className="text-sm text-slate-600">Аналитика по встречам и переговоркам</p>
      </div>

      {/* Фильтры по датам */}
      <div className="mb-6 flex gap-4 items-end">
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            С даты
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            По дату
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          onClick={loadStatistics}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Загрузка..." : "Обновить"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading && !stats && (
        <div className="text-center py-8 text-slate-500">Загрузка статистики...</div>
      )}

      {stats && !loading && (
        <div className="space-y-8">
          {/* Дашборд - сводка */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
              <div className="text-sm font-medium text-blue-700 mb-1">Всего отделов</div>
              <div className="text-3xl font-bold text-blue-900">{stats.department_stats.length}</div>
              <div className="text-xs text-blue-600 mt-1">
                {stats.department_stats.reduce((sum, d) => sum + d.total_meetings, 0)} встреч
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
              <div className="text-sm font-medium text-green-700 mb-1">Всего сотрудников</div>
              <div className="text-3xl font-bold text-green-900">{stats.employee_stats.length}</div>
              <div className="text-xs text-green-600 mt-1">
                {stats.employee_stats.reduce((sum, e) => sum + e.total_meetings, 0)} встреч
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
              <div className="text-sm font-medium text-purple-700 mb-1">Всего переговорок</div>
              <div className="text-3xl font-bold text-purple-900">{stats.room_stats.length}</div>
              <div className="text-xs text-purple-600 mt-1">
                {stats.room_stats.reduce((sum, r) => sum + r.total_bookings, 0)} бронирований
              </div>
            </div>
          </div>

          {/* График по отделам */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Статистика по отделам (время встреч)
            </h3>
            {stats.department_stats.length === 0 ? (
              <p className="text-slate-500">Нет данных за выбранный период</p>
            ) : (
              <div className="space-y-4">
                {/* Визуализация - столбчатая диаграмма */}
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="space-y-3">
                    {stats.department_stats.slice(0, 10).map((dept) => {
                      const maxHours = Math.max(...stats.department_stats.map(d => d.total_hours), 1);
                      const percentage = (dept.total_hours / maxHours) * 100;
                      return (
                        <div key={dept.department_id || "no-dept"} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700">
                              {dept.department_name || "Без отдела"}
                            </span>
                            <span className="text-slate-600">
                              {dept.total_hours.toFixed(1)} ч ({dept.total_meetings} встреч)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Таблица */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                          Отдел
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Встреч
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Минут
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Часов
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.department_stats.map((dept) => (
                        <tr
                          key={dept.department_id || "no-dept"}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {dept.department_name || "Без отдела"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {dept.total_meetings}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {dept.total_minutes.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                            {dept.total_hours.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* График по сотрудникам */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Статистика по сотрудникам (время встреч)
            </h3>
            {stats.employee_stats.length === 0 ? (
              <p className="text-slate-500">Нет данных за выбранный период</p>
            ) : (
              <div className="space-y-4">
                {/* Визуализация - столбчатая диаграмма */}
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="space-y-3">
                    {stats.employee_stats.slice(0, 15).map((emp) => {
                      const maxHours = Math.max(...stats.employee_stats.map(e => e.total_hours), 1);
                      const percentage = (emp.total_hours / maxHours) * 100;
                      return (
                        <div key={emp.user_id} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium text-slate-700">
                              {emp.user_name || emp.user_email}
                              {emp.department_name && (
                                <span className="text-xs text-slate-500 ml-2">
                                  ({emp.department_name})
                                </span>
                              )}
                            </span>
                            <span className="text-slate-600">
                              {emp.total_hours.toFixed(1)} ч ({emp.total_meetings} встреч)
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Таблица */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                          Сотрудник
                        </th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                          Отдел
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Встреч
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Минут
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Часов
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.employee_stats.map((emp) => (
                        <tr
                          key={emp.user_id}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 text-sm text-slate-900">
                            {emp.user_name || emp.user_email}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600">
                            {emp.department_name || "Без отдела"}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {emp.total_meetings}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {emp.total_minutes.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900 text-right">
                            {emp.total_hours.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* График по переговоркам */}
          <div>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">
              Статистика по переговоркам (свободность)
            </h3>
            {stats.room_stats.length === 0 ? (
              <p className="text-slate-500">Нет данных за выбранный период</p>
            ) : (
              <div className="space-y-4">
                {/* Визуализация - круговая диаграмма загруженности */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stats.room_stats.map((room) => {
                    const utilization = Math.min(100, room.utilization_percent);
                    const freePercent = 100 - utilization;
                    return (
                      <div
                        key={room.room_id}
                        className="bg-slate-50 rounded-lg p-4 border border-slate-200"
                      >
                        <div className="mb-3">
                          <h4 className="font-semibold text-slate-900 mb-1">{room.room_name}</h4>
                          <div className="text-xs text-slate-600">
                            {room.total_bookings} бронирований
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-slate-600">Загруженность</span>
                            <span className="font-medium text-slate-900">
                              {room.utilization_percent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-gradient-to-r from-purple-500 to-purple-600 h-2 rounded-full transition-all"
                              style={{ width: `${utilization}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-slate-500">
                            <span>Занято: {room.total_hours.toFixed(1)} ч</span>
                            <span>Свободно: {room.free_time_hours.toFixed(1)} ч</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Таблица */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-slate-700">
                          Переговорка
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Бронирований
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Занято часов
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Свободно часов
                        </th>
                        <th className="px-4 py-3 text-right text-sm font-semibold text-slate-700">
                          Загруженность
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.room_stats.map((room) => (
                        <tr
                          key={room.room_id}
                          className="border-b border-slate-100 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {room.room_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {room.total_bookings}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 text-right">
                            {room.total_hours.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-sm font-medium text-green-600 text-right">
                            {room.free_time_hours.toFixed(1)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-24 bg-slate-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full transition-all"
                                  style={{ width: `${Math.min(100, room.utilization_percent)}%` }}
                                />
                              </div>
                              <span className="text-sm font-medium text-slate-700 w-12 text-right">
                                {room.utilization_percent.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

