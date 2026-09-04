import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('game_versions')
@Index('idx_game_versions_series', ['game_series'])
export class GameVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 36, unique: true })
  public_id: string;

  @Column({ length: 50 })
  version_value: string; // "159", "159.1" — parsed by MindustryVersionValue

  @Column({ length: 50 })
  game_series: string; // stable | beta | legacy

  @Column({ length: 50 })
  release_channel: string; // stable | beta | alpha | bleeding-edge

  @Column({ length: 255, nullable: true })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  changelog: string;

  @Column({ type: 'datetime', nullable: true })
  released_at: Date;

  @Column({ default: false })
  is_official: boolean;

  @CreateDateColumn()
  created_at: Date;
}
