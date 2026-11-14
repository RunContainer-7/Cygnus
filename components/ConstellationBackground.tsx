"use client";

import { useEffect, useRef } from "react";

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  speed: number;
  phase: number;
  depth: number;
};

type Meteor = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
};

const CYGNUS = [
  { x: 0.62, y: 0.1, radius: 3.4 },
  { x: 0.55, y: 0.34, radius: 2.3 },
  { x: 0.38, y: 0.37, radius: 1.9 },
  { x: 0.74, y: 0.36, radius: 1.7 },
  { x: 0.57, y: 0.65, radius: 2.6 },
  { x: 0.68, y: 0.2, radius: 1.2 },
  { x: 0.43, y: 0.16, radius: 1.1 },
];

const EDGES: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [0, 5],
  [0, 6],
  [2, 6],
  [3, 5],
];

export default function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let meteors: Meteor[] = [];
    let frame = 0;
    let raf = 0;
    let nextMeteor = 2600;
    let paused = false;

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    const seedStars = () => {
      const count = Math.min(260, Math.round((width * height) / 9000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.35 + Math.random() * 1.15,
        alpha: 0.18 + Math.random() * 0.55,
        speed: 0.4 + Math.random() * 1.4,
        phase: Math.random() * Math.PI * 2,
        depth: 0.25 + Math.random() * 0.75,
      }));
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedStars();
      if (reduceMotion) draw(0);
    };

    const drawConstellation = (time: number) => {
      const dense = width > 900;
      const centerX = width * (dense ? 0.63 : 0.5);
      const centerY = height * (dense ? 0.48 : 0.58);
      const size = Math.min(width, height) * (dense ? 0.92 : 0.78);
      const offsetX = pointer.x * 16;
      const offsetY = pointer.y * 12;

      const points = CYGNUS.map((point) => ({
        x: centerX + (point.x - 0.55) * size + offsetX,
        y: centerY + (point.y - 0.38) * size + offsetY,
        radius: point.radius * (dense ? 1 : 0.85),
      }));

      context.save();
      context.strokeStyle = "rgba(158, 186, 255, 0.2)";
      context.lineWidth = 1;
      for (const [from, to] of EDGES) {
        const start = points[from];
        const end = points[to];
        const gradient = context.createLinearGradient(start.x, start.y, end.x, end.y);
        gradient.addColorStop(0, "rgba(170, 196, 255, 0.32)");
        gradient.addColorStop(0.5, "rgba(190, 173, 255, 0.18)");
        gradient.addColorStop(1, "rgba(170, 196, 255, 0.28)");
        context.strokeStyle = gradient;
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }

      const twinkle = 0.86 + Math.sin(time * 0.0007) * 0.14;
      for (const point of points) {
        const glow = context.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          point.radius * 7,
        );
        glow.addColorStop(0, "rgba(225, 235, 255, 0.85)");
        glow.addColorStop(0.35, "rgba(168, 196, 255, 0.28)");
        glow.addColorStop(1, "rgba(150, 180, 255, 0)");
        context.fillStyle = glow;
        context.beginPath();
        context.arc(point.x, point.y, point.radius * 7, 0, Math.PI * 2);
        context.fill();

        context.fillStyle = `rgba(240, 246, 255, ${0.92 * twinkle})`;
        context.beginPath();
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    };

    const draw = (time: number) => {
      context.clearRect(0, 0, width, height);

      pointer.x += (pointer.tx - pointer.x) * 0.045;
      pointer.y += (pointer.ty - pointer.y) * 0.045;

      for (const star of stars) {
        const shimmer = 0.62 + 0.38 * Math.sin(time * 0.001 * star.speed + star.phase);
        context.fillStyle = `rgba(214, 226, 255, ${star.alpha * shimmer})`;
        context.beginPath();
        context.arc(
          star.x + pointer.x * 8 * star.depth,
          star.y + pointer.y * 6 * star.depth,
          star.radius,
          0,
          Math.PI * 2,
        );
        context.fill();
      }

      drawConstellation(time);

      for (const meteor of meteors) {
        const progress = 1 - meteor.life / meteor.maxLife;
        const tailX = meteor.x - meteor.vx * 9;
        const tailY = meteor.y - meteor.vy * 9;
        const fade = Math.sin(progress * Math.PI);
        const gradient = context.createLinearGradient(meteor.x, meteor.y, tailX, tailY);
        gradient.addColorStop(0, `rgba(230, 240, 255, ${0.7 * fade})`);
        gradient.addColorStop(1, "rgba(230, 240, 255, 0)");
        context.strokeStyle = gradient;
        context.lineWidth = 1.2;
        context.beginPath();
        context.moveTo(meteor.x, meteor.y);
        context.lineTo(tailX, tailY);
        context.stroke();
      }
    };

    const tick = (time: number) => {
      if (!paused) {
        draw(time);

        for (const meteor of meteors) {
          meteor.x += meteor.vx;
          meteor.y += meteor.vy;
          meteor.life -= 1;
        }
        meteors = meteors.filter((meteor) => meteor.life > 0);

        if (!reduceMotion && time > nextMeteor) {
          nextMeteor = time + 4200 + Math.random() * 5200;
          const startX = width * (0.25 + Math.random() * 0.6);
          const startY = height * (0.05 + Math.random() * 0.35);
          meteors.push({
            x: startX,
            y: startY,
            vx: -2.4 - Math.random() * 1.6,
            vy: 1.1 + Math.random() * 0.7,
            life: 70,
            maxLife: 70,
          });
        }
      }
      raf = window.requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.tx = (event.clientX / window.innerWidth - 0.5) * 2;
      pointer.ty = (event.clientY / window.innerHeight - 0.5) * 2;
    };

    const onVisibility = () => {
      paused = document.hidden;
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove);
    document.addEventListener("visibilitychange", onVisibility);

    if (reduceMotion) {
      draw(0);
    } else {
      raf = window.requestAnimationFrame(tick);
    }

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      void frame;
    };
  }, []);

  return <canvas ref={canvasRef} className="constellation" aria-hidden="true" />;
}
