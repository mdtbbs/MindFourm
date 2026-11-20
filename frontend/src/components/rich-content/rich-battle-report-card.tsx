'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchV1 } from '@/lib/api/v1/transport';
import {
  battleReportLabel,
  formatBattleReportDuration,
  formatCompactNumber,
  isBattleReportPublicId,
  normalizeBattleReportPayload,
  seekSecondsForFraction,
  waveMarkers,
  type BattleReportData,
  type TimelapseMetricPoint,
} from '@/lib/timelapses/battle-report-data';
import { BattleReportCharts } from './battle-report-charts';

const PLAYBACK_RATES = [0.5, 1, 2] as const;
const EMPTY_METRICS: TimelapseMetricPoint[] = [];
const UNAVAILABLE_TEXT = '该战报尚未通过审核或已被移除';

type CardState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; report: BattleReportData };

export interface RichBattleReportCardProps {
  publicId?: string | null;
  mapName?: string;
  maxWave?: number;
  editing?: boolean;
}

/** 非 published 状态只可能出现在作者视角；API 对其他访客返回 404。 */
function reviewStatusLabel(status: BattleReportData['status']): string | null {
  switch (status) {
    case 'published': return null;
    case 'pending_review': return '审核中';
    case 'rejected': return '已驳回';
    case 'failed': return '处理失败';
    case 'uploading': return '上传中';
    case 'queued': return '排队渲染中';
    case 'processing': return '渲染中';
    default: return '审核中';
  }
}

function HighlightBadge({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rich-battle-report-highlight">
      <span className="rich-battle-report-highlight-label">{label}</span>
      <strong className="rich-battle-report-highlight-value">{formatCompactNumber(value)}{suffix}</strong>
    </div>
  );
}

export function RichBattleReportCard({ publicId, mapName, maxWave, editing = false }: RichBattleReportCardProps) {
  const validId = isBattleReportPublicId(publicId) ? publicId : null;
  const [state, setState] = useState<CardState>({ phase: 'loading' });
  const [playbackRate, setPlaybackRate] = useState(1);
  const playerRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setPlaybackRate(1);
    if (editing || !validId) return;
    let live = true;
    const controller = new AbortController();
    setState({ phase: 'loading' });
    // fetchV1 与站点其余 V1 调用一致：浏览器带 credentials: 'include'，
    // 服务端返回 { data } 信封。这里只信任清洗后的结构化字段。
    fetchV1<unknown>('/timelapses/' + encodeURIComponent(validId), { signal: controller.signal })
      .then((payload) => {
        if (!live) return;
        const report = normalizeBattleReportPayload(payload);
        setState(report ? { phase: 'ready', report } : { phase: 'error' });
      })
      .catch((error: unknown) => {
        if (!live || (error as { name?: string } | null)?.name === 'AbortError') return;
        setState({ phase: 'error' });
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, [editing, validId]);

  const metrics = state.phase === 'ready' ? state.report.metrics : EMPTY_METRICS;
  const markers = useMemo(
    () => waveMarkers(metrics, state.phase === 'ready' ? state.report.durationSeconds : undefined),
    [metrics, state],
  );

  if (editing) {
    return (
      <figure
        className="rich-battle-report-card rich-battle-report-card--editing"
        data-testid="rich-battle-report-editing"
      >
        <div className="rich-battle-report-editing-body">
          <span className="rich-battle-report-eyebrow">基地延时战报</span>
          <strong className="rich-battle-report-editing-title">{battleReportLabel(mapName, maxWave)}</strong>
          <p className="rich-battle-report-editing-hint">
            发布后将在此展示延时视频、波次跳转以及电力、产能、单位三张图表。
          </p>
        </div>
      </figure>
    );
  }

  if (!validId) return null;

  if (state.phase === 'loading') {
    return (
      <figure
        className="rich-battle-report-card rich-battle-report-card--placeholder"
        data-testid="rich-battle-report-placeholder"
        aria-busy="true"
      >
        <p>战报加载中…</p>
      </figure>
    );
  }

  if (state.phase === 'error') {
    return (
      <figure
        className="rich-battle-report-card rich-battle-report-card--placeholder"
        data-testid="rich-battle-report-placeholder"
        data-state="unavailable"
      >
        <p>{UNAVAILABLE_TEXT}</p>
      </figure>
    );
  }

  const report = state.report;
  const statusLabel = reviewStatusLabel(report.status);
  const title = report.mapName || '未知地图';
  const durationLabel = formatBattleReportDuration(report.durationSeconds);
  const hasVideo = Boolean(report.videoUrl);
  const reviewNote = report.status === 'rejected'
    ? (report.reviewReason || '该战报未通过审核，仅作者可见。')
    : report.status === 'failed'
      ? (report.failureReason || '视频处理失败，仅作者可见。')
      : '该战报尚未公开，仅作者可见。';

  const changePlaybackRate = (rate: number) => {
    setPlaybackRate(rate);
    if (playerRef.current) playerRef.current.playbackRate = rate;
  };

  const seekToFraction = (fraction: number) => {
    const video = playerRef.current;
    if (!video) return;
    const fallbackDuration = Number.isFinite(video.duration) ? video.duration : 0;
    const duration = report.durationSeconds > 0 ? report.durationSeconds : fallbackDuration;
    try {
      video.currentTime = seekSecondsForFraction(duration, fraction);
    } catch {
      // 元数据尚未就绪时浏览器会拒绝定位；下一次点击即可。
    }
  };

  return (
    <figure
      className="rich-battle-report-card"
      data-testid="rich-battle-report-card"
      data-timelapse-public-id={report.id}
      data-status={report.status}
    >
      <header className="rich-battle-report-head">
        <div className="rich-battle-report-heading">
          <span className="rich-battle-report-eyebrow">基地延时战报</span>
          <h3 className="rich-battle-report-title">{title}</h3>
          <p className="rich-battle-report-meta">
            <span>最高 {report.maxWave} 波</span>
            {report.durationSeconds > 0 ? <span>时长 {durationLabel}</span> : null}
            <span>作者 {report.author.username}</span>
          </p>
        </div>
        <div className="rich-battle-report-head-actions">
          {statusLabel ? (
            <span
              className={'rich-battle-report-status ' + (report.status === 'rejected' || report.status === 'failed'
                ? 'rich-battle-report-status--error'
                : 'rich-battle-report-status--review')}
              data-testid="rich-battle-report-status"
            >
              {statusLabel}
            </span>
          ) : null}
          {report.videoUrl ? (
            <a className="rich-battle-report-link" href={report.videoUrl} target="_blank" rel="noopener noreferrer">打开视频</a>
          ) : null}
        </div>
      </header>

      {statusLabel ? <p className="rich-battle-report-review-note">{reviewNote}</p> : null}

      {hasVideo ? (
        <div className="rich-battle-report-stage">
          <video
            ref={playerRef}
            data-testid="rich-battle-report-video"
            controls
            preload="metadata"
            poster={report.posterUrl || undefined}
            src={report.videoUrl || undefined}
            aria-label={title + ' 基地延时视频'}
            onLoadedMetadata={(event) => { event.currentTarget.playbackRate = playbackRate; }}
          />
        </div>
      ) : (
        <div className="rich-battle-report-stage rich-battle-report-stage--empty" role="note">视频暂不可用</div>
      )}

      {hasVideo ? (
        <div className="rich-battle-report-player-controls">
          <span className="rich-battle-report-controls-label">播放速度</span>
          <div className="rich-battle-report-rate-buttons" role="group" aria-label="播放速度">
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={playbackRate === rate}
                onClick={() => changePlaybackRate(rate)}
              >
                {rate}x
              </button>
            ))}
          </div>
          {markers.length ? (
            <div className="rich-battle-report-wave-jumps" role="group" aria-label="波次进度跳转">
              <div className="rich-battle-report-wave-track" aria-hidden="true">
                {markers.map((marker) => (
                  <span
                    key={'tick-' + marker.wave}
                    className="rich-battle-report-wave-tick"
                    style={{ left: `${marker.fraction * 100}%` }}
                  />
                ))}
              </div>
              <div className="rich-battle-report-wave-buttons">
                {markers.map((marker) => (
                  <button
                    key={marker.wave}
                    type="button"
                    data-testid={'rich-battle-report-wave-' + marker.wave}
                    title={'跳到第 ' + marker.wave + ' 波'}
                    onClick={() => seekToFraction(marker.fraction)}
                  >
                    第 {marker.wave} 波
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rich-battle-report-highlights" aria-label="战报亮点">
        <HighlightBadge label="峰值发电" value={report.highlights.peakPowerGen} />
        <HighlightBadge label="峰值产能" value={report.highlights.peakItemRatePerMin} suffix="/min" />
        <HighlightBadge label="最高波次" value={report.maxWave || report.highlights.maxWave} suffix="波" />
        <HighlightBadge label="建筑峰值" value={report.highlights.peakBuildingsAlly} />
      </div>

      <BattleReportCharts metrics={report.metrics} durationSeconds={report.durationSeconds} />

      <figcaption className="rich-battle-report-foot">
        <span>作者：{report.author.username}</span>
        <span>{report.status === 'published' ? '已通过审核' : '仅作者可见'}</span>
      </figcaption>
    </figure>
  );
}
