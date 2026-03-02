import { MongoClient } from 'mongodb'

// Use a global variable to cache the connection across serverless function invocations
// This is the recommended pattern for Next.js on Vercel to avoid connection exhaustion
let cachedClient = null
let cachedDb = null

export async function connectToMongo() {
  if (cachedDb) return cachedDb
  
  try {
    if (!cachedClient) {
      cachedClient = new MongoClient(process.env.MONGO_URL)
      await cachedClient.connect()
      console.log('Connected to MongoDB')
    }
    cachedDb = cachedClient.db(process.env.DB_NAME)
    return cachedDb
  } catch (error) {
    cachedClient = null
    cachedDb = null
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export async function getCollection(collectionName) {
  const database = await connectToMongo()
  return database.collection(collectionName)
}
