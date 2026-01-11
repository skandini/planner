"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { useAuth } from "@/context/AuthContext";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const url = `${API_BASE_URL}/auth/login`;
      console.log("[Login] Attempting login to:", url);
      console.log("[Login] Email:", email);
      
      // Добавляем таймаут для запроса
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 секунд таймаут
      
      console.log("[Login] Sending request...");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        mode: "cors",
        credentials: "omit",
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log("[Login] Response status:", response.status, response.ok);
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        console.error("[Login] Error response:", response.status, data);
        throw new Error(data.detail || `Не удалось войти (${response.status})`);
      }
      const data = await response.json();
      console.log("[Login] Success, received tokens");
      
      login({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        userEmail: email,
      });
      
      console.log("[Login] Redirecting to home page");
      router.push("/");
    } catch (err) {
      console.error("[Login] Exception:", err);
      
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          setError("Запрос превысил время ожидания. Проверьте, что backend сервер запущен на http://localhost:8000");
        } else if (err.message.includes('fetch')) {
          setError("Не удалось подключиться к серверу. Проверьте, что backend запущен на http://localhost:8000");
        } else {
          setError(err.message);
        }
      } else {
        setError("Произошла ошибка при входе");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">Вход в систему</h1>
        <p className="mt-2 text-sm text-slate-500">
          Используйте корпоративную почту, чтобы перейти в календарь.
        </p>

        {error && (
          <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
              required
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            Пароль
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-slate-900 outline-none focus:border-lime-500"
              required
            />
          </label>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-lime-500 px-4 py-3 font-semibold text-white transition hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Входим…" : "Войти"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-lime-600 hover:underline">
            Зарегистрируйтесь
          </Link>
        </p>
      </div>
    </div>
  );
}

