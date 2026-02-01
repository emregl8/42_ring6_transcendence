import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { Comment } from './entities/comment.entity';
import { Like } from './entities/like.entity';
import { Post } from './entities/post.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Post, Comment, Like])],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
