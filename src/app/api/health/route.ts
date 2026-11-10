import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/connect";

export async function GET() {
  try {
    await connectDB();
    const state = mongoose.connection.readyState;
    return NextResponse.json({
      ok: true,
      dbConnected: state === 1,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        dbConnected: false,
        error: err instanceof Error ? err.message : "Database unavailable",
      },
      { status: 503 },
    );
  }
}
