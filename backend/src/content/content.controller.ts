import { Controller, Get, Post, Body, UseGuards, Req, Param, NotFoundException, Patch } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { User } from '../auth/entities/user.entity';
import { ContentService } from './content.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post as PostEntity } from './entities/post.entity';
import { PostRateLimitGuard } from './guards/post-rate-limit.guard';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller('content')
@UseGuards(AuthGuard('jwt'))
export class ContentController {
  constructor(private readonly contentService: ContentService) {}

  @Post()
  @UseGuards(PostRateLimitGuard)
  create(@Body() createPostDto: CreatePostDto, @Req() req: AuthenticatedRequest): Promise<PostEntity> {
    return this.contentService.create(createPostDto, req.user);
  }

  @Get()
  findAll(): Promise<PostEntity[]> {
    return this.contentService.findAll();
  }

  @Get('my-posts')
  findMyPosts(@Req() req: AuthenticatedRequest): Promise<PostEntity[]> {
    return this.contentService.findByUser(req.user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PostEntity> {
    const post = await this.contentService.findOne(id);
    if (post === null) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  @Patch(':id')
  @UseGuards(PostRateLimitGuard)
  update(@Param('id') id: string, @Body() updatePostDto: UpdatePostDto, @Req() req: AuthenticatedRequest): Promise<PostEntity> {
    return this.contentService.update(id, updatePostDto, req.user);
  }
}
