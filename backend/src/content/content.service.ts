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

  async create(createPostDto: CreatePostDto, user: User, imageUrl?: string): Promise<Post> {
    const cleanTitle = this.sanitizeTitle(createPostDto.title);
    const cleanContent = this.sanitizeContent(createPostDto.content);

    const post = this.postsRepository.create({
      title: cleanTitle,
      content: cleanContent,
      user,
      imageUrl,
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

  async update(id: string, updatePostDto: UpdatePostDto, user: User, imageUrl?: string): Promise<Post> {
    if (updatePostDto.title === undefined && updatePostDto.content === undefined && imageUrl === undefined) {
      throw new BadRequestException('At least one field (title, content or image) must be provided');
    }
    const post = await this.findOne(id);
    if (post === null) {
      throw new NotFoundException('Post not found');
    }
    if (post.user.id !== user.id) {
      throw new ForbiddenException('You can only edit your own posts');
    }
    if (updatePostDto.title !== undefined) {
      post.title = this.sanitizeTitle(updatePostDto.title);
    }
    if (updatePostDto.content !== undefined) {
      post.content = this.sanitizeContent(updatePostDto.content);
    }
    if (imageUrl !== undefined) {
      post.imageUrl = imageUrl;
    }
    return this.postsRepository.save(post);
  }

  private sanitizeTitle(title: string): string {
    return sanitizeHtml(title, {
      allowedTags: [],
      allowedAttributes: {},
    });
  }

  private sanitizeContent(content: string): string {
    return sanitizeHtml(content, {
      allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br', 'img', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'div', 'span'],
      allowedAttributes: {
        img: ['src', 'alt', 'width', 'height'],
      },
      allowedClasses: {
        span: ['blocked-image'],
      },
      allowedSchemes: ['http', 'https', 'ftp', 'mailto', 'tel'],
      transformTags: {
        img: (tagName, attribs) => {
          if (attribs.src !== undefined && attribs.src !== '' && !attribs.src.startsWith('/uploads/')) {
            return { tagName: 'span', attribs: { class: 'blocked-image' } };
          }
          return { tagName, attribs };
        },
      },
    });
  }
}
