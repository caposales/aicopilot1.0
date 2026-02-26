import { MongoClient } from 'mongodb'

let client = null
let db = null

export async function connectToMongo() {
  if (db) return db
  
  try {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
    console.log('Connected to MongoDB')
    return db
  } catch (error) {
    console.error('MongoDB connection error:', error)
    throw error
  }
}

export async function getCollection(collectionName) {
  const database = await connectToMongo()
  return database.collection(collectionName)
}
