import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from './user.entity';
import { ShopItem } from './shop-item.entity';

@Entity('purchases')
export class Purchase {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  item_id: number;

  @Column({ type: 'int' })
  points_spent: number;

  @Column({ length: 20, default: 'completed' })
  status: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => ShopItem, { eager: false })
  @JoinColumn({ name: 'item_id' })
  item: ShopItem;
}
