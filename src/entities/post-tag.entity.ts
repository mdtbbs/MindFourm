import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Post } from './post.entity';
import { Tag } from './tag.entity';

@Entity('post_tags')
export class PostTag {
  @PrimaryColumn()
  post_id: number;

  @PrimaryColumn()
  tag_id: number;

  @ManyToOne(() => Post, (post) => post.postTags, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @ManyToOne(() => Tag)
  @JoinColumn({ name: 'tag_id' })
  tag: Tag;
}
