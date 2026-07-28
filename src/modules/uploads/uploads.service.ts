import { Injectable } from '@nestjs/common';

export interface PublicImageUploadResult {
  url: string;
  filename: string;
  original_name: string;
  mime_type: string;
  size: number;
}

@Injectable()
export class UploadsService {
  toPublicImageResult(file: Express.Multer.File): PublicImageUploadResult {
    return {
      url: `/uploads/public-images/${file.filename}`,
      filename: file.filename,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size: file.size,
    };
  }
}
