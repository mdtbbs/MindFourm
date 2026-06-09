import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
} from 'typeorm';

@Entity('session_audit')
export class SessionAudit {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  user_id: number;

  @Column({ length: 255 })
  session_token: string;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @CreateDateColumn()
  created_at: Date;
}
