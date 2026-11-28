import {
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type { AccountExport, ExportJob } from "@focus/contracts";
import type { FastifyReply } from "fastify";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { Public } from "../auth/public.decorator";
import { ExportService } from "./export.service";

// RF-71 : création asynchrone, statut pollable, téléchargement par lien signé.
@Controller("me/export")
export class ExportController {
  constructor(@Inject(ExportService) private readonly exports: ExportService) {}

  @Post()
  @HttpCode(202)
  request(@CurrentAuth() auth: AuthContext): Promise<ExportJob> {
    return this.exports.request(auth);
  }

  @Get(":id")
  status(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<ExportJob> {
    return this.exports.status(auth, id);
  }

  // Le jeton signé (24 h) est la seule autorisation : un navigateur peut
  // télécharger sans en-tête Authorization, sans exposer la session.
  @Public()
  @Get(":id/download")
  async download(
    @Param("id") id: string,
    @Query("token") token: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AccountExport> {
    const payload = await this.exports.download(id, token);
    reply.header("content-disposition", `attachment; filename="focus-export-${id}.json"`);
    reply.header("cache-control", "private, no-store");
    return payload;
  }
}
