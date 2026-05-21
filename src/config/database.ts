import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load .env from project root (kas_backend/.env), regardless of cwd
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function getMongoUri(): string {
  return process.env.MONGODB_URI || "";
}

// Flag to track if event handlers have been registered
let eventHandlersRegistered = false;

// Register connection event handlers only once
const registerConnectionHandlers = () => {
  if (eventHandlersRegistered) return;
  
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
  
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected. Mongoose will automatically attempt to reconnect...');
  });
  
  mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected successfully');
  });
  
  mongoose.connection.on('connecting', () => {
    console.log('🔄 Connecting to MongoDB...');
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
    
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Only disconnect if in an intermediate state (connecting/disconnecting)
    // Don't disconnect if already connected - that's handled by the early return above
    if (mongoose.connection.readyState === 2 || mongoose.connection.readyState === 3) {
      await mongoose.disconnect();
    }
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: isProduction ? 30000 : 10000, // 30s for production, 10s for dev
      socketTimeoutMS: 60000, // Close sockets after 60s of inactivity (increased)
      connectTimeoutMS: 30000, // 30s connection timeout
      maxPoolSize: 10, // Maintain up to 10 socket connections
      // Remove minPoolSize - let MongoDB manage connection pool naturally
      maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
      // Remove retryWrites and w - they're already in the connection string URI
    });
    
    console.log("✅ MongoDB connected successfully");
    console.log(`📊 Database: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`); // Hide credentials in logs
    
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
    
    if (error.name === 'MongooseServerSelectionError') {
      console.error("⚠️  MongoDB Server Selection Error:");
      console.error("   1. Check if your IP address is whitelisted in MongoDB Atlas");
      console.error("   2. Go to MongoDB Atlas → Network Access → Add IP Address");
      console.error("   3. Add 0.0.0.0/0 for Render deployment (or specific IPs)");
      console.error("   4. Verify MONGODB_URI is correct in environment variables");
    } else {
      console.error("⚠️  Please ensure MongoDB is running:");
      console.error("   1. Check if MongoDB service is running");
      console.error("   2. Or run: start-mongodb.bat");
      console.error("   3. Connection string:", MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));
    }
    // Don't exit - allow server to run without MongoDB for development
  }
};

export default connectDB;