"use client";

import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="mx-auto max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-semibold text-slate-900">
          Регистрация недоступна
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Регистрация новых пользователей отключена. Учётные записи создаются администратором.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-800">
            Если вам нужен доступ к системе, обратитесь к администратору для создания учётной записи.
          </p>
        </div>

        <div className="mt-6">
          <Link
            href="/login"
            className="block w-full rounded-2xl bg-lime-500 px-4 py-3 text-center font-semibold text-white transition hover:bg-lime-400"
          >
            Вернуться к входу
          </Link>
        </div>
      </div>
    </div>
  );
}
