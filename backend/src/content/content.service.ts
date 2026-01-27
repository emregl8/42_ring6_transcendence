import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sanitizeHtml from 'sanitize-html';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post } from './entities/post.entity';
@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Post)
    private postsRepository: Repository<Post>
  ) {}

  async create(createPostDto: CreatePostDto, user: User): Promise<Post> {
    const cleanTitle = sanitizeHtml(createPostDto.title, {
      allowedTags: [],
      allowedAttributes: {},
    });
    const cleanContent = sanitizeHtml(createPostDto.content, {
      allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
      allowedAttributes: {},
    });
    const post = this.postsRepository.create({
      title: cleanTitle,
      content: cleanContent,
      user,
    });
    return this.postsRepository.save(post);
  }

  async findAll(): Promise<Post[]> {
    return this.postsRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findOne(id: string): Promise<Post | null> {
    return this.postsRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async findByUser(userId: string): Promise<Post[]> {
    return this.postsRepository.find({
      where: { user: { id: userId } },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async update(id: string, updatePostDto: UpdatePostDto, user: User): Promise<Post> {
    if (updatePostDto.title === undefined && updatePostDto.content === undefined) {
      throw new BadRequestException('At least one field (title or content) must be provided');
    }
    const post = await this.findOne(id);
    if (post === null) {
      throw new NotFoundException('Post not found');
    }
    if (post.user.id !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }
    if (updatePostDto.title !== undefined) {
      post.title = sanitizeHtml(updatePostDto.title, {
        allowedTags: [],
        allowedAttributes: {},
      });
    }
    if (updatePostDto.content !== undefined) {
      post.content = sanitizeHtml(updatePostDto.content, {
        allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
        allowedAttributes: {},
      });
    }
    return this.postsRepository.save(post);
  }
}
