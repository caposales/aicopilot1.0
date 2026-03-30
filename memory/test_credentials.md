# Test Credentials

## Test User Account
- Email: test@demo.com
- Password: test123

## Test Agent
- Agent ID: 68a2d703-6eae-4ebf-8006-8df451bd5dba
- Agent Name: Demo Agent
- Voice: rachel (ElevenLabs fallback)

## Integration Keys (configured in .env)
- Deepgram API Key: c4dcda44c17e81faa70a14ff02e387163ca05105
- ElevenLabs API Key: sk_71d91530418d75456a9552e550457d4cf228fdd4c9efa150 (Note: Account has 0 voices, TTS will fallback to browser)
- Emergent LLM Key: sk-emergent-3A415FcFe0eC04dCcA

## Notes
- ElevenLabs account has no voices - TTS falls back to browser Web Speech API
- Deepgram API key works for direct WebSocket connections but cannot generate temporary tokens (permission issue)
