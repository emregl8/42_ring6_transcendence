import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany, Relation } from 'typeorm';
import { User } from '../../auth/entities/user.entity.js';
import { Comment } from './comment.entity.js';
import { Like } from './like.entity.js';

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id!: string;
  @Column()
  title!: string;
  @Column('text')
  content!: string;
  @Column({ name: 'image_url', nullable: true })
  imageUrl?: string;
  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ name: 'user_id' })
  userId!: string;

  @OneToMany(() => Comment, (comment) => comment.post)
  comments!: Relation<Comment>[];

  @OneToMany(() => Like, (like) => like.post)
  likes!: Relation<Like>[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
