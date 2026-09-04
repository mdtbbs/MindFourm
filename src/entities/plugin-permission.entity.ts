import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Plugin } from './plugin.entity';

@Entity('plugin_permissions')
export class PluginPermission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plugin_id: number;

  @Column({ length: 100 })
  permission: string;

  @Column({ default: 0 })
  granted: number;

  @ManyToOne(() => Plugin, { eager: false })
  @JoinColumn({ name: 'plugin_id' })
  plugin: Plugin;
}
