/**
 * Централизованная система логирования
 * Заменяет console.log/error/warn для лучшего контроля в production
 */

type LogLevel = "log" | "error" | "warn" | "info" | "debug";

class Logger {
  private isDevelopment = process.env.NODE_ENV === "development";

  private shouldLog(level: LogLevel): boolean {
    // В production логируем только ошибки
    if (!this.isDevelopment) {
      return level === "error";
    }
    return true;
  }

  log(...args: unknown[]): void {
    if (this.shouldLog("log")) {
      console.log(...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.shouldLog("error")) {
      console.error(...args);
      // В production можно отправлять ошибки на сервер
      if (!this.isDevelopment) {
        this.sendErrorToServer(args);
      }
    }
  }

  warn(...args: unknown[]): void {
    if (this.shouldLog("warn")) {
      console.warn(...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.shouldLog("info")) {
      console.info(...args);
    }
  }

  debug(...args: unknown[]): void {
    if (this.shouldLog("debug")) {
      console.debug(...args);
    }
  }

  private sendErrorToServer(args: unknown[]): void {
    // В будущем можно интегрировать с Sentry, LogRocket и т.д.
    try {
      if (typeof window !== "undefined" && "navigator" in window) {
        const errorData = {
          message: args.map(String).join(" "),
          timestamp: new Date().toISOString(),
          url: window.location.href,
          userAgent: navigator.userAgent,
        };
        // Используем sendBeacon для отправки ошибок
        navigator.sendBeacon("/api/logs/error", JSON.stringify(errorData));
      }
    } catch {
      // Игнорируем ошибки отправки логов
    }
  }
}

export const logger = new Logger();

