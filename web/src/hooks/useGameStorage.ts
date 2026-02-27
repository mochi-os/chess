const LAST_GAME_KEY = 'mochi-chess-last'
const SESSION_STARTED_KEY = 'mochi-chess-session-started'

export const setLastGame = (gameId: string) => {
  try {
    localStorage.setItem(LAST_GAME_KEY, gameId)
  } catch {
    // localStorage may not be available
  }
}

export const getLastGame = (): string | null => {
  try {
    return localStorage.getItem(LAST_GAME_KEY)
  } catch {
    return null
  }
}

export const clearLastGame = () => {
  try {
    localStorage.removeItem(LAST_GAME_KEY)
  } catch {
    // ignore
  }
}

export const shouldRedirectToLastGame = (): boolean => {
  try {
    const started = sessionStorage.getItem(SESSION_STARTED_KEY)
    if (!started) {
      sessionStorage.setItem(SESSION_STARTED_KEY, '1')
      return true
    }
    return false
  } catch {
    return false
  }
}
