import { Module } from "@nestjs/common";
import { PrismaTagRepository } from "./prisma-tag.repository";
import { TAG_REPOSITORY } from "./tag.repository";
import { TagsController } from "./tags.controller";
import { TagsService } from "./tags.service";

@Module({
  controllers: [TagsController],
  providers: [TagsService, { provide: TAG_REPOSITORY, useClass: PrismaTagRepository }],
  exports: [TAG_REPOSITORY, TagsService],
})
export class TagsModule {}
