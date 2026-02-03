import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentController } from './content.controller.js';
import { ContentService } from './content.service.js';
import { Comment } from './entities/comment.entity.js';
import { Like } from './entities/like.entity.js';
import { Post } from './entities/post.entity.js';
@Module({
  imports: [TypeOrmModule.forFeature([Post, Comment, Like])],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
