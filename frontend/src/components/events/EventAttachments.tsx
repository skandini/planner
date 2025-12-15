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
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 МБ
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 МБ

export function EventAttachments({
  eventId,
  attachments,
  authFetch,
  canManage,
  onAttachmentsChange,
  pendingFiles = [],
  onPendingFilesChange,
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
    const attachmentsSize = attachments.reduce((sum, att) => sum + att.file_size, 0);
    const pendingSize = pendingFiles.reduce((sum, file) => sum + file.size, 0);
    return attachmentsSize + pendingSize;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManage) return;

    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);

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

      // Если событие уже создано, загружаем файлы сразу
      if (eventId) {
        setUploading(true);
        try {
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

          // Обновляем список
          if (onAttachmentsChange) {
            onAttachmentsChange();
          }
        } finally {
          setUploading(false);
        }
      } else {
        // Если событие еще не создано, сохраняем файлы во временное состояние
        if (onPendingFilesChange) {
          onPendingFilesChange([...pendingFiles, ...files]);
        }
      }

      // Очищаем input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файлов");
    }
  };

  const handleDeletePendingFile = (index: number) => {
    if (!canManage || !onPendingFilesChange) return;
    const newFiles = pendingFiles.filter((_, i) => i !== index);
    onPendingFilesChange(newFiles);
  };

  const handleDelete = async (attachmentId: string) => {
    if (!canManage || !eventId) return;

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

  const getFileIconFromFile = (file: File) => {
    if (file.type.startsWith("image/")) return "🖼️";
    if (file.type.includes("pdf")) return "📄";
    if (file.type.includes("word") || file.type.includes("document")) return "📝";
    if (file.type.includes("excel") || file.type.includes("spreadsheet")) return "📊";
    if (file.type.includes("zip") || file.type.includes("archive")) return "📦";
    return "📎";
  };

  const totalSize = getTotalSize();
  const remainingSize = MAX_TOTAL_SIZE - totalSize;
  const totalFilesCount = attachments.length + pendingFiles.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-900">Вложения</h3>
          <span className="text-xs text-slate-500">
            {totalFilesCount > 0
              ? `(${totalFilesCount} ${totalFilesCount === 1 ? "файл" : "файлов"})`
              : "Нет вложений"}
          </span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || remainingSize <= 0}
            className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Добавить
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
        <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      {uploading && (
        <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
          Загрузка...
        </div>
      )}

      {/* Временные файлы (до создания события) */}
      {pendingFiles.length > 0 && (
        <div className="space-y-1">
          {pendingFiles.map((file, index) => (
            <div
              key={`pending-${index}`}
              className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded text-base">
                {getFileIconFromFile(file)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">
                  {file.name}
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatFileSize(file.size)}
                </p>
              </div>
              {canManage && onPendingFilesChange && (
                <button
                  type="button"
                  onClick={() => handleDeletePendingFile(index)}
                  className="rounded p-1 text-red-600 transition hover:bg-red-100"
                  title="Удалить"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Загруженные файлы */}
      {attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 transition hover:bg-slate-50"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded text-base">
                {getFileIcon(attachment.content_type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">
                  {attachment.original_filename}
                </p>
                <p className="text-[10px] text-slate-500">
                  {formatFileSize(attachment.file_size)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDownload(attachment)}
                  className="rounded p-1 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                  title="Скачать"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
                {canManage && eventId && (
                  <button
                    type="button"
                    onClick={() => handleDelete(attachment.id)}
                    className="rounded p-1 text-red-600 transition hover:bg-red-100"
                    title="Удалить"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
          <span>Макс: {formatFileSize(MAX_TOTAL_SIZE)}/событие, {formatFileSize(MAX_FILE_SIZE)}/файл</span>
          {remainingSize > 0 ? (
            <span className="font-medium text-slate-700">
              • Осталось: {formatFileSize(remainingSize)}
            </span>
          ) : (
            <span className="font-medium text-red-600">
              • Лимит достигнут
            </span>
          )}
        </div>
      )}
    </div>
  );
}
