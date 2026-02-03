import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import sanitizeHtml from 'sanitize-html';
import { Repository } from 'typeorm';
import { User } from '../auth/entities/user.entity.js';
import { isDefined } from '../common/utils/validation.util.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { Comment } from './entities/comment.entity.js';
import { Like } from './entities/like.entity.js';
import { Post } from './entities/post.entity.js';

@Injectable()
export class ContentService {
  constructor(
    @InjectRepository(Post)
    private readonly postsRepository: Repository<Post>,
    @InjectRepository(Comment)
    private readonly commentsRepository: Repository<Comment>,
    @InjectRepository(Like)
    private readonly likesRepository: Repository<Like>
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

  async remove(id: string, user: User): Promise<void> {
    const post = await this.findOne(id);
    if (post === null) {
      throw new NotFoundException('Post not found');
    }
    if (post.user.id !== user.id) {
      throw new ForbiddenException('You can only delete your own posts');
    }
    await this.postsRepository.remove(post);
  }

  async toggleLike(postId: string, user: User): Promise<{ liked: boolean; count: number }> {
    const post = await this.getPostOrThrow(postId);

    const existingLike = await this.likesRepository.findOne({
      where: { postId, userId: user.id },
    });

    if (isDefined(existingLike)) {
      await this.likesRepository.remove(existingLike);
    } else {
      const like = this.likesRepository.create({
        post,
        user,
      });
      await this.likesRepository.save(like);
    }

    const count = await this.likesRepository.count({ where: { postId } });
    return { liked: existingLike === null, count };
  }

  async addComment(postId: string, createCommentDto: CreateCommentDto, user: User): Promise<Comment> {
    const post = await this.getPostOrThrow(postId);

    const cleanContent = sanitizeHtml(createCommentDto.content, {
      allowedTags: [],
      allowedAttributes: {},
    });

    const comment = this.commentsRepository.create({
      content: cleanContent,
      post,
      user,
    });

    return this.commentsRepository.save(comment);
  }

  async deleteComment(commentId: string, user: User): Promise<void> {
    const comment = await this.commentsRepository.findOne({
      where: { id: commentId },
      relations: ['user', 'post', 'post.user'],
    });

    if (comment === null) {
      throw new NotFoundException('Comment not found');
    }

    if (comment.user.id !== user.id && comment.post.user.id !== user.id) {
      throw new ForbiddenException('You can only delete your own comments or comments on your post');
    }

    await this.commentsRepository.remove(comment);
  }

  async getPostDetails(id: string, user?: User): Promise<Post & { likeCount: number; isLiked: boolean; comments: Comment[] }> {
    const post = await this.postsRepository.findOne({
      where: { id },
      relations: ['user'],
    });

    if (post === null) {
      throw new NotFoundException('Post not found');
    }

    const likeCount = await this.likesRepository.count({ where: { postId: id } });
    let isLiked = false;
    if (user !== undefined) {
      isLiked = await this.likesRepository.exists({ where: { postId: id, userId: user.id } });
    }

    const comments = await this.commentsRepository.find({
      where: { postId: id },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });

    return {
      ...post,
      likeCount,
      isLiked,
      comments,
    };
  }

  private async getPostOrThrow(id: string): Promise<Post> {
    const post = await this.postsRepository.findOneBy({ id });
    if (post === null) {
      throw new NotFoundException('Post not found');
    }
    return post;
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
        span: ['class'],
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
