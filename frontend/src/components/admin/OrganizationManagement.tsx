"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import { ORGANIZATIONS_ENDPOINT } from "@/lib/constants";

interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  description?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
}

interface OrganizationManagementProps {
  authFetch: AuthenticatedFetch;
}

export function OrganizationManagement({ authFetch }: OrganizationManagementProps) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [createForm, setCreateForm] = useState({
    name: "",
    slug: "",
    timezone: "Europe/Moscow",
    description: "",
    primary_color: "",
    secondary_color: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    slug: "",
    timezone: "",
    description: "",
    primary_color: "",
    secondary_color: "",
  });

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(ORGANIZATIONS_ENDPOINT);
      if (!res.ok) {
        throw new Error("Не удалось загрузить организации");
      }
      const data = await res.json();
      setOrganizations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки организаций");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    loadOrganizations();
  }, [loadOrganizations]);

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.slug.trim()) {
      setError("Название и slug обязательны");
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const payload = {
        name: createForm.name.trim(),
        slug: createForm.slug.trim(),
        timezone: createForm.timezone || "Europe/Moscow",
        description: createForm.description.trim() || null,
        primary_color: createForm.primary_color.trim() || null,
        secondary_color: createForm.secondary_color.trim() || null,
      };

      const res = await authFetch(ORGANIZATIONS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Не удалось создать организацию");
      }

      await loadOrganizations();
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        slug: "",
        timezone: "Europe/Moscow",
        description: "",
        primary_color: "",
        secondary_color: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания организации");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = (org: Organization) => {
    setEditingOrg(org);
    setEditForm({
      name: org.name || "",
      slug: org.slug || "",
      timezone: org.timezone || "Europe/Moscow",
      description: org.description || "",
      primary_color: org.primary_color || "",
      secondary_color: org.secondary_color || "",
    });
    setShowEditModal(true);
    setError(null);
  };

  const handleUpdate = async () => {
    if (!editingOrg) return;

    setSavingId(editingOrg.id);
    setError(null);
    try {
      const payload: any = {};

      if (editForm.name !== editingOrg.name) payload.name = editForm.name.trim();
      if (editForm.slug !== editingOrg.slug) payload.slug = editForm.slug.trim();
      if (editForm.timezone !== editingOrg.timezone) payload.timezone = editForm.timezone;
      if (editForm.description !== (editingOrg.description || "")) {
        payload.description = editForm.description.trim() || null;
      }
      if (editForm.primary_color !== (editingOrg.primary_color || "")) {
        payload.primary_color = editForm.primary_color.trim() || null;
      }
      if (editForm.secondary_color !== (editingOrg.secondary_color || "")) {
        payload.secondary_color = editForm.secondary_color.trim() || null;
      }

      if (Object.keys(payload).length === 0) {
        setShowEditModal(false);
        setEditingOrg(null);
        setSavingId(null);
        return;
      }

      const res = await authFetch(`${ORGANIZATIONS_ENDPOINT}/${editingOrg.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Не удалось обновить организацию");
      }

      await loadOrganizations();
      setShowEditModal(false);
      setEditingOrg(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления организации");
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (org: Organization) => {
    if (!confirm(`Удалить организацию "${org.name}"?\n\nЭто действие нельзя отменить.`)) {
      return;
    }

    setSavingId(org.id);
    setError(null);
    try {
      const res = await authFetch(`${ORGANIZATIONS_ENDPOINT}/${org.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Не удалось удалить организацию");
      }

      await loadOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления организации");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Управление организациями</h2>
          <p className="text-slate-600 mt-1">
            Создание и редактирование юридических лиц (организаций)
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 transition"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Создать организацию
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
            <div className="text-sm text-slate-500">Загрузка...</div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Название
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Slug (ID)
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Часовой пояс
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Описание
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {organizations.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                      Нет организаций. Создайте первую организацию.
                    </td>
                  </tr>
                ) : (
                  organizations.map((org) => (
                    <tr key={org.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">🏛️</span>
                          <div>
                            <div className="text-sm font-medium text-slate-900">{org.name}</div>
                            {org.primary_color && (
                              <div className="flex items-center gap-1 mt-1">
                                <div
                                  className="w-3 h-3 rounded-full border border-slate-200"
                                  style={{ backgroundColor: org.primary_color }}
                                />
                                {org.secondary_color && (
                                  <div
                                    className="w-3 h-3 rounded-full border border-slate-200"
                                    style={{ backgroundColor: org.secondary_color }}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                          {org.slug}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {org.timezone}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">
                        {org.description || "—"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEdit(org)}
                            disabled={savingId === org.id}
                            className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                          >
                            Редактировать
                          </button>
                          <button
                            onClick={() => handleDelete(org)}
                            disabled={savingId === org.id}
                            className="text-red-600 hover:text-red-900 disabled:opacity-50"
                          >
                            {savingId === org.id ? "Удаление..." : "Удалить"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Модальное окно создания */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !creating && setShowCreateModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-900">Создать организацию</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="text-slate-400 hover:text-slate-600 text-2xl disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Название <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="ООО КОРСТОУН"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Slug (ID) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={createForm.slug}
                    onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                    placeholder="corestone"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Только латиница, цифры и дефисы
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Часовой пояс
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={createForm.timezone}
                  onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })}
                >
                  <option value="Europe/Moscow">Europe/Moscow (МСК)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Описание
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="Краткое описание организации..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Основной цвет
                  </label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg border border-slate-200"
                    value={createForm.primary_color || "#4F46E5"}
                    onChange={(e) => setCreateForm({ ...createForm, primary_color: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Дополнительный цвет
                  </label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg border border-slate-200"
                    value={createForm.secondary_color || "#8B5CF6"}
                    onChange={(e) => setCreateForm({ ...createForm, secondary_color: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleCreate}
                  disabled={creating || !createForm.name.trim() || !createForm.slug.trim()}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? "Создание..." : "Создать"}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={creating}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно редактирования */}
      {showEditModal && editingOrg && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !savingId && setShowEditModal(false)}
        >
          <div
            className="bg-white rounded-2xl p-6 max-w-2xl w-full shadow-xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold text-slate-900">
                Редактировать: {editingOrg.name}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                disabled={!!savingId}
                className="text-slate-400 hover:text-slate-600 text-2xl disabled:opacity-50"
              >
                ×
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Название
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Slug (ID)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    value={editForm.slug}
                    onChange={(e) => setEditForm({ ...editForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Часовой пояс
                </label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  value={editForm.timezone}
                  onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })}
                >
                  <option value="Europe/Moscow">Europe/Moscow (МСК)</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="America/New_York">America/New_York</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Описание
                </label>
                <textarea
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none"
                  rows={3}
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Основной цвет
                  </label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg border border-slate-200"
                    value={editForm.primary_color || "#4F46E5"}
                    onChange={(e) => setEditForm({ ...editForm, primary_color: e.target.value })}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Дополнительный цвет
                  </label>
                  <input
                    type="color"
                    className="w-full h-10 rounded-lg border border-slate-200"
                    value={editForm.secondary_color || "#8B5CF6"}
                    onChange={(e) => setEditForm({ ...editForm, secondary_color: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <button
                  onClick={handleUpdate}
                  disabled={!!savingId}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingId ? "Сохранение..." : "Сохранить"}
                </button>
                <button
                  onClick={() => setShowEditModal(false)}
                  disabled={!!savingId}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm disabled:opacity-50"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

