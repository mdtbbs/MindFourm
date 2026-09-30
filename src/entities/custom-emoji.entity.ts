import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('custom_emojis')
export class CustomEmoji {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 48, unique: true })
  shortcode: string;

  @Column({ type: 'varchar', length: 255 })
  file_name: string;

  @Column({ type: 'varchar', length: 500 })
  file_path: string;

  @Column({ type: 'varchar', length: 40 })
  mime_type: string;

  @Column({ type: 'tinyint', default: 1 })
  is_enabled: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'int' })
  created_by_user_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
