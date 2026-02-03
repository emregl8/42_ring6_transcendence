import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  Param,
  Patch,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  InternalServerErrorException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { diskStorage } from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../auth/entities/user.entity.js';
import { ContentService } from './content.service.js';
import { CreateCommentDto } from './dto/create-comment.dto.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { Comment as CommentEntity } from './entities/comment.entity.js';
import { Post as PostEntity } from './entities/post.entity.js';
import { PostRateLimitGuard } from './guards/post-rate-limit.guard.js';

interface AuthenticatedRequest extends Request {
  user: User;
}

const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');
const PUBLIC_DIR = path.join(UPLOAD_ROOT, 'public');

const storage = diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, TEMP_DIR);
  },
  filename: (_req, _file, callback) => {
    const uniqueSuffix = uuidv4();
    callback(null, `${uniqueSuffix}.jpg`);
  },
});

const multerOptions = {
  storage,
  limits: {
    fileSize: 1024 * 1024 * 5,
  },
};

@Controller('content')
@UseGuards(AuthGuard('jwt'))
export class ContentController implements OnModuleInit {
  constructor(private readonly contentService: ContentService) {}

  async onModuleInit(): Promise<void> {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
  }

  private async processImage(filename: string): Promise<string> {
    const tempPath = path.join(TEMP_DIR, filename);
    const publicPath = path.join(PUBLIC_DIR, filename);

    try {
      await fs.mkdir(PUBLIC_DIR, { recursive: true });
      const buffer = await sharp(tempPath).rotate().resize({ width: 1200, withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();

      await fs.writeFile(publicPath, buffer);
      await fs.unlink(tempPath).catch(() => {});

      return `/uploads/${filename}`;
    } catch {
      await fs.unlink(tempPath).catch(() => {});
      throw new InternalServerErrorException('Failed to process image');
    }
  }

  private async handleUploadedImage(file?: Express.Multer.File): Promise<string | undefined> {
    if (file === undefined) {
      return undefined;
    }
    if (!file.mimetype.startsWith('image/')) {
      await fs.unlink(file.path).catch(() => {});
      throw new BadRequestException('Only images are allowed');
    }
    return this.processImage(file.filename);
  }

  @Post()
  @UseGuards(PostRateLimitGuard)
  @UseInterceptors(FileInterceptor('image', multerOptions))
  async create(
    @Body() createPostDto: CreatePostDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 })],
        fileIsRequired: false,
      })
    )
    file?: Express.Multer.File
  ): Promise<PostEntity> {
    const imageUrl = await this.handleUploadedImage(file);
    return this.contentService.create(createPostDto, req.user, imageUrl);
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
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest
  ): Promise<PostEntity & { likeCount: number; isLiked: boolean; comments: CommentEntity[] }> {
    return this.contentService.getPostDetails(id, req.user);
  }

  @Post(':id/like')
  async toggleLike(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<{ liked: boolean; count: number }> {
    return this.contentService.toggleLike(id, req.user);
  }

  @Post(':id/comments')
  async addComment(@Param('id') id: string, @Body() createCommentDto: CreateCommentDto, @Req() req: AuthenticatedRequest): Promise<CommentEntity> {
    return this.contentService.addComment(id, createCommentDto, req.user);
  }

  @Delete('comments/:id')
  async deleteComment(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.contentService.deleteComment(id, req.user);
  }

  @Patch(':id')
  @UseGuards(PostRateLimitGuard)
  @UseInterceptors(FileInterceptor('image', multerOptions))
  async update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 })],
        fileIsRequired: false,
      })
    )
    file?: Express.Multer.File
  ): Promise<PostEntity> {
    const imageUrl = await this.handleUploadedImage(file);
    return this.contentService.update(id, updatePostDto, req.user, imageUrl);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.contentService.remove(id, req.user);
  }

  @Post('upload')
  @UseGuards(PostRateLimitGuard)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 })],
      })
    )
    file: Express.Multer.File
  ): Promise<{ url: string }> {
    const url = await this.handleUploadedImage(file);
    if (url === undefined) {
      throw new BadRequestException('File is required');
    }
    return { url };
  }
}
