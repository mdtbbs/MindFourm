import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { Attachment } from '@entities/attachment.entity';

type ForgeResource = {
  id: string;
  status: 'processing' | 'ready' | 'failed';
  errorCode?: string;
};

@Injectable()
export class ForgePreviewService {
  private readonly logger = new Logger(ForgePreviewService.name);

  constructor(private readonly config: ConfigService) {}

  supports(attachment: Pick<Attachment, 'file_name'>): boolean {
    return /\.(msav|msch)$/i.test(attachment.file_name);
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async submit(attachment: Attachment): Promise<{ status: string; resourceId?: string; errorCode?: string }> {
    if (!this.supports(attachment)) return { status: 'unsupported' };
    if (!this.isConfigured()) return { status: 'unavailable' };

    const extension = attachment.file_name.toLowerCase().endsWith('.msav') ? 'maps' : 'schematics';
    const data = await fs.readFile(attachment.file_path);
    const form = new FormData();
    form.append('file', new Blob([data], { type: 'application/octet-stream' }), attachment.file_name);

    const response = await fetch(`${this.baseUrl}/v1/${extension}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      this.logger.warn(`MDT-Forge submission failed for attachment ${attachment.id}: ${response.status}`);
      return { status: 'failed', errorCode: 'FORGE_SUBMIT_FAILED' };
    }

    const payload = await response.json() as { resourceId?: string; status?: string };
    if (!payload.resourceId) return { status: 'failed', errorCode: 'FORGE_INVALID_RESPONSE' };
    return { status: payload.status || 'processing', resourceId: payload.resourceId };
  }

  async status(resourceId: string): Promise<ForgeResource | null> {
    if (!this.isConfigured()) return null;
    const response = await fetch(`${this.baseUrl}/v1/resources/${encodeURIComponent(resourceId)}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    return response.json() as Promise<ForgeResource>;
  }

  async preview(resourceId: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (!this.isConfigured()) return null;
    const response = await fetch(`${this.baseUrl}/v1/resources/${encodeURIComponent(resourceId)}/preview`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    return {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get('content-type') || 'image/png',
    };
  }

  private get baseUrl(): string {
    return (this.config.get<string>('forge.baseUrl') || '').replace(/\/$/, '');
  }

  private get apiKey(): string {
    return this.config.get<string>('forge.apiKey') || '';
  }
}
