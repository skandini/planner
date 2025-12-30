/**
 * Утилиты для мониторинга производительности
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private readonly maxMetrics = 100; // Храним последние 100 метрик

  /**
   * Измеряет время выполнения функции
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration, metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(name, duration, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Синхронная версия measure
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.recordMetric(name, duration, metadata);
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.recordMetric(name, duration, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Записывает метрику
   */
  private recordMetric(
    name: string,
    duration: number,
    metadata?: Record<string, unknown>
  ): void {
    const metric: PerformanceMetric = {
      name,
      duration,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Ограничиваем количество метрик
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Логируем медленные операции в development
    if (process.env.NODE_ENV === "development" && duration > 1000) {
      console.warn(`[Performance] Slow operation: ${name} took ${duration.toFixed(2)}ms`, metadata);
    }

    // Отправляем метрики на сервер в production (можно настроить)
    if (process.env.NODE_ENV === "production" && duration > 2000) {
      this.sendMetricToServer(metric);
    }
  }

  /**
   * Отправляет метрику на сервер для анализа
   */
  private sendMetricToServer(metric: PerformanceMetric): void {
    // В будущем можно интегрировать с APM системой
    // Например: Sentry, DataDog, или собственная система метрик
    if (typeof window !== "undefined" && "navigator" in window) {
      // Можно использовать navigator.sendBeacon для отправки метрик
      try {
        const endpoint = "/api/metrics";
        const data = JSON.stringify(metric);
        navigator.sendBeacon(endpoint, data);
      } catch (error) {
        // Игнорируем ошибки отправки метрик
      }
    }
  }

  /**
   * Получает все метрики
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Получает метрики по имени
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.name === name);
  }

  /**
   * Получает среднее время выполнения для операции
   */
  getAverageDuration(name: string): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;
    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Очищает все метрики
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Получает статистику производительности
   */
  getStats(): {
    totalOperations: number;
    averageDuration: number;
    slowOperations: PerformanceMetric[];
    operationsByName: Record<string, { count: number; avgDuration: number }>;
  } {
    const slowOperations = this.metrics.filter((m) => m.duration > 1000);
    const totalDuration = this.metrics.reduce((sum, m) => sum + m.duration, 0);
    const averageDuration =
      this.metrics.length > 0 ? totalDuration / this.metrics.length : 0;

    const operationsByName: Record<
      string,
      { count: number; avgDuration: number }
    > = {};
    this.metrics.forEach((metric) => {
      if (!operationsByName[metric.name]) {
        operationsByName[metric.name] = { count: 0, avgDuration: 0 };
      }
      operationsByName[metric.name].count++;
    });

    Object.keys(operationsByName).forEach((name) => {
      const avg = this.getAverageDuration(name);
      operationsByName[name].avgDuration = avg;
    });

    return {
      totalOperations: this.metrics.length,
      averageDuration,
      slowOperations,
      operationsByName,
    };
  }
}

// Singleton экземпляр
export const performanceMonitor = new PerformanceMonitor();

/**
 * React Hook для измерения производительности компонентов
 */
export function usePerformanceMonitor() {
  return performanceMonitor;
}

