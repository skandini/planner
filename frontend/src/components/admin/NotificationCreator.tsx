"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { ADMIN_NOTIFICATIONS_ENDPOINT, DEPARTMENTS_ENDPOINT, USERS_ENDPOINT } from "@/lib/constants";
import type { AdminNotificationCreate } from "@/types/admin-notification.types";
import type { UserProfile } from "@/types/user.types";

interface NotificationCreatorProps {
  authFetch: AuthenticatedFetch;
  users: UserProfile[];
  onSuccess?: () => void;
}

export function NotificationCreator({ authFetch, users, onSuccess }: NotificationCreatorProps) {
  const [form, setForm] = useState<AdminNotificationCreate>({
    title: "",
    message: "",
    target_user_ids: [],
    target_department_ids: [],
    display_duration_hours: 24,
  });
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUserList, setShowUserList] = useState(false);
  const [showDepartmentList, setShowDepartmentList] = useState(false);

  useEffect(() => {
    const loadDepartments = async () => {
      try {
        const res = await authFetch(DEPARTMENTS_ENDPOINT);
        if (res.ok) {
          const data = await res.json();
          const flatten = (depts: any[]): Array<{ id: string; name: string }> => {
            const result: Array<{ id: string; name: string }> = [];
            depts.forEach((d) => {
              result.push({ id: d.id, name: d.name });
              if (d.children?.length) result.push(...flatten(d.children));
            });
            return result;
          };
          setDepartments(flatten(data));
        }
      } catch (err) {
        console.error("Failed to load departments:", err);
      }
    };
    loadDepartments();
  }, [authFetch]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.message.trim()) {
      setError("Заполните заголовок и сообщение");
      return;
    }
    if (form.target_user_ids.length === 0 && form.target_department_ids.length === 0) {
      setError("Выберите хотя бы одного получателя");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: form.title,
        message: form.message,
        target_user_ids: form.target_user_ids,
        target_department_ids: form.target_department_ids,
        display_duration_hours: form.display_duration_hours,
      };
      
      console.log("[NotificationCreator] Sending request to:", ADMIN_NOTIFICATIONS_ENDPOINT);
      console.log("[NotificationCreator] Payload:", payload);
      
      const response = await authFetch(ADMIN_NOTIFICATIONS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      console.log("[NotificationCreator] Response status:", response.status);
      console.log("[NotificationCreator] Response ok:", response.ok);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[NotificationCreator] Error response:", errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
          console.error("[NotificationCreator] Parsed error data:", errorData);
        } catch {
          errorData = { detail: errorText || `HTTP ${response.status}: ${response.statusText}` };
        }
        const errorMessage = errorData.detail || errorData.message || `Не удалось создать уведомление (${response.status})`;
        console.error("[NotificationCreator] Error message:", errorMessage);
        throw new Error(errorMessage);
      }

      // Сброс формы
      setForm({
        title: "",
        message: "",
        target_user_ids: [],
        target_department_ids: [],
        display_duration_hours: 24,
      });
      setShowUserList(false);
      setShowDepartmentList(false);
      
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать уведомление");
    } finally {
      setLoading(false);
    }
  }, [form, authFetch, onSuccess]);

  const toggleUser = (userId: string) => {
    setForm((prev) => ({
      ...prev,
      target_user_ids: prev.target_user_ids.includes(userId)
        ? prev.target_user_ids.filter((id) => id !== userId)
        : [...prev.target_user_ids, userId],
    }));
  };

  const toggleDepartment = (deptId: string) => {
    setForm((prev) => ({
      ...prev,
      target_department_ids: prev.target_department_ids.includes(deptId)
        ? prev.target_department_ids.filter((id) => id !== deptId)
        : [...prev.target_department_ids, deptId],
    }));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-bold text-slate-900 mb-4">Создать уведомление</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Заголовок <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
            placeholder="Например: Важное объявление"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Сообщение <span className="text-red-500">*</span>
          </label>
          <textarea
            value={form.message}
            onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
            rows={4}
            placeholder="Текст уведомления..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Время отображения (часов)
          </label>
          <input
            type="number"
            min="0"
            max="168"
            value={form.display_duration_hours}
            onChange={(e) => setForm((prev) => ({ ...prev, display_duration_hours: parseInt(e.target.value) || 0 }))}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 focus:border-lime-500 focus:bg-white focus:ring-2 focus:ring-lime-500/20"
          />
          <p className="text-xs text-slate-500 mt-1">0 = бессрочно (до ручного закрытия)</p>
        </div>

        <div className="space-y-3">
          <div>
            <button
              type="button"
              onClick={() => setShowUserList(!showUserList)}
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <span>Выбрать сотрудников ({form.target_user_ids.length})</span>
              <span>{showUserList ? "▼" : "▶"}</span>
            </button>
            {showUserList && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {users.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.target_user_ids.includes(user.id)}
                      onChange={() => toggleUser(user.id)}
                      className="rounded border-slate-300 text-lime-600 focus:ring-lime-500"
                    />
                    <span className="text-sm text-slate-700">{user.full_name || user.email}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowDepartmentList(!showDepartmentList)}
              className="w-full flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <span>Выбрать отделы ({form.target_department_ids.length})</span>
              <span>{showDepartmentList ? "▼" : "▶"}</span>
            </button>
            {showDepartmentList && (
              <div className="mt-2 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                {departments.map((dept) => (
                  <label key={dept.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.target_department_ids.includes(dept.id)}
                      onChange={() => toggleDepartment(dept.id)}
                      className="rounded border-slate-300 text-lime-600 focus:ring-lime-500"
                    />
                    <span className="text-sm text-slate-700">{dept.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-lime-500 to-lime-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:from-lime-600 hover:to-lime-700 transition disabled:opacity-50"
        >
          {loading ? "Отправка..." : "Отправить уведомление"}
        </button>
      </form>
    </div>
  );
}

