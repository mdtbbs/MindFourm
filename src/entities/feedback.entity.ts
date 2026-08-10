import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Index('idx_feedbacks_status', ['status'])
@Entity('feedbacks')
export class Feedback {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  type: string; // bug | suggestion | other

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ length: 255, nullable: true })
  contact_email: string | null;

  @Column({ nullable: true })
  user_id: number | null;

  @Column({ length: 50, default: 'pending' })
  status: string; // pending | reviewed | resolved

  @CreateDateColumn()
  created_at: Date;
}
