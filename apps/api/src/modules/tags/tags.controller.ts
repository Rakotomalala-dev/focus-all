import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from "@nestjs/common";
import type { Tag, TagListResponse } from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { TagsService } from "./tags.service";

@Controller("tags")
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext): Promise<TagListResponse> {
    return this.tags.list(auth);
  }

  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<Tag> {
    return this.tags.create(auth, body);
  }

  @Post("ensure")
  @HttpCode(200)
  ensure(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<readonly Tag[]> {
    return this.tags.ensure(auth, body);
  }

  @Patch(":id")
  update(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Tag> {
    return this.tags.update(auth, id, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    await this.tags.remove(auth, id);
  }
}
