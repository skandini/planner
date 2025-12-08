"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import { USERS_ENDPOINT, ORGANIZATIONS_ENDPOINT } from "@/lib/constants";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string | null;
  is_active: boolean;
  role: string;
  created_at: string;
}

interface ProfileSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  authFetch: AuthenticatedFetch;
  onUpdate?: () => void;
}

export function ProfileSettings({
  isOpen,
  onClose,
  authFetch,
  onUpdate,
}: ProfileSettingsProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    organization_id: "",
    phone: "",
    position: "",
    department: "",
  });

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      loadOrganizations();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch(`${USERS_ENDPOINT}me`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Не удалось загрузить профиль");
      }
      const data: UserProfile = await response.json();
      setProfile(data);
      setFormData({
        email: data.email,
        full_name: data.full_name || "",
        organization_id: data.organization_id || "",
        phone: "",
        position: "",
        department: "",
      });
    } catch (err) {
      console.error("Profile load error:", err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки профиля");
    } finally {
      setLoading(false);
    }
  };

  const loadOrganizations = async () => {
    try {
      const response = await authFetch(ORGANIZATIONS_ENDPOINT);
      if (response.ok) {
        const data: Organization[] = await response.json();
        setOrganizations(data);
      } else {
        console.error("Failed to load organizations:", response.status, response.statusText);
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: {
        email: string;
        full_name: string | null;
        organization_id: string | null;
      } = {
        email: formData.email,
        full_name: formData.full_name || null,
        organization_id: formData.organization_id || null,
      };

      // Если organization_id пустая строка, отправляем null
      if (!payload.organization_id) {
        payload.organization_id = null;
      }

      const response = await authFetch(`${USERS_ENDPOINT}me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Profile update error:", errorData);
        // Если это ошибка валидации, показываем детали
        if (response.status === 422 && Array.isArray(errorData.detail)) {
          const validationErrors = errorData.detail.map((err: any) => 
            `${err.loc?.join('.')}: ${err.msg}`
          ).join(', ');
          throw new Error(`Ошибка валидации: ${validationErrors}`);
        }
        throw new Error(errorData.detail || "Не удалось обновить профиль");
      }

      if (onUpdate) {
        onUpdate();
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления профиля");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Заголовок */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Настройки профиля</h2>
            <p className="text-sm text-slate-500 mt-0.5">Управление личными данными и принадлежностью</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Контент */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-slate-400">Загрузка...</div>
            </div>
          ) : error && !profile ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Основная информация */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Основная информация
                </h3>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      ФИО
                    </label>
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      placeholder="Иванов Иван Иванович"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Телефон
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="+7 (999) 123-45-67"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Должность
                    </label>
                    <input
                      type="text"
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                      placeholder="Менеджер проектов"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      Отдел
                    </label>
                    <input
                      type="text"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="Отдел разработки"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* Принадлежность к юридическому лицу */}
              <div className="space-y-4 border-t border-slate-200 pt-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Принадлежность к юридическому лицу
                </h3>
                <p className="text-sm text-slate-600">
                  Выберите юридическое лицо из группы компаний, к которому вы принадлежите
                </p>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Юридическое лицо
                  </label>
                  <select
                    value={formData.organization_id}
                    onChange={(e) => setFormData({ ...formData, organization_id: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-500/20"
                  >
                    <option value="">Не выбрано</option>
                    {organizations.map((org) => (
                      <option key={org.id} value={org.id}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                  {organizations.length === 0 && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      Нет доступных юридических лиц. Обратитесь к администратору.
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Кнопки */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-gradient-to-r from-lime-500 to-emerald-500 px-4 py-2 text-sm font-semibold text-white transition hover:from-lime-600 hover:to-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

