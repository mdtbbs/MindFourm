import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * 建房时房主上报的单个 Mod 条目，以及服务端按公开 Mod 目录解析出的权威定级。
 *
 * 解析结果只保存公开资源身份：`resource_*` 仅在资源公开可见且对应版本已发布时写入，
 * 未过审、隔离、已删除或合并的资源一律不落库，避免同步计划接口泄露隔离文件。
 */
export type MultiplayerSessionModResolution =
  | 'catalog_verified'
  | 'catalog_version_mismatch'
  | 'unlisted_local';

@Entity('multiplayer_session_mods')
@Index('idx_multiplayer_session_mods_mod_session', ['mod_id', 'session_id'])
@Index('idx_multiplayer_session_mods_resource_session', ['resource_id', 'session_id'])
@Index('uq_multiplayer_session_mods_session_mod', ['session_id', 'mod_id'], { unique: true })
export class MultiplayerSessionMod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 48 })
  session_id: string;

  /** 房主上报的小写 Mod 标识（与 `mod_profiles.mod_id` 同一命名空间）。 */
  @Column({ type: 'varchar', length: 191 })
  mod_id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  display_name: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  version: string | null;

  /** 房主上报的 SHA-256；仅当提供时才可能被判定为 `catalog_verified`。 */
  @Column({ type: 'char', length: 64, nullable: true })
  sha256: string | null;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({
    type: 'enum',
    enum: ['catalog_verified', 'catalog_version_mismatch', 'unlisted_local'],
    default: 'unlisted_local',
  })
  resolution_status: MultiplayerSessionModResolution;

  /** 公开资源整数 ID；内部使用，不对外返回。 */
  @Column({ type: 'int', nullable: true })
  resource_id: number | null;

  @Column({ type: 'char', length: 36, nullable: true })
  resource_public_id: string | null;

  @Column({ type: 'int', nullable: true })
  resource_version_id: number | null;

  @Column({ type: 'char', length: 36, nullable: true })
  resource_version_public_id: string | null;

  @Column({ type: 'char', length: 36, nullable: true })
  file_public_id: string | null;

  @Column({ type: 'bigint', unsigned: true, nullable: true })
  file_size_bytes: string | number | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
