import { useCallback, useEffect, useState } from 'react'
import { getMySharingCode, getUserAddress, initializeMidnight } from '../services/midnight'

export function useMidnightUser() {
  const [userAddress, setUserAddress] = useState<string | null>(null)
  const [sharingCode, setSharingCode] = useState<string | null>(null)
  const [walletConnected, setWalletConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  const refreshAddress = useCallback(async () => {
    const address = await getUserAddress()
    setUserAddress(address)
    if (address) {
      setSharingCode(await getMySharingCode(address))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const connected = await initializeMidnight()
      if (cancelled) return
      setWalletConnected(connected)
      await refreshAddress()
      if (cancelled) return
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshAddress])

  // initializeMidnight() already dedupes concurrent calls into one
  // in-flight request (see midnight.ts), so this can't fire a second
  // overlapping connect() — but the wallet's own approval popup can still
  // sit unfocused/unnoticed, and a user clicking "Connect wallet" again
  // while nothing visibly happens is exactly what an unguarded button
  // invites. Track connecting state so the button can disable itself and
  // say so, rather than relying on the wallet to explain "already pending"
  // for every extra click.
  const connectWallet = useCallback(async () => {
    if (connecting) return
    setConnecting(true)
    try {
      const connected = await initializeMidnight()
      setWalletConnected(connected)
      await refreshAddress()
    } finally {
      setConnecting(false)
    }
  }, [connecting, refreshAddress])

  return { userAddress, sharingCode, walletConnected, loading, connecting, connectWallet }
}
