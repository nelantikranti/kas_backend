import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../src/config/database";
import User from "../src/models/User";

async function main() {
  const email = (process.env.ADMIN_EMAIL || "elevatoradmin@damsole.com").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || "K@SElev@toradmin";
  const name = (process.env.ADMIN_NAME || "Elevator Admin").trim();

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required");
  }

  await connectDB();

  const today = new Date().toISOString().split("T")[0];

  const admin = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        name,
        email,
        password,
        role: "Admin",
        status: "Active",
        lastLogin: today,
      },
    },
    { upsert: true, new: true }
  );

  console.log(`✅ Admin ready: ${admin.email} (${admin._id.toString()})`);
}

main()
  .catch((err) => {
    console.error("❌ Failed to seed admin:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // ignore
    }
  });

