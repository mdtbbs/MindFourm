import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';

/** One file entry of a manifest snapshot; the bytes live in `game_save_blobs`. */
@Entity('game_save_snapshot_files')
@Unique('uq_game_save_snapshot_file_path', ['snapshot_id', 'path'])
@Index('idx_game_save_snapshot_files_blob', ['blob_id'])
export class GameSaveSnapshotFile {
  @PrimaryColumn({ type: 'char', length: 36 }) id: string;
  @Column({ type: 'char', length: 36 }) snapshot_id: string;
  /** Relative path inside the cloud save data directory. */
  @Column({ type: 'varchar', length: 512 }) path: string;
  @Column({ type: 'char', length: 36 }) blob_id: string;
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'char', length: 64 }) sha256: string;
  @CreateDateColumn({ type: 'datetime' }) created_at: Date;
}
