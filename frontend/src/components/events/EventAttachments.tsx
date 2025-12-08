"use client";

import { useState, useRef } from "react";
import type { EventAttachment } from "@/types/event.types";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { EVENT_ENDPOINT } from "@/lib/constants";

interface EventAttachmentsProps {
  eventId: string | null;
  attachments: EventAttachment[];
  authFetch: AuthenticatedFetch;
  canManage: boolean;
  onAttachmentsChange?: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 МБ
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 МБ

export function EventAttachments({
  eventId,
  attachments,
  authFetch,
  canManage,
  onAttachmentsChange,
}: EventAttachmentsProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const getTotalSize = () => {
    return attachments.reduce((sum, att) => sum + att.file_size, 0);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!eventId || !canManage) return;

    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      // Проверяем размер каждого файла
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`Файл "${file.name}" превышает максимальный размер ${formatFileSize(MAX_FILE_SIZE)}`);
        }
      }

      // Проверяем общий размер
      const currentTotal = getTotalSize();
      const newFilesTotal = files.reduce((sum, f) => sum + f.size, 0);
      if (currentTotal + newFilesTotal > MAX_TOTAL_SIZE) {
        throw new Error(`Общий размер файлов превышает ${formatFileSize(MAX_TOTAL_SIZE)}`);
      }

      // Загружаем файлы по очереди
      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        const response = await authFetch(
          `${EVENT_ENDPOINT}${eventId}/attachments`,
          {
            method: "POST",
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Не удалось загрузить файл "${file.name}"`);
        }
      }

      // Очищаем input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      // Обновляем список
      if (onAttachmentsChange) {
        onAttachmentsChange();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файлов");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!canManage) return;

    if (!confirm("Удалить этот файл?")) return;

    try {
      const response = await authFetch(
        `${EVENT_ENDPOINT}attachments/${attachmentId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error("Не удалось удалить файл");
      }

      if (onAttachmentsChange) {
        onAttachmentsChange();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления файла");
    }
  };

  const handleDownload = async (attachment: EventAttachment) => {
    try {
      const response = await authFetch(
        `${EVENT_ENDPOINT}attachments/${attachment.id}/download`,
        {}
      );

      if (!response.ok) {
        throw new Error("Не удалось скачать файл");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = attachment.original_filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка скачивания файла");
    }
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) return "🖼️";
    if (contentType.includes("pdf")) return "📄";
    if (contentType.includes("word") || contentType.includes("document")) return "📝";
    if (contentType.includes("excel") || contentType.includes("spreadsheet")) return "📊";
    if (contentType.includes("zip") || contentType.includes("archive")) return "📦";
    return "📎";
  };

  const totalSize = getTotalSize();
  const remainingSize = MAX_TOTAL_SIZE - totalSize;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Вложения</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {attachments.length > 0
              ? `${attachments.length} ${attachments.length === 1 ? "файл" : "файлов"} (${formatFileSize(totalSize)})`
              : "Нет вложений"}
          </p>
        </div>
        {canManage && eventId && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || remainingSize <= 0}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Добавить файл
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading || remainingSize <= 0}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Загрузка файлов...
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:bg-slate-50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-xl">
                {getFileIcon(attachment.content_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {attachment.original_filename}
                </p>
                <p className="text-xs text-slate-500">
                  {formatFileSize(attachment.file_size)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownload(attachment)}
                  className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
                  title="Скачать"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment.id)}
                    className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-600 transition hover:bg-red-100"
                    title="Удалить"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && eventId && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <p>Максимум: {formatFileSize(MAX_TOTAL_SIZE)} на событие</p>
          <p>Максимум: {formatFileSize(MAX_FILE_SIZE)} на файл</p>
          {remainingSize > 0 && (
            <p className="mt-1 font-medium text-slate-700">
              Осталось: {formatFileSize(remainingSize)}
            </p>
          )}
          {remainingSize <= 0 && (
            <p className="mt-1 font-medium text-red-600">
              Достигнут лимит размера файлов
            </p>
          )}
        </div>
      )}
    </div>
  );
}

