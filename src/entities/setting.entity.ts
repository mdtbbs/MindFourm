import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryColumn({ length: 255 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ length: 100 })
  category: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @UpdateDateColumn()
  updated_at: Date;
}
