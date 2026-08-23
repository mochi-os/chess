// Copyright © 2026 Mochisoft OÜ
// SPDX-License-Identifier: AGPL-3.0-only
// This file is part of Mochi, licensed under the GNU AGPL v3 with the
// Mochi Application Interface Exception - see license.txt and license-exception.md.

import { defineConfig } from 'vitest/config'
import path from 'path'

// Deliberately smaller than projects/crm's config: everything covered here is
// pure logic over chess.js, so there is no jsdom environment, no Lingui macro
// transform and no setup file to maintain. Add them when a component test needs
// them, not before.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
