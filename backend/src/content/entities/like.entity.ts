import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Unique, Relation } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { Post } from './post.entity.js';

@Entity('likes')
@Unique(['user', 'post'])
export class Like {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @Column({ name: 'user_id' })
  userId!: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Relation<Post>;

  @Column({ name: 'post_id' })
  postId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
