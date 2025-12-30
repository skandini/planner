"use client";

import { useEffect, useRef } from "react";

interface ShaderGradientBackgroundProps {
  className?: string;
}

export function ShaderGradientBackground({ className = "" }: ShaderGradientBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Устанавливаем размеры canvas
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Параметры градиента (из вашего ShaderGradient)
    const color1 = { r: 115, g: 191, b: 196 }; // #73bfc4
    const color2 = { r: 255, g: 129, b: 10 };  // #ff810a
    const color3 = { r: 141, g: 160, b: 206 }; // #8da0ce

    let time = 0;
    const speed = 0.3;
    const frequency = 5.5;
    const amplitude = 0.5;
    const density = 0.8;
    const strength = 0.3;

    // Функция для интерполяции цветов
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const lerpColor = (c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, t: number) => ({
      r: Math.floor(lerp(c1.r, c2.r, t)),
      g: Math.floor(lerp(c1.g, c2.g, t)),
      b: Math.floor(lerp(c1.b, c2.b, t)),
    });

    // Функция для создания градиента с шумом
    const drawGradient = () => {
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const index = (y * canvas.width + x) * 4;

          // Нормализуем координаты от 0 до 1
          const nx = x / canvas.width;
          const ny = y / canvas.height;

          // Создаем волновой паттерн
          const wave1 = Math.sin((nx * frequency + time * speed) * Math.PI * 2) * amplitude;
          const wave2 = Math.sin((ny * frequency + time * speed * 0.7) * Math.PI * 2) * amplitude;
          const wave3 = Math.sin(((nx + ny) * frequency * 0.5 + time * speed * 1.2) * Math.PI * 2) * amplitude;

          // Комбинируем волны
          const combined = (wave1 + wave2 + wave3) / 3;

          // Создаем градиент от color1 через color2 к color3
          let t = (nx + ny) / 2 + combined * strength;
          t = Math.max(0, Math.min(1, t));

          let color;
          if (t < 0.5) {
            color = lerpColor(color1, color2, t * 2);
          } else {
            color = lerpColor(color2, color3, (t - 0.5) * 2);
          }

          // Применяем плотность (brightness)
          const brightness = 0.8;
          color.r = Math.floor(color.r * brightness);
          color.g = Math.floor(color.g * brightness);
          color.b = Math.floor(color.b * brightness);

          // Добавляем зерно (grain)
          const grain = (Math.random() - 0.5) * 10 * density;
          color.r = Math.max(0, Math.min(255, color.r + grain));
          color.g = Math.max(0, Math.min(255, color.g + grain));
          color.b = Math.max(0, Math.min(255, color.b + grain));

          data[index] = color.r;     // R
          data[index + 1] = color.g;   // G
          data[index + 2] = color.b;  // B
          data[index + 3] = 200;      // A (прозрачность для читаемости)
        }
      }

      ctx.putImageData(imageData, 0, 0);
      time += 0.01;
    };

    // Анимация
    const animate = () => {
      drawGradient();
      animationFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 pointer-events-none ${className}`}
      style={{
        zIndex: 0,
        opacity: 0.15, // Низкая непрозрачность для читаемости
        mixBlendMode: "multiply",
      }}
    />
  );
}

