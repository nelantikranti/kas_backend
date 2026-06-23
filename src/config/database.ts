import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import dns from "dns";

// Prefer IPv4 for DNS + sockets — avoids flaky IPv6 / NAT64 on Windows with Atlas
dns.setDefaultResultOrder("ipv4first");
// Load .env from project root (kas_backend/.env), regardless of cwd
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function getMongoUri(): string {
  return process.env.MONGODB_URI || "";
}

// Flag to track if event handlers have been registered
let eventHandlersRegistered = false;
let postConnectSetupDone = false;

// Fail fast when DB is down instead of buffering queries for 10s
mongoose.set("bufferCommands", false);

// Register connection event handlers only once
const registerConnectionHandlers = () => {
  if (eventHandlersRegistered) return;

  mongoose.connection.on("error", (err) => {
    console.error("❌ MongoDB connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("⚠️  MongoDB disconnected — Mongoose will reconnect automatically");
  });

  mongoose.connection.on("reconnected", () => {
    console.log("✅ MongoDB reconnected successfully");
  });

  eventHandlersRegistered = true;
};

export const connectDB = async () => {
  const MONGODB_URI = getMongoUri();
  if (!MONGODB_URI) {
    console.error("❌ Missing environment variable: MONGODB_URI");
    console.error("   Add MONGODB_URI to kas_backend/.env");
    return;
  }

  try {
    // If already connected, return early
    if (mongoose.connection.readyState === 1) {
      console.log("✅ MongoDB already connected");
      return;
    }
    
    // Register event handlers once
    registerConnectionHandlers();

    // Mongoose auto-reconnect in progress — don't start a competing connect
    if (mongoose.connection.readyState === 2) {
      return;
    }

    if (mongoose.connection.readyState === 3) {
      await mongoose.disconnect();
    }
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 30000,
      maxPoolSize: 10,
      // family: 4 avoids IPv6 ETIMEDOUT on Windows when Atlas resolves to unreachable IPv6
      family: 4,
      retryWrites: true,
    });

    console.log("✅ MongoDB connected successfully");
    console.log(`📊 Database: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, "//***:***@")}`);

    // Bootstrap and index fixes only on first connect — not on every auto-reconnect
    if (postConnectSetupDone) return;
    postConnectSetupDone = true;

    try {
      const { runHrBootstrap } = await import("../services/bootstrapService");
      await runHrBootstrap();
    } catch (bootstrapErr: unknown) {
      console.warn("⚠️  HR bootstrap:", bootstrapErr instanceof Error ? bootstrapErr.message : bootstrapErr);
    }

    // Fix duplicate key index issue - drop problematic 'id' unique index if it exists
    if ((mongoose.connection.readyState as number) === 1 && mongoose.connection.db) {
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const projectsCollection = collections.find(col => col.name === 'projects');
        
        if (projectsCollection) {
          const indexes = await mongoose.connection.db.collection('projects').indexes();
          const idIndex = indexes.find((idx: any) => idx.name === 'id_1' || (idx.key && idx.key.id === 1));
          
          if (idIndex && idIndex.unique) {
            console.log("⚠️  Found problematic unique index on 'id' field. Dropping it...");
            await mongoose.connection.db.collection('projects').dropIndex('id_1').catch((err: any) => {
              // Index might not exist or already dropped
              if (err.code !== 27) { // 27 = IndexNotFound error
                console.warn("Warning: Could not drop index:", err.message);
              }
            });
            console.log("✅ Index 'id_1' dropped successfully. MongoDB will use '_id' as primary key.");
            
            // Clean up existing documents - remove 'id' field from documents where id is null or missing
            try {
              const result = await mongoose.connection.db.collection('projects').updateMany(
                { $or: [{ id: null }, { id: { $exists: false } }] },
                { $unset: { id: "" } }
              );
              if (result.modifiedCount > 0) {
                console.log(`✅ Cleaned up ${result.modifiedCount} documents by removing 'id' field.`);
              }
            } catch (cleanupError: any) {
              console.warn("⚠️  Could not cleanup existing documents:", cleanupError.message);
            }
          }
        }
      } catch (indexError: any) {
        console.warn("⚠️  Could not check/fix indexes:", indexError.message);
        // Don't fail connection if index fix fails
      }
    }
    
    // Automatic seeding removed to prevent accidental population of databases.
    // If you need to seed data manually in the future, run the seed script locally
    // or re-add an explicit seeding step guarded by an environment flag.
  } catch (error: any) {
    console.error("❌ MongoDB connection error:", error.message);
    
    if (error.name === "MongooseServerSelectionError") {
      console.error("⚠️  MongoDB Server Selection Error:");
      console.error("   1. Check if your IP address is whitelisted in MongoDB Atlas");
      console.error("   2. Go to MongoDB Atlas → Network Access → Add IP Address");
      console.error("   3. Add 0.0.0.0/0 for Render deployment (or specific IPs)");
      console.error("   4. Verify MONGODB_URI is correct in environment variables");
    } else if (error.message?.includes("queryTxt") || error.message?.includes("ETIMEOUT")) {
      console.error("⚠️  DNS timeout reaching MongoDB Atlas:");
      console.error("   1. Check your internet connection / disable VPN if active");
      console.error("   2. Try switching DNS to 8.8.8.8 or 1.1.1.1");
      console.error("   3. In Atlas → Connect → use the standard (non-SRV) connection string if DNS stays flaky");
    } else {      console.error("⚠️  Please ensure MongoDB is running:");
      console.error("   1. Check if MongoDB service is running");
      console.error("   2. Or run: start-mongodb.bat");
      console.error("   3. Connection string:", MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    }
    // Don't exit - allow server to run without MongoDB for development
  }
};

export default connectDB;