import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TypeOrmModule],
  controllers: [HealthController],
})
export class HealthModule {}
