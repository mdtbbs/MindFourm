'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, PointerEvent } from 'react';

export type CanvasPoint = { x: number; y: number };
export default function EditorCanvas({ width, height, zoom, setZoom, label, children, onPoint, onDrag, pan = false, invertY = false }: {
  width: number; height: number; zoom: number; setZoom: (value: number) => void; label: string; children: ReactNode;
  onPoint?: (point: CanvasPoint, event: PointerEvent<SVGSVGElement>) => void;
  onDrag?: (from: CanvasPoint, to: CanvasPoint, event: PointerEvent<SVGSVGElement>, path: CanvasPoint[]) => void;
  pan?: boolean; invertY?: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ from: CanvasPoint; x: number; y: number; moved: boolean; pan: boolean; pinch: boolean; path: CanvasPoint[] } | null>(null);
  const [rectangle, setRectangle] = useState<{ from: CanvasPoint; to: CanvasPoint } | null>(null);
  const [space, setSpace] = useState(false);
  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = svg.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(width - 1, Math.floor((event.clientX - box.left) / box.width * width)));
    const row = Math.max(0, Math.min(height - 1, Math.floor((event.clientY - box.top) / box.height * height)));
    return { x, y: invertY ? height - 1 - row : row };
  };
  useEffect(() => {
    const element = viewport.current; if (!element) return;
    const wheel = (event: WheelEvent) => { event.preventDefault(); setZoom(Math.max(2, Math.min(48, zoom * (event.deltaY < 0 ? 1.12 : .89)))); };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [zoom, setZoom]);
  const fit = () => setZoom(Math.max(2, Math.min(36, (viewport.current!.clientWidth - 16) / width)));
  return <div className="min-w-0 space-y-2" onKeyDown={event => { if (event.code === 'Space' && event.target === event.currentTarget) { event.preventDefault(); setSpace(true); } }} onKeyUp={event => { if (event.code === 'Space') setSpace(false); }} tabIndex={0}>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={fit} className="min-h-11 border border-[var(--border)] px-3 text-sm">适应画布</button><button type="button" onClick={() => setZoom(18)} className="min-h-11 border border-[var(--border)] px-3 text-sm">100%</button><span className="self-center text-xs text-[var(--text-muted)]">滚轮缩放 · 中键或空格拖动 · 双指缩放{pan ? ' · 单指平移' : ''}</span></div>
    <div ref={viewport} className="max-h-[65vh] min-w-0 overflow-auto overscroll-contain border border-[var(--border)] bg-[#111820] p-2">
      <svg ref={svg} role="grid" aria-label={label} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`} className="block touch-none select-none"
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); gesture.current = { from: point(event), x: event.clientX, y: event.clientY, moved: false, pan: pan || space || event.button === 1, pinch: pointers.current.size > 1, path: [point(event)] }; }}
        onPointerMove={event => {
          const previous = pointers.current.get(event.pointerId); if (!previous || !gesture.current) return;
          if (pointers.current.size > 1) {
            const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
            if (other) { const before = Math.hypot(previous.x - other.x, previous.y - other.y); const after = Math.hypot(event.clientX - other.x, event.clientY - other.y); if (before > 0) setZoom(Math.max(2, Math.min(48, zoom * after / before))); }
            gesture.current.pinch = true;
          } else if (gesture.current.pan && viewport.current) { viewport.current.scrollLeft -= event.clientX - previous.x; viewport.current.scrollTop -= event.clientY - previous.y; }
          else if (onDrag) { const position = point(event); if (gesture.current.path.length < 10000) gesture.current.path.push(position); setRectangle({ from: gesture.current.from, to: position }); }
          if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 4) gesture.current.moved = true;
          pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }}
        onPointerUp={event => { const current = gesture.current; pointers.current.delete(event.pointerId); setRectangle(null); if (current && !current.pan && !current.pinch) { if (current.moved && onDrag) onDrag(current.from, point(event), event, [...current.path, point(event)]); else onPoint?.(point(event), event); } if (!pointers.current.size) gesture.current = null; }}
        onPointerCancel={() => { pointers.current.clear(); gesture.current = null; setRectangle(null); }}>
        {children}
        {rectangle ? <rect pointerEvents="none" x={Math.min(rectangle.from.x, rectangle.to.x)} y={invertY ? height - 1 - Math.max(rectangle.from.y, rectangle.to.y) : Math.min(rectangle.from.y, rectangle.to.y)} width={Math.abs(rectangle.to.x - rectangle.from.x) + 1} height={Math.abs(rectangle.to.y - rectangle.from.y) + 1} fill="#71b7ff33" stroke="#71b7ff" strokeWidth=".15" /> : null}
      </svg>
    </div>
  </div>;
}
