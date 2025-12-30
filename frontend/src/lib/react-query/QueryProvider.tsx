"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Время, в течение которого данные считаются свежими
            staleTime: 5 * 60 * 1000, // 5 минут
            // Время кеширования данных
            gcTime: 10 * 60 * 1000, // 10 минут (было cacheTime)
            // Повторные попытки при ошибке
            retry: 1,
            // Рефетч при фокусе окна
            refetchOnWindowFocus: false,
            // Рефетч при переподключении
            refetchOnReconnect: true,
          },
          mutations: {
            // Повторные попытки при ошибке мутаций
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
}

