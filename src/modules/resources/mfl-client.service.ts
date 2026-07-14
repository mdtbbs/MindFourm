import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MflUploadResult {
  id: number;
  file_name: string;
  file_path: string;
  file_size: number;
}

export interface MflUploadResponse {
  message: string;
  files: MflUploadResult[];
}

@Injectable()
export class MflClientService {
  private readonly logger = new Logger(MflClientService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>('mfl.baseUrl') || '';
    this.apiKey = this.configService.get<string>('mfl.apiKey') || '';
  }

  private get enabled(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  /**
   * Upload a file to MindFileList
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
    category: string,
    mimeType: string,
    options?: { resourceId?: number },
  ): Promise<MflUploadResult | null> {
    if (!this.enabled) {
      this.logger.warn('MFL not configured, skipping upload');
      return null;
    }

    try {
      // Use native FormData (Node 24+)
      const form = new FormData();
      const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType || 'application/octet-stream' });
      form.append('files', blob, filename);

      const params = new URLSearchParams();
      params.set('category', category || 'uncategorized');
      if (options?.resourceId) {
        params.set('approval_status', 'pending');
        params.set('approval_source', 'mindforum');
        params.set('resource_id', String(options.resourceId));
      }

      const url = `${this.baseUrl}/api/v1/files/upload?${params.toString()}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: form as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MFL upload failed (${response.status}): ${errorText}`);
      }

      const result: MflUploadResponse = await response.json();

      if (result.files && result.files.length > 0) {
        this.logger.log(`MFL upload success: ${result.files[0].file_name} (id=${result.files[0].id})`);
        return result.files[0];
      }

      throw new Error('MFL upload returned no files');
    } catch (error) {
      this.logger.error(`MFL upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update approval status of a file on MFL
   */
  async updateApprovalStatus(
    mflFileId: number,
    status: 'pending' | 'approved' | 'rejected',
    resourceId?: number,
    rejectReason?: string,
  ): Promise<boolean> {
    if (!this.enabled) {
      this.logger.warn('MFL not configured, skipping approval update');
      return false;
    }

    try {
      const url = `${this.baseUrl}/api/v1/files/${mflFileId}/approval`;
      const body: Record<string, any> = { status };
      if (resourceId !== undefined) body.resource_id = resourceId;
      if (rejectReason) body.reject_reason = rejectReason;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MFL approval update failed (${response.status}): ${errorText}`);
      }

      this.logger.log(`MFL approval updated: file=${mflFileId} status=${status}`);
      return true;
    } catch (error) {
      this.logger.error(`MFL approval update error: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the download URL for a MFL file
   */
  getDownloadUrl(mflFileId: number): string {
    return `${this.baseUrl}/download/${mflFileId}`;
  }
}
