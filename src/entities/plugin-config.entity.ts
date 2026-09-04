import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Plugin } from './plugin.entity';

@Entity('plugin_configs')
export class PluginConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  plugin_id: number;

  @Column({ length: 100 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ length: 20 })
  type: string; // string/number/boolean/json

  @Column({ length: 255, nullable: true })
  description: string;

  @ManyToOne(() => Plugin, { eager: false })
  @JoinColumn({ name: 'plugin_id' })
  plugin: Plugin;
}
