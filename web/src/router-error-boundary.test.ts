// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.
// TanStack wraps a match in a CatchBoundary only where the route resolves an
// errorComponent, so without this default the only boundary is __root's and a
// page error replaces the sidebar too. RouteError's own behaviour is covered
// in lib/web; what is guarded here is that this app still passes the option.
// main.tsx renders on import, so it is read rather than imported. Vitest runs
// from the package root, so the path is resolved from there.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

describe('app router', () => {
  it('gives every route its own error boundary', async () => {
    const source = await readFile(
      path.resolve(process.cwd(), 'src/main.tsx'),
      'utf8'
    )
    expect(source).toMatch(/defaultErrorComponent:\s*RouteError/)
  })
})
