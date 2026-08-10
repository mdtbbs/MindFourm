import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index,
} from 'typeorm';
import { Resource } from './resource.entity';
import { User } from './user.entity';

@Entity('resource_attributions')
@Index('idx_resource_attributions_resource', ['resource'])
export class ResourceAttribution {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column({ length: 50 })
  role: string; // original_author | maintainer | publisher | submitter | contributor

  @Column({ length: 50 })
  subject_type: string; // local_user | external_person | external_project

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_name: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profile_url: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  source_url: string | null;

  @Column({ default: 0 })
  sort_order: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User;
}
