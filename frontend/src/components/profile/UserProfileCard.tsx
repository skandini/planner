"use client";

import { useState, useEffect } from "react";
import type { UserProfile } from "@/types/user.types";
import type { DepartmentWithChildren } from "@/types/department.types";
import { USERS_ENDPOINT } from "@/lib/constants";

interface UserProfileCardProps {
  user: UserProfile;
  departments: DepartmentWithChildren[];
  organizations: Array<{ id: string; name: string; slug: string }>;
  apiBaseUrl: string;
  onClose: () => void;
  onUpdate?: () => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

export function UserProfileCard({
  user,
  departments,
  organizations,
  apiBaseUrl,
  onClose,
  onUpdate,
  authFetch,
}: UserProfileCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    full_name: user.full_name || "",
    phone: user.phone || "",
    position: user.position || "",
    birthday: user.birthday || "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get all departments user belongs to
  const userDeptIds = user.department_ids || (user.department_id ? [user.department_id] : []);
  const userDepts = userDeptIds
    .map(deptId => {
      const dept = departments.find(d => d.id === deptId) || 
                  departments.flatMap(d => d.children || []).find(d => d.id === deptId);
      return dept;
    })
    .filter(Boolean);

  // Get all organizations user belongs to
  const userOrgIds = user.organization_ids || (user.organization_id ? [user.organization_id] : []);
  const userOrgs = userOrgIds
    .map(orgId => organizations.find(o => o.id === orgId))
    .filter(Boolean);

  // Get manager
  const manager = user.manager_id 
    ? departments.flatMap(d => [d, ...(d.children || [])])
        .find(d => d.manager_id === user.manager_id)
    : null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const resp = await authFetch(`${USERS_ENDPOINT}${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: formData.full_name || null,
          phone: formData.phone || null,
          position: formData.position || null,
          birthday: formData.birthday || null,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.detail || "Не удалось обновить профиль");
      }

      setIsEditing(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Ошибка сохранения";
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const formatBirthday = (dateStr: string | null | undefined) => {
    if (!dateStr) return "Не указан";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("ru-RU", { 
        day: "numeric", 
        month: "long", 
        year: "numeric" 
      });
    } catch {
      return dateStr;
    }
  };

  const getAge = (dateStr: string | null | undefined) => {
    if (!dateStr) return null;
    try {
      const today = new Date();
      const birthDate = new Date(dateStr);
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };

  const isTodayBirthday = () => {
    if (!user.birthday) return false;
    try {
      const today = new Date();
      const birthday = new Date(user.birthday);
      return birthday.getMonth() === today.getMonth() && birthday.getDate() === today.getDate();
    } catch {
      return false;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      style={{ animation: 'fadeIn 0.2s ease-out forwards' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl"
        style={{ animation: 'fadeInUp 0.3s ease-out forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 shadow-lg shadow-indigo-500/30">
                    {user.avatar_url ? (
                      <img
                        src={`${apiBaseUrl}${user.avatar_url}`}
                        alt={user.full_name || user.email}
                        className="h-full w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="text-2xl font-bold text-white">
                        {(user.full_name || user.email).charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  {isTodayBirthday() && (
                    <div className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white shadow-lg animate-pulse">
                      🎂
                    </div>
                  )}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {user.full_name || user.email}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-400 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-600"
                aria-label="Закрыть"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {!isEditing && (
              <div className="flex gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Редактировать
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto" style={{ maxHeight: "calc(90vh - 200px)" }}>
          <div className="p-6 space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {isEditing ? (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
                className="space-y-5"
              >
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    ФИО
                  </label>
                  <input
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
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
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none"
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

                <div className="flex gap-3 pt-4 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        full_name: user.full_name || "",
                        phone: user.phone || "",
                        position: user.position || "",
                        birthday: user.birthday || "",
                      });
                      setError(null);
                    }}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-gradient-to-r from-indigo-500 to-purple-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition hover:from-indigo-600 hover:to-purple-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving ? "Сохранение…" : "Сохранить"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                {/* Основная информация */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Основная информация</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Должность</div>
                      <div className="text-sm text-slate-900 mt-1">{user.position || "Не указана"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Телефон</div>
                      <div className="text-sm text-slate-900 mt-1">{user.phone || "Не указан"}</div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">День рождения</div>
                      <div className="text-sm text-slate-900 mt-1 flex items-center gap-2">
                        {formatBirthday(user.birthday)}
                        {isTodayBirthday() && (
                          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
                            🎂 Сегодня!
                          </span>
                        )}
                        {user.birthday && getAge(user.birthday) !== null && (
                          <span className="text-xs text-slate-500">
                            ({getAge(user.birthday)} лет)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Отделы */}
                {userDepts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Отделы</h3>
                    <div className="flex flex-wrap gap-2">
                      {userDepts.map(dept => (
                        <span key={dept.id} className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-sm border border-slate-200">
                          {dept.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Организации */}
                {userOrgs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Организации</h3>
                    <div className="flex flex-wrap gap-2">
                      {userOrgs.map(org => (
                        <span key={org.id} className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-sm border border-indigo-200">
                          🏢 {org.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Руководитель */}
                {manager && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wide mb-4">Руководитель</h3>
                    <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-900">
                      {manager.name}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

