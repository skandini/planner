"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { API_BASE_URL, USERS_ENDPOINT, DEPARTMENTS_ENDPOINT } from "@/lib/constants";
import type { UserProfile } from "@/types/user.types";

interface ScheduleAccessPermission {
  id: string;
  granted_to_user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  target_user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  target_department: {
    id: string;
    name: string;
  } | null;
  granted_by_user: {
    id: string;
    email: string;
    full_name: string | null;
  } | null;
  created_at: string;
  updated_at: string;
}

interface ScheduleAccessManagerProps {
  authFetch: AuthenticatedFetch;
}

export function ScheduleAccessManager({ authFetch }: ScheduleAccessManagerProps) {
  const [permissions, setPermissions] = useState<ScheduleAccessPermission[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({
    granted_to_user_id: "",
    target_user_id: "",
    target_department_id: "",
  });

  const loadPermissions = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE_URL}/schedule-access`, { cache: "no-store" });
      if (!res.ok) throw new Error("Не удалось загрузить права доступа");
      const data = await res.json();
      setPermissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки прав доступа");
    }
  }, [authFetch]);

  const loadUsers = useCallback(async () => {
    try {
      const res = await authFetch(USERS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) throw new Error("Не удалось загрузить пользователей");
      const data = await res.json();
      // API возвращает PaginatedResponse, нужно извлечь items
      const usersList = Array.isArray(data) ? data : (data.items || []);
      setUsers(usersList);
    } catch (err) {
      console.error("Ошибка загрузки пользователей:", err);
      setUsers([]); // Устанавливаем пустой массив при ошибке
    }
  }, [authFetch]);

  const loadDepartments = useCallback(async () => {
    try {
      const res = await authFetch(DEPARTMENTS_ENDPOINT);
      if (!res.ok) throw new Error("Не удалось загрузить отделы");
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
    } catch (err) {
      console.error("Ошибка загрузки отделов:", err);
    }
  }, [authFetch]);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadPermissions(), loadUsers(), loadDepartments()]).finally(() => {
      setLoading(false);
    });
  }, [loadPermissions, loadUsers, loadDepartments]);

  const handleCreate = async () => {
    if (!form.granted_to_user_id) {
      setError("Выберите пользователя, которому предоставляется доступ");
      return;
    }

    if (!form.target_user_id && !form.target_department_id) {
      setError("Выберите либо пользователя, либо отдел для доступа");
      return;
    }

    if (form.target_user_id && form.target_department_id) {
      setError("Выберите либо пользователя, либо отдел, но не оба");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const body: any = {
        granted_to_user_id: form.granted_to_user_id,
      };
      if (form.target_user_id) {
        body.target_user_id = form.target_user_id;
      } else {
        body.target_department_id = form.target_department_id;
      }

      const res = await authFetch(`${API_BASE_URL}/schedule-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось создать право доступа");
      }

      await loadPermissions();
      setShowCreateForm(false);
      setForm({
        granted_to_user_id: "",
        target_user_id: "",
        target_department_id: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания права доступа");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (permissionId: string) => {
    if (!confirm("Вы уверены, что хотите удалить это право доступа?")) {
      return;
    }

    try {
      const res = await authFetch(`${API_BASE_URL}/schedule-access/${permissionId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось удалить право доступа");
      }

      await loadPermissions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления права доступа");
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center text-slate-500">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">Доступ к расписанию сотрудников</h3>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition text-sm font-medium"
        >
          {showCreateForm ? "Отмена" : "+ Добавить доступ"}
        </button>
      </div>

      {showCreateForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900 mb-3">Новое право доступа</h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Пользователь, которому предоставляется доступ
              </label>
              <select
                value={form.granted_to_user_id}
                onChange={(e) => setForm({ ...form, granted_to_user_id: e.target.value })}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="">Выберите пользователя</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name || u.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Доступ к расписанию
              </label>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Конкретного сотрудника:</label>
                  <select
                    value={form.target_user_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        target_user_id: e.target.value,
                        target_department_id: "",
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Выберите сотрудника</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="text-xs text-slate-500 text-center">или</div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Всех сотрудников отдела:</label>
                  <select
                    value={form.target_department_id}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        target_department_id: e.target.value,
                        target_user_id: "",
                      })
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Выберите отдел</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm font-medium"
            >
              {creating ? "Создание..." : "Создать"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Кому предоставлен доступ</th>
                <th className="py-2 pr-3">Доступ к</th>
                <th className="py-2 pr-3">Предоставлен</th>
                <th className="py-2 pr-3">Дата создания</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {permissions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    Нет прав доступа
                  </td>
                </tr>
              ) : (
                permissions.map((perm) => (
                  <tr key={perm.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-slate-900">
                      {perm.granted_to_user?.full_name || perm.granted_to_user?.email || "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {perm.target_user
                        ? `Сотрудник: ${perm.target_user.full_name || perm.target_user.email}`
                        : perm.target_department
                        ? `Отдел: ${perm.target_department.name}`
                        : "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {perm.granted_by_user?.full_name || perm.granted_by_user?.email || "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-500 text-xs">
                      {new Date(perm.created_at).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => handleDelete(perm.id)}
                        className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50 transition"
                      >
                        Удалить
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

