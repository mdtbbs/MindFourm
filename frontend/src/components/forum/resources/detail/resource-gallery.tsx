'use client';

import { ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { useI18n } from '@/i18n/provider';

export default function ResourceGallery({
  title, images, index, contain, onSelect,
}: {
  title: string; images: string[]; index: number; contain: boolean; onSelect: (index: number) => void;
}) {
  const { t } = useI18n();
  const imageClass = contain ? 'object-contain' : 'object-cover';
  return <div className="w-full shrink-0 sm:w-80">
    <div className="relative aspect-[16/10] overflow-hidden bg-[var(--bg-elevated)] sm:rounded-md">
      {images[index] ? <img src={images[index]} alt={t('cards.previewAltNumbered', { title, index: index + 1 })} className={`h-full w-full ${imageClass}`} /> : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><Package className="h-14 w-14" aria-hidden /></div>}
      {images.length > 1 && <>
        <button type="button" onClick={() => onSelect((index - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 rounded-full bg-black/45 p-1 text-white" aria-label={t('cards.previousImage')}><ChevronLeft className="h-4 w-4" /></button>
        <button type="button" onClick={() => onSelect((index + 1) % images.length)} className="absolute right-2 top-1/2 rounded-full bg-black/45 p-1 text-white" aria-label={t('cards.nextImage')}><ChevronRight className="h-4 w-4" /></button>
      </>}
    </div>
    {images.length > 1 && <div className="mt-2 flex gap-2 overflow-x-auto">{images.map((image, imageIndex) => <button key={image} type="button" onClick={() => onSelect(imageIndex)} aria-label={t('cards.showImage', { index: imageIndex + 1 })} aria-pressed={index === imageIndex} className={`h-12 w-16 shrink-0 overflow-hidden rounded-md border-2 ${index === imageIndex ? 'border-[var(--primary)]' : 'border-transparent'}`}><img src={image} alt="" className={`h-full w-full ${imageClass}`} /></button>)}</div>}
  </div>;
}
