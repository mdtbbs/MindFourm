import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CustomEmoji } from '@entities/custom-emoji.entity';
import { TiptapDocument, normalizeTiptapDocument } from '@common/utils/tiptap-content.util';

const SHORTCODE = /^[a-z0-9_+-]{1,48}$/;

@Injectable()
export class CustomEmojisService {
  constructor(@InjectRepository(CustomEmoji) private readonly repository: Repository<CustomEmoji>) {}

  async listEnabled(): Promise<Array<Pick<CustomEmoji, 'id' | 'name' | 'shortcode' | 'sort_order'>>> {
    return this.repository.find({
      where: { is_enabled: 1 },
      select: { id: true, name: true, shortcode: true, sort_order: true },
      order: { sort_order: 'ASC', id: 'ASC' },
    });
  }

  async listAll(): Promise<CustomEmoji[]> {
    return this.repository.find({ order: { sort_order: 'ASC', id: 'ASC' } });
  }

  async getEnabled(id: number): Promise<CustomEmoji> {
    const emoji = await this.repository.findOne({ where: { id, is_enabled: 1 } });
    if (!emoji) throw new NotFoundException('表情不存在');
    return emoji;
  }

  async create(data: {
    name: string;
    shortcode: string;
    file_name: string;
    file_path: string;
    mime_type: string;
    created_by_user_id: number;
  }): Promise<CustomEmoji> {
    const name = this.validateName(data.name);
    const shortcode = this.validateShortcode(data.shortcode);
    return this.repository.save(this.repository.create({ ...data, name, shortcode, is_enabled: 1, sort_order: 0 }));
  }

  async update(id: number, input: {
    name?: string;
    shortcode?: string;
    is_enabled?: boolean;
    sort_order?: number;
  }): Promise<CustomEmoji> {
    const emoji = await this.repository.findOne({ where: { id } });
    if (!emoji) throw new NotFoundException('表情不存在');
    if (input.name !== undefined) emoji.name = this.validateName(input.name);
    if (input.shortcode !== undefined) emoji.shortcode = this.validateShortcode(input.shortcode);
    if (input.is_enabled !== undefined) emoji.is_enabled = input.is_enabled ? 1 : 0;
    if (input.sort_order !== undefined) {
      if (!Number.isSafeInteger(input.sort_order) || input.sort_order < -100_000 || input.sort_order > 100_000) {
        throw new BadRequestException('sort_order 无效');
      }
      emoji.sort_order = input.sort_order;
    }
    return this.repository.save(emoji);
  }

  async remove(id: number): Promise<CustomEmoji> {
    const emoji = await this.repository.findOne({ where: { id } });
    if (!emoji) throw new NotFoundException('表情不存在');
    await this.repository.remove(emoji);
    return emoji;
  }

  async canonicalizeDocument(input: unknown, schemaVersion = 2, resourceDescription = false, allowDraftAttachments = false): Promise<TiptapDocument> {
    const document = normalizeTiptapDocument(input, { schemaVersion, resourceDescription, allowDraftAttachments });
    const ids = new Set<number>();
    const visit = (node: Record<string, any>) => {
      if (node.type === 'customEmoji') ids.add(Number(node.attrs.id));
      for (const child of node.content || []) visit(child);
    };
    visit(document as unknown as Record<string, any>);
    if (!ids.size) return document;
    const emojis = await this.repository.find({ where: { id: In([...ids]), is_enabled: 1 } });
    const byId = new Map(emojis.map((emoji) => [emoji.id, emoji]));
    for (const id of ids) if (!byId.has(id)) throw new BadRequestException({ code: 'INVALID_CUSTOM_EMOJI', details: { id } });
    const apply = (node: Record<string, any>) => {
      if (node.type === 'customEmoji') {
        const emoji = byId.get(Number(node.attrs.id))!;
        node.attrs.name = emoji.name;
        node.attrs.shortcode = emoji.shortcode;
      }
      for (const child of node.content || []) apply(child);
    };
    apply(document as unknown as Record<string, any>);
    return document;
  }

  private validateName(value: string): string {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) throw new BadRequestException('表情名称无效');
    return value.trim();
  }

  private validateShortcode(value: string): string {
    const shortcode = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!SHORTCODE.test(shortcode)) throw new BadRequestException('shortcode 仅允许小写字母、数字和 _+-');
    return shortcode;
  }
}
