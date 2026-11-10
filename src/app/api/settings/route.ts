import { NextResponse, type NextRequest } from "next/server";
import mongoose from "mongoose";
import { requireAuthUser } from "@/lib/auth/guard";
import { SettingsModel, type ISettings } from "@/lib/db/models/Settings";
import { UserModel } from "@/lib/db/models/User";
import { handleApiError } from "@/lib/errors";
import { ensureUserBootstrap } from "@/lib/services/bootstrap";
import { serializeSettings } from "@/lib/services/serializers";
import { updateSettingsSchema } from "@/lib/validation/schemas";

export async function GET() {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const settings = await SettingsModel.findOne({
      userId: new mongoose.Types.ObjectId(user.id),
    }).lean();

    return NextResponse.json({
      user,
      settings: settings
        ? serializeSettings(settings as unknown as ISettings)
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAuthUser();
    await ensureUserBootstrap(user.id);
    const body = await request.json().catch(() => null);
    const parsed = updateSettingsSchema.parse(body);
    const userObjectId = new mongoose.Types.ObjectId(user.id);

    if (parsed.name) {
      await UserModel.updateOne(
        { _id: userObjectId },
        { $set: { name: parsed.name } },
      );
    }

    const updateFields: Record<string, unknown> = {};
    if (parsed.currencyCode !== undefined)
      updateFields.currencyCode = parsed.currencyCode;
    if (parsed.currencySymbol !== undefined)
      updateFields.currencySymbol = parsed.currencySymbol;
    if (parsed.dateFormat !== undefined)
      updateFields.dateFormat = parsed.dateFormat;
    if (parsed.theme !== undefined) updateFields.theme = parsed.theme;
    if (parsed.defaultDashboardRange !== undefined)
      updateFields.defaultDashboardRange = parsed.defaultDashboardRange;

    const updatedSettings = await SettingsModel.findOneAndUpdate(
      { userId: userObjectId },
      { $set: updateFields },
      { returnDocument: "after" },
    ).lean();

    const freshUser = await UserModel.findById(userObjectId).lean();

    return NextResponse.json({
      user: freshUser
        ? {
            id: freshUser._id.toString(),
            name: freshUser.name,
            email: freshUser.email,
            createdAt: freshUser.createdAt.toISOString(),
          }
        : user,
      settings: updatedSettings
        ? serializeSettings(updatedSettings as unknown as ISettings)
        : null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
