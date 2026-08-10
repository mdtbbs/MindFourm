import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';

@Entity('resource_categories')
export class ResourceCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 255, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 50, nullable: true })
  icon: string;

  @Column({ default: 0 })
  sort_order: number;

  @Column({ default: 1 })
  is_active: number;

  @Column({ nullable: true })
  parent_id: number | null;

  @ManyToOne(() => ResourceCategory, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_id' })
  parent: ResourceCategory | null;

  @OneToMany(() => ResourceCategory, (category) => category.parent)
  children: ResourceCategory[];

  @CreateDateColumn()
  created_at: Date;
}
