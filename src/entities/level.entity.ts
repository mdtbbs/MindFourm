import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('levels')
export class Level {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 50, unique: true })
  slug: string;

  @Column({ type: 'int' })
  min_points: number;

  @Column({ type: 'int', nullable: true })
  max_points: number;

  @Column({ length: 50, nullable: true })
  icon: string;

  @Column({ length: 20, nullable: true })
  color: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
