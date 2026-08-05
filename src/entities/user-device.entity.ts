import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_devices')
@Index(['uid'])
@Index(['remember_token'])
@Index(['token_expire'])
export class UserDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'uid', type: 'bigint' })
  uid: number;

  @Column({ length: 255 })
  remember_token: string;

  @Column({ length: 45 })
  ip: string;

  @Column({ type: 'text', nullable: true })
  device_info: string;

  @Column({ length: 255, nullable: true })
  device_name: string;

  @Column({ length: 50, nullable: true })
  platform: string;

  @Column({ type: 'datetime' })
  token_expire: Date;

  @Column({ type: 'datetime' })
  last_active: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
