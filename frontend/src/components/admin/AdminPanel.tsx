"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { USERS_ENDPOINT, DEPARTMENTS_ENDPOINT, API_BASE_URL } from "@/lib/constants";
import type { UserProfile } from "@/types/user.types";
import { NotificationCreator } from "./NotificationCreator";
import { RoomManagement } from "./RoomManagement";
import { Statistics } from "../statistics/Statistics";
import { OrganizationManagement } from "./OrganizationManagement";

type Role = "admin" | "it" | "employee";

interface AdminPanelProps {
  authFetch: AuthenticatedFetch;
  currentUser?: UserProfile | null;
  onClose?: () => void;
}

export function AdminPanel({ authFetch, currentUser, onClose }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [editForm, setEditForm] = useState({
    email: "",
    full_name: "",
    password: "",
  });
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [bootstrapMode, setBootstrapMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "rooms" | "organizations" | "statistics">("users");
  const [form, setForm] = useState({
    email: "",
    full_name: "",
    password: "",
    role: "employee" as Role,
    department_id: "",
    access_org_structure: true,
    access_tickets: true,
    access_availability_slots: false,
  });

  const flattenedDepartments = useMemo(() => departments, [departments]);

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
      console.error(err);
    }
  }, [authFetch]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(USERS_ENDPOINT, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setBootstrapMode(true);
        }
        const txt = await res.text();
        throw new Error(txt || "Не удалось загрузить пользователей");
      }
      const data = await res.json();
      setUsers(data);
      setBootstrapMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки пользователей");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, [loadUsers, loadDepartments]);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      if (!form.email || !form.password) {
        setError("Введите email и пароль");
        setCreating(false);
        return;
      }
      const payload: any = {
        email: form.email,
        full_name: form.full_name || null,
        password: form.password,
        role: form.role,
        department_id: form.department_id || null,
        access_org_structure: form.access_org_structure,
        access_tickets: form.access_tickets,
        access_availability_slots: form.access_availability_slots,
      };
      const url = bootstrapMode
        ? `${API_BASE_URL}/users/bootstrap-admin`
        : `${USERS_ENDPOINT}admin-create`;
      const fetcher = bootstrapMode ? fetch : authFetch;

      const res = await fetcher(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Не удалось создать пользователя");
      }
      await loadUsers();
      setForm({
        email: "",
        full_name: "",
        password: "",
        role: "employee",
        department_id: "",
        access_org_structure: true,
        access_tickets: true,
        access_availability_slots: false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания пользователя");
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (user: UserProfile, changes: Partial<UserProfile & { role: Role }>) => {
    setSavingId(user.id);
    setError(null);
    try {
      const payload: any = {};
      if (changes.role) payload.role = changes.role;
      if (typeof changes.access_org_structure === "boolean") payload.access_org_structure = changes.access_org_structure;
      if (typeof changes.access_tickets === "boolean") payload.access_tickets = changes.access_tickets;
      if (typeof changes.access_availability_slots === "boolean") payload.access_availability_slots = changes.access_availability_slots;
      if (changes.department_id !== undefined) payload.department_id = changes.department_id;

      const res = await authFetch(`${USERS_ENDPOINT}${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Не удалось обновить пользователя");
      }
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления пользователя");
    } finally {
      setSavingId(null);
    }
  };

  const handleOpenEdit = (user: UserProfile) => {
    setEditingUser(user);
    setEditForm({
      email: user.email || "",
      full_name: user.full_name || "",
      password: "",
    });
    setError(null);
  };

  const handleCloseEdit = () => {
    setEditingUser(null);
    setEditForm({
      email: "",
      full_name: "",
      password: "",
    });
    setError(null);
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    
    setSavingId(editingUser.id);
    setError(null);
    try {
      const payload: any = {};
      
      // Обновляем email только если он изменился
      if (editForm.email && editForm.email !== editingUser.email) {
        payload.email = editForm.email;
      }
      
      // Обновляем full_name только если он изменился
      if (editForm.full_name !== editingUser.full_name) {
        payload.full_name = editForm.full_name || null;
      }
      
      // Обновляем пароль только если он указан
      if (editForm.password && editForm.password.trim().length > 0) {
        if (editForm.password.length < 8) {
          setError("Пароль должен быть не менее 8 символов");
          setSavingId(null);
          return;
        }
        payload.password = editForm.password;
      }

      if (Object.keys(payload).length === 0) {
        handleCloseEdit();
        setSavingId(null);
        return;
      }

      const res = await authFetch(`${USERS_ENDPOINT}${editingUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Не удалось обновить пользователя");
      }
      await loadUsers();
      handleCloseEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления пользователя");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-50 flex flex-col z-50 overflow-hidden" style={{ animation: 'fadeIn 0.3s ease-in-out forwards' }}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 p-4 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-1">
          <h2 className="text-lg font-bold">Админ-панель</h2>
        </div>
        {(onClose || currentUser) && (
          <button
            onClick={() => onClose ? onClose() : window.history.back()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Закрыть
          </button>
        )}
      </div>
      
      {/* Content with scroll */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-6 p-6">
          {/* Вкладки */}
          <div className="flex gap-2 border-b border-slate-200">
            <button
              onClick={() => setActiveTab("users")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "users"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Пользователи
            </button>
            <button
              onClick={() => setActiveTab("rooms")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "rooms"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Переговорки
            </button>
            <button
              onClick={() => setActiveTab("organizations")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "organizations"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Организации
            </button>
            <button
              onClick={() => setActiveTab("statistics")}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "statistics"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              Статистика
            </button>
          </div>

          {activeTab === "users" && (
            <>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Админ-панель</h1>
              <p className="text-slate-600">
                {bootstrapMode
                  ? "Создание первого администратора"
                  : "Создание учетных записей и выдача прав доступа"}
              </p>
            </div>
          </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Создание пользователя */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Создать пользователя</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="ФИО"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Пароль"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          >
            <option value="employee">Сотрудник</option>
            <option value="it">ИТ</option>
            <option value="admin">Админ</option>
          </select>
          <select
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={form.department_id}
            onChange={(e) => setForm({ ...form, department_id: e.target.value })}
          >
            <option value="">Отдел не выбран</option>
            {flattenedDepartments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.access_org_structure}
                onChange={(e) => setForm({ ...form, access_org_structure: e.target.checked })}
              />
              Доступ к оргструктуре
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={form.access_tickets}
                onChange={(e) => setForm({ ...form, access_tickets: e.target.checked })}
              />
              Доступ к тикетам
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.access_availability_slots}
                onChange={(e) => setForm({ ...form, access_availability_slots: e.target.checked })}
              />
              Доступ к предложениям слотов
            </label>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
          >
            {creating ? "Создаем..." : "Создать"}
          </button>
        </div>
      </div>

      {/* Таблица пользователей */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-slate-900">Пользователи</h3>
          {loading && <div className="text-xs text-slate-500">Загрузка...</div>}
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 pr-3">Имя</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Роль</th>
                <th className="py-2 pr-3">Отдел</th>
                <th className="py-2 pr-3">Доступ</th>
                <th className="py-2 pr-3">Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="py-2 pr-3 text-slate-900">{u.full_name || "—"}</td>
                  <td className="py-2 pr-3 text-slate-600">{u.email}</td>
                  <td className="py-2 pr-3">
                    <select
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                      value={u.role}
                      disabled={savingId === u.id}
                      onChange={(e) => handleUpdate(u, { role: e.target.value as Role })}
                    >
                      <option value="employee">Сотрудник</option>
                      <option value="it">ИТ</option>
                      <option value="admin">Админ</option>
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <select
                      className="rounded border border-slate-200 px-2 py-1 text-xs"
                      value={u.department_id || ""}
                      disabled={savingId === u.id}
                      onChange={(e) => handleUpdate(u, { department_id: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {flattenedDepartments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-1 text-xs">
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={u.access_org_structure !== false}
                          disabled={savingId === u.id}
                          onChange={(e) => handleUpdate(u, { access_org_structure: e.target.checked })}
                        />
                        Оргструктура
                      </label>
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={u.access_tickets !== false}
                          disabled={savingId === u.id}
                          onChange={(e) => handleUpdate(u, { access_tickets: e.target.checked })}
                        />
                        Тикеты
                      </label>
                      <label className="inline-flex items-center gap-2 text-slate-700">
                        <input
                          type="checkbox"
                          checked={u.access_availability_slots === true}
                          disabled={savingId === u.id}
                          onChange={(e) => handleUpdate(u, { access_availability_slots: e.target.checked })}
                        />
                        Предложения слотов
                      </label>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <button
                      onClick={() => handleOpenEdit(u)}
                      disabled={savingId === u.id}
                      className="text-xs px-2 py-1 rounded border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {savingId === u.id ? "Сохранение..." : "Редактировать"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Модальное окно редактирования пользователя */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleCloseEdit}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Редактировать пользователя</h3>
              <button
                onClick={handleCloseEdit}
                className="text-slate-400 hover:text-slate-600 text-xl"
              >
                ×
              </button>
            </div>
            
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email (логин)
                </label>
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  ФИО
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.full_name}
                  onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                  placeholder="Иванов Иван Иванович"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Новый пароль (оставьте пустым, чтобы не менять)
                </label>
                <input
                  type="password"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Минимум 8 символов"
                />
              </div>
              
              <div className="flex gap-2 mt-2">
                <button
                  onClick={handleSaveEdit}
                  disabled={savingId === editingUser.id}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingId === editingUser.id ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  onClick={handleCloseEdit}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

          {/* Создание уведомлений */}
          <NotificationCreator 
            authFetch={authFetch} 
            users={users}
            onSuccess={() => {
              // Уведомления обновятся автоматически
            }}
          />
            </>
          )}

          {activeTab === "rooms" && (
            <RoomManagement authFetch={authFetch} />
          )}

          {activeTab === "organizations" && (
            <OrganizationManagement authFetch={authFetch} />
          )}

          {activeTab === "statistics" && (
            <Statistics authFetch={authFetch} />
          )}
        </div>
      </div>
    </div>
  );
}

