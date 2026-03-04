// Platform-level API keys from environment variables.
// When set, these keys are used as defaults for all workspaces,
// so users don't need to configure them individually.

export function getPlatformKeys() {
  return {
    deepgram: {
      apiKey: process.env.DEEPGRAM_API_KEY || null,
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || null,
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || null,
      authToken: process.env.TWILIO_AUTH_TOKEN || null,
    },
    ghl: {
      apiKey: process.env.GHL_API_KEY || null,
      locationId: process.env.GHL_LOCATION_ID || null,
    },
    calcom: {
      apiKey: process.env.CALCOM_API_KEY || null,
    },
  }
}

export function hasPlatformKey(provider) {
  const keys = getPlatformKeys()
  const config = keys[provider]
  if (!config) return false

  if (provider === 'twilio') {
    return !!(config.accountSid && config.authToken)
  }
  return !!config.apiKey
}

export function getPlatformKey(provider) {
  const keys = getPlatformKeys()
  return keys[provider] || null
}
