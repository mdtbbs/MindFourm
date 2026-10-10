'use client';

import { useCallback, useRef, useState, type PointerEvent, type WheelEvent, type ReactNode } from 'react';
import { Maximize2, Minus, Plus, Scan } from 'lucide-react';

type Point = { x: number; y: number };

export function EditorViewport({ children, minZoom = 0.35, maxZoom = 4, className = '', contentWidth, contentHeight }:
  { children: ReactNode; minZoom?: number; maxZoom?: number; className?: string; contentWidth?: number; contentHeight?: number }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const touchTargets = useRef(new Map<number, EventTarget | null>());
  const suppressedCancels = useRef(new Set<number>());
  const pinching = useRef(false);
  const gesture = useRef<{ distance: number; zoom: number; center: Point; anchor: Point } | null>(null);
  const panStart = useRef<{ pointer: number; origin: Point; start: Point } | null>(null);
  const clampZoom = useCallback((value: number) => Math.max(minZoom, Math.min(maxZoom, value)), [maxZoom, minZoom]);
  const zoomBy = (factor: number) => setZoom((value) => clampZoom(value * factor));
  const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const fitContent = () => {
    const bounds = viewport.current?.getBoundingClientRect();
    if (!bounds || !contentWidth || !contentHeight) return;
    const nextZoom = clampZoom(Math.min((bounds.width - 32) / contentWidth, (bounds.height - 32) / contentHeight));
    setZoom(nextZoom);
    setPan({ x: Math.max(0, (bounds.width - contentWidth * nextZoom) / 2), y: Math.max(0, (bounds.height - contentHeight * nextZoom) / 2) });
  };

  const cancelChildTouch = (pointerId: number) => {
    const target = touchTargets.current.get(pointerId);
    if (!(target instanceof Element)) return;
    suppressedCancels.current.add(pointerId);
    target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, cancelable: true, pointerId, pointerType: 'touch', button: 0, buttons: 0 }));
  };
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch') return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    touchTargets.current.set(event.pointerId, event.target);
    if (pointers.current.size < 2) return;
    event.preventDefault();
    event.stopPropagation();
    if (!pinching.current) {
      pinching.current = true;
      const [first, second] = [...pointers.current.values()];
      const bounds = event.currentTarget.getBoundingClientRect();
      const center = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const localCenter = { x: center.x - bounds.left, y: center.y - bounds.top };
      gesture.current = {
        distance: Math.hypot(first.x - second.x, first.y - second.y), zoom,
        center: localCenter, anchor: { x: (localCenter.x - pan.x) / zoom, y: (localCenter.y - pan.y) / zoom },
      };
      cancelChildTouch([...pointers.current.keys()][0]);
    }
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* the pointer may already have been released */ }
  };
  const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!pinching.current || !pointers.current.has(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...pointers.current.values()];
    if (points.length < 2 || !gesture.current) return;
    const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const center = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const bounds = event.currentTarget.getBoundingClientRect();
    const localCenter = { x: center.x - bounds.left, y: center.y - bounds.top };
    const nextZoom = clampZoom(gesture.current.zoom * distance / Math.max(1, gesture.current.distance));
    setZoom(nextZoom);
    setPan({ x: localCenter.x - gesture.current.anchor.x * nextZoom, y: localCenter.y - gesture.current.anchor.y * nextZoom });
  };
  const onPointerUpCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (suppressedCancels.current.delete(event.pointerId)) { event.preventDefault(); event.stopPropagation(); return; }
    if (!pointers.current.has(event.pointerId)) return;
    if (!pinching.current) {
      pointers.current.delete(event.pointerId);
      touchTargets.current.delete(event.pointerId);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const remaining = [...pointers.current.keys()].filter((id) => id !== event.pointerId);
    pointers.current.clear();
    touchTargets.current.delete(event.pointerId);
    gesture.current = null;
    pinching.current = false;
    for (const id of remaining) cancelChildTouch(id);
    touchTargets.current.clear();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    if (event.button === 1 || event.button === 2 || event.altKey) {
      event.preventDefault();
      panStart.current = { pointer: event.pointerId, origin: pan, start: { x: event.clientX, y: event.clientY } };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (panStart.current?.pointer === event.pointerId) {
      setPan({ x: panStart.current.origin.x + event.clientX - panStart.current.start.x, y: panStart.current.origin.y + event.clientY - panStart.current.start.y });
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (panStart.current?.pointer === event.pointerId) panStart.current = null;
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    zoomBy(event.deltaY < 0 ? 1.12 : 0.89);
  };
  return <div ref={viewport} className={`relative min-h-0 overflow-hidden bg-[#111820] ${className}`} onPointerDownCapture={onPointerDownCapture} onPointerMoveCapture={onPointerMoveCapture} onPointerUpCapture={onPointerUpCapture} onPointerCancelCapture={onPointerUpCapture} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel} onContextMenu={(event) => event.preventDefault()} style={{ touchAction: 'none' }}>
    <div className="absolute inset-0 overflow-auto overscroll-contain">
      <div className="min-h-full min-w-full" style={{ width: contentWidth ? contentWidth * zoom : undefined, height: contentHeight ? contentHeight * zoom : undefined }}>
        <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'top left', width: contentWidth, height: contentHeight }}>{children}</div>
      </div>
    </div>
    <div className="absolute bottom-2 right-2 z-20 flex border border-white/20 bg-[#111820]/95 text-white shadow">
      <button type="button" onClick={() => zoomBy(0.8)} className="flex h-10 w-10 items-center justify-center" aria-label="缩小"><Minus className="h-4 w-4" /></button>
      <button type="button" onClick={resetView} className="flex h-10 min-w-12 items-center justify-center gap-1 px-2 text-xs" aria-label="重置视图"><Maximize2 className="h-3.5 w-3.5" />{Math.round(zoom * 100)}%</button>
      {contentWidth && contentHeight ? <button type="button" onClick={fitContent} className="flex h-10 w-10 items-center justify-center" aria-label="适配画布"><Scan className="h-4 w-4" /></button> : null}
      <button type="button" onClick={() => zoomBy(1.25)} className="flex h-10 w-10 items-center justify-center" aria-label="放大"><Plus className="h-4 w-4" /></button>
    </div>
  </div>;
}
