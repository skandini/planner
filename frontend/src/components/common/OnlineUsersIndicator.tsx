"use client";

import { useEffect, useState, useCallback } from "react";
import { useTheme } from "@/context/ThemeContext";

interface OnlineUsersIndicatorProps {
  authFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  className?: string;
}

interface OnlineStats {
  online_count: number;
  total_users: number;
  last_updated: string;
}

export function OnlineUsersIndicator({ authFetch, className = "" }: OnlineUsersIndicatorProps) {
  const [stats, setStats] = useState<OnlineStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme } = useTheme();

  const fetchOnlineStats = useCallback(async () => {
    try {
      const res = await authFetch("/api/v1/users/online/");
      if (!res.ok) {
        throw new Error("Failed to fetch online stats");
      }
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error("Error fetching online stats:", err);
      setError("Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  // Initial fetch
  useEffect(() => {
    fetchOnlineStats();
  }, [fetchOnlineStats]);

  // Polling every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchOnlineStats, 30000);
    return () => clearInterval(interval);
  }, [fetchOnlineStats]);

  // Update user's last activity on various interactions
  useEffect(() => {
    const updateActivity = async () => {
      try {
        await authFetch("/api/v1/users/activity/", { method: "POST" });
      } catch {
        // Silently ignore activity update errors
      }
    };

    // Update on focus
    const handleFocus = () => updateActivity();
    
    // Update on visibility change
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        updateActivity();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    // Initial activity update
    updateActivity();

    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [authFetch]);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
        theme === "dark" 
          ? "bg-slate-800 border border-slate-600" 
          : "bg-white/60 border border-slate-200"
      } ${className}`}>
        <div className="w-2 h-2 rounded-full bg-slate-400 animate-pulse" />
        <span className={`text-xs font-medium ${
          theme === "dark" ? "text-slate-400" : "text-slate-500"
        }`}>
          ...
        </span>
      </div>
    );
  }

  if (error || !stats) {
    return null; // Don't show anything on error
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-default transition-all ${
        theme === "dark"
          ? "bg-slate-800/80 border border-slate-600 hover:bg-slate-700"
          : "bg-white/60 backdrop-blur-sm border border-slate-200/60 hover:bg-white/80"
      } ${className}`}
      title={`${stats.online_count} из ${stats.total_users} пользователей онлайн`}
    >
      {/* Green pulsing dot */}
      <div className="relative">
        <div className="w-2.5 h-2.5 rounded-full bg-green-500 online-pulse" />
        <div className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-75" />
      </div>
      
      {/* Count */}
      <span className={`text-xs font-semibold tabular-nums ${
        theme === "dark" ? "text-green-400" : "text-green-600"
      }`}>
        {stats.online_count}
      </span>
      
      {/* Label */}
      <span className={`text-xs font-medium ${
        theme === "dark" ? "text-slate-400" : "text-slate-500"
      }`}>
        онлайн
      </span>
    </div>
  );
}

