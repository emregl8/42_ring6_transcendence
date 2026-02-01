import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
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
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
