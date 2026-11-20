import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** 快照文件清单行；`blob_id` 指向 `squad_save_blobs`。 */
@Entity('squad_save_snapshot_files')
@Index('idx_squad_save_snapshot_files_blob', ['blob_id'])
export class SquadSaveSnapshotFile {
  @PrimaryColumn({ type: 'char', length: 36 }) snapshot_id: string;
  @PrimaryColumn({ type: 'varchar', length: 512, collation: 'utf8mb4_bin' }) file_path: string;
  @Column({ type: 'char', length: 36 }) blob_id: string;
  @Column({ type: 'bigint', unsigned: true }) size_bytes: string;
  @Column({ type: 'char', length: 64 }) sha256: string;
}
