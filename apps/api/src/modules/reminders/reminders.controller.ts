import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post } from "@nestjs/common";
import type {
  Device,
  DeviceListResponse,
  NotificationPreferences,
} from "@focus/contracts";
import type { AuthContext } from "../auth/auth-context";
import { CurrentAuth } from "../auth/current-auth.decorator";
import { RemindersService } from "./reminders.service";

// RF-50/RF-51 : préférences par catégorie, plage silencieuse et appareils.
@Controller()
export class RemindersController {
  constructor(@Inject(RemindersService) private readonly reminders: RemindersService) {}

  @Get("notification-preferences")
  getPreferences(@CurrentAuth() auth: AuthContext): Promise<NotificationPreferences> {
    return this.reminders.getPreferences(auth);
  }

  @Patch("notification-preferences")
  updatePreferences(
    @CurrentAuth() auth: AuthContext,
    @Body() body: unknown,
  ): Promise<NotificationPreferences> {
    return this.reminders.updatePreferences(auth, body);
  }

  @Get("devices")
  async listDevices(@CurrentAuth() auth: AuthContext): Promise<DeviceListResponse> {
    return { items: [...(await this.reminders.listDevices(auth))] };
  }

  @Post("devices")
  registerDevice(@CurrentAuth() auth: AuthContext, @Body() body: unknown): Promise<Device> {
    return this.reminders.registerDevice(auth, body);
  }

  @Patch("devices/:id")
  updateDevice(
    @CurrentAuth() auth: AuthContext,
    @Param("id") id: string,
    @Body() body: unknown,
  ): Promise<Device> {
    return this.reminders.updateDevice(auth, id, body);
  }

  @Delete("devices/:id")
  @HttpCode(204)
  async removeDevice(@CurrentAuth() auth: AuthContext, @Param("id") id: string): Promise<void> {
    await this.reminders.removeDevice(auth, id);
  }
}
