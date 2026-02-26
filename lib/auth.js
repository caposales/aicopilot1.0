import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET) {
  console.warn('Warning: JWT_SECRET not set. Using default for development only.')
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'dev-only-secret-do-not-use-in-production'
const JWT_EXPIRES_IN = '7d'

export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(12)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(password, hashedPassword) {
  return bcrypt.compare(password, hashedPassword)
}

export function generateToken(payload) {
  return jwt.sign(payload, EFFECTIVE_JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, EFFECTIVE_JWT_SECRET)
  } catch (error) {
    return null
  }
}

export function extractTokenFromHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  return authHeader.split(' ')[1]
}
