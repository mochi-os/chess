import { shellStorage } from '@mochi/common'

const LAST_GAME_KEY = 'mochi-chess-last'

export const setLastGame = (gameId: string) => {
  shellStorage.setItem(LAST_GAME_KEY, gameId)
}

export const getLastGame = async (): Promise<string | null> => {
  return shellStorage.getItem(LAST_GAME_KEY)
}

export const clearLastGame = () => {
  shellStorage.removeItem(LAST_GAME_KEY)
}
