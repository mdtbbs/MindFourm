import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('popular_searches')
@Index(['count'])
export class PopularSearch {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 255, unique: true })
  query: string;

  @Column({ type: 'int', default: 0 })
  count: number;

  @UpdateDateColumn()
  last_searched_at: Date;

  @CreateDateColumn()
  created_at: Date;
}
