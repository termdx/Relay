import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApprovalController } from './approval.controller';
import { ApprovalService } from './approval.service';
import { Approval } from './entities/approval.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Approval])],
  controllers: [ApprovalController],
  providers: [ApprovalService],
  exports: [ApprovalService],
})
export class ApprovalModule {}
