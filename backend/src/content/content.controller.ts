import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Req,
  Param,
  NotFoundException,
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
import { User } from '../auth/entities/user.entity';
import { ContentService } from './content.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { Post as PostEntity } from './entities/post.entity';
import { PostRateLimitGuard } from './guards/post-rate-limit.guard';

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

  @Post()
  @UseGuards(PostRateLimitGuard)
  @UseInterceptors(FileInterceptor('image', { storage }))
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
    let imageUrl: string | undefined;
    if (file !== undefined) {
      if (!file.mimetype.startsWith('image/')) {
        await fs.unlink(file.path).catch(() => {});
        throw new BadRequestException('Only images are allowed');
      }
      imageUrl = await this.processImage(file.filename);
    }
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
  async findOne(@Param('id') id: string): Promise<PostEntity> {
    const post = await this.contentService.findOne(id);
    if (post === null) {
      throw new NotFoundException('Post not found');
    }
    return post;
  }

  @Patch(':id')
  @UseGuards(PostRateLimitGuard)
  @UseInterceptors(FileInterceptor('image', { storage }))
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
    let imageUrl: string | undefined;
    if (file !== undefined) {
      if (!file.mimetype.startsWith('image/')) {
        await fs.unlink(file.path).catch(() => {});
        throw new BadRequestException('Only images are allowed');
      }
      imageUrl = await this.processImage(file.filename);
    }
    return this.contentService.update(id, updatePostDto, req.user, imageUrl);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<void> {
    return this.contentService.remove(id, req.user);
  }

  @Post('upload')
  @UseGuards(PostRateLimitGuard)
  @UseInterceptors(FileInterceptor('file', { storage }))
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 })],
      })
    )
    file: Express.Multer.File
  ): Promise<{ url: string }> {
    if (!file.mimetype.startsWith('image/')) {
      await fs.unlink(file.path).catch(() => {});
      throw new BadRequestException('Only images are allowed');
    }
    const url = await this.processImage(file.filename);
    return { url };
  }
}
