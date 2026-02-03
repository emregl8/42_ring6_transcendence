import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Relation } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { Post } from './post.entity.js';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column('text')
  content!: string;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post!: Relation<Post>;

  @Column({ name: 'post_id' })
  postId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
