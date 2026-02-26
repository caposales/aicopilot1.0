// AES-GCM encryption for secrets
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

// Get or generate encryption key
function getEncryptionKey() {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    console.warn('Warning: ENCRYPTION_KEY not set. Using default for development only.')
  }
  const effectiveKey = key || 'dev-only-encryption-key-32bytes!'
  // Ensure key is exactly 32 bytes
  return Buffer.from(effectiveKey.padEnd(KEY_LENGTH, '0').slice(0, KEY_LENGTH))
}

export function encrypt(text) {
  if (!text) return null
  
  try {
    const key = getEncryptionKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    // Format: iv:authTag:encryptedData
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  } catch (error) {
    console.error('Encryption error:', error.message)
    throw new Error('Failed to encrypt data')
  }
}

export function decrypt(encryptedText) {
  if (!encryptedText) return null
  
  try {
    const key = getEncryptionKey()
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':')
    
    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted text format')
    }
    
    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    console.error('Decryption error:', error.message)
    throw new Error('Failed to decrypt data')
  }
}

// Mask a secret for UI display (show only last 4 chars)
export function maskSecret(secret) {
  if (!secret || secret.length < 4) return '••••••••'
  return '••••••••' + secret.slice(-4)
}
