import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('resource_versions')
export class ResourceVersion {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  resource_id: number;

  @Column({ length: 50 })
  version: string;

  @Column({ length: 500, nullable: true })
  file_path: string;

  @Column({ length: 255, nullable: true })
  file_name: string;

  @Column({ nullable: true })
  file_size: number;

  @Column({ length: 100, nullable: true })
  mime_type: string;

  @CreateDateColumn()
  created_at: Date;
}
