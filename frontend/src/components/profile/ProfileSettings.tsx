"use client";

import { FormEvent, useEffect, useState } from "react";
import type { AuthenticatedFetch } from "@/types/common.types";
import type { UserProfile } from "@/types/user.types";
import type { DepartmentWithChildren } from "@/types/department.types";
import { USERS_ENDPOINT, ORGANIZATIONS_ENDPOINT, DEPARTMENTS_ENDPOINT, API_BASE_URL } from "@/lib/constants";
import { AvailabilityScheduleSettings } from "./AvailabilityScheduleSettings";

interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
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
  const [departments, setDepartments] = useState<DepartmentWithChildren[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const [formData, setFormData] = useState({
    email: "",
    full_name: "",
    phone: "",
    position: "",
    birthday: "",
    organization_ids: [] as string[],
    department_ids: [] as string[],
  });
  const [initialFormData, setInitialFormData] = useState<typeof formData | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [activeTab, setActiveTab] = useState<"profile" | "availability">("profile");

  useEffect(() => {
    if (isOpen) {
      loadProfile();
      loadOrganizations();
      loadDepartments();
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
      
      const newFormData = {
        email: data.email,
        full_name: data.full_name || "",
        phone: data.phone || "",
        position: data.position || "",
        birthday: data.birthday || "",
        organization_ids: data.organization_ids || [],
        department_ids: data.department_ids || [],
      };
      
      setFormData(newFormData);
      setInitialFormData(newFormData);
      
      if (data.avatar_url) {
        const avatarUrl = data.avatar_url.startsWith('http') 
          ? data.avatar_url 
          : `${API_BASE_URL.replace('/api/v1', '')}${data.avatar_url.startsWith('/') ? '' : '/'}${data.avatar_url}`;
        setAvatarPreview(avatarUrl);
      } else {
        setAvatarPreview(null);
      }
      setAvatarFile(null);
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
      }
    } catch (err) {
      console.error("Failed to load organizations:", err);
    }
  };

  const loadDepartments = async () => {
    try {
      const response = await authFetch(`${DEPARTMENTS_ENDPOINT}?_t=${Date.now()}`);
      if (response.ok) {
        const data: DepartmentWithChildren[] = await response.json();
        setDepartments(data);
      }
    } catch (err) {
      console.error("Failed to load departments:", err);
    }
  };

  const flattenDepartments = (depts: DepartmentWithChildren[]): DepartmentWithChildren[] => {
    const result: DepartmentWithChildren[] = [];
    const walk = (nodes: DepartmentWithChildren[]) => {
      nodes.forEach(node => {
        result.push(node);
        if (node.children) walk(node.children);
      });
    };
    walk(depts);
    return result;
  };

  const flatDepartments = flattenDepartments(departments);

  const hasUnsavedChanges = () => {
    if (!initialFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialFormData);
  };

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Размер файла не должен превышать 5 МБ");
        return;
      }
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setError("Разрешены только изображения (JPG, PNG, GIF, WebP)");
        return;
      }
      setAvatarFile(file);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (avatarFile) {
        setUploadingAvatar(true);
        const formData = new FormData();
        formData.append("file", avatarFile);
        
        const uploadResponse = await authFetch(`${USERS_ENDPOINT}me/avatar`, {
          method: "POST",
          body: formData,
        });
        
        if (!uploadResponse.ok) {
          const errorData = await uploadResponse.json().catch(() => ({}));
          throw new Error(errorData.detail || "Не удалось загрузить аватар");
        }
        setUploadingAvatar(false);
      }
      
      const payload: {
        email: string;
        full_name: string | null;
        phone: string | null;
        position: string | null;
        birthday: string | null;
        organization_ids: string[];
        department_ids: string[];
      } = {
        email: formData.email.trim(),
        full_name: formData.full_name.trim() || null,
        phone: formData.phone.trim() || null,
        position: formData.position.trim() || null,
        birthday: formData.birthday.trim() || null,
        organization_ids: formData.organization_ids,
        department_ids: formData.department_ids,
      };

      const response = await authFetch(`${USERS_ENDPOINT}me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
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
    <>
      {/* Диалог подтверждения закрытия */}
      {showCloseConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-2">Вы уверены?</h3>
            <p className="text-sm text-slate-600 mb-6">
              Все несохраненные изменения будут потеряны. Вы действительно хотите закрыть модальное окно?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowCloseConfirm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCloseConfirm(false);
                  onClose();
                }}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-600"
              >
                Закрыть без сохранения
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно */}
      <div 
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        style={{ animation: 'fadeIn 0.2s ease-out forwards' }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose();
          }
        }}
      >
        <div 
          className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
          style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Заголовок */}
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50">
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 shadow-lg shadow-indigo-500/30">
                    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">Настройки профиля</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      Управление личными данными и принадлежностью
                    </p>
                  </div>
                  
                  {/* Tabs */}
                  <div className="flex items-center gap-1 border-b border-slate-200 -mb-4">
                    <button
                      type="button"
                      onClick={() => setActiveTab("profile")}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === "profile"
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Профиль
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("availability")}
                      className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                        activeTab === "availability"
                          ? "border-indigo-500 text-indigo-600"
                          : "border-transparent text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      Доступность
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
                  aria-label="Закрыть"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Кнопки действий - перемещены вверх */}
              {activeTab === "profile" && (
                <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    form="profile-form"
                    disabled={saving || uploadingAvatar}
                    className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving || uploadingAvatar ? "Сохранение…" : "Сохранить"}
                  </button>
                </div>
              )}
              {activeTab === "availability" && (
                <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Закрыть
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Контент */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 280px)" }}>
            {activeTab === "availability" ? (
              <div className="p-6">
                <AvailabilityScheduleSettings authFetch={authFetch} onUpdate={onUpdate} />
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                  <div className="text-sm text-slate-500">Загрузка...</div>
                </div>
              </div>
            ) : error && !profile ? (
              <div className="p-6">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
                  {error}
                </div>
              </div>
            ) : (
              <form id="profile-form" onSubmit={handleSubmit} className="p-6 space-y-6">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* Фотография профиля */}
                <div className="space-y-4 border-b border-slate-200 pb-6">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Фотография профиля</h3>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      {avatarPreview ? (
                        <img
                          src={avatarPreview}
                          alt="Аватар"
                          className="h-24 w-24 rounded-2xl object-cover border-2 border-slate-200 shadow-lg"
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center border-2 border-slate-200 shadow-lg">
                          <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block">
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                          onChange={handleAvatarChange}
                          className="hidden"
                          disabled={uploadingAvatar}
                        />
                        <span className="inline-block rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                          {avatarFile ? "Изменить фото" : "Загрузить фото"}
                        </span>
                      </label>
                      <p className="mt-1.5 text-xs text-slate-500">
                        JPG, PNG, GIF или WebP, максимум 5 МБ
                      </p>
                    </div>
                  </div>
                </div>

                {/* Основная информация */}
                <div className="space-y-4 border-b border-slate-200 pb-6">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Основная информация</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        ФИО
                      </label>
                      <input
                        type="text"
                        value={formData.full_name}
                        onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                        placeholder="Иванов Иван Иванович"
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Телефон
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        placeholder="+7 (999) 123-45-67"
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Должность
                      </label>
                      <input
                        type="text"
                        value={formData.position}
                        onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                        placeholder="Менеджер проектов"
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        День рождения
                      </label>
                      <input
                        type="date"
                        value={formData.birthday}
                        onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Принадлежность */}
                <div className="space-y-4 border-b border-slate-200 pb-6">
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Принадлежность</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Организации
                    </label>
                    <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                      {organizations.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">Нет доступных организаций</p>
                      ) : (
                        organizations.map((org) => {
                          const isChecked = formData.organization_ids.includes(org.id);
                          return (
                            <label 
                              key={org.id} 
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      organization_ids: [...formData.organization_ids, org.id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      organization_ids: formData.organization_ids.filter(id => id !== org.id),
                                    });
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                              />
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                                  <span className="text-lg">🏢</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-900 truncate">
                                    {org.name}
                                  </div>
                                  {org.description && (
                                    <div className="text-xs text-slate-500 truncate">{org.description}</div>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Отделы
                    </label>
                    <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                      {flatDepartments.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-4">Нет доступных отделов</p>
                      ) : (
                        flatDepartments.map((dept) => {
                          const isChecked = formData.department_ids.includes(dept.id);
                          return (
                            <label 
                              key={dept.id} 
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      department_ids: [...formData.department_ids, dept.id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      department_ids: formData.department_ids.filter(id => id !== dept.id),
                                    });
                                  }
                                }}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-2 focus:ring-indigo-500/20"
                              />
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0">
                                  <span className="text-lg">🏢</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-medium text-slate-900 truncate">
                                    {dept.name}
                                  </div>
                                  {dept.description && (
                                    <div className="text-xs text-slate-500 truncate">{dept.description}</div>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
