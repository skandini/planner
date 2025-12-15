"use client";

import { useState, useRef, useEffect } from "react";
import type { AuthenticatedFetch } from "@/lib/api/baseApi";
import { TICKETS_ENDPOINT, API_BASE_URL } from "@/lib/constants";

interface TicketAttachment {
  id: string;
  ticket_id: string;
  original_filename: string;
  file_size: number;
  content_type: string;
  created_at: string;
  uploaded_by: string;
}

interface TicketAttachmentsSectionProps {
  ticketId: string | null;
  authFetch: AuthenticatedFetch;
  onAttachmentsChange?: () => void;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 МБ
const MAX_TOTAL_SIZE = 20 * 1024 * 1024; // 20 МБ

export function TicketAttachmentsSection({
  ticketId,
  authFetch,
  onAttachmentsChange,
}: TicketAttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  const getFileIcon = (contentType: string) => {
    if (contentType.startsWith("image/")) return "🖼️";
    if (contentType.includes("pdf")) return "📄";
    if (contentType.includes("word") || contentType.includes("document")) return "📝";
    if (contentType.includes("excel") || contentType.includes("spreadsheet")) return "📊";
    if (contentType.includes("zip") || contentType.includes("archive")) return "📦";
    return "📎";
  };

  const loadAttachments = async () => {
    if (!ticketId) return;

    setLoading(true);
    try {
      const response = await authFetch(`${TICKETS_ENDPOINT}${ticketId}/attachments`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = await response.json();
        setAttachments(data);
      }
    } catch (err) {
      console.error("Failed to load attachments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      loadAttachments();
    }
  }, [ticketId]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!ticketId) return;

    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setError(null);

    try {
      for (const file of files) {
        if (file.size > MAX_FILE_SIZE) {
          throw new Error(`Файл "${file.name}" превышает максимальный размер ${formatFileSize(MAX_FILE_SIZE)}`);
        }

        setUploading(true);
        const formData = new FormData();
        formData.append("file", file);

        const response = await authFetch(`${TICKETS_ENDPOINT}${ticketId}/attachments`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `Не удалось загрузить файл "${file.name}"`);
        }
      }

      await loadAttachments();
      if (onAttachmentsChange) {
        onAttachmentsChange();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файлов");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDownload = async (attachment: TicketAttachment) => {
    try {
      const response = await authFetch(`${API_BASE_URL}/tickets/attachments/${attachment.id}/download`);
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

  const handleDelete = async (attachmentId: string) => {
    if (!ticketId || !confirm("Удалить этот файл?")) return;

    try {
      const response = await authFetch(`${API_BASE_URL}/tickets/attachments/${attachmentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Не удалось удалить файл");
      }

      await loadAttachments();
      if (onAttachmentsChange) {
        onAttachmentsChange();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления файла");
    }
  };

  if (!ticketId) return null;

  const totalSize = attachments.reduce((sum, att) => sum + att.file_size, 0);
  const remainingSize = MAX_TOTAL_SIZE - totalSize;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-slate-900">Вложения</h3>
          <span className="text-xs text-slate-500">
            {attachments.length > 0 ? `(${attachments.length} файлов)` : "Нет вложений"}
          </span>
        </div>
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
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-lime-500"></div>
          Загрузка...
        </div>
      )}

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
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] text-slate-600">
        <span>Макс: {formatFileSize(MAX_TOTAL_SIZE)}/тикет, {formatFileSize(MAX_FILE_SIZE)}/файл</span>
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
    </div>
  );
}

