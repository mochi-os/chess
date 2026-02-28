const LAST_GAME_KEY = 'mochi-chess-last'

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
