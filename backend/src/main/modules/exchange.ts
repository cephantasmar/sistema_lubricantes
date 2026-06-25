import type { ParallelDollarRate } from '../../shared/ipc/contracts'

const BINANCE_P2P_URL = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search'
const CACHE_DURATION_MS = 2 * 60 * 1000
const SAMPLE_SIZE = 5

let cachedRate: ParallelDollarRate | null = null
let cachedAt = 0

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

async function fetchP2PPrices(tradeType: 'BUY' | 'SELL') {
  const response = await fetch(BINANCE_P2P_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Inventario-Lubricantes/1.0',
    },
    body: JSON.stringify({
      page: 1,
      rows: SAMPLE_SIZE,
      payTypes: [],
      asset: 'USDT',
      fiat: 'BOB',
      tradeType,
      publisherType: null,
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Binance P2P respondió con estado ${response.status}.`)
  }

  const payload = await response.json() as {
    data?: Array<{ adv?: { price?: string } }>
  }
  const prices = (payload.data ?? [])
    .map((item) => Number(item.adv?.price))
    .filter((price) => Number.isFinite(price) && price > 0)

  if (prices.length === 0) {
    throw new Error('Binance P2P no devolvió ofertas USDT/BOB.')
  }

  return prices
}

export async function getParallelDollarRate(forceRefresh = false): Promise<ParallelDollarRate> {
  if (!forceRefresh && cachedRate && Date.now() - cachedAt < CACHE_DURATION_MS) {
    return cachedRate
  }

  const [buyPrices, sellPrices] = await Promise.all([
    fetchP2PPrices('BUY'),
    fetchP2PPrices('SELL'),
  ])

  cachedRate = {
    buy: Number(median(buyPrices).toFixed(2)),
    sell: Number(median(sellPrices).toFixed(2)),
    updatedAt: new Date().toISOString(),
    source: 'Binance P2P',
    sampleSize: Math.min(buyPrices.length, sellPrices.length),
  }
  cachedAt = Date.now()

  return cachedRate
}
