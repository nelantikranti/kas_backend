/**
 * Script to fix duplicate key error on projects collection
 * Drops the problematic 'id_1' unique index
 * 
 * Run: node scripts/fix-project-index.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/kas-crm";

async function fixProjectIndex() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('projects');

    // List all indexes
    console.log('\n📋 Current indexes:');
    const indexes = await collection.indexes();
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(unique)' : '');
    });

    // Find and drop the problematic id_1 index
    const idIndex = indexes.find(idx => idx.name === 'id_1' || (idx.key && idx.key.id === 1));
    
    if (idIndex) {
      console.log('\n⚠️  Found problematic index:', idIndex.name);
      console.log('🗑️  Dropping index...');
      
      try {
        await collection.dropIndex(idIndex.name);
        console.log('✅ Index dropped successfully!');
      } catch (dropError) {
        if (dropError.code === 27) {
          console.log('ℹ️  Index already does not exist');
        } else {
          throw dropError;
        }
      }

      // Clean up documents with id: null
      console.log('\n🧹 Cleaning up documents with id: null...');
      const result = await collection.updateMany(
        { $or: [{ id: null }, { id: { $exists: false } }] },
        { $unset: { id: "" } }
      );
      console.log(`✅ Cleaned up ${result.modifiedCount} documents`);

    } else {
      console.log('\n✅ No problematic index found. Everything looks good!');
    }

    // List indexes after cleanup
    console.log('\n📋 Final indexes:');
    const finalIndexes = await collection.indexes();
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(unique)' : '');
    });

    console.log('\n✅ Fix complete! You can now create projects without duplicate key errors.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n👋 Disconnected from MongoDB');
  }
}

fixProjectIndex();

