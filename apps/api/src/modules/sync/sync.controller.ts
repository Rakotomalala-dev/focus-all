import { Body, Controller, Get, HttpCode, Inject, Post, Query } from "@nestjs/common";
import type { SyncPullResponse, SyncPushResponse, SyncSnapshotResponse } from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { SyncService } from "./sync.service";

// Le workspace vient du jeton pour les trois routes : le corps d'un push ne
// peut pas choisir un autre journal (N-3).
@Controller("sync")
export class SyncController {
  constructor(@Inject(SyncService) private readonly sync: SyncService) {}

  @Get("pull")
  pull(@CurrentAuth() auth: AuthContext, @Query() query: unknown): Promise<SyncPullResponse> {
    return this.sync.pull(auth, query);
  }

  @Post("push")
  @HttpCode(200)
  push(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<SyncPushResponse> {
    return this.sync.push(auth, body);
  }

  @Get("snapshot")
  snapshot(@CurrentAuth() auth: AuthContext): Promise<SyncSnapshotResponse> {
    return this.sync.snapshot(auth);
  }
}
