import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { Post } from './entities/post.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Post])],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
