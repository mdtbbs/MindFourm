import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Unique } from 'typeorm';
import { User } from './user.entity';

@Entity('follows')
@Unique(['follower_id', 'following_id'])
export class Follow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  follower_id: number;

  @Column()
  following_id: number;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'follower_id' })
  follower: User;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'following_id' })
  following: User;
}
