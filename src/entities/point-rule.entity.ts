import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('point_rules')
export class PointRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50, unique: true })
  action: string;

  @Column({ type: 'int' })
  points: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 1 })
  is_active: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
