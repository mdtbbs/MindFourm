import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('plugins')
export class Plugin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  slug: string;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 20 })
  version: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 100, nullable: true })
  author: string;

  @Column({ default: 0 })
  is_installed: number;

  @Column({ default: 0 })
  is_active: number;

  @Column({ type: 'text', nullable: true })
  config: string; // JSON

  @Column({ type: 'text', nullable: true })
  dependencies: string; // JSON array of strings

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
