import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { GameServer } from './game-server.entity';

@Entity('game_server_snapshots')
@Index('idx_server_snapshots_server', ['game_server'])
export class GameServerSnapshot {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  game_server_id: number;

  @Column({ default: false })
  is_online: boolean;

  @Column({ type: 'int', nullable: true })
  player_count: number | null;

  @Column({ type: 'int', nullable: true })
  max_players: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  map_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  game_version: string | null;

  @Column({ type: 'int', nullable: true })
  response_time_ms: number | null;

  @CreateDateColumn()
  captured_at: Date;

  @ManyToOne(() => GameServer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'game_server_id' })
  game_server: GameServer;
}
