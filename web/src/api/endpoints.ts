const endpoints = {
  game: {
    list: '/-/list',
    new: '/-/new',
    create: '/-/create',
    detail: (gameId: string) => `/${gameId}/-/view`,
    messages: (gameId: string) => `/${gameId}/-/messages`,
    send: (gameId: string) => `/${gameId}/-/send`,
    move: (gameId: string) => `/${gameId}/-/move`,
    resign: (gameId: string) => `/${gameId}/-/resign`,
    delete: (gameId: string) => `/${gameId}/-/delete`,
  },
  auth: {
    code: '/_/code',
    verify: '/_/verify',
    identity: '/_/identity',
    logout: '/_/logout',
  },
} as const

export default endpoints
