'use client';
import { useEffect, useState } from 'react';
import { useEditorCatalog } from './content-picker';

const textures = new Map<string, Promise<HTMLImageElement | null>>();
function texture(url: string) {
  if (!textures.has(url)) textures.set(url, new Promise(resolve => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => resolve(null); image.src = url; }));
  return textures.get(url)!;
}
export default function MapTileImage({ width, height, cells }: { width: number; height: number; cells: Array<{ x: number; y: number; floor: string; overlay: string }> }) {
  const [url, setUrl] = useState('');
  const { items } = useEditorCatalog();
  useEffect(() => {
    let active = true;
    void (async () => {
      const names = new Set(cells.flatMap(cell => [cell.floor, cell.overlay]));
      const images = new Map(await Promise.all(items.filter(item => item.type === 'block' && item.icon && names.has(item.name)).map(async item => [item.name, await texture(item.icon!)] as const)));
      if (!active) return;
      const scale = 8; const canvas = document.createElement('canvas'); canvas.width = width*scale; canvas.height = height*scale;
      const context = canvas.getContext('2d'); if (!context) return;
      context.imageSmoothingEnabled = false; context.fillStyle = '#111820'; context.fillRect(0, 0, canvas.width, canvas.height);
      for (const cell of cells) {
        const floor = images.get(cell.floor), overlay = images.get(cell.overlay);
        if (floor) context.drawImage(floor, cell.x*scale, cell.y*scale, scale, scale);
        else { context.fillStyle = cell.floor.includes('water') ? '#337c9e' : cell.floor.includes('sand') ? '#bd9958' : /snow|ice/.test(cell.floor) ? '#a9d7e3' : '#7b7770'; context.fillRect(cell.x*scale, cell.y*scale, scale, scale); }
        if (cell.overlay !== 'air') {
          if (overlay) context.drawImage(overlay, cell.x*scale, cell.y*scale, scale, scale);
          else { context.fillStyle = '#f4d35e'; context.fillRect((cell.x+.25)*scale, (cell.y+.25)*scale, .5*scale, .5*scale); }
        }
      }
      setUrl(canvas.toDataURL());
    })();
    return () => { active = false; };
  }, [cells, height, items, width]);
  return url ? <image href={url} width={width} height={height} style={{ imageRendering: 'pixelated' }} /> : null;
}
