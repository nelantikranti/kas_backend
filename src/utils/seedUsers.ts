import User from "../models/User";
import { DEFAULT_ROLE_PERMISSIONS, ALL_PERMISSIONS } from "./permissions";

// Default users to seed if they don't exist
const defaultUsers = [
  {
    name: "Admin User",
    email: "admin@kas.com",
    password: "admin123",
    role: "Admin" as const,
    permissions: ALL_PERMISSIONS, // Admin gets all permissions
    status: "Active" as const,
    lastLogin: new Date().toISOString().split("T")[0],
  },
  {
    name: "Sales Executive 1",
    email: "sales1@kas.com",
    password: "sales123",
    role: "Sales Executive" as const,
    permissions: DEFAULT_ROLE_PERMISSIONS["Sales Executive"] || [],
    status: "Active" as const,
    lastLogin: new Date().toISOString().split("T")[0],
  },
  {
    name: "Sales Executive 2",
    email: "sales2@kas.com",
    password: "sales123",
    role: "Sales Executive" as const,
    permissions: DEFAULT_ROLE_PERMISSIONS["Sales Executive"] || [],
    status: "Active" as const,
    lastLogin: new Date().toISOString().split("T")[0],
  },
  {
    name: "Engineer 1",
    email: "engineer1@kas.com",
    password: "engineer123",
    role: "Service Engineer" as const,
    permissions: DEFAULT_ROLE_PERMISSIONS["Service Engineer"] || [],
    status: "Active" as const,
    lastLogin: new Date().toISOString().split("T")[0],
  },
  {
    name: "Project Manager 1",
    email: "pm1@kas.com",
    password: "pm123",
    role: "Project Manager" as const,
    permissions: DEFAULT_ROLE_PERMISSIONS["Project Manager"] || [],
    status: "Active" as const,
    lastLogin: new Date().toISOString().split("T")[0],
  },
];

export const seedDefaultUsers = async () => {
  try {
    console.log("🌱 Seeding default users...");
    
    for (const userData of defaultUsers) {
      const existingUser = await User.findOne({ email: userData.email });
      
      if (!existingUser) {
        const newUser = new User(userData);
        await newUser.save();
        console.log(`✅ Created default user: ${userData.email}`);
      } else {
        // Update password if user exists but password might be missing
        if (!existingUser.password) {
          existingUser.password = userData.password;
          await existingUser.save();
          console.log(`✅ Updated password for: ${userData.email}`);
        }
      }
    }
    
    console.log("✅ Default users seeding completed");
  } catch (error) {
    console.error("❌ Error seeding default users:", error);
  }
};

