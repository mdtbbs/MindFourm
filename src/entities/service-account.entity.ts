import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('service_accounts')
@Index('uq_service_accounts_slug', ['slug'], { unique: true })
export class ServiceAccount {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 80 }) slug: string;
  @Column({ length: 120 }) display_name: string;
  @Column({ length: 40 }) kind: string; // sync | ai
  @Column({ default: true }) is_active: boolean;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
