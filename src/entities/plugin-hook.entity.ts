import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Plugin } from './plugin.entity';

@Entity('plugin_hooks')
export class PluginHook {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plugin_id: number;

  @Column({ length: 100 })
  hook_name: string;

  @Column({ default: 0 })
  priority: number;

  @Column({ default: 1 })
  is_active: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Plugin, { eager: false })
  @JoinColumn({ name: 'plugin_id' })
  plugin: Plugin;
}
