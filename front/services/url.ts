export const VITE_API_URL = import.meta.env.VITE_API_URL

export const VITE_MIDNIGHT_RELAYER_URL = import.meta.env.VITE_MIDNIGHT_RELAYER_URL || 'http://localhost:8788'

// Passed to a connected wallet's InitialAPI.connect(networkId). There's no
// fixed enum for this — @midnight-ntwrk/midnight-js-network-id types it as
// a plain string — so this must match whatever network the installed
// wallet (1AM, Lace, etc.) is actually configured for. 'preprod' is
// Midnight's current public testnet identifier as of this writing; override
// per environment rather than assuming it stays accurate.
export const VITE_MIDNIGHT_NETWORK = import.meta.env.VITE_MIDNIGHT_NETWORK || 'preprod'
