import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('game_servers')
@Index('idx_game_servers_slug', ['slug'])
export class GameServer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  public_id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  slug: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 255 })
  hostname: string;

  @Column()
  port: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  protocol: string | null;

  @Column({ length: 50, default: 'community' })
  server_type: string;

  @Column({ length: 50, default: 'pending' })
  status: string;

  @Column({ default: true })
  is_public: boolean;

  @Column({ type: 'int', nullable: true })
  owner_user_id: number | null;

  @Column({ type: 'int', nullable: true })
  discussion_thread_id: number | null;

  @Column({ type: 'json', nullable: true })
  metadata_json: any;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
