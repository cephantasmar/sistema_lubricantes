import './style.css'
import '@tabler/icons-webfont/dist/tabler-icons.css'
import './notifications.css'
import { showToast } from './notifications'
import type {
  AttendanceFormInput,
  AuthInput,
  AuthResult,
  BootstrapData,
  ClientFormInput,
  InventoryAuditInput,
  MovementFormInput,
  ProductFormInput,
  ProductRow,
  RoleFormInput,
  SaleFormInput,
  SaleFullDetail,
  ShiftFormInput,
  WorkerFormInput,
  SalesReportInput,
  SalesReportData,
} from '@shared/ipc/contracts'

type TabName = 'home' | 'dashboard' | 'inventario' | 'movimientos' | 'ventas' | 'turnos' | 'administracion' | 'admin-roles' | 'admin-trabajadores' | 'admin-turnos' | 'admin-auditoria' | 'reportes'
type Semaforo = 'pendiente' | 'verde' | 'amarillo' | 'rojo'
type InventorySearchField = 'all' | 'codigo' | 'nombre'
type ThemeName = 'light' | 'dark'

const THEME_STORAGE_KEY = 'lubricantes-theme'

type ProductFormState = { id_producto: number | null }
const productFormState: ProductFormState = { id_producto: null }


type InventoryAuditRowState = {
  id_producto: number
  conteo_fisico: number
  precio_costo: number
  precio_venta: number
  revisado: boolean
}

type RoleFormState = { id_rol: number | null }
const roleFormState: RoleFormState = { id_rol: null }

type WorkerFormState = { id_trabajador: number | null }
const workerFormState: WorkerFormState = { id_trabajador: null }

type ShiftFormState = { id_turno: number | null }
const shiftFormState: ShiftFormState = { id_turno: null }

let bootstrapData: BootstrapData | null = null
let currentUser: NonNullable<AuthResult['user']> | null = null
const saleCart = new Map<number, { product: ProductRow; cantidad: number; descuento_unitario: number }>()

type LocalPayment = {
  id_metodo_pago: number
  metodo_nombre: string
  id_moneda: number
  moneda_codigo: string
  monto: number
  referencia_pago: string | null
}

const salePayments: LocalPayment[] = []
let inventoryAuditMode = false
let inventoryAuditRows: InventoryAuditRowState[] = []
let appInfoSnapshot: { appName: string; version: string; databasePath: string } | null = null
let inventorySearchTerm = ''
let inventorySearchField: InventorySearchField = 'all'
let inventoryAuditSearchTerm = ''
let clockInterval: number | null = null
let landingDismissTimer: number | null = null
let bootstrapInitialized = false
let saleSubmissionInProgress = false
let currentSalesReportData: SalesReportData | null = null

function applyTheme(theme: ThemeName) {
  document.documentElement.dataset.theme = theme
  const button = document.querySelector<HTMLButtonElement>('#theme-toggle')
  if (!button) return

  const dark = theme === 'dark'
  button.setAttribute('aria-pressed', String(dark))
  button.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
  button.innerHTML = dark
    ? '<i class="ti ti-sun"></i> <span>Modo claro</span>'
    : '<i class="ti ti-moon"></i> <span>Modo oscuro</span>'
}

function initTheme() {
  let theme: ThemeName = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
  try {
    theme = localStorage.getItem(THEME_STORAGE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    // La aplicación puede funcionar aunque el almacenamiento local no esté disponible.
  }

  applyTheme(theme)
  document.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
    const nextTheme: ThemeName = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'
    applyTheme(nextTheme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
    } catch {
      // En este caso la preferencia solo durará durante la ejecución actual.
    }
  })
}

function hasPermission(permissionName: string) {
  return Boolean(currentUser?.id_usuario === 1 || currentUser?.permissionNames.includes(permissionName))
}

function hasAnyPermission(permissionNames: string[]) {
  return permissionNames.some((permissionName) => hasPermission(permissionName))
}

function canAccessTab(tabName: TabName) {
  const accessByTab: Record<TabName, boolean> = {
    home: true,
    dashboard: hasAnyPermission(['VER_DASHBOARD']) || Boolean(currentUser?.isAdminLike),
    inventario: hasPermission('GESTIONAR_INVENTARIO'),
    movimientos: hasPermission('GESTIONAR_MOVIMIENTOS'),
    ventas: hasPermission('GESTIONAR_VENTAS'),
    turnos: hasAnyPermission(['VER_ASISTENCIAS', 'REGISTRAR_ASISTENCIAS']),
    administracion: hasAnyPermission(['GESTIONAR_ROLES', 'GESTIONAR_TRABAJADORES', 'GESTIONAR_TURNOS', 'VER_AUDITORIA']),
    'admin-roles': hasPermission('GESTIONAR_ROLES'),
    'admin-trabajadores': hasPermission('GESTIONAR_TRABAJADORES'),
    'admin-turnos': hasPermission('GESTIONAR_TURNOS'),
    'admin-auditoria': hasPermission('VER_AUDITORIA'),
    reportes: hasPermission('GESTIONAR_REPORTES'),
  }

  return accessByTab[tabName]
}

function getFirstAccessibleTab(): TabName {
  return (['home', 'dashboard', 'inventario', 'movimientos', 'ventas', 'turnos', 'admin-roles', 'admin-trabajadores', 'admin-turnos', 'admin-auditoria', 'reportes'] as TabName[]).find(canAccessTab) ?? 'home'
}


function setActiveTab(tabName: TabName) {
  const nextTab = canAccessTab(tabName) ? tabName : getFirstAccessibleTab()

  document.querySelectorAll<HTMLElement>('.tabs__button[data-tab]').forEach((button) => {
    const buttonTab = button.dataset.tab as TabName | undefined
    if (buttonTab === ('administracion-group' as any)) return
    const allowed = buttonTab ? canAccessTab(buttonTab) : false
    const isActive = allowed && buttonTab === nextTab
    button.hidden = !allowed
    button.toggleAttribute('aria-hidden', !allowed)
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-selected', String(isActive))
  })
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    const panelTab = panel.dataset.panel as TabName | undefined
    const allowed = panelTab ? canAccessTab(panelTab) : false
    panel.hidden = !allowed
    panel.toggleAttribute('aria-hidden', !allowed)
    panel.classList.toggle('is-active', allowed && panelTab === nextTab)
  })

  // Auto-expand accordion if active tab is a sub-tab
  const isSubTab = ['admin-roles', 'admin-trabajadores', 'admin-turnos', 'admin-auditoria'].includes(nextTab)
  if (isSubTab) {
    const toggle = document.getElementById('admin-accordion-toggle')
    const content = document.getElementById('admin-accordion-content')
    if (toggle && content) {
      toggle.setAttribute('aria-expanded', 'true')
      content.style.display = 'flex'
    }
  }

  if (tabName === 'ventas') {
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('#sale-product-search')?.focus()
    }, 50)
  } else if (tabName === 'reportes') {
    initReportDates()
    void loadSalesReportData()
  }
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatHours(value: number) {
  return new Intl.NumberFormat('es-EC', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function normalizeSearch(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('es')
}

function isProductActive(product: ProductRow) {
  return product.estado === true || product.estado === 1
}

function getSaleSubtotal() {
  return roundMoney(
    Array.from(saleCart.values()).reduce((sum, item) => sum + Number(item.product.precio_venta) * item.cantidad, 0),
  )
}

function getSaleFinancialSnapshot() {
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  const discountInput = document.querySelector<HTMLInputElement>('#sale-form input[name="descuento_total"]')
  const idMonedaSale = Number((saleForm?.elements.namedItem('id_moneda') as HTMLSelectElement | null)?.value ?? 1)
  const saleCurrencyObj = bootstrapData?.references.monedas.find((currency) => currency.id === idMonedaSale)
  const saleCurrencyCode = saleCurrencyObj ? saleCurrencyObj.nombre.split(' - ')[0] : 'BOB'
  const subtotal = getSaleSubtotal()
  const discountManual = roundMoney(Number(discountInput?.value ?? 0))
  const discountLines = roundMoney(
    Array.from(saleCart.values()).reduce((sum, item) => sum + (item.descuento_unitario ?? 0) * item.cantidad, 0),
  )
  const discountTotal = roundMoney(discountLines + discountManual)
  const validDiscountTotal = Number.isFinite(discountTotal) && discountTotal >= 0 ? Math.min(discountTotal, subtotal) : 0
  const total = roundMoney(subtotal - validDiscountTotal)

  let paid = 0
  salePayments.forEach((payment) => {
    const ratePayment = getLocalCurrencyRate(payment.id_moneda)
    const rateSale = getLocalCurrencyRate(idMonedaSale)
    paid = roundMoney(paid + (payment.monto * ratePayment) / rateSale)
  })

  return {
    saleCurrencyCode,
    subtotal,
    discountLines,
    validDiscountTotal,
    total,
    paid,
    pending: paid >= total ? 0 : roundMoney(total - paid),
    change: paid > total ? roundMoney(paid - total) : 0,
  }
}

function updateSaleGuidance() {
  const snapshot = getSaleFinancialSnapshot()
  const hasProducts = saleCart.size > 0
  const hasPayments = salePayments.length > 0
  const nextAction = document.querySelector<HTMLElement>('#sale-next-action')

  document.querySelectorAll<HTMLElement>('[data-sale-step]').forEach((step) => {
    step.classList.remove('is-active', 'is-done')
  })

  const searchStep = document.querySelector<HTMLElement>('[data-sale-step="buscar"]')
  const reviewStep = document.querySelector<HTMLElement>('[data-sale-step="revisar"]')
  const payStep = document.querySelector<HTMLElement>('[data-sale-step="cobrar"]')

  if (!hasProducts) {
    searchStep?.classList.add('is-active')
    if (nextAction) nextAction.textContent = 'Busca por codigo, nombre o marca para empezar.'
    return
  }

  searchStep?.classList.add('is-done')

  if (!hasPayments) {
    reviewStep?.classList.add('is-active')
    if (nextAction) {
      nextAction.textContent = 'Revisa cantidad y total. Si esta correcto, pulsa Cobrar saldo.'
    }
    return
  }

  if (snapshot.pending > 0) {
    reviewStep?.classList.add('is-done')
    payStep?.classList.add('is-active')
    if (nextAction) {
      nextAction.textContent = `Registra el pago pendiente: ${snapshot.saleCurrencyCode} ${formatCurrency(snapshot.pending)}.`
    }
    return
  }

  reviewStep?.classList.add('is-done')
  payStep?.classList.add('is-done', 'is-active')
  if (nextAction) {
    nextAction.textContent = 'Todo listo. Confirma la venta para guardarla.'
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function formatTime(value: string | null) {
  if (!value) {
    return 'Pendiente'
  }

  return new Intl.DateTimeFormat('es-EC', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatCurrentDate(value: Date) {
  return new Intl.DateTimeFormat('es-BO', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

function formatCurrentClock(value: Date) {
  return new Intl.DateTimeFormat('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value)
}

function updateClock() {
  const now = new Date()
  const clock = formatCurrentClock(now)
  const date = formatCurrentDate(now)
  renderLanding()

  document.querySelectorAll<HTMLElement>('#landing-clock, #topbar-clock').forEach((element) => {
    element.textContent = clock
  })
  document.querySelectorAll<HTMLElement>('#landing-date, #topbar-date').forEach((element) => {
    element.textContent = date
  })
}

function startClock() {
  updateClock()

  if (clockInterval) {
    window.clearInterval(clockInterval)
  }

  clockInterval = window.setInterval(updateClock, 1000)
}

function getFormValues<T extends HTMLElement>(form: HTMLFormElement) {
  return new FormData(form) as unknown as FormData & {
    get(name: string): FormDataEntryValue | null
  }
}


function normalizeSearchValue(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function matchesProductSearch(product: BootstrapData['products'][number], searchTerm: string, field: InventorySearchField) {
  if (!searchTerm) {
    return true
  }

  const codigo = normalizeSearchValue(product.codigo)
  const nombre = normalizeSearchValue(product.nombre)

  if (field === 'codigo') {
    return codigo.includes(searchTerm)
  }

  if (field === 'nombre') {
    return nombre.includes(searchTerm)
  }

  return codigo.includes(searchTerm) || nombre.includes(searchTerm)
}

function getFilteredProducts(data: BootstrapData) {
  const normalized = normalizeSearchValue(inventorySearchTerm)
  return data.products.filter((product) => matchesProductSearch(product, normalized, inventorySearchField))
}

function getFilteredAuditProducts(data: BootstrapData) {
  const normalized = normalizeSearchValue(inventoryAuditSearchTerm)
  return data.products.filter((product) => matchesProductSearch(product, normalized, 'all'))
}

function formatCurrency(value: number) {
  return formatNumber(value)
}


function renderMetricCards(data: BootstrapData) {
  const metricsContainer = document.querySelector<HTMLDivElement>('#dashboard-metrics')
  const quickStats = document.querySelector<HTMLDivElement>('#quick-stats')
  const salesTotal = Number(data.metrics.totalSalesAmount || 0)
  const cards = [
    { icon: 'ti-box', label: 'Productos', value: data.metrics.totalProducts, detail: `${data.metrics.lowStockProducts} con stock bajo` },
    { icon: 'ti-packages', label: 'Stock total', value: formatNumber(data.metrics.totalStock), detail: 'Unidades registradas' },
    { icon: 'ti-arrows-exchange', label: 'Movimientos', value: data.metrics.totalMovements, detail: 'Movimientos recientes' },
    { icon: 'ti-receipt', label: 'Ventas', value: data.metrics.totalSales, detail: `Bs ${formatCurrency(salesTotal)}` },
    { icon: 'ti-users', label: 'En turno', value: data.metrics.activeAttendances, detail: 'Trabajadores activos' },
  ]
  const markup = cards.map(card => `
    <article class="summary-card">
      <div class="summary-card__heading"><i class="ti ${card.icon}"></i><span>${escapeHtml(card.label)}</span></div>
      <strong>${escapeHtml(card.value)}</strong>
      <small>${escapeHtml(card.detail)}</small>
    </article>
  `).join('')
  if (metricsContainer) metricsContainer.innerHTML = markup
  if (quickStats) quickStats.innerHTML = markup
}

function renderDashboard(data: BootstrapData) {
  const lowStock = data.products
    .filter((product) => Number(product.stock_actual) <= Number(product.stock_minimo))
    .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual))
    .slice(0, 6)
  const activeWorkers = data.attendances.filter((attendance) => attendance.estado === 'EN_TURNO').slice(0, 6)
  const recentSales = data.sales.slice(0, 5)
  const recentMovements = data.movements.slice(0, 5)

  const lowStockCount = document.querySelector<HTMLElement>('#dashboard-low-stock-count')
  const activeCount = document.querySelector<HTMLElement>('#dashboard-active-count')
  if (lowStockCount) lowStockCount.textContent = `${data.metrics.lowStockProducts} productos`
  if (activeCount) activeCount.textContent = `${data.metrics.activeAttendances} activos`

  const lowStockContainer = document.querySelector<HTMLElement>('#dashboard-low-stock')
  if (lowStockContainer) {
    lowStockContainer.innerHTML = lowStock.length
      ? lowStock.map((product) => `
          <article class="dashboard-list-item">
            <i class="ti ti-alert-triangle"></i>
            <div>
              <strong>${escapeHtml(product.nombre)}</strong>
              <small>${escapeHtml(product.codigo)} · Minimo ${escapeHtml(formatNumber(Number(product.stock_minimo)))}</small>
            </div>
            <span class="dashboard-list-value">${escapeHtml(formatNumber(Number(product.stock_actual)))}</span>
          </article>
        `).join('')
      : '<p class="empty-state">Todo el inventario está por encima del stock mínimo.</p>'
  }

  const activeContainer = document.querySelector<HTMLElement>('#dashboard-active-workers')
  if (activeContainer) {
    activeContainer.innerHTML = activeWorkers.length
      ? activeWorkers.map((attendance) => `
          <article class="dashboard-list-item">
            <i class="ti ti-user-check"></i>
            <div>
              <strong>${escapeHtml(attendance.trabajador_nombre)}</strong>
              <small>${escapeHtml(attendance.turno_nombre)} · Entrada ${escapeHtml(formatTime(attendance.hora_entrada))}</small>
            </div>
            <span class="badge badge--success">En turno</span>
          </article>
        `).join('')
      : '<p class="empty-state">No hay trabajadores con una entrada abierta.</p>'
  }

  const salesContainer = document.querySelector<HTMLElement>('#dashboard-recent-sales')
  if (salesContainer) {
    salesContainer.innerHTML = recentSales.length
      ? recentSales.map((sale) => `
          <article class="dashboard-list-item">
            <i class="ti ti-receipt"></i>
            <div>
              <strong>${escapeHtml(sale.numero_factura)}</strong>
              <small>${escapeHtml(formatDateTime(sale.fecha_venta))} · ${escapeHtml(sale.metodo_pago)}</small>
            </div>
            <span class="dashboard-list-value">Bs ${escapeHtml(formatCurrency(Number(sale.total)))}</span>
          </article>
        `).join('')
      : '<p class="empty-state">Todavía no hay ventas registradas.</p>'
  }

  const movementsContainer = document.querySelector<HTMLElement>('#dashboard-recent-movements')
  if (movementsContainer) {
    movementsContainer.innerHTML = recentMovements.length
      ? recentMovements.map((movement) => `
          <article class="dashboard-list-item">
            <i class="ti ${movement.tipo_movimiento === 'ENTRADA' ? 'ti-arrow-down' : 'ti-arrow-up'}"></i>
            <div>
              <strong>${escapeHtml(movement.producto_nombre)}</strong>
              <small>${escapeHtml(movement.tipo_movimiento)} · ${escapeHtml(formatDateTime(movement.fecha_movimiento))}</small>
            </div>
            <span class="dashboard-list-value">${escapeHtml(formatNumber(Number(movement.cantidad)))}</span>
          </article>
        `).join('')
      : '<p class="empty-state">Todavía no hay movimientos registrados.</p>'
  }
}

function getGreetingForHour(hour: number, userName: string) {
  if (hour >= 6 && hour < 12) {
    return `¡Buenos días, ${userName}!`
  }

  if (hour >= 12 && hour < 19) {
    return `¡Buenas tardes, ${userName}!`
  }

  return `¡Buenas noches, ${userName}!`
}

function renderLanding() {
  const welcome = document.querySelector<HTMLHeadingElement>('#landing-welcome')
  const message = document.querySelector<HTMLParagraphElement>('#landing-message')
  const userName = currentUser?.nombres || currentUser?.username || 'Usuario'

  if (welcome) {
    welcome.textContent = getGreetingForHour(new Date().getHours(), userName)
  }

  if (message) {
    message.textContent = 'Que tengas una excelente jornada de trabajo.'
  }

  const roleElement = document.querySelector<HTMLElement>('#home-role-name')
  if (roleElement) {
    roleElement.textContent = currentUser?.roleNames.length ? currentUser.roleNames.join(', ') : 'Sin rol asignado'
  }
}

function renderHomeQuickActions() {
  const container = document.querySelector<HTMLElement>('#home-quick-actions')
  if (!container) return

  const actions: Array<{ tab: TabName; icon: string; title: string; description: string; target?: string }> = []

  if (currentUser?.isAdminLike) {
    actions.push(
      {
        tab: 'dashboard',
        icon: 'ti-layout-dashboard',
        title: 'Ver Dashboard',
        description: 'Consulta metricas, ventas y el estado general del negocio.',
      },
      {
        tab: 'admin-turnos',
        icon: 'ti-clock-cog',
        title: 'Gestionar Turnos',
        description: 'Configura los horarios de trabajo de la temporada.',
      },
    )
  } else {
    if (hasPermission('GESTIONAR_VENTAS')) {
      actions.push({
        tab: 'ventas',
        icon: 'ti-shopping-cart-plus',
        title: 'Nueva Venta',
        description: 'Abre la caja y registra una nueva venta.',
      })
    }

    if (hasPermission('REGISTRAR_ASISTENCIAS')) {
      actions.push({
        tab: 'turnos',
        icon: 'ti-clock-check',
        title: 'Registrar Asistencia',
        description: 'Marca tu entrada o salida del turno actual.',
        target: '#attendance-form',
      })
    }
  }

  if (actions.length === 0) {
    container.innerHTML = '<p class="empty-state">No tienes tareas rápidas asignadas para este rol.</p>'
    return
  }

  container.innerHTML = actions.map((action) => `
    <button class="quick-action-card" type="button" data-home-tab="${action.tab}" ${action.target ? `data-home-target="${action.target}"` : ''}>
      <i class="ti ${action.icon}"></i>
      <span>
        <strong>${escapeHtml(action.title)}</strong>
        <small>${escapeHtml(action.description)}</small>
      </span>
      <i class="ti ti-arrow-right quick-action-card__arrow"></i>
    </button>
  `).join('')

  container.querySelectorAll<HTMLButtonElement>('[data-home-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      setActiveTab(button.dataset.homeTab as TabName)
      const target = button.dataset.homeTarget
      if (target) {
        window.setTimeout(() => {
          document.querySelector<HTMLElement>(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 120)
      }
    })
  })
}

function weatherDescription(code: number, isDay: boolean) {
  if (code === 0) return { label: 'Despejado', icon: isDay ? 'ti-sun' : 'ti-moon-stars' }
  if (code === 1) return { label: 'Mayormente despejado', icon: isDay ? 'ti-sun-high' : 'ti-moon-stars' }
  if (code === 2) return { label: 'Parcialmente nublado', icon: isDay ? 'ti-sun-high' : 'ti-moon' }
  if (code === 3) return { label: 'Nublado', icon: 'ti-cloud' }
  if (code === 45 || code === 48) return { label: 'Niebla', icon: 'ti-mist' }
  if (code >= 51 && code <= 67) return { label: 'Lluvia ligera', icon: 'ti-cloud-rain' }
  if (code >= 71 && code <= 77) return { label: 'Nieve', icon: 'ti-snowflake' }
  if (code >= 80 && code <= 82) return { label: 'Chubascos', icon: 'ti-cloud-rain' }
  if (code >= 95) return { label: 'Tormenta', icon: 'ti-cloud-storm' }
  return { label: 'Clima variable', icon: 'ti-cloud' }
}

function setWeatherStatus(
  temperature: string,
  description: string,
  details: string,
  icon = 'ti-cloud',
  location = 'Trinidad, Bolivia',
  humidity = '--%',
  wind = '-- km/h',
  period: 'day' | 'night' | 'loading' = 'loading',
) {
  const temperatureElement = document.querySelector<HTMLElement>('#weather-temperature')
  const descriptionElement = document.querySelector<HTMLElement>('#weather-description')
  const detailsElement = document.querySelector<HTMLElement>('#weather-details')
  const iconElement = document.querySelector<HTMLElement>('.weather-card__icon')
  const locationElement = document.querySelector<HTMLElement>('#weather-location')
  const humidityElement = document.querySelector<HTMLElement>('#weather-humidity')
  const windElement = document.querySelector<HTMLElement>('#weather-wind')
  const weatherCard = document.querySelector<HTMLElement>('.weather-card')

  if (temperatureElement) temperatureElement.textContent = temperature
  if (descriptionElement) descriptionElement.textContent = description
  if (detailsElement) detailsElement.textContent = details
  if (iconElement) iconElement.className = `ti ${icon} weather-card__icon`
  if (locationElement) locationElement.textContent = location
  if (humidityElement) humidityElement.textContent = humidity
  if (windElement) windElement.textContent = wind
  if (weatherCard) weatherCard.dataset.period = period
}

async function fetchWeather(latitude: number, longitude: number, locationLabel: string) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(latitude))
  url.searchParams.set('longitude', String(longitude))
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day')
  url.searchParams.set('timezone', 'America/La_Paz')

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('No se pudo consultar el clima.')
  }

  const data = await response.json() as {
    current?: {
      temperature_2m: number
      apparent_temperature: number
      relative_humidity_2m: number
      weather_code: number
      wind_speed_10m: number
      is_day: number
    }
  }

  if (!data.current) {
    throw new Error('El servicio no devolvio el clima actual.')
  }

  const isDay = data.current.is_day === 1
  const condition = weatherDescription(data.current.weather_code, isDay)
  setWeatherStatus(
    `${Math.round(data.current.temperature_2m)} °C`,
    condition.label,
    `${isDay ? 'Día' : 'Noche'} · Sensacion termica ${Math.round(data.current.apparent_temperature)} °C`,
    condition.icon,
    locationLabel,
    `${Math.round(data.current.relative_humidity_2m)}%`,
    `${Math.round(data.current.wind_speed_10m)} km/h`,
    isDay ? 'day' : 'night',
  )
}

function loadLocalWeather() {
  setWeatherStatus('--°', 'Cargando clima...', 'Consultando las condiciones de Trinidad.', 'ti-loader-2', 'Trinidad, Bolivia')
  void fetchWeather(-14.8333, -64.9, 'Trinidad, Bolivia').catch(() => {
    setWeatherStatus(
      '--°',
      'Clima no disponible',
      'Revisa la conexion a internet e intenta nuevamente.',
      'ti-cloud-off',
      'Trinidad, Bolivia',
    )
  })
}

function showTemporaryLanding() {
  const landing = document.querySelector<HTMLElement>('#session-welcome-banner')

  if (!landing) {
    return
  }

  if (landingDismissTimer) {
    window.clearTimeout(landingDismissTimer)
  }

  landing.classList.remove('is-dismissed')
  landingDismissTimer = window.setTimeout(() => {
    landing.classList.add('is-dismissed')
    landingDismissTimer = null
  }, 4000)
}

function renderAppInfo(data: BootstrapData) {
  const container = document.querySelector<HTMLDivElement>('#app-info')

if (!container) {
    return
  }

  container.innerHTML = `
    <div class="info-item"><span>Aplicación</span><strong>${escapeHtml(appInfoSnapshot?.appName ?? '-')}</strong></div>
    <div class="info-item"><span>Versión</span><strong>${escapeHtml(appInfoSnapshot?.version ?? '-')}</strong></div>
    <div class="info-item"><span>Base de datos</span><strong>${escapeHtml(appInfoSnapshot?.databasePath ?? '-')}</strong></div>
    <div class="info-item"><span>Productos activos</span><strong>${escapeHtml(data.products.filter((p) => Boolean(p.estado)).length)}</strong></div>
  `

  // Populate user nav info
  const navUserName = document.getElementById('nav-user-name')
  const navUserRole = document.getElementById('nav-user-role')
  if (navUserName) navUserName.textContent = currentUser?.nombres || currentUser?.username || 'Usuario'

  if (navUserRole) {
    navUserRole.textContent = currentUser?.roleNames.length ? currentUser.roleNames.join(', ') : 'Sin rol asignado'
  }

}

function renderSelectOptions(select: HTMLSelectElement | null, options: Array<{ id: number; nombre: string }>, includeEmpty = false) {
  if (!select) {
    return
  }

  const items = [
    ...(includeEmpty ? ['<option value="">Seleccionar</option>'] : []),
    ...options.map((option) => `<option value="${option.id}">${escapeHtml(option.nombre)}</option>`),
  ]
  select.innerHTML = items.join('')
}

function renderReportSelectOptions(select: HTMLSelectElement | null, options: Array<{ id: number; nombre: string }>, emptyLabel: string) {
  if (!select) {
    return
  }

  const currentValue = select.value
  select.innerHTML = [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...options.map((option) => `<option value="${option.id}">${escapeHtml(option.nombre)}</option>`),
  ].join('')

  if (currentValue && options.some((option) => String(option.id) === currentValue)) {
    select.value = currentValue
  }
}

function renderReportFilterOptions(data: BootstrapData) {
  renderReportSelectOptions(
    document.querySelector<HTMLSelectElement>('#report-vendedor-filter'),
    data.references.trabajadores.map((worker) => ({
      id: worker.id_trabajador,
      nombre: worker.nombre_completo ?? `${worker.nombres} ${worker.apellidos}`,
    })),
    'Todos',
  )

  renderReportSelectOptions(
    document.querySelector<HTMLSelectElement>('#report-turno-filter'),
    data.references.turnos.map((shift) => ({
      id: shift.id_turno,
      nombre: `${shift.nombre} (${shift.hora_inicio} - ${shift.hora_fin})`,
    })),
    'Todos',
  )

  renderReportSelectOptions(document.querySelector<HTMLSelectElement>('#report-moneda-filter'), data.references.monedas, 'Todas')
  updateReportFilterButton()
}

function hasActiveReportFilters() {
  return [
    '#report-vendedor-filter',
    '#report-turno-filter',
    '#report-moneda-filter',
    '#report-estado-filter',
  ].some((selector) => Boolean(document.querySelector<HTMLSelectElement>(selector)?.value))
}

function updateReportFilterButton() {
  const reportView = document.querySelector<HTMLElement>('[data-panel="reportes"]')
  const button = document.querySelector<HTMLButtonElement>('#report-filter-toggle')
  if (!button) return

  const showFilters = Boolean(reportView?.classList.contains('show-report-filters'))
  const activeFilters = hasActiveReportFilters()
  button.classList.toggle('has-active-filter', activeFilters)

  if (showFilters) {
    button.innerHTML = '<i class="ti ti-eye-off"></i> Ocultar filtros'
  } else {
    button.innerHTML = activeFilters
      ? '<i class="ti ti-filter-check"></i> Filtros activos'
      : '<i class="ti ti-adjustments-horizontal"></i> Filtros'
  }
}

function renderShiftSelectOptions(data: BootstrapData) {
  const options = data.references.turnos.map((shift) => ({
    id: shift.id_turno,
    nombre: `${shift.nombre} (${shift.hora_inicio} - ${shift.hora_fin})`,
  }))

  const selects = [
    document.querySelector<HTMLSelectElement>('#sale-form select[name="id_turno"]'),
    document.querySelector<HTMLSelectElement>('#attendance-form select[name="id_turno"]'),
  ]

  selects.forEach((select) => {
    if (!select) return
    const currentValue = select.value
    renderSelectOptions(select, options, true)
    if (currentValue && options.some((option) => String(option.id) === currentValue)) {
      select.value = currentValue
    }
  })
}

function updateShiftDataLocally(shift: BootstrapData['shifts'][number], remove = false) {
  if (!bootstrapData) return

  const previousShift = bootstrapData.shifts.find((item) => item.id_turno === shift.id_turno)
  const nextShift = {
    ...previousShift,
    ...shift,
    registros_asociados: shift.registros_asociados ?? previousShift?.registros_asociados ?? 0,
  }

  bootstrapData.shifts = remove
    ? bootstrapData.shifts.filter((item) => item.id_turno !== shift.id_turno)
    : [...bootstrapData.shifts.filter((item) => item.id_turno !== shift.id_turno), nextShift]
        .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio) || a.nombre.localeCompare(b.nombre))

  bootstrapData.references.turnos = bootstrapData.shifts
    .filter((item) => Boolean(item.estado))
    .map(({ id_turno, nombre, hora_inicio, hora_fin, descripcion }) => ({
      id_turno,
      nombre,
      hora_inicio,
      hora_fin,
      descripcion,
    }))

  renderShiftsTable(bootstrapData)
  renderShiftSelectOptions(bootstrapData)
  renderAttendanceState(bootstrapData)
}

function setClosestCardHidden(selector: string, hidden: boolean) {
  document.querySelector<HTMLElement>(selector)?.closest<HTMLElement>('.module-card')?.toggleAttribute('hidden', hidden)
}

function applyAccessControl() {
  const canAccessRoles = hasPermission('GESTIONAR_ROLES')
  const canAccessTrabajadores = hasPermission('GESTIONAR_TRABAJADORES')
  const canAccessTurnos = hasPermission('GESTIONAR_TURNOS')
  const canAccessAuditoria = Boolean(currentUser?.isAdminLike)

  const accessByTab: Record<TabName, boolean> = {
    home: true,
    dashboard: canAccessTab('dashboard'),
    inventario: canAccessTab('inventario'),
    movimientos: canAccessTab('movimientos'),
    ventas: canAccessTab('ventas'),
    turnos: canAccessTab('turnos'),
    administracion: false,
    'admin-roles': canAccessRoles,
    'admin-trabajadores': canAccessTrabajadores,
    'admin-turnos': canAccessTurnos,
    'admin-auditoria': canAccessAuditoria,
    reportes: canAccessTab('reportes'),
  }

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    const tabName = button.dataset.tab as TabName | undefined
    if (tabName === ('administracion-group' as any)) return
    const allowed = tabName ? accessByTab[tabName] : false
    button.hidden = !allowed
    button.toggleAttribute('aria-hidden', !allowed)
    button.disabled = !allowed
  })

  // Group visibility
  const adminAccordion = document.getElementById('admin-accordion')
  if (adminAccordion) {
    const hasAnyAdminAccess = canAccessRoles || canAccessTrabajadores || canAccessTurnos || canAccessAuditoria
    adminAccordion.hidden = !hasAnyAdminAccess
  }

  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    const tabName = panel.dataset.panel as TabName | undefined
    const allowed = tabName ? accessByTab[tabName] : false
    panel.hidden = !allowed
    panel.toggleAttribute('aria-hidden', !allowed)
    if (!allowed) {
      panel.classList.remove('is-active')
    }
  })

  setClosestCardHidden('#product-form', !hasPermission('GESTIONAR_INVENTARIO'))
  document.querySelector<HTMLButtonElement>('#inventory-mode-toggle')?.toggleAttribute('hidden', !hasPermission('GESTIONAR_INVENTARIO'))
  if (!hasPermission('GESTIONAR_INVENTARIO') && inventoryAuditMode) {
    setInventoryAuditMode(false)
  }

  setClosestCardHidden('#movement-form', !hasPermission('GESTIONAR_MOVIMIENTOS'))
  setClosestCardHidden('#sale-form', !hasPermission('GESTIONAR_VENTAS'))
  const canManageAttendancePanel = hasPermission('VER_ASISTENCIAS') || Boolean(currentUser?.isAdminLike)
  setClosestCardHidden('#attendance-form', !hasPermission('REGISTRAR_ASISTENCIAS'))
  setClosestCardHidden('#attendance-table', !canManageAttendancePanel)
  setClosestCardHidden('#work-hours-table', !canManageAttendancePanel)
  setClosestCardHidden('#shift-rotation-table', !canManageAttendancePanel)
  setClosestCardHidden('#shift-history-table', !canAccessTab('turnos'))
  setClosestCardHidden('#role-form', !hasPermission('GESTIONAR_ROLES'))
  setClosestCardHidden('#worker-form', !hasPermission('GESTIONAR_TRABAJADORES'))
  document.querySelector<HTMLElement>('#shift-management-card')?.toggleAttribute('hidden', !hasPermission('GESTIONAR_TURNOS'))
  setClosestCardHidden('#audit-table', !Boolean(currentUser?.isAdminLike))

  const activeTab = document.querySelector<HTMLElement>('[data-tab].is-active')?.dataset.tab as TabName | undefined
  if (!activeTab || !canAccessTab(activeTab)) {
    setActiveTab(getFirstAccessibleTab())
  }
}

function renderProductFormOptions(data: BootstrapData) {
  const productForm = document.querySelector<HTMLFormElement>('#product-form')
  const movementForm = document.querySelector<HTMLFormElement>('#movement-form')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  const attendanceForm = document.querySelector<HTMLFormElement>('#attendance-form')

  if (productForm) {
    renderSelectOptions(productForm.elements.namedItem('id_marca') as HTMLSelectElement, data.references.marcas)
    renderSelectOptions(productForm.elements.namedItem('id_categoria') as HTMLSelectElement, data.references.categorias, true)
  }

const productOptions = data.products.map((product) => ({
    id: product.id_producto,
    nombre: `${product.codigo} · ${product.nombre}`,
  }))

  if (movementForm) {
    renderSelectOptions(
      movementForm.elements.namedItem('id_producto') as HTMLSelectElement,
      productOptions,
      true,
    )
  }
  if (saleForm) {
    const clientSelect = saleForm.elements.namedItem('id_cliente') as HTMLSelectElement
    const selectedClientId = clientSelect?.value || '0'
    renderSelectOptions(
      clientSelect,
      [
        { id: 0, nombre: 'Consumidor final' },
        ...data.references.clientes
      ],
      false
    )
    
    const trabajadoresMapped = data.references.trabajadores.map((worker) => ({
      id: worker.id_trabajador,
      nombre: worker.nombre_completo ?? `${worker.nombres} ${worker.apellidos}`,
    }))

    renderSelectOptions(saleForm.elements.namedItem('id_vendedor') as HTMLSelectElement, trabajadoresMapped, false)
    renderSelectOptions(saleForm.elements.namedItem('id_moneda') as HTMLSelectElement, data.references.monedas, false)

    const methodSelect = document.querySelector<HTMLSelectElement>('#payment-method-select')
    if (methodSelect) {
      renderSelectOptions(methodSelect, data.references.metodosPago, false)
    }
    const currencySelect = document.querySelector<HTMLSelectElement>('#payment-currency-select')
    if (currencySelect) {
      renderSelectOptions(currencySelect, data.references.monedas, false)
      currencySelect.value = '1'
    }

    // Set default values for sale fields
    if (clientSelect) {
      clientSelect.value = Array.from(clientSelect.options).some((option) => option.value === selectedClientId)
        ? selectedClientId
        : '0'
    }
    const vendedorSelect = saleForm.elements.namedItem('id_vendedor') as HTMLSelectElement
    if (vendedorSelect) {
      const preferredWorkerId = currentUser?.id_trabajador ?? data.references.trabajadores[0]?.id_trabajador
      vendedorSelect.value = preferredWorkerId ? String(preferredWorkerId) : ''
    }
    const monedaSelect = saleForm.elements.namedItem('id_moneda') as HTMLSelectElement
    if (monedaSelect) {
      monedaSelect.value = '1'
    }
    updateSaleCurrencyRate()
    updateSaleShift()
  }

  if (attendanceForm) {
    const workerSelect = attendanceForm.elements.namedItem('id_trabajador') as HTMLSelectElement
    renderSelectOptions(
      workerSelect,
      data.references.trabajadores.map((worker) => ({
        id: worker.id_trabajador,
        nombre: `${worker.nombres} ${worker.apellidos}${worker.cargo ? ` - ${worker.cargo}` : ''}`,
      })),
      true,
    )
    if (!currentUser?.isAdminLike && currentUser?.id_trabajador) {
      workerSelect.value = String(currentUser.id_trabajador)
      workerSelect.disabled = true
    } else {
      workerSelect.disabled = false
    }
  }

  renderShiftSelectOptions(data)
}


function renderPermissionsCheckboxes(data: BootstrapData) {
  const container = document.getElementById('role-permissions-container')
  if (!container) return
  
  const groups: Record<string, typeof data.permissions> = {}
  data.permissions.forEach(p => {
    if (!groups[p.modulo]) groups[p.modulo] = []
    groups[p.modulo].push(p)
  })

  let html = ''
  for (const [modulo, perms] of Object.entries(groups)) {
    html += `<div class="permission-module"><h4>${escapeHtml(modulo)}</h4>`
    perms.forEach(p => {
      html += `<label class="permission-item">
        <input type="checkbox" name="permisos[]" value="${p.id_permiso}" />
        <span>${escapeHtml(p.nombre)}</span>
      </label>`
    })
    html += `</div>`
  }
  container.innerHTML = html
}

function renderWorkerRoleSelect(data: BootstrapData) {
  const select = document.getElementById('worker-rol-select') as HTMLSelectElement
  if (!select) return
  renderSelectOptions(select, data.roles.map(r => ({ id: r.id_rol, nombre: r.nombre })), true)

}

function renderProductsTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#products-table tbody')

  const count = document.querySelector<HTMLSpanElement>('#inventory-count')

  if (!tableBody) {
    return
  }

  const filteredProducts = getFilteredProducts(data)

  if (count) {
    count.textContent = `${filteredProducts.length} de ${data.products.length} productos`
  }

  if (filteredProducts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay productos que coincidan con la búsqueda.</td></tr>'
    return
  }

  tableBody.innerHTML = filteredProducts
    .map((product) => {
      const isLow = Number(product.stock_actual) <= Number(product.stock_minimo)

      return `
        <tr>
          <td>
            <strong>${escapeHtml(product.nombre)}</strong>
            <small>${escapeHtml(product.codigo)}</small>
          </td>
          <td>${escapeHtml(product.marca_nombre)}</td>
          <td>${escapeHtml(product.categoria_nombre ?? 'General')}</td>
          <td>
            <strong>${escapeHtml(formatNumber(Number(product.stock_actual)))}</strong>
            <small>mínimo ${escapeHtml(formatNumber(Number(product.stock_minimo)))} ${isLow ? '(bajo)' : ''}</small>
          </td>
          <td>${escapeHtml(formatNumber(Number(product.precio_venta)))}</td>
          <td><span class="badge ${product.estado ? 'badge--success' : 'badge--muted'}">${product.estado ? 'Activo' : 'Inactivo'}</span></td>
          <td>
            <div class="row-actions">
              ${hasPermission('GESTIONAR_INVENTARIO') ? `<button class="button button--small" type="button" data-product-edit="${product.id_producto}">Editar</button>` : ''}
            </div>
          </td>
        </tr>
      `
    })
    .join('')


  tableBody.querySelectorAll<HTMLButtonElement>('[data-product-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const productId = Number(button.dataset.productEdit)
      const product = data.products.find((item) => item.id_producto === productId)
      if (product) {
        fillProductForm(product)
        setActiveTab('inventario')
        setStatus('inventory-status', `Editando ${product.nombre}.`, 'info')
      }
    })
  })
}

function renderMovementsTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#movements-table tbody')
  if (!tableBody) return
  if (data.movements.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Todavía no hay movimientos registrados.</td></tr>'
    return
  }


  tableBody.innerHTML = data.movements
    .map(
      (movement) => `
        <tr>
          <td>${escapeHtml(formatDateTime(movement.fecha_movimiento))}</td>
          <td>
            <strong>${escapeHtml(movement.producto_nombre)}</strong>
            <small>${escapeHtml(movement.producto_codigo)}</small>
          </td>
          <td><span class="badge badge--soft">${escapeHtml(movement.tipo_movimiento)}</span></td>
          <td>${escapeHtml(formatNumber(Number(movement.cantidad)))}</td>
          <td>${escapeHtml(movement.motivo ?? 'Sin motivo')}</td>
          <td>${escapeHtml(movement.referencia ?? 'Sin referencia')}</td>
        </tr>
      `,
    )
    .join('')

}

function renderSalesTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#sales-table tbody')
  const count = document.querySelector<HTMLSpanElement>('#sale-count')

  if (!tableBody) {
    return
  }

  if (count) {
    count.textContent = `${data.sales.length} ventas`
  }

  if (data.sales.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="9" class="empty-state">Todavía no hay ventas registradas.</td></tr>'
    return
  }

  tableBody.innerHTML = data.sales
    .map(
      (sale) => `
        <tr>
          <td><strong>${escapeHtml(sale.numero_factura)}</strong></td>
          <td>${escapeHtml(formatDateTime(sale.fecha_venta))}</td>
          <td>${escapeHtml(sale.cliente_nombre)}</td>
          <td>${escapeHtml(sale.productos_diferentes)}</td>
          <td>${escapeHtml(formatCurrency(Number(sale.cantidad_total)))}</td>
          <td>${escapeHtml(formatCurrency(Number(sale.total)))}</td>

          <td>${escapeHtml(sale.metodo_pago)} · ${escapeHtml(sale.moneda)}</td>
          <td><span class="badge badge--soft">${escapeHtml(sale.estado)}</span></td>
          <td>
            <button class="button button--small button--primary" type="button" data-sale-detail-btn="${sale.id_venta}">Ver</button>
          </td>
        </tr>
      `,
    )
    .join('')

  tableBody.querySelectorAll<HTMLButtonElement>('[data-sale-detail-btn]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const saleId = Number(btn.dataset.saleDetailBtn)
      await openSaleDetailModal(saleId)
    })
  })
}

function renderAttendanceState(data: BootstrapData) {
  const form = document.querySelector<HTMLFormElement>('#attendance-form')
  const state = document.querySelector<HTMLDivElement>('#attendance-current-state')
  const activeCount = document.querySelector<HTMLSpanElement>('#attendance-active-count')
  const entryButton = form?.querySelector<HTMLButtonElement>('[data-attendance-action="entry"]')
  const exitButton = form?.querySelector<HTMLButtonElement>('[data-attendance-action="exit"]')

  if (activeCount) {
    activeCount.textContent = `${data.metrics.activeAttendances} en turno`
  }

  if (!form || !state) {
    return
  }

  const workerId = Number((form.elements.namedItem('id_trabajador') as HTMLSelectElement).value || 0)
  const shiftSelect = form.elements.namedItem('id_turno') as HTMLSelectElement

  if (!workerId) {
    shiftSelect.disabled = false
    if (entryButton) {
      entryButton.disabled = false
    }
    if (exitButton) {
      exitButton.disabled = false
    }
    state.innerHTML = '<span>Selecciona un trabajador para ver su estado.</span>'
    state.dataset.state = 'idle'
    return
  }

  const openAttendance = data.attendances.find(
    (attendance) => attendance.id_trabajador === workerId && attendance.estado === 'EN_TURNO',
  )

  if (!openAttendance) {
    shiftSelect.disabled = false
    if (entryButton) {
      entryButton.disabled = false
    }
    if (exitButton) {
      exitButton.disabled = false
    }
    state.innerHTML = '<strong>Fuera de turno</strong><span>Puede registrar entrada cuando inicie su jornada.</span>'
    state.dataset.state = 'out'
    return
  }

  shiftSelect.value = String(openAttendance.id_turno)
  shiftSelect.disabled = true
  if (entryButton) {
    entryButton.disabled = false
  }
  if (exitButton) {
    exitButton.disabled = false
  }

  state.innerHTML = `
    <strong>En turno desde ${escapeHtml(formatTime(openAttendance.hora_entrada))}</strong>
    <span>${escapeHtml(openAttendance.turno_nombre)} - ${escapeHtml(openAttendance.fecha)}. Se usara este turno para registrar la salida.</span>
  `
  state.dataset.state = 'in'
}

function renderAttendanceTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#attendance-table tbody')
  const count = document.querySelector<HTMLSpanElement>('#attendance-count')

  if (!tableBody) {
    return
  }

  if (count) {
    count.textContent = `${data.attendances.length} hoy`
  }

  if (data.attendances.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Todavia no hay entradas o salidas registradas hoy.</td></tr>'
    return
  }

  tableBody.innerHTML = data.attendances
    .map(
      (attendance) => `
        <tr>
          <td><strong>${escapeHtml(attendance.trabajador_nombre)}</strong></td>
          <td>${escapeHtml(attendance.turno_nombre)}</td>
          <td>
            <strong>${escapeHtml(formatTime(attendance.hora_entrada))}</strong>
            <small>${escapeHtml(attendance.fecha)}</small>
          </td>
          <td>${escapeHtml(formatTime(attendance.hora_salida))}</td>
          <td><span class="badge ${attendance.estado === 'EN_TURNO' ? 'badge--success' : 'badge--muted'}">${attendance.estado === 'EN_TURNO' ? 'En turno' : 'Completado'}</span></td>
          <td>${escapeHtml(attendance.observacion ?? 'Sin observacion')}</td>
        </tr>
      `,
    )
    .join('')
}

function renderWorkHoursTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#work-hours-table tbody')

  if (!tableBody) {
    return
  }

  if (data.workHoursSummary.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">Todavia no hay horas cerradas para calcular.</td></tr>'
    return
  }

  tableBody.innerHTML = data.workHoursSummary
    .map((summary) => {
      const hours = Number(summary.horas_trabajadas)

      return `
        <tr>
          <td><strong>${escapeHtml(summary.trabajador_nombre)}</strong></td>
          <td>${escapeHtml(summary.cargo ?? 'Sin cargo')}</td>
          <td>${escapeHtml(summary.asistencias_completadas)}</td>
          <td>
            <strong>${escapeHtml(formatHours(hours))} h</strong>
            <small>${escapeHtml(summary.minutos_trabajados)} minutos</small>
          </td>
        </tr>
      `
    })
    .join('')
}

function renderShiftRotationTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#shift-rotation-table tbody')

  if (!tableBody) {
    return
  }

  if (data.shiftRotationSummary.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Todavia no hay rotacion de turnos registrada.</td></tr>'
    return
  }

  tableBody.innerHTML = data.shiftRotationSummary
    .map(
      (summary) => `
        <tr>
          <td><strong>${escapeHtml(summary.trabajador_nombre)}</strong></td>
          <td>${escapeHtml(summary.cargo ?? 'Sin cargo')}</td>
          <td>${escapeHtml(summary.turnos_manana)}</td>
          <td>${escapeHtml(summary.turnos_tarde)}</td>
          <td>${escapeHtml(summary.turnos_noche)}</td>
          <td><strong>${escapeHtml(summary.total_turnos)}</strong></td>
          <td>
            <strong>${escapeHtml(summary.ultimo_turno ?? 'Sin turno')}</strong>
            <small>${escapeHtml(summary.ultima_fecha ?? 'Sin fecha')}</small>
          </td>
        </tr>
      `,
    )
    .join('')
}

function renderShiftHistoryTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#shift-history-table tbody')

  if (!tableBody) {
    return
  }

  if (data.shiftHistory.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Todavia no hay historial de turnos registrado.</td></tr>'
    return
  }

  tableBody.innerHTML = data.shiftHistory
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.fecha)}</td>
          <td>
            <strong>${escapeHtml(item.trabajador_nombre)}</strong>
            <small>${escapeHtml(item.cargo ?? 'Sin cargo')}</small>
          </td>
          <td><span class="badge badge--soft">${escapeHtml(item.turno_nombre)}</span></td>
          <td>${escapeHtml(formatTime(item.hora_entrada))}</td>
          <td>${escapeHtml(formatTime(item.hora_salida))}</td>
          <td><span class="badge ${item.estado === 'EN_TURNO' ? 'badge--success' : 'badge--muted'}">${item.estado === 'EN_TURNO' ? 'En turno' : 'Completado'}</span></td>
        </tr>
      `,
    )
    .join('')
}

function semaforoForDifference(stockSistema: number, conteoFisico: number): Semaforo {
  const diff = Math.abs(conteoFisico - stockSistema)

  if (diff === 0) {
    return 'verde'
  }

  const thresholdYellow = Math.max(1, stockSistema * 0.1)
  return diff <= thresholdYellow ? 'amarillo' : 'rojo'
}

function getAuditSemaforo(stockSistema: number, conteoFisico: number, revisado: boolean): Semaforo {
  if (!revisado) {
    return 'pendiente'
  }

  return semaforoForDifference(stockSistema, conteoFisico)
}

function resetInventoryAuditRows(data: BootstrapData) {
  inventoryAuditRows = data.products.map((product) => ({
    id_producto: product.id_producto,
    conteo_fisico: Number(product.stock_actual),
    precio_costo: Number(product.precio_costo),
    precio_venta: Number(product.precio_venta),
    revisado: false,
  }))
}

function getInventoryAuditRow(productId: number) {
  return inventoryAuditRows.find((row) => row.id_producto === productId)
}

function renderInventoryChecklist(data: BootstrapData) {
  const checklistBody = document.querySelector<HTMLTableSectionElement>('#inventory-checklist-table tbody')

  if (!checklistBody) {
    return
  }

  if (!inventoryAuditMode) {
    checklistBody.innerHTML = ''
    return
  }

  const filteredProducts = getFilteredAuditProducts(data)

  if (filteredProducts.length === 0) {
    checklistBody.innerHTML = '<tr><td colspan="8" class="empty-state">No hay productos que coincidan con el filtro.</td></tr>'
    return
  }

  checklistBody.innerHTML = filteredProducts
    .map((product) => {
      const rowState = getInventoryAuditRow(product.id_producto)
      const conteoFisico = rowState?.conteo_fisico ?? Number(product.stock_actual)
      const precioCosto = rowState?.precio_costo ?? Number(product.precio_costo)
      const precioVenta = rowState?.precio_venta ?? Number(product.precio_venta)
      const revisado = Boolean(rowState?.revisado)
      const diferencia = conteoFisico - Number(product.stock_actual)
      const semaforo = getAuditSemaforo(Number(product.stock_actual), conteoFisico, revisado)
      const label =
        semaforo === 'pendiente'
          ? 'Pendiente'
          : semaforo === 'verde'
            ? 'OK'
            : semaforo === 'amarillo'
              ? 'Ligera diferencia'
              : 'Gran diferencia'

      return `
        <tr>
          <td class="check-cell"><input class="check-input" data-audit-check="${product.id_producto}" type="checkbox" ${
            revisado ? 'checked' : ''
          } /></td>
          <td>
            <strong>${escapeHtml(product.nombre)}</strong>
            <small>${escapeHtml(product.codigo)}</small>
          </td>
          <td>${escapeHtml(formatNumber(Number(product.stock_actual)))}</td>
          <td><input class="table-input" data-audit-count="${product.id_producto}" type="number" step="0.01" min="0" value="${escapeHtml(conteoFisico)}" /></td>
          <td>${escapeHtml(formatNumber(diferencia))}</td>
          <td><span class="semaforo-pill semaforo-pill--${semaforo}">${label}</span></td>
          <td><input class="table-input" data-audit-cost="${product.id_producto}" type="number" step="0.01" min="0" value="${escapeHtml(precioCosto)}" /></td>
          <td><input class="table-input" data-audit-sale="${product.id_producto}" type="number" step="0.01" min="0" value="${escapeHtml(precioVenta)}" /></td>
        </tr>
      `
    })
    .join('')

  checklistBody.querySelectorAll<HTMLInputElement>('[data-audit-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const productId = Number(input.dataset.auditCheck)
      const row = getInventoryAuditRow(productId)
      if (row) {
        row.revisado = input.checked
        renderInventoryChecklist(data)
        renderInventoryComparison(data)
        updateInventoryAuditStatus(data)
      }
    })
  })

  checklistBody.querySelectorAll<HTMLInputElement>('[data-audit-count]').forEach((input) => {
    input.addEventListener('input', () => {
      const productId = Number(input.dataset.auditCount)
      const row = getInventoryAuditRow(productId)
      if (row) {
        row.conteo_fisico = Number(input.value || 0)
        renderInventoryChecklist(data)
        renderInventoryComparison(data)
        updateInventoryAuditStatus(data)
      }
    })
  })

  checklistBody.querySelectorAll<HTMLInputElement>('[data-audit-cost]').forEach((input) => {
    input.addEventListener('input', () => {
      const productId = Number(input.dataset.auditCost)
      const row = getInventoryAuditRow(productId)
      if (row) {
        row.precio_costo = Number(input.value || 0)
        renderInventoryComparison(data)
        updateInventoryAuditStatus(data)
      }
    })
  })

  checklistBody.querySelectorAll<HTMLInputElement>('[data-audit-sale]').forEach((input) => {
    input.addEventListener('input', () => {
      const productId = Number(input.dataset.auditSale)
      const row = getInventoryAuditRow(productId)
      if (row) {
        row.precio_venta = Number(input.value || 0)
        renderInventoryComparison(data)
        updateInventoryAuditStatus(data)
      }
    })
  })
}

function updateInventoryAuditStatus(data: BootstrapData) {
  if (!inventoryAuditMode) {
    return
  }

  const total = data.products.length
  const revisados = inventoryAuditRows.filter((row) => row.revisado).length
  const conCambios = data.products.filter((product) => {
    const row = getInventoryAuditRow(product.id_producto)

    if (!row || !row.revisado) {
      return false
    }

    const deltaStock = row.conteo_fisico - Number(product.stock_actual)
    const changedPriceCost = Number(row.precio_costo) !== Number(product.precio_costo)
    const changedPriceSale = Number(row.precio_venta) !== Number(product.precio_venta)

    return deltaStock !== 0 || changedPriceCost || changedPriceSale
  }).length

  setStatus(
    'inventory-audit-status',
    `Revisados: ${revisados}/${total}. Productos con cambio: ${conCambios}.`,
    'info',
  )
}

function renderInventoryComparison(data: BootstrapData) {
  const container = document.querySelector<HTMLDivElement>('#inventory-comparison')

  if (!container) {
    return
  }

  const changed = data.products
    .map((product) => {
      const row = getInventoryAuditRow(product.id_producto)

      if (!row || !row.revisado) {
        return null
      }

      const deltaStock = row.conteo_fisico - Number(product.stock_actual)
      const changedPriceCost = Number(row.precio_costo) !== Number(product.precio_costo)
      const changedPriceSale = Number(row.precio_venta) !== Number(product.precio_venta)

      if (deltaStock === 0 && !changedPriceCost && !changedPriceSale) {
        return null
      }

      return {
        nombre: product.nombre,
        stockSistema: Number(product.stock_actual),
        conteoFisico: row.conteo_fisico,
        deltaStock,
        precioCostoSistema: Number(product.precio_costo),
        precioCostoNuevo: row.precio_costo,
        precioVentaSistema: Number(product.precio_venta),
        precioVentaNuevo: row.precio_venta,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (changed.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay diferencias, el inventario coincide con el sistema.</p>'
    return
  }

  container.innerHTML = changed
    .map(
      (item) => `
        <article class="comparison-item">
          <div>
            <strong>${escapeHtml(item.nombre)}</strong>
            <span>Stock sistema ${escapeHtml(formatNumber(item.stockSistema))} / físico ${escapeHtml(formatNumber(item.conteoFisico))}</span>
          </div>
          <span>Diferencia: ${escapeHtml(formatNumber(item.deltaStock))}</span>
          <span>Costo: ${escapeHtml(formatNumber(item.precioCostoSistema))} -> ${escapeHtml(formatNumber(item.precioCostoNuevo))}</span>
          <span>Venta: ${escapeHtml(formatNumber(item.precioVentaSistema))} -> ${escapeHtml(formatNumber(item.precioVentaNuevo))}</span>
        </article>
      `,
    )
    .join('')
}

function setInventoryAuditMode(enabled: boolean) {
  inventoryAuditMode = enabled

  const panel = document.querySelector<HTMLElement>('#inventory-mode-panel')
  const toggleButton = document.querySelector<HTMLButtonElement>('#inventory-mode-toggle')

  if (panel) {
    panel.hidden = !enabled
  }

  if (toggleButton) {
    toggleButton.textContent = enabled ? 'Modo inventario activo' : 'Hacer inventario'
    toggleButton.classList.toggle('button--primary', !enabled)
  }
}

function buildInventoryAuditPayload(data: BootstrapData): InventoryAuditInput {
  return {
    items: data.products.map((product) => {
      const row = getInventoryAuditRow(product.id_producto)
      return {
        id_producto: product.id_producto,
        conteo_fisico: row?.conteo_fisico ?? Number(product.stock_actual),
        precio_costo: row?.precio_costo ?? Number(product.precio_costo),
        precio_venta: row?.precio_venta ?? Number(product.precio_venta),
      }
    }),
    observacion: 'Cierre de inventario desde checklist',
  }
}

function renderRolesTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#roles-table tbody')
  if (!tableBody) return
  if (data.roles.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" class="empty-state">No hay roles registrados.</td></tr>'
    return
  }
  tableBody.innerHTML = data.roles.map(role => `
    <tr>
      <td><strong>${escapeHtml(role.nombre)}</strong></td>
      <td>${escapeHtml(role.descripcion ?? 'Sin descripción')}</td>
      <td><span class="badge ${role.estado ? 'badge--success' : 'badge--muted'}">${role.estado ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        ${hasPermission('GESTIONAR_ROLES') ? `<button class="button button--small" type="button" data-role-edit="${role.id_rol}">Editar</button>` : ''}
      </td>
    </tr>
  `).join('')
  tableBody.querySelectorAll<HTMLButtonElement>('[data-role-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const roleId = Number(button.dataset.roleEdit)
      const role = data.roles.find(r => r.id_rol === roleId)
      if (role) {
        fillRoleForm(role)
        setStatus('role-status', `Editando ${role.nombre}.`, 'info')
      }
    })
  })
}

function renderWorkersTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#workers-table tbody')
  if (!tableBody) return
  if (data.workers.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">No hay trabajadores registrados.</td></tr>'
    return
  }
  tableBody.innerHTML = data.workers.map(worker => `
    <tr>
      <td><strong>${escapeHtml(worker.nombres)} ${escapeHtml(worker.apellidos)}</strong></td>
      <td>${escapeHtml(worker.cargo ?? 'No especificado')}</td>
      <td>${worker.username ? escapeHtml(worker.username) : '<span class="badge badge--muted">Sin usuario</span>'}</td>
      <td>${worker.rol_nombre ? escapeHtml(worker.rol_nombre) : '<span class="badge badge--muted">Ninguno</span>'}</td>
      <td>${escapeHtml(worker.creado_en)}</td>
      <td><span class="badge ${worker.estado === 'activo' ? 'badge--success' : 'badge--muted'}">${escapeHtml(worker.estado)}</span></td>
      <td>
        <div class="row-actions">
          ${hasPermission('GESTIONAR_TRABAJADORES') ? `
            <button class="button button--small" type="button" data-worker-edit="${worker.id_trabajador}">Editar</button>
            ${worker.id_usuario ? `<button class="button button--small button--ghost" type="button" data-worker-reset="${worker.id_trabajador}" title="Restablecer Contraseña"><i class="ti ti-key"></i></button>` : ''}
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('')
  
  tableBody.querySelectorAll<HTMLButtonElement>('[data-worker-edit]').forEach(button => {
    button.addEventListener('click', () => {
      const workerId = Number(button.dataset.workerEdit)
      const worker = data.workers.find(w => w.id_trabajador === workerId)
      if (worker) {
        fillWorkerForm(worker)
        setStatus('worker-status', `Editando ${worker.nombres}.`, 'info')
      }
    })
  })

  tableBody.querySelectorAll<HTMLButtonElement>('[data-worker-reset]').forEach(button => {
    button.addEventListener('click', async () => {
      const workerId = Number(button.dataset.workerReset)
      const worker = data.workers.find(w => w.id_trabajador === workerId)
      if (!worker) return
      
      if (!window.confirm(`¿Estas seguro de restablecer la contraseña a "12345" para el usuario ${worker.username}?`)) {
        return
      }

      button.disabled = true
      try {
        const result = await window.inventoryApi.resetUserPassword(workerId)
        if (result.success) {
          alert('Contraseña restablecida correctamente. La nueva contraseña es 12345.')
        } else {
          alert(result.message || 'Error al restablecer la contraseña.')
        }
      } catch (error) {
        alert(getFriendlyErrorMessage(error, 'No se pudo restablecer la contraseña.'))
      } finally {
        button.disabled = false
      }
    })
  })
}

function renderShiftsTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#shifts-table tbody')
  if (!tableBody) return

  if (data.shifts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay turnos configurados.</td></tr>'
    return
  }

  tableBody.innerHTML = data.shifts.map((shift) => `
    <tr>
      <td>
        <strong>${escapeHtml(shift.nombre)}</strong>
        <small>${shift.registros_asociados ? `${escapeHtml(shift.registros_asociados)} registros asociados` : 'Sin historial'}</small>
      </td>
      <td>${escapeHtml(shift.hora_inicio)} - ${escapeHtml(shift.hora_fin)}</td>
      <td>${escapeHtml(shift.descripcion ?? 'Sin descripcion')}</td>
      <td><span class="badge ${shift.estado ? 'badge--success' : 'badge--muted'}">${shift.estado ? 'Disponible' : 'Inactivo'}</span></td>
      <td>
        <div class="row-actions">
          <button class="button button--small" type="button" data-shift-edit="${shift.id_turno}">Editar</button>
          <button class="button button--small button--ghost" type="button" data-shift-toggle="${shift.id_turno}">${shift.estado ? 'Deshabilitar' : 'Habilitar'}</button>
        </div>
      </td>
    </tr>
  `).join('')

  tableBody.querySelectorAll<HTMLButtonElement>('[data-shift-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const shift = data.shifts.find((item) => item.id_turno === Number(button.dataset.shiftEdit))
      if (shift) {
        fillShiftForm(shift)
        setStatus('shift-status', `Editando ${shift.nombre}. Modifica los datos y pulsa "Actualizar turno".`, 'info')
        const card = document.querySelector<HTMLElement>('#shift-management-card')
        card?.classList.add('is-editing')
        card?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>('#shift-form input[name="nombre"]')?.focus()
        }, 350)
      }
    })
  })

  tableBody.querySelectorAll<HTMLButtonElement>('[data-shift-toggle]').forEach((button) => {
    button.addEventListener('click', async () => {
      const shift = data.shifts.find((item) => item.id_turno === Number(button.dataset.shiftToggle))
      if (!shift) return

      const nextState = !Boolean(shift.estado)
      button.disabled = true
      button.textContent = nextState ? 'Habilitando...' : 'Deshabilitando...'

      try {
        await window.inventoryApi.setShiftState(shift.id_turno, nextState)
        updateShiftDataLocally({ ...shift, estado: nextState })
        await refresh()
        setStatus('shift-status', `Turno ${nextState ? 'habilitado' : 'deshabilitado'} correctamente.`, 'success')
      } catch (error) {
        setStatus('shift-status', getFriendlyErrorMessage(error, 'No se pudo cambiar el estado del turno.'), 'error')
      }
    })
  })

}

let currentAuditPage = 1
const AUDIT_LIMIT = 20

const ACTIONS_BY_MODULE: Record<string, string[]> = {
  auth: ['LOGIN', 'LOGOUT'],
  asistencias: ['INSERT', 'UPDATE', 'DELETE'],
  productos: ['INSERT', 'UPDATE', 'DELETE'],
  inventario_movimientos: ['INSERT', 'UPDATE', 'DELETE'],
  ventas: ['INSERT', 'UPDATE', 'DELETE'],
  roles: ['INSERT', 'UPDATE', 'DELETE'],
  trabajadores: ['INSERT', 'UPDATE', 'DELETE'],
  usuarios: ['INSERT', 'UPDATE', 'DELETE'],
  reportes: ['GENERATE', 'VIEW', 'EXPORT']
}

function renderAuditTable(data: BootstrapData) {
  fetchAndRenderAuditLogs()
  
  const moduleSelect = document.getElementById('audit-filter-module') as HTMLSelectElement
  const actionSelect = document.getElementById('audit-filter-action') as HTMLSelectElement
  const btnFilter = document.getElementById('btn-audit-filter')
  const btnExport = document.getElementById('btn-audit-export')
  const btnPrev = document.getElementById('btn-audit-prev')
  const btnNext = document.getElementById('btn-audit-next')
  
  if (moduleSelect && actionSelect && !moduleSelect.dataset.bound) {
    moduleSelect.dataset.bound = 'true'
    moduleSelect.addEventListener('change', () => {
      const mod = moduleSelect.value
      actionSelect.innerHTML = '<option value="">Todas las acciones</option>'
      if (mod && ACTIONS_BY_MODULE[mod]) {
        ACTIONS_BY_MODULE[mod].forEach(act => {
          const opt = document.createElement('option')
          opt.value = act
          opt.textContent = act
          actionSelect.appendChild(opt)
        })
      } else {
        const defaultActions = ['LOGIN', 'LOGOUT', 'INSERT', 'UPDATE', 'DELETE']
        defaultActions.forEach(act => {
          const opt = document.createElement('option')
          opt.value = act
          opt.textContent = act
          actionSelect.appendChild(opt)
        })
      }
    })
    moduleSelect.dispatchEvent(new Event('change'))
  }

  if (btnFilter && !btnFilter.dataset.bound) {
    btnFilter.dataset.bound = 'true'
    btnFilter.addEventListener('click', () => {
      currentAuditPage = 1
      fetchAndRenderAuditLogs()
    })
  }

  if (btnExport && !btnExport.dataset.bound) {
    btnExport.dataset.bound = 'true'
    btnExport.addEventListener('click', exportAuditLogs)
  }

  if (btnPrev && !btnPrev.dataset.bound) {
    btnPrev.dataset.bound = 'true'
    btnPrev.addEventListener('click', () => {
      if (currentAuditPage > 1) {
        currentAuditPage--
        fetchAndRenderAuditLogs()
      }
    })
  }

  if (btnNext && !btnNext.dataset.bound) {
    btnNext.dataset.bound = 'true'
    btnNext.addEventListener('click', () => {
      currentAuditPage++
      fetchAndRenderAuditLogs()
    })
  }
}

async function fetchAndRenderAuditLogs() {
  const moduleSelect = document.querySelector<HTMLSelectElement>('#audit-filter-module')
  const actionSelect = document.querySelector<HTMLSelectElement>('#audit-filter-action')
  const userFilter = document.querySelector<HTMLInputElement>('#audit-filter-user')
  const dateFrom = document.querySelector<HTMLInputElement>('#audit-filter-date-from')
  const dateTo = document.querySelector<HTMLInputElement>('#audit-filter-date-to')
  
  const input = {
    page: currentAuditPage,
    limit: AUDIT_LIMIT,
    modulo: moduleSelect?.value || null,
    accion: actionSelect?.value || null,
    usuario: userFilter?.value || null,
    fechaDesde: dateFrom?.value || null,
    fechaHasta: dateTo?.value || null
  }

  try {
    const result = await window.inventoryApi.fetchAuditLogs(input)
    renderAuditLogsDynamic(result)
  } catch (err) {
    console.error('Error fetching audit logs:', err)
  }
}

function renderAuditLogsDynamic(result: any) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#audit-table tbody')
  if (!tableBody) return
  
  if (result.logs.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay eventos registrados que coincidan.</td></tr>'
  } else {
    tableBody.innerHTML = result.logs.map((log: any) => `
      <tr>
        <td>${escapeHtml(formatDateTime(log.fecha_evento))}</td>
        <td>${escapeHtml(log.usuario)}</td>
        <td><span class="badge badge--soft">${escapeHtml(log.modulo)}</span></td>
        <td><strong>${escapeHtml(log.accion)}</strong></td>
        <td>${escapeHtml(log.descripcion ?? '')}</td>
      </tr>
    `).join('')
  }

  const infoEl = document.getElementById('audit-pagination-info')
  const pageEl = document.getElementById('audit-pagination-page')
  const btnPrev = document.getElementById('btn-audit-prev') as HTMLButtonElement
  const btnNext = document.getElementById('btn-audit-next') as HTMLButtonElement

  if (infoEl) infoEl.textContent = `Mostrando ${result.totalItems} registros`
  if (pageEl) pageEl.textContent = `Página ${result.currentPage} de ${result.totalPages}`
  
  if (btnPrev) btnPrev.disabled = result.currentPage <= 1
  if (btnNext) btnNext.disabled = result.currentPage >= result.totalPages

  if (btnPrev && btnPrev.parentElement) {
    btnPrev.parentElement.style.display = result.totalPages <= 1 ? 'none' : 'flex'
  }
  
  currentAuditPage = result.currentPage
}

async function exportAuditLogs() {
  const moduleSelect = document.querySelector<HTMLSelectElement>('#audit-filter-module')
  const actionSelect = document.querySelector<HTMLSelectElement>('#audit-filter-action')
  const userFilter = document.querySelector<HTMLInputElement>('#audit-filter-user')
  const dateFrom = document.querySelector<HTMLInputElement>('#audit-filter-date-from')
  const dateTo = document.querySelector<HTMLInputElement>('#audit-filter-date-to')
  
  const input = {
    page: 1,
    limit: 5000,
    modulo: moduleSelect?.value || null,
    accion: actionSelect?.value || null,
    usuario: userFilter?.value || null,
    fechaDesde: dateFrom?.value || null,
    fechaHasta: dateTo?.value || null
  }

  try {
    const result = await window.inventoryApi.fetchAuditLogs(input)
    if (result.logs.length === 0) {
      showToast.warning('No hay datos para exportar.')
      return
    }
    
    const headers = ['Fecha', 'Usuario', 'Módulo', 'Acción', 'Detalle']
    const rows = result.logs.map((log: any) => [
      formatDateTime(log.fecha_evento),
      log.usuario,
      log.modulo,
      log.accion,
      log.descripcion || ''
    ])
    
    const csvContent = [headers, ...rows].map((row: any[]) => row.map((cell: any) => '"' + String(cell).replace(/"/g, '""') + '"').join(',')).join('\n')
    
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `auditoria_${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Error exportando CSV:', err)
    showToast.error('Error al exportar.')
  }
}

function renderProductSearchResults(query = '') {
  const container = document.querySelector<HTMLDivElement>('#sale-product-results')

  if (!container || !bootstrapData) {
    return
  }

  const normalizedQuery = normalizeSearch(query)
  if (!normalizedQuery) {
    container.innerHTML = '<p class="empty-state">Escribe un codigo, nombre o marca para buscar productos.</p>'
    return
  }

  const products = bootstrapData.products
    .filter((product) => isProductActive(product) && Number(product.stock_actual) > 0)
    .filter((product) => {
      return [
        product.codigo,
        product.codigo_barra,
        product.nombre,
        product.marca_nombre,
      ].some((value) => normalizeSearch(value).includes(normalizedQuery))
    })
    .slice(0, 8)

  if (products.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay productos disponibles para esa búsqueda.</p>'
    return
  }

  container.innerHTML = products
    .map(
      (product) => `
        <button class="product-result" type="button" data-sale-product="${product.id_producto}">
          <span>
            <strong>${escapeHtml(product.nombre)}</strong>
            <small>${escapeHtml(product.codigo)} · ${escapeHtml(product.marca_nombre)}</small>
          </span>
          <span>
            <strong>${escapeHtml(formatCurrency(Number(product.precio_venta)))}</strong>
            <small>Stock ${escapeHtml(formatCurrency(Number(product.stock_actual)))}</small>
          </span>
        </button>
      `,
    )
    .join('')

  container.querySelectorAll<HTMLButtonElement>('[data-sale-product]').forEach((button) => {
    button.addEventListener('click', () => {
      addProductToCart(Number(button.dataset.saleProduct))
      const searchInput = document.querySelector<HTMLInputElement>('#sale-product-search')
      if (searchInput) {
        searchInput.value = ''
      }
      renderProductSearchResults('')
    })
  })
}

function addProductToCart(productId: number) {
  if (!bootstrapData) {
    return
  }

  const product = bootstrapData.products.find((item) => item.id_producto === productId)

  if (!product) {
    setStatus('sale-status', 'El producto seleccionado no existe.', 'error')
    return
  }

  if (!isProductActive(product)) {
    setStatus('sale-status', 'El producto seleccionado esta inactivo.', 'error')
    return
  }

  const stock = Number(product.stock_actual)
  const current = saleCart.get(productId)
  const nextQuantity = roundMoney((current?.cantidad ?? 0) + 1)

  if (nextQuantity > stock) {
    setStatus('sale-status', `No hay stock suficiente para ${product.nombre}.`, 'error')
    return
  }

  saleCart.set(productId, { product, cantidad: nextQuantity, descuento_unitario: current?.descuento_unitario ?? 0 })
  renderSaleCart()
  setStatus('sale-status', `${product.nombre} agregado al carrito.`, 'success')
}

function updateCartQuantity(productId: number, quantity: number) {
  const item = saleCart.get(productId)

  if (!item) {
    return
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    setStatus('sale-status', 'La cantidad debe ser mayor que cero.', 'error')
    renderSaleCart()
    return
  }

  if (quantity > Number(item.product.stock_actual)) {
    setStatus('sale-status', 'La cantidad no puede superar el stock disponible.', 'error')
    renderSaleCart()
    return
  }

  saleCart.set(productId, { ...item, cantidad: roundMoney(quantity) })
  renderSaleCart()
}

function updateCartDiscount(productId: number, discountUnit: number) {
  const item = saleCart.get(productId)

  if (!item) {
    return
  }

  if (!Number.isFinite(discountUnit) || discountUnit < 0) {
    setStatus('sale-status', 'El descuento unitario no puede ser negativo.', 'error')
    renderSaleCart()
    return
  }

  if (discountUnit > Number(item.product.precio_venta)) {
    setStatus('sale-status', 'El descuento unitario no puede superar el precio de venta.', 'error')
    renderSaleCart()
    return
  }

  saleCart.set(productId, { ...item, descuento_unitario: roundMoney(discountUnit) })
  renderSaleCart()
}

function getLocalCurrencyRate(idMoneda: number): number {
  if (!bootstrapData) return 1
  if (idMoneda === 1) return 1
  const currency = bootstrapData.references.monedas.find(m => m.id === idMoneda)
  if (!currency || currency.nombre.startsWith('BOB')) return 1

  const rateObj = bootstrapData.references.tiposCambio.find(r => r.id_moneda === idMoneda)
  return rateObj ? Number(rateObj.valor) : 1
}

function updateSaleCurrencyRate() {
  if (!bootstrapData) return
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  if (!saleForm) return
  const idMoneda = Number((saleForm.elements.namedItem('id_moneda') as HTMLSelectElement).value)
  const rateInput = saleForm.elements.namedItem('tasa_cambio_aplicada') as HTMLInputElement
  if (!rateInput) return

  const rate = getLocalCurrencyRate(idMoneda)
  rateInput.value = rate.toFixed(4)
  renderSaleCart()
}

function updateSaleShift() {
  if (!bootstrapData) return
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  if (!saleForm) return
  const vendedorSelect = saleForm.elements.namedItem('id_vendedor') as HTMLSelectElement
  const shiftSelect = saleForm.elements.namedItem('id_turno') as HTMLSelectElement
  const shiftStatus = document.querySelector<HTMLElement>('#sale-shift-status')
  if (!vendedorSelect || !shiftSelect) return

  const workerId = Number(vendedorSelect.value)
  if (!workerId) {
    shiftSelect.value = ''
    if (shiftStatus) {
      shiftStatus.textContent = 'Selecciona un vendedor para detectar su jornada activa.'
      shiftStatus.dataset.state = 'pending'
    }
    return
  }

  const activeAttendance = bootstrapData.attendances.find(
    (att) => att.id_trabajador === workerId && att.estado === 'EN_TURNO'
  )

  if (activeAttendance) {
    shiftSelect.value = String(activeAttendance.id_turno)
    if (shiftStatus) {
      shiftStatus.textContent = `Turno detectado automáticamente: ${activeAttendance.turno_nombre}.`
      shiftStatus.dataset.state = 'success'
    }
  } else {
    shiftSelect.value = ''
    if (shiftStatus) {
      shiftStatus.textContent = currentUser?.isAdminLike
        ? 'Administrador sin turno activo: la venta se registrará sin turno.'
        : 'El vendedor debe registrar su entrada antes de realizar ventas.'
      shiftStatus.dataset.state = currentUser?.isAdminLike ? 'pending' : 'error'
    }
  }
}

function renderSalePayments() {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#sale-payments-table tbody')
  if (!tableBody) return

  if (salePayments.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No se han registrado pagos.</td></tr>'
    return
  }

  tableBody.innerHTML = salePayments
    .map((pago, index) => {
      return `
        <tr>
          <td><strong>${escapeHtml(pago.metodo_nombre)}</strong></td>
          <td>${escapeHtml(pago.moneda_codigo)}</td>
          <td>${escapeHtml(formatCurrency(pago.monto))}</td>
          <td>${escapeHtml(pago.referencia_pago || '-')}</td>
          <td>
            <button class="button button--small" type="button" data-payment-remove="${index}">Eliminar</button>
          </td>
        </tr>
      `
    })
    .join('')

  tableBody.querySelectorAll<HTMLButtonElement>('[data-payment-remove]').forEach((button) => {
    button.addEventListener('click', () => {
      const idx = Number(button.dataset.paymentRemove)
      salePayments.splice(idx, 1)
      renderSalePayments()
      renderSaleCart()
    })
  })
}

function setupPaymentHandlers() {
  const addBtn = document.querySelector<HTMLButtonElement>('#payment-add-btn')
  const fillTotalBtn = document.querySelector<HTMLButtonElement>('#payment-fill-total')

  fillTotalBtn?.addEventListener('click', () => {
    const amountInput = document.querySelector<HTMLInputElement>('#payment-amount-input')
    const currencySelect = document.querySelector<HTMLSelectElement>('#payment-currency-select')
    const saleCurrencySelect = document.querySelector<HTMLSelectElement>('#sale-form select[name="id_moneda"]')

    if (!amountInput) {
      return
    }

    const snapshot = getSaleFinancialSnapshot()
    if (snapshot.total <= 0) {
      document.querySelector<HTMLInputElement>('#sale-product-search')?.focus()
      setStatus('sale-status', 'Primero agrega un producto a la venta.', 'info')
      return
    }

    if (currencySelect && saleCurrencySelect) {
      currencySelect.value = saleCurrencySelect.value
    }

    amountInput.value = String(snapshot.pending || snapshot.total)
    amountInput.focus()
    amountInput.select()
    setStatus('sale-status', 'Monto listo para cobrar. Pulsa Registrar pago.', 'info')
  })

  if (!addBtn) return

  addBtn.addEventListener('click', () => {
    if (!bootstrapData) return
    const methodSelect = document.querySelector<HTMLSelectElement>('#payment-method-select')
    const currencySelect = document.querySelector<HTMLSelectElement>('#payment-currency-select')
    const amountInput = document.querySelector<HTMLInputElement>('#payment-amount-input')
    const refInput = document.querySelector<HTMLInputElement>('#payment-ref-input')

    if (!methodSelect || !currencySelect || !amountInput || !refInput) return

    const idMetodo = Number(methodSelect.value)
    const idMoneda = Number(currencySelect.value)
    const monto = Number(amountInput.value)
    const referencia = refInput.value.trim() || null

    if (!idMetodo || !idMoneda) {
      setStatus('sale-status', 'Seleccione método de pago y moneda.', 'error')
      return
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      setStatus('sale-status', 'El monto de pago debe ser mayor que cero.', 'error')
      return
    }

    const methodObj = bootstrapData.references.metodosPago.find(m => m.id === idMetodo)
    const currencyObj = bootstrapData.references.monedas.find(c => c.id === idMoneda)

    if (!methodObj || !currencyObj) return

    salePayments.push({
      id_metodo_pago: idMetodo,
      metodo_nombre: methodObj.nombre,
      id_moneda: idMoneda,
      moneda_codigo: currencyObj.nombre.split(' - ')[0],
      monto: roundMoney(monto),
      referencia_pago: referencia
    })

    amountInput.value = ''
    refInput.value = ''

    renderSalePayments()
    renderSaleCart()
    setStatus('sale-status', 'Pago agregado.', 'success')
  })
}

function renderSaleCart() {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#sale-cart-table tbody')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  if (!saleForm) return

  const snapshot = getSaleFinancialSnapshot()
  const { saleCurrencyCode, subtotal, validDiscountTotal, total } = snapshot

  // Track focused element before rendering
  let activeElementInfo: { productId: number; field: 'quantity' | 'discount'; selectionStart: number | null; selectionEnd: number | null } | null = null
  const activeEl = document.activeElement as HTMLInputElement | null
  if (activeEl && (activeEl.classList.contains('cart-quantity') || activeEl.classList.contains('cart-discount'))) {
    const isQty = activeEl.classList.contains('cart-quantity')
    const productId = Number(activeEl.dataset.cartQuantity ?? activeEl.dataset.cartDiscount)
    activeElementInfo = {
      productId,
      field: isQty ? 'quantity' : 'discount',
      selectionStart: activeEl.selectionStart,
      selectionEnd: activeEl.selectionEnd
    }
  }

  if (tableBody) {
    const cartItems = Array.from(saleCart.values())
    const minRows = cartItems.length
    const rowsToRender: string[] = []

    cartItems.forEach((item, index) => {
      const subtotalLine = roundMoney(Number(item.product.precio_venta) * item.cantidad)
      const discountLine = roundMoney((item.descuento_unitario ?? 0) * item.cantidad)
      const totalLine = roundMoney(subtotalLine - discountLine)

      rowsToRender.push(`
        <tr>
          <td class="excel-row-num" style="text-align: center; font-weight: bold; background: #f1f5f9; color: #64748b; vertical-align: middle;">${index + 1}</td>
          <td>
            <strong>${escapeHtml(item.product.nombre)}</strong>
            <small>${escapeHtml(item.product.codigo)} · ${escapeHtml(item.product.marca_nombre)}</small>
          </td>
          <td style="text-align: right; vertical-align: middle;">${escapeHtml(formatCurrency(Number(item.product.stock_actual)))}</td>
          <td class="excel-cell-input" style="padding: 0; vertical-align: middle;">
            <input class="cart-quantity excel-input" type="number" step="0.01" min="0.01" max="${escapeHtml(
              item.product.stock_actual,
            )}" value="${escapeHtml(item.cantidad)}" data-cart-quantity="${item.product.id_producto}" style="text-align: right; width: 100%; height: 100%; border: none; padding: 11px; background: transparent; outline: none;" />
          </td>
          <td style="text-align: right; vertical-align: middle;">${escapeHtml(formatCurrency(Number(item.product.precio_venta)))}</td>
          <td class="excel-cell-input sale-advanced-col" style="padding: 0; vertical-align: middle;">
            <input class="cart-discount excel-input" type="number" step="0.01" min="0" max="${escapeHtml(
              item.product.precio_venta,
            )}" value="${escapeHtml(item.descuento_unitario ?? 0)}" data-cart-discount="${item.product.id_producto}" style="text-align: right; width: 100%; height: 100%; border: none; padding: 11px; background: transparent; outline: none;" />
          </td>
          <td class="sale-advanced-col" style="text-align: right; vertical-align: middle;">${escapeHtml(formatCurrency(subtotalLine))}</td>
          <td style="text-align: right; vertical-align: middle;">${escapeHtml(formatCurrency(totalLine))}</td>
          <td style="text-align: center; vertical-align: middle;"><button class="button button--small" type="button" data-cart-remove="${item.product.id_producto}">Eliminar</button></td>
        </tr>
      `)
    })

    // Fill with empty rows
    for (let i = cartItems.length; i < minRows; i++) {
      rowsToRender.push(`
        <tr class="empty-excel-row">
          <td class="excel-row-num" style="text-align: center; font-weight: bold; background: #f1f5f9; color: #64748b; vertical-align: middle;">${i + 1}</td>
          <td>&nbsp;</td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
          <td></td>
        </tr>
      `)
    }

    tableBody.innerHTML = cartItems.length === 0
      ? `
        <tr>
          <td colspan="9" class="sale-cart-empty">
            <strong>Busca un producto para iniciar la venta.</strong>
            <small>La venta se arma aqui automaticamente. Despues registra el pago y guarda.</small>
          </td>
        </tr>
      `
      : rowsToRender.join('')

    // Set change and keyboard navigation events
    tableBody.querySelectorAll<HTMLInputElement>('[data-cart-quantity]').forEach((input) => {
      input.addEventListener('change', () => {
        updateCartQuantity(Number(input.dataset.cartQuantity), Number(input.value))
      })
    })

    tableBody.querySelectorAll<HTMLInputElement>('[data-cart-discount]').forEach((input) => {
      input.addEventListener('change', () => {
        updateCartDiscount(Number(input.dataset.cartDiscount), Number(input.value))
      })
    })

    // Auto-select text on focus and handle key navigation
    tableBody.querySelectorAll<HTMLInputElement>('.cart-quantity, .cart-discount').forEach((input) => {
      input.addEventListener('focus', () => {
        input.select()
      })

      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          const isQty = input.classList.contains('cart-quantity')
          const selector = isQty ? '.cart-quantity' : '.cart-discount'
          const allInputs = Array.from(tableBody.querySelectorAll<HTMLInputElement>(selector))
          const currentIndex = allInputs.indexOf(input)

          let nextIndex = currentIndex
          if (e.key === 'ArrowDown') {
            nextIndex = currentIndex + 1
          } else if (e.key === 'ArrowUp') {
            nextIndex = currentIndex - 1
          }

          if (nextIndex >= 0 && nextIndex < allInputs.length) {
            allInputs[nextIndex].focus()
          }
        } else if (e.key === 'Enter') {
          e.preventDefault()
          input.blur() // Trigger changes
          const isQty = input.classList.contains('cart-quantity')
          const selector = isQty ? '.cart-quantity' : '.cart-discount'
          const allInputs = Array.from(tableBody.querySelectorAll<HTMLInputElement>(selector))
          const currentIndex = allInputs.indexOf(input)

          if (currentIndex + 1 < allInputs.length) {
            allInputs[currentIndex + 1].focus()
          } else {
            document.querySelector<HTMLInputElement>('#sale-product-search')?.focus()
          }
        }
      })
    })

    tableBody.querySelectorAll<HTMLButtonElement>('[data-cart-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        saleCart.delete(Number(button.dataset.cartRemove))
        renderSaleCart()
      })
    })

    // Restore focus if applicable
    if (activeElementInfo) {
      const selector = activeElementInfo.field === 'quantity'
        ? `input[data-cart-quantity="${activeElementInfo.productId}"]`
        : `input[data-cart-discount="${activeElementInfo.productId}"]`
      const nextActive = tableBody.querySelector<HTMLInputElement>(selector)
      if (nextActive) {
        nextActive.focus()
        if (activeElementInfo.selectionStart !== null && activeElementInfo.selectionEnd !== null) {
          nextActive.setSelectionRange(activeElementInfo.selectionStart, activeElementInfo.selectionEnd)
        }
      }
    }
  }

  const totalPagadoInSaleCurrency = snapshot.paid
  const saldoPendiente = snapshot.pending
  const cambio = snapshot.change

  document.querySelector<HTMLElement>('#sale-summary-products')!.textContent = String(saleCart.size)
  document.querySelector<HTMLElement>('#sale-summary-units')!.textContent = formatCurrency(
    Array.from(saleCart.values()).reduce((sum, item) => sum + item.cantidad, 0),
  )
  document.querySelector<HTMLElement>('#sale-summary-subtotal')!.textContent = formatCurrency(subtotal)
  document.querySelector<HTMLElement>('#sale-summary-discount')!.textContent = formatCurrency(validDiscountTotal)
  document.querySelector<HTMLElement>('#sale-total-output')!.textContent = `${saleCurrencyCode} ${formatCurrency(total)}`

  document.querySelector<HTMLElement>('#sale-paid-output')!.textContent = `${saleCurrencyCode} ${formatCurrency(totalPagadoInSaleCurrency)}`
  document.querySelector<HTMLElement>('#sale-pending-output')!.textContent = `${saleCurrencyCode} ${formatCurrency(saldoPendiente)}`
  document.querySelector<HTMLElement>('#sale-change-output')!.textContent = `${saleCurrencyCode} ${formatCurrency(cambio)}`
  updateSaleGuidance()
}

function fillProductForm(product: BootstrapData['products'][number]) {
  const form = document.querySelector<HTMLFormElement>('#product-form')
  if (!form) return
  productFormState.id_producto = product.id_producto
  ;(form.elements.namedItem('id_producto') as HTMLInputElement).value = String(product.id_producto)
  ;(form.elements.namedItem('codigo') as HTMLInputElement).value = product.codigo
  ;(form.elements.namedItem('codigo_barra') as HTMLInputElement).value = product.codigo_barra ?? ''
  ;(form.elements.namedItem('nombre') as HTMLInputElement).value = product.nombre
  ;(form.elements.namedItem('id_marca') as HTMLSelectElement).value = String(product.id_marca)
  ;(form.elements.namedItem('id_categoria') as HTMLSelectElement).value = String(product.id_categoria ?? '')
  ;(form.elements.namedItem('descripcion') as HTMLTextAreaElement).value = product.descripcion ?? ''
  ;(form.elements.namedItem('precio_costo') as HTMLInputElement).value = String(product.precio_costo)
  ;(form.elements.namedItem('precio_venta') as HTMLInputElement).value = String(product.precio_venta)
  ;(form.elements.namedItem('stock_minimo') as HTMLInputElement).value = String(product.stock_minimo)
  ;(form.elements.namedItem('unidad_medida') as HTMLInputElement).value = product.unidad_medida
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = Boolean(product.estado)
  ;(form.elements.namedItem('stock_inicial') as HTMLInputElement).value = '0'
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (submitButton) submitButton.textContent = 'Actualizar producto'
}

function resetProductForm() {
  const form = document.querySelector<HTMLFormElement>('#product-form')
  if (!form) return
  productFormState.id_producto = null
  form.reset()
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = true
  ;(form.elements.namedItem('stock_minimo') as HTMLInputElement).value = '0'
  ;(form.elements.namedItem('stock_inicial') as HTMLInputElement).value = '0'
  ;(form.elements.namedItem('codigo') as HTMLInputElement).focus()
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (submitButton) submitButton.textContent = 'Guardar producto'
}

function fillRoleForm(role: BootstrapData['roles'][number]) {
  const form = document.querySelector<HTMLFormElement>('#role-form')
  if (!form) return
  roleFormState.id_rol = role.id_rol
  ;(form.elements.namedItem('id_rol') as HTMLInputElement).value = String(role.id_rol)

  const title = document.getElementById('role-form-title')
  if (title) title.textContent = 'Editar Rol'
  const formView = document.getElementById('roles-form-view')
  if (formView) formView.style.display = 'flex'

  ;(form.elements.namedItem('nombre') as HTMLInputElement).value = role.nombre
  ;(form.elements.namedItem('descripcion') as HTMLTextAreaElement).value = role.descripcion ?? ''
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = Boolean(role.estado)
  
  form.querySelectorAll<HTMLInputElement>('input[name="permisos[]"]').forEach(cb => cb.checked = false)
  if (role.permisos) {
    role.permisos.forEach(p => {
      const cb = form.querySelector<HTMLInputElement>(`input[name="permisos[]"][value="${p}"]`)
      if (cb) cb.checked = true
    })
  }

  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (btn) btn.textContent = 'Actualizar rol'
}

function resetRoleForm() {
  const form = document.querySelector<HTMLFormElement>('#role-form')
  if (!form) return
  roleFormState.id_rol = null
  form.reset()
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = true
  form.querySelectorAll<HTMLInputElement>('input[name="permisos[]"]').forEach(cb => cb.checked = false)
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (btn) btn.textContent = 'Guardar rol'
}

function fillWorkerForm(worker: BootstrapData['workers'][number]) {
  const form = document.querySelector<HTMLFormElement>('#worker-form')
  if (!form) return
  workerFormState.id_trabajador = worker.id_trabajador
  ;(form.elements.namedItem('id_trabajador') as HTMLInputElement).value = String(worker.id_trabajador)

  const title = document.getElementById('worker-form-title')
  if (title) title.textContent = 'Editar Trabajador'
  const formView = document.getElementById('workers-form-view')
  if (formView) formView.style.display = 'flex'

  ;(form.elements.namedItem('nombres') as HTMLInputElement).value = worker.nombres
  ;(form.elements.namedItem('apellidos') as HTMLInputElement).value = worker.apellidos
  ;(form.elements.namedItem('cedula') as HTMLInputElement).value = worker.cedula ?? ''
  ;(form.elements.namedItem('cargo') as HTMLInputElement).value = worker.cargo ?? ''
  ;(form.elements.namedItem('salario_base') as HTMLInputElement).value = worker.salario_base ? String(worker.salario_base) : ''
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = worker.estado === 'activo'
  ;(form.elements.namedItem('id_rol') as HTMLSelectElement).value = worker.id_rol ? String(worker.id_rol) : ''
  ;(form.elements.namedItem('crear_usuario') as HTMLInputElement).checked = false
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (btn) btn.textContent = 'Actualizar trabajador'
}

function resetWorkerForm() {
  const form = document.querySelector<HTMLFormElement>('#worker-form')
  if (!form) return
  workerFormState.id_trabajador = null
  form.reset()
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = true
  const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (btn) btn.textContent = 'Guardar trabajador'
}

function fillShiftForm(shift: BootstrapData['shifts'][number]) {
  const form = document.querySelector<HTMLFormElement>('#shift-form')
  if (!form) return

  shiftFormState.id_turno = shift.id_turno
  ;(form.elements.namedItem('id_turno') as HTMLInputElement).value = String(shift.id_turno)
  ;(form.elements.namedItem('nombre') as HTMLInputElement).value = shift.nombre
  ;(form.elements.namedItem('hora_inicio') as HTMLInputElement).value = shift.hora_inicio.slice(0, 5)
  ;(form.elements.namedItem('hora_fin') as HTMLInputElement).value = shift.hora_fin.slice(0, 5)
  ;(form.elements.namedItem('descripcion') as HTMLTextAreaElement).value = shift.descripcion ?? ''
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = Boolean(shift.estado)
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (button) button.textContent = 'Actualizar turno'
}

function resetShiftForm() {
  const form = document.querySelector<HTMLFormElement>('#shift-form')
  if (!form) return

  shiftFormState.id_turno = null
  document.querySelector<HTMLElement>('#shift-management-card')?.classList.remove('is-editing')
  form.reset()
  ;(form.elements.namedItem('id_turno') as HTMLInputElement).value = ''
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = true
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  if (button) button.textContent = 'Guardar turno'
}

function setStatus(targetId: string, message: string, kind: 'info' | 'success' | 'error' = 'info') {
  const target = document.querySelector<HTMLElement>(`#${targetId}`)
  if (!target) return
  target.textContent = message
  target.dataset.kind = kind

  if (message) {
    if (kind === 'error') {
      showToast.error(message)
    } else if (kind === 'success') {
      showToast.success(message)
    } else {
      showToast.info(message)
    }
  }
}

function getFriendlyErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) {
    return fallback
  }

  return error.message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim() || fallback
}

function readRequiredNumber(formData: FormData, name: string, label: string, options: { positive?: boolean } = {}) {
  const rawValue = String(formData.get(name) ?? '').trim()
  const value = Number(rawValue)

  if (!rawValue || !Number.isFinite(value)) {
    throw new Error(`${label} debe ser un numero valido.`)
  }

  if (options.positive && value <= 0) {
    throw new Error(`${label} debe ser mayor que cero.`)
  }

  if (!options.positive && value < 0) {
    throw new Error(`${label} no puede ser negativo.`)
  }

  return value
}

function readOptionalNumber(formData: FormData, name: string, label: string) {
  const rawValue = String(formData.get(name) ?? '').trim()

  if (!rawValue) {
    return null
  }

  const value = Number(rawValue)

  if (!Number.isFinite(value)) {
    throw new Error(`${label} debe ser un numero valido.`)
  }

  if (value < 0) {
    throw new Error(`${label} no puede ser negativo.`)
  }

  return value
}

function readRequiredId(formData: FormData, name: string, label: string) {
  const value = readRequiredNumber(formData, name, label, { positive: true })

  if (!Number.isInteger(value)) {
    throw new Error(`${label} debe ser una seleccion valida.`)
  }

  return value
}

async function refresh() {
  bootstrapData = await window.inventoryApi.getBootstrapData()
  renderLanding()
  renderHomeQuickActions()
  renderMetricCards(bootstrapData)
  renderDashboard(bootstrapData)
  renderAppInfo(bootstrapData)
  applyAccessControl()
  renderProductFormOptions(bootstrapData)
  renderReportFilterOptions(bootstrapData)
  renderWorkerRoleSelect(bootstrapData)
  renderPermissionsCheckboxes(bootstrapData)
  renderProductsTable(bootstrapData)
  renderMovementsTable(bootstrapData)
  renderSalesTable(bootstrapData)
  renderAttendanceState(bootstrapData)
  renderAttendanceTable(bootstrapData)
  renderWorkHoursTable(bootstrapData)
  renderShiftRotationTable(bootstrapData)
  renderShiftHistoryTable(bootstrapData)
  renderRolesTable(bootstrapData)
  renderWorkersTable(bootstrapData)
  renderShiftsTable(bootstrapData)
  renderAuditTable(bootstrapData)
  if (!inventoryAuditMode) {
    resetInventoryAuditRows(bootstrapData)
  }
  renderInventoryChecklist(bootstrapData)
  renderInventoryComparison(bootstrapData)
  updateInventoryAuditStatus(bootstrapData)
  renderProductSearchResults((document.querySelector<HTMLInputElement>('#sale-product-search')?.value ?? '').trim())
  renderSaleCart()
}

async function bootstrap() {
  appInfoSnapshot = await window.inventoryApi.getAppInfo()
  startClock()
  loadLocalWeather()

  await refresh()
  document.querySelector<HTMLButtonElement>('#weather-refresh')!.onclick = loadLocalWeather

  if (bootstrapInitialized) {
    return
  }
  bootstrapInitialized = true

  const productForm = document.querySelector<HTMLFormElement>('#product-form')
  const movementForm = document.querySelector<HTMLFormElement>('#movement-form')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  const clientForm = document.querySelector<HTMLFormElement>('#client-form')
  const attendanceForm = document.querySelector<HTMLFormElement>('#attendance-form')
  let attendanceAction: 'entry' | 'exit' = 'entry'
  const roleForm = document.querySelector<HTMLFormElement>('#role-form')
  const workerForm = document.querySelector<HTMLFormElement>('#worker-form')
  const shiftForm = document.querySelector<HTMLFormElement>('#shift-form')
  const saleSearchInput = document.querySelector<HTMLInputElement>('#sale-product-search')
  const saleDiscountInput = document.querySelector<HTMLInputElement>('#sale-form input[name="descuento_total"]')
  const clientSearchInput = document.querySelector<HTMLInputElement>('#client-search')
  const clientSearchButton = document.querySelector<HTMLButtonElement>('#client-search-btn')
  const clientSearchStatus = document.querySelector<HTMLElement>('#client-search-status')
  const clientSelect = saleForm?.elements.namedItem('id_cliente') as HTMLSelectElement | null
  const clientEditButton = document.querySelector<HTMLButtonElement>('#client-edit-btn')
  let editingClientId: number | null = null

  document.querySelector<HTMLButtonElement>('#sale-advanced-toggle')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement
    const show = !saleForm?.classList.contains('show-advanced-sale')

    saleForm?.classList.toggle('show-advanced-sale', show)
    button.setAttribute('aria-pressed', String(show))
    button.innerHTML = show
      ? '<i class="ti ti-eye-off"></i> Ocultar opciones'
      : '<i class="ti ti-adjustments-horizontal"></i> Opciones'
  })

  const updateClientEditButton = () => {
    if (clientEditButton) clientEditButton.disabled = Number(clientSelect?.value ?? 0) <= 0
  }

  const setClientSearchStatus = (message: string, kind: 'info' | 'success' | 'error' = 'info') => {
    if (!clientSearchStatus) return
    clientSearchStatus.textContent = message
    clientSearchStatus.dataset.kind = kind
  }

  const renderClientSearchResults = (query = '') => {
    if (!clientSelect || !bootstrapData) return

    const selectedValue = clientSelect.value
    const normalizedQuery = query.trim().toLocaleLowerCase('es')
    const filteredClients = bootstrapData.clients.filter((client) =>
      !normalizedQuery
      || client.documento.toLocaleLowerCase('es').includes(normalizedQuery)
      || client.nombre.toLocaleLowerCase('es').includes(normalizedQuery)
    )

    renderSelectOptions(
      clientSelect,
      [
        { id: 0, nombre: 'Consumidor final' },
        ...filteredClients.map((client) => ({
          id: client.id_cliente,
          nombre: `${client.nombre} · CI ${client.documento}`,
        })),
      ],
      false,
    )

    if (Array.from(clientSelect.options).some((option) => option.value === selectedValue)) {
      clientSelect.value = selectedValue
    } else {
      clientSelect.value = filteredClients.length === 1 ? String(filteredClients[0].id_cliente) : '0'
    }
    updateClientEditButton()
  }

  const searchClient = () => {
    if (!clientSearchInput || !clientSelect || !bootstrapData) return

    const query = clientSearchInput.value.trim()
    if (!query) {
      renderClientSearchResults()
      clientSelect.value = '0'
      updateClientEditButton()
      setClientSearchStatus('Escribe un CI o nombre para buscar.', 'error')
      return
    }

    const normalizedQuery = query.toLocaleLowerCase('es')
    const exactClient = bootstrapData.clients.find(
      (client) => client.documento.toLocaleLowerCase('es') === normalizedQuery,
    )
    const matches = exactClient
      ? [exactClient]
      : bootstrapData.clients.filter((client) =>
          client.documento.toLocaleLowerCase('es').includes(normalizedQuery)
          || client.nombre.toLocaleLowerCase('es').includes(normalizedQuery)
        )

    renderClientSearchResults(query)

    if (matches.length === 0) {
      clientSelect.value = '0'
      updateClientEditButton()
      setClientSearchStatus('No se encontró ningún cliente. Puedes registrarlo con “Nuevo cliente”.', 'error')
      return
    }

    clientSelect.value = String(matches[0].id_cliente)
    updateClientEditButton()
    setClientSearchStatus(
      matches.length === 1
        ? `Cliente encontrado: ${matches[0].nombre} · CI ${matches[0].documento}`
        : `${matches.length} clientes encontrados. Selecciona el correcto en la lista.`,
      'success',
    )
  }

  const setClientFormVisible = (visible: boolean) => {
    if (!clientForm) return

    clientForm.hidden = !visible
    document.querySelector<HTMLButtonElement>('#client-form-toggle')?.setAttribute('aria-expanded', String(visible))

    if (visible) {
      window.setTimeout(() => {
        const nameInput = clientForm.elements.namedItem('nombre')
        if (nameInput instanceof HTMLElement) nameInput.focus()
      }, 0)
      return
    }

    clientForm.reset()
    editingClientId = null
    const title = document.querySelector<HTMLElement>('#client-form-title')
    if (title) title.textContent = 'Registrar cliente'
    const submitButton = clientForm.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submitButton) submitButton.innerHTML = '<i class="ti ti-device-floppy"></i> Guardar cliente'
    setStatus('client-status', '', 'info')
  }

  document.querySelector<HTMLButtonElement>('#client-form-toggle')?.addEventListener('click', () => {
    clientForm?.reset()
    editingClientId = null
    const title = document.querySelector<HTMLElement>('#client-form-title')
    if (title) title.textContent = 'Registrar cliente'
    const submitButton = clientForm?.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submitButton) submitButton.innerHTML = '<i class="ti ti-device-floppy"></i> Guardar cliente'
    setClientFormVisible(true)
  })
  document.querySelector<HTMLButtonElement>('#client-form-close')?.addEventListener('click', () => setClientFormVisible(false))
  document.querySelector<HTMLButtonElement>('#client-form-cancel')?.addEventListener('click', () => setClientFormVisible(false))

  clientSearchInput?.addEventListener('input', () => {
    if (!clientSearchInput.value.trim()) {
      renderClientSearchResults()
      setClientSearchStatus('Escribe el CI o nombre y presiona Enter o la lupa.')
    }
  })
  clientSearchInput?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    event.stopPropagation()
    searchClient()
  })
  clientSearchButton?.addEventListener('click', searchClient)
  clientSelect?.addEventListener('change', updateClientEditButton)
  updateClientEditButton()

  clientEditButton?.addEventListener('click', () => {
    if (!clientForm || !bootstrapData) return

    const clientId = Number(clientSelect?.value ?? 0)
    const client = bootstrapData.clients.find((item) => item.id_cliente === clientId)
    if (!client) {
      setStatus('sale-status', 'Selecciona un cliente para editar sus datos.', 'error')
      return
    }

    editingClientId = client.id_cliente
    ;(clientForm.elements.namedItem('id_cliente') as HTMLInputElement).value = String(client.id_cliente)
    ;(clientForm.elements.namedItem('nombre') as HTMLInputElement).value = client.nombre
    ;(clientForm.elements.namedItem('documento') as HTMLInputElement).value = client.documento
    ;(clientForm.elements.namedItem('telefono') as HTMLInputElement).value = client.telefono ?? ''
    ;(clientForm.elements.namedItem('email') as HTMLInputElement).value = client.email ?? ''
    ;(clientForm.elements.namedItem('direccion') as HTMLInputElement).value = client.direccion ?? ''
    const title = document.querySelector<HTMLElement>('#client-form-title')
    if (title) title.textContent = 'Editar cliente'
    const submitButton = clientForm.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submitButton) submitButton.innerHTML = '<i class="ti ti-device-floppy"></i> Actualizar cliente'
    setClientFormVisible(true)
    setStatus('client-status', `Editando los datos de ${client.nombre}.`, 'info')
  })

  clientForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('GESTIONAR_VENTAS')) {
      setStatus('client-status', 'No tienes permiso para registrar clientes.', 'error')
      return
    }

    const formData = new FormData(clientForm)
    const wasEditing = editingClientId !== null
    const payload: ClientFormInput = {
      id_cliente: editingClientId,
      nombre: String(formData.get('nombre') ?? '').trim(),
      documento: String(formData.get('documento') ?? '').trim(),
      telefono: String(formData.get('telefono') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      direccion: String(formData.get('direccion') ?? '').trim() || null,
    }
    const button = clientForm.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (button) {
      button.disabled = true
      button.innerHTML = '<i class="ti ti-loader-2"></i> Guardando...'
    }

    try {
      const result = await window.inventoryApi.saveClient(payload)
      await refresh()
      const clientSelect = saleForm?.elements.namedItem('id_cliente') as HTMLSelectElement | null
      if (clientSelect) clientSelect.value = String(result.clientId)
      setClientFormVisible(false)
      if (clientSearchInput) clientSearchInput.value = payload.documento
      updateClientEditButton()
      setClientSearchStatus(`Cliente seleccionado: ${payload.nombre} · CI ${payload.documento}`, 'success')
      setStatus(
        'sale-status',
        `Cliente ${payload.nombre} ${wasEditing ? 'actualizado' : 'registrado'} y seleccionado.`,
        'success',
      )
    } catch (error) {
      setStatus('client-status', getFriendlyErrorMessage(error, 'No se pudo registrar el cliente.'), 'error')
    } finally {
      if (button) {
        button.disabled = false
        button.innerHTML = editingClientId
          ? '<i class="ti ti-device-floppy"></i> Actualizar cliente'
          : '<i class="ti ti-device-floppy"></i> Guardar cliente'
      }
    }
  })

  document.querySelector<HTMLButtonElement>('#product-form-reset')?.addEventListener('click', () => {
    resetProductForm()
    setStatus('inventory-status', 'Formulario listo para un nuevo producto.', 'info')
  })

  document.querySelector<HTMLButtonElement>('#inventory-refresh')?.addEventListener('click', async () => {
    await refresh()
    setStatus('inventory-status', 'Inventario actualizado en tiempo real.', 'success')
  })

  document.querySelector<HTMLButtonElement>('#inventory-mode-toggle')?.addEventListener('click', async () => {
    if (!hasPermission('GESTIONAR_INVENTARIO')) {
      setStatus('inventory-status', 'No tienes permiso para cerrar inventario.', 'error')
      return
    }

    if (!bootstrapData) {
      return
    }

    setInventoryAuditMode(true)
    resetInventoryAuditRows(bootstrapData)
    renderInventoryChecklist(bootstrapData)
    renderInventoryComparison(bootstrapData)
    updateInventoryAuditStatus(bootstrapData)
  })

  document.querySelector<HTMLButtonElement>('#inventory-audit-cancel')?.addEventListener('click', async () => {
    setInventoryAuditMode(false)
    await refresh()
    setStatus('inventory-status', 'Modo inventario cancelado.', 'info')
  })

  document.querySelector<HTMLButtonElement>('#inventory-close')?.addEventListener('click', async () => {
    if (!hasPermission('GESTIONAR_INVENTARIO')) {
      setStatus('inventory-audit-status', 'No tienes permiso para cerrar inventario.', 'error')
      return
    }

    if (!bootstrapData) {
      return
    }

    try {
      const result = await window.inventoryApi.closeInventory(buildInventoryAuditPayload(bootstrapData))
      setInventoryAuditMode(false)
      await refresh()
      setStatus('inventory-status', `Inventario cerrado. Procesados: ${result.procesados}, ajustados: ${result.ajustados}.`, 'success')
    } catch (error) {
      setStatus('inventory-audit-status', error instanceof Error ? error.message : 'No se pudo cerrar inventario.', 'error')
    }
  })

  productForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('GESTIONAR_INVENTARIO')) {
      setStatus('inventory-status', 'No tienes permiso para guardar productos.', 'error')
      return
    }

    try {
      const formData = new FormData(productForm)
      const payload: ProductFormInput = {
        id_producto: productFormState.id_producto,
        codigo: String(formData.get('codigo') ?? ''),
        codigo_barra: String(formData.get('codigo_barra') ?? '').trim() || null,
        nombre: String(formData.get('nombre') ?? ''),
        id_marca: readRequiredId(formData, 'id_marca', 'La marca'),
        id_categoria: formData.get('id_categoria') ? readRequiredId(formData, 'id_categoria', 'La categoria') : null,
        descripcion: String(formData.get('descripcion') ?? '').trim() || null,
        precio_costo: readRequiredNumber(formData, 'precio_costo', 'El precio costo'),
        precio_venta: readRequiredNumber(formData, 'precio_venta', 'El precio venta'),
        stock_minimo: readRequiredNumber(formData, 'stock_minimo', 'El stock minimo'),
        unidad_medida: String(formData.get('unidad_medida') ?? ''),
        estado: (formData.get('estado') as FormDataEntryValue | null) !== null,
        stock_inicial: readRequiredNumber(formData, 'stock_inicial', 'El stock inicial'),
      }

      await window.inventoryApi.saveProduct(payload)
      setStatus('inventory-status', 'Producto guardado correctamente.', 'success')
      resetProductForm()
      await refresh()
    } catch (error) {
      setStatus('inventory-status', getFriendlyErrorMessage(error, 'No se pudo guardar el producto.'), 'error')
    }
  })

  movementForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('GESTIONAR_MOVIMIENTOS')) {
      setStatus('movement-status', 'No tienes permiso para registrar movimientos.', 'error')
      return
    }

    try {
      const formData = new FormData(movementForm)
      const payload: MovementFormInput = {
        id_producto: readRequiredId(formData, 'id_producto', 'El producto'),
        tipo_movimiento: String(formData.get('tipo_movimiento') ?? ''),
        cantidad: readRequiredNumber(formData, 'cantidad', 'La cantidad', { positive: true }),
        costo_unitario: readOptionalNumber(formData, 'costo_unitario', 'El costo unitario'),
        motivo: String(formData.get('motivo') ?? '').trim() || null,
        referencia: String(formData.get('referencia') ?? '').trim() || null,
        observacion: String(formData.get('observacion') ?? '').trim() || null,
      }

      await window.inventoryApi.createMovement(payload)
      setStatus('movement-status', 'Movimiento registrado correctamente.', 'success')
      movementForm.reset()
      await refresh()
    } catch (error) {
      setStatus('movement-status', getFriendlyErrorMessage(error, 'No se pudo registrar el movimiento.'), 'error')
    }
  })

  saleSearchInput?.addEventListener('input', () => {
    renderProductSearchResults(saleSearchInput.value)
  })

  saleSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const query = saleSearchInput.value.trim()
      if (!query || !bootstrapData) return

      const normalizedQuery = normalizeSearch(query)
      const activeProducts = bootstrapData.products
        .filter((product) => isProductActive(product) && Number(product.stock_actual) > 0)

      // 1. Try to find exact match by code or barcode
      let matchedProduct = activeProducts.find(
        (product) =>
          normalizeSearch(product.codigo) === normalizedQuery ||
          (product.codigo_barra && normalizeSearch(product.codigo_barra) === normalizedQuery)
      )

      // 2. If no exact match, see if there is only one product matching the query in the search results
      if (!matchedProduct) {
        const filtered = activeProducts.filter((product) =>
          [
            product.codigo,
            product.codigo_barra,
            product.nombre,
            product.marca_nombre,
          ].some((value) => normalizeSearch(value).includes(normalizedQuery))
        )
        if (filtered.length === 1) {
          matchedProduct = filtered[0]
        }
      }

      if (matchedProduct) {
        addProductToCart(matchedProduct.id_producto)
        saleSearchInput.value = ''
        renderProductSearchResults('')
      } else {
        setStatus('sale-status', 'Producto no encontrado o múltiples coincidencias.', 'error')
      }
    }
  })

  saleDiscountInput?.addEventListener('input', () => {
    renderSaleCart()
  })

  document.querySelector<HTMLButtonElement>('#sale-cart-clear')?.addEventListener('click', () => {
    saleCart.clear()
    renderSaleCart()
    setStatus('sale-status', 'Carrito limpio.', 'info')
  })

  saleForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (saleSubmissionInProgress) {
      setStatus('sale-status', 'La venta ya se está procesando. Espera un momento.', 'info')
      return
    }

    if (!hasPermission('GESTIONAR_VENTAS')) {
      setStatus('sale-status', 'No tienes permiso para registrar ventas.', 'error')
      return
    }

    if (!bootstrapData) {
      return
    }

    const formData = new FormData(saleForm)
    const subtotal = getSaleSubtotal()

    const discountManual = String(formData.get('descuento_total') ?? '').trim()
      ? Number(formData.get('descuento_total'))
      : 0

    if (saleCart.size === 0) {
      setStatus('sale-status', 'Agrega al menos un producto antes de confirmar la venta.', 'error')
      return
    }

    if (!Number.isFinite(discountManual) || discountManual < 0) {
      setStatus('sale-status', 'El descuento manual no puede ser negativo.', 'error')
      return
    }

    const idClienteVal = formData.get('id_cliente') ? Number(formData.get('id_cliente')) : 0
    const idCliente = idClienteVal > 0 ? idClienteVal : null

    const idVendedorVal = Number(formData.get('id_vendedor') ?? 0)
    if (!idVendedorVal) {
      setStatus('sale-status', 'Debe seleccionar un vendedor.', 'error')
      return
    }

    const idTurnoVal = formData.get('id_turno') ? Number(formData.get('id_turno')) : 0
    const idTurno = idTurnoVal > 0 ? idTurnoVal : null

    if (!idTurno && !currentUser?.isAdminLike) {
      setStatus('sale-status', 'El vendedor debe registrar su entrada antes de confirmar la venta.', 'error')
      return
    }

    const idMoneda = Number(formData.get('id_moneda') ?? 1)
    const tasaCambio = Number(formData.get('tasa_cambio_aplicada') ?? 1)

    // Distributed general discount manual share
    const details = Array.from(saleCart.values()).map((item) => {
      const subtotalLine = roundMoney(Number(item.product.precio_venta) * item.cantidad)
      const lineManualShare = subtotal === 0 ? 0 : roundMoney((subtotalLine / subtotal) * discountManual)
      const lineManualShareUnit = roundMoney(lineManualShare / item.cantidad)
      const totalDescuentoUnitario = roundMoney((item.descuento_unitario ?? 0) + lineManualShareUnit)

      return {
        id_producto: item.product.id_producto,
        cantidad: item.cantidad,
        descuento_unitario: totalDescuentoUnitario,
        id_descuento: null as number | null
      }
    })

    const payload: SaleFormInput = {
      id_cliente: idCliente,
      id_vendedor: idVendedorVal,
      id_turno: idTurno,
      id_moneda: idMoneda,
      tasa_cambio_aplicada: tasaCambio,
      observacion: String(formData.get('observacion') ?? '').trim() || null,
      detalles: details,
      pagos: salePayments.map(pago => ({
        id_metodo_pago: pago.id_metodo_pago,
        id_moneda: pago.id_moneda,
        monto: pago.monto,
        referencia_pago: pago.referencia_pago
      }))
    }
    const submitBtn = saleForm.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submitBtn) {
      submitBtn.disabled = true
      submitBtn.textContent = 'Procesando...'
    }

    saleSubmissionInProgress = true
    try {
      await window.inventoryApi.createSale(payload)
      setStatus('sale-status', 'Venta registrada correctamente.', 'success')
      saleCart.clear()
      salePayments.length = 0
      saleForm.reset()
      renderSalePayments()
      await refresh()
    } catch (error) {
      setStatus('sale-status', getFriendlyErrorMessage(error, 'No se pudo registrar la venta.'), 'error')
    } finally {
      saleSubmissionInProgress = false
      if (submitBtn) {
        submitBtn.disabled = false
        submitBtn.textContent = 'Confirmar venta'
      }
    }
  })

  attendanceForm?.querySelectorAll<HTMLButtonElement>('[data-attendance-action]').forEach((button) => {
    button.addEventListener('click', () => {
      attendanceAction = button.dataset.attendanceAction === 'exit' ? 'exit' : 'entry'
    })
  })

  attendanceForm?.addEventListener('change', () => {
    if (bootstrapData) {
      renderAttendanceState(bootstrapData)
    }
  })

  attendanceForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('REGISTRAR_ASISTENCIAS')) {
      setStatus('attendance-status', 'No tienes permiso para registrar asistencias.', 'error')
      return
    }

    try {
      const formData = new FormData(attendanceForm)
      const workerId = !currentUser?.isAdminLike && currentUser?.id_trabajador
        ? currentUser.id_trabajador
        : readRequiredId(formData, 'id_trabajador', 'El trabajador')
      const selectedShiftId = String(formData.get('id_turno') ?? '').trim()
        ? readRequiredId(formData, 'id_turno', 'El turno')
        : 0
      const openAttendance = bootstrapData?.attendances.find(
        (attendance) => attendance.id_trabajador === workerId && attendance.estado === 'EN_TURNO',
      )
      const payload: AttendanceFormInput = {
        id_trabajador: workerId,
        id_turno: attendanceAction === 'exit' ? openAttendance?.id_turno ?? selectedShiftId : selectedShiftId,
        observacion: String(formData.get('observacion') ?? '').trim() || null,
      }

      if (attendanceAction === 'exit') {
        await window.inventoryApi.registerAttendanceExit(payload)
        setStatus('attendance-status', 'Salida registrada correctamente.', 'success')
      } else {
        if (openAttendance) {
          setStatus('attendance-status', 'Este trabajador ya esta en turno. Registra su salida para cerrar la asistencia.', 'error')
          return
        }

        if (!payload.id_turno) {
          setStatus('attendance-status', 'Selecciona el turno para registrar la entrada.', 'error')
          return
        }

        await window.inventoryApi.registerAttendanceEntry(payload)
        setStatus('attendance-status', 'Entrada registrada correctamente.', 'success')
      }

      ;(attendanceForm.elements.namedItem('observacion') as HTMLTextAreaElement).value = ''
      await refresh()
    } catch (error) {
      setStatus('attendance-status', getFriendlyErrorMessage(error, 'No se pudo registrar la asistencia.'), 'error')
    }
  })

  document.querySelector<HTMLButtonElement>('#btn-new-role')?.addEventListener('click', () => {
    resetRoleForm()
    const title = document.getElementById('role-form-title')
    if (title) title.textContent = 'Crear Nuevo Rol'
    setStatus('role-status', 'Formulario listo para un nuevo rol.', 'info')
    const formView = document.getElementById('roles-form-view')
    if (formView) formView.style.display = 'flex'
  })

  document.querySelector<HTMLButtonElement>('#btn-cancel-role')?.addEventListener('click', () => {
    const formView = document.getElementById('roles-form-view')
    if (formView) formView.style.display = 'none'
    resetRoleForm()
  })

  roleForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('GESTIONAR_ROLES')) {
      setStatus('role-status', 'No tienes permiso para guardar roles.', 'error')
      return
    }

    const formData = new FormData(roleForm)
    const checkedPermisos = Array.from(roleForm.querySelectorAll<HTMLInputElement>('input[name="permisos[]"]:checked')).map(cb => Number(cb.value))
    try {
      await window.inventoryApi.saveRole({
        id_rol: roleFormState.id_rol,
        nombre: String(formData.get('nombre') ?? ''),
        descripcion: String(formData.get('descripcion') ?? '').trim() || null,
        estado: (formData.get('estado') as FormDataEntryValue | null) !== null,
        permisos: checkedPermisos
      })
      setStatus('role-status', 'Rol guardado correctamente.', 'success')
      resetRoleForm()
      await refresh()
      const formView = document.getElementById('roles-form-view')
      if (formView) formView.style.display = 'none'
    } catch (error) {
      setStatus('role-status', error instanceof Error ? error.message : 'Error al guardar.', 'error')
    }
  })

  document.querySelector<HTMLButtonElement>('#btn-new-worker')?.addEventListener('click', () => {
    resetWorkerForm()
    const title = document.getElementById('worker-form-title')
    if (title) title.textContent = 'Crear Nuevo Trabajador'
    setStatus('worker-status', 'Formulario listo para un nuevo trabajador.', 'info')
    const formView = document.getElementById('workers-form-view')
    if (formView) formView.style.display = 'flex'
  })

  document.querySelector<HTMLButtonElement>('#btn-cancel-worker')?.addEventListener('click', () => {
    const formView = document.getElementById('workers-form-view')
    if (formView) formView.style.display = 'none'
    resetWorkerForm()
  })

  workerForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('GESTIONAR_TRABAJADORES')) {
      setStatus('worker-status', 'No tienes permiso para guardar trabajadores.', 'error')
      return
    }

    const formData = new FormData(workerForm)
    try {
      await window.inventoryApi.saveWorker({
        id_trabajador: workerFormState.id_trabajador,
        nombres: String(formData.get('nombres') ?? ''),
        apellidos: String(formData.get('apellidos') ?? ''),
        cedula: String(formData.get('cedula') ?? '').trim() || null,
        cargo: String(formData.get('cargo') ?? '').trim() || null,
        salario_base: String(formData.get('salario_base') ?? '').trim() ? Number(formData.get('salario_base')) : null,
        estado: (formData.get('estado') as FormDataEntryValue | null) !== null ? 'activo' : 'inactivo',
        crear_usuario: (formData.get('crear_usuario') as FormDataEntryValue | null) !== null,
        id_rol: String(formData.get('id_rol') ?? '').trim() ? Number(formData.get('id_rol')) : null
      })
      setStatus('worker-status', 'Trabajador guardado correctamente.', 'success')
      resetWorkerForm()
      await refresh()
      const formView = document.getElementById('workers-form-view')
      if (formView) formView.style.display = 'none'
    } catch (error) {
      setStatus('worker-status', error instanceof Error ? error.message : 'Error al guardar.', 'error')
    }
  })

  document.querySelector<HTMLButtonElement>('#dashboard-refresh')?.addEventListener('click', async () => {
    const button = document.querySelector<HTMLButtonElement>('#dashboard-refresh')
    if (button) {
      button.disabled = true
      button.innerHTML = '<i class="ti ti-loader-2"></i> Actualizando...'
    }

    try {
      await refresh()
    } finally {
      if (button) {
        button.disabled = false
        button.innerHTML = '<i class="ti ti-refresh"></i> Actualizar'
      }
    }
  })

  document.querySelector<HTMLButtonElement>('#shift-form-reset')?.addEventListener('click', () => {
    resetShiftForm()
    setStatus('shift-status', 'Formulario listo para un nuevo turno.', 'info')
  })

  shiftForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!hasPermission('GESTIONAR_TURNOS')) {
      setStatus('shift-status', 'No tienes permiso para gestionar turnos.', 'error')
      return
    }

    const formData = new FormData(shiftForm)
    const payload: ShiftFormInput = {
      id_turno: shiftFormState.id_turno,
      nombre: String(formData.get('nombre') ?? '').trim(),
      hora_inicio: String(formData.get('hora_inicio') ?? ''),
      hora_fin: String(formData.get('hora_fin') ?? ''),
      descripcion: String(formData.get('descripcion') ?? '').trim() || null,
      estado: formData.get('estado') !== null,
    }

    const submitButton = shiftForm.querySelector<HTMLButtonElement>('button[type="submit"]')
    if (submitButton) {
      submitButton.disabled = true
      submitButton.textContent = 'Guardando...'
    }

    try {
      const result = await window.inventoryApi.saveShift(payload)
      updateShiftDataLocally({
        id_turno: result.shiftId,
        nombre: payload.nombre,
        hora_inicio: payload.hora_inicio,
        hora_fin: payload.hora_fin,
        descripcion: payload.descripcion ?? null,
        estado: payload.estado,
      })
      resetShiftForm()
      await refresh()
      setStatus('shift-status', 'Turno guardado correctamente.', 'success')
    } catch (error) {
      setStatus('shift-status', getFriendlyErrorMessage(error, 'No se pudo guardar el turno.'), 'error')
    } finally {
      if (submitButton) {
        submitButton.disabled = false
        submitButton.textContent = shiftFormState.id_turno ? 'Actualizar turno' : 'Guardar turno'
      }
    }
  })

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab as TabName | string | undefined
      if (tabName === 'administracion-group') {
        const toggle = document.getElementById('admin-accordion-toggle')
        const content = document.getElementById('admin-accordion-content')
        if (toggle && content) {
          const isExpanded = toggle.getAttribute('aria-expanded') === 'true'
          toggle.setAttribute('aria-expanded', (!isExpanded).toString())
          content.style.display = isExpanded ? 'none' : 'flex'
        }
        return
      }
      if (tabName) setActiveTab(tabName as TabName)
    })
  })

  setupPaymentHandlers()
  setupModalCloseHandler()

  document.querySelector('#sale-form select[name="id_moneda"]')?.addEventListener('change', () => {
    updateSaleCurrencyRate()
  })

  document.querySelector('#sale-form select[name="id_vendedor"]')?.addEventListener('change', () => {
    updateSaleShift()
  })

  document.querySelector<HTMLInputElement>('#inventory-search')?.addEventListener('input', async (event) => {
    inventorySearchTerm = (event.target as HTMLInputElement).value
    if (bootstrapData) {
      renderProductsTable(bootstrapData)
    }
  })

  document.querySelector<HTMLSelectElement>('#inventory-search-field')?.addEventListener('change', async (event) => {
    inventorySearchField = (event.target as HTMLSelectElement).value as InventorySearchField
    if (bootstrapData) {
      renderProductsTable(bootstrapData)
    }
  })

  document.querySelector<HTMLButtonElement>('#inventory-search-clear')?.addEventListener('click', () => {
    inventorySearchTerm = ''
    inventorySearchField = 'all'

    const searchInput = document.querySelector<HTMLInputElement>('#inventory-search')
    const searchSelect = document.querySelector<HTMLSelectElement>('#inventory-search-field')

    if (searchInput) {
      searchInput.value = ''
    }

    if (searchSelect) {
      searchSelect.value = 'all'
    }

    if (bootstrapData) {
      renderProductsTable(bootstrapData)
    }
  })

  document.querySelector<HTMLInputElement>('#inventory-audit-search')?.addEventListener('input', (event) => {
    inventoryAuditSearchTerm = (event.target as HTMLInputElement).value
    if (bootstrapData) {
      renderInventoryChecklist(bootstrapData)
    }
  })

  // Reportes tab handlers
  document.querySelector<HTMLButtonElement>('#report-generate-btn')?.addEventListener('click', () => {
    void loadSalesReportData()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-report-range]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.dataset.reportRange as ReportRangePreset | undefined
      if (preset === 'today' || preset === 'week' || preset === 'month') {
        setReportDateRange(preset)
      }
    })
  })

  document.querySelectorAll<HTMLInputElement>('#report-start-date, #report-end-date').forEach((input) => {
    input.addEventListener('change', syncReportPresetButtons)
  })

  document.querySelectorAll<HTMLSelectElement>(
    '#report-vendedor-filter, #report-turno-filter, #report-moneda-filter, #report-estado-filter',
  ).forEach((select) => {
    select.addEventListener('change', updateReportFilterButton)
  })

  document.querySelector<HTMLButtonElement>('#report-filter-toggle')?.addEventListener('click', (event) => {
    const reportView = document.querySelector<HTMLElement>('[data-panel="reportes"]')
    const button = event.currentTarget as HTMLButtonElement
    const show = !reportView?.classList.contains('show-report-filters')

    reportView?.classList.toggle('show-report-filters', show)
    button.setAttribute('aria-pressed', String(show))
    updateReportFilterButton()
  })

  document.querySelector<HTMLButtonElement>('#report-detail-toggle')?.addEventListener('click', (event) => {
    const reportView = document.querySelector<HTMLElement>('[data-panel="reportes"]')
    const button = event.currentTarget as HTMLButtonElement
    const show = !reportView?.classList.contains('show-report-detail')

    reportView?.classList.toggle('show-report-detail', show)
    button.setAttribute('aria-pressed', String(show))
    button.innerHTML = show
      ? '<i class="ti ti-eye-off"></i> detalle'
      : '<i class="ti ti-list-details"></i> Detalle'

    if (show && currentSalesReportData) {
      const reportData = currentSalesReportData
      window.requestAnimationFrame(() => renderSalesReportCharts(reportData))
    }
  })

  document.querySelectorAll<HTMLButtonElement>('.report-subtab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.report-subtab-btn').forEach((b) => b.classList.remove('is-active'))
      btn.classList.add('is-active')
      const targetSubpanel = btn.dataset.subtab
      document.querySelectorAll('.report-table-panel').forEach((panel) => {
        const p = panel as HTMLElement
        p.classList.toggle('is-active', p.dataset.subpanel === targetSubpanel)
      })
    })
  })
}

async function openSaleDetailModal(saleId: number) {
  const modal = document.querySelector<HTMLDivElement>('#sale-detail-modal')
  const body = document.querySelector<HTMLDivElement>('#sale-detail-modal-body')
  if (!modal || !body) return

  try {
    const detail = await window.inventoryApi.getSaleDetail(saleId)
    body.innerHTML = `
      <div class="sale-detail-view">
        <div class="sale-detail-grid form-grid">
          <div class="field"><span>Factura</span><strong>${escapeHtml(detail.numero_factura)}</strong></div>
          <div class="field"><span>Fecha</span><strong>${escapeHtml(formatDateTime(detail.fecha_venta))}</strong></div>
          <div class="field"><span>Cliente</span><strong>${escapeHtml(detail.cliente_nombre || 'Consumidor final')}</strong></div>
          <div class="field"><span>CI</span><strong>${escapeHtml(detail.cliente_documento || '-')}</strong></div>
          <div class="field"><span>Teléfono</span><strong>${escapeHtml(detail.cliente_telefono || '-')}</strong></div>
          <div class="field"><span>Vendedor</span><strong>${escapeHtml(detail.vendedor_nombre)}</strong></div>
          <div class="field"><span>Turno</span><strong>${escapeHtml(detail.turno_nombre || 'Sin turno')}</strong></div>
          <div class="field"><span>Estado</span><strong class="badge badge--soft">${escapeHtml(detail.estado)}</strong></div>
          <div class="field"><span>Moneda</span><strong>${escapeHtml(detail.moneda_codigo)}</strong></div>
          <div class="field"><span>Observación</span><strong>${escapeHtml(detail.observacion || '-')}</strong></div>
        </div>

        <h3 class="section-title" style="margin-top:16px;">Productos</h3>
        <div class="table-wrap">
          <table class="data-table" style="min-width: 100%">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>P. Unitario</th>
                <th>Descuento Unit.</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${detail.detalles.map(d => `
                <tr>
                  <td><strong>${escapeHtml(d.nombre)}</strong><small>${escapeHtml(d.codigo)}</small></td>
                  <td>${escapeHtml(formatCurrency(d.cantidad))}</td>
                  <td>${escapeHtml(formatCurrency(d.precio_unitario))}</td>
                  <td>${escapeHtml(formatCurrency(d.descuento_unitario))}</td>
                  <td>${escapeHtml(formatCurrency(d.total_linea))}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <h3 class="section-title" style="margin-top:16px;">Pagos Realizados</h3>
        <div class="table-wrap">
          <table class="data-table" style="min-width: 100%">
            <thead>
              <tr>
                <th>Método</th>
                <th>Moneda</th>
                <th>Monto</th>
                <th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              ${detail.pagos.map(p => `
                <tr>
                  <td><strong>${escapeHtml(p.metodo_pago)}</strong></td>
                  <td>${escapeHtml(p.moneda_codigo)}</td>
                  <td>${escapeHtml(formatCurrency(p.monto))}</td>
                  <td>${escapeHtml(p.referencia_pago || '-')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="sale-detail-totals" style="margin-top:16px; display:grid; gap:8px; justify-content:end; text-align:right;">
          <div><span>Subtotal:</span> <strong>${escapeHtml(detail.moneda_codigo)} ${escapeHtml(formatCurrency(detail.subtotal))}</strong></div>
          <div><span>Descuento:</span> <strong>${escapeHtml(detail.moneda_codigo)} ${escapeHtml(formatCurrency(detail.descuento_total))}</strong></div>
          <div><span>Total Final:</span> <strong>${escapeHtml(detail.moneda_codigo)} ${escapeHtml(formatCurrency(detail.total))}</strong></div>
          <div style="font-size:1.15rem; font-weight:800; color:var(--success); border-top:1px solid var(--border); padding-top:8px;"><span>Ganancia Neta:</span> <strong>${escapeHtml(detail.moneda_codigo)} ${escapeHtml(formatCurrency(detail.ganancia_total))}</strong></div>
        </div>
      </div>
    `
    modal.style.display = 'block'
  } catch (error) {
    showToast.error(error instanceof Error ? error.message : 'No se pudo obtener el detalle de la venta.')
  }
}

function setupModalCloseHandler() {
  const modal = document.querySelector<HTMLDivElement>('#sale-detail-modal')
  const closeBtn = document.querySelector<HTMLButtonElement>('#close-detail-modal-btn')
  const overlay = document.querySelector<HTMLDivElement>('#sale-detail-modal-overlay')

  const closeModal = () => {
    if (modal) modal.style.display = 'none'
  }

  closeBtn?.addEventListener('click', closeModal)
  overlay?.addEventListener('click', closeModal)
}

function initLogin() {
  const sidebarToggle = document.getElementById('sidebar-toggle')
  const sidebar = document.getElementById('main-sidebar')
  sidebarToggle?.addEventListener('click', () => {
    sidebar?.classList.toggle('is-collapsed')
  })

  const loginForm = document.querySelector<HTMLFormElement>('#login-form')
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const formData = new FormData(loginForm)
    try {
      const result = await window.inventoryApi.login({
        username: String(formData.get('username') ?? ''),
        password_plain: String(formData.get('password') ?? '')
      })
      if (result.success) {
        currentUser = result.user ?? null

        if (result.requiresPasswordChange) {
          document.getElementById('login-overlay')!.style.display = 'none'
          document.getElementById('password-change-overlay')!.style.display = 'flex'
          return
        }

        document.getElementById('login-overlay')!.style.display = 'none'
        document.getElementById('main-app')!.style.display = 'block'
        setActiveTab('home')
        void bootstrap()
      } else {
        setStatus('login-status', result.message ?? 'Credenciales incorrectas', 'error')
      }
    } catch (err) {
      setStatus('login-status', 'Error de conexión con el backend', 'error')
    }
  })

  const passwordChangeForm = document.getElementById('password-change-form') as HTMLFormElement | null
  const newPasswordInput = document.getElementById('new-password-input') as HTMLInputElement | null
  const passwordStrengthProgress = document.getElementById('password-strength-progress')
  const passwordStrengthText = document.getElementById('password-strength-text')
  const passwordChangeSubmit = document.getElementById('password-change-submit') as HTMLButtonElement | null

  newPasswordInput?.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value
    let strength = 0
    if (val.length >= 8) strength += 1
    if (/[A-Z]/.test(val)) strength += 1
    if (/[0-9]/.test(val)) strength += 1
    if (/[^A-Za-z0-9]/.test(val)) strength += 1

    if (passwordStrengthProgress && passwordStrengthText && passwordChangeSubmit) {
      passwordStrengthProgress.className = 'password-strength-progress'
      if (val.length === 0) {
        passwordStrengthProgress.style.width = '0%'
        passwordStrengthText.textContent = 'La contraseña debe tener al menos 8 caracteres'
        passwordChangeSubmit.disabled = true
      } else if (strength <= 1) {
        passwordStrengthProgress.style.width = '33%'
        passwordStrengthProgress.classList.add('strength-weak')
        passwordStrengthText.textContent = 'Débil (usa mayúsculas, números y símbolos)'
        passwordChangeSubmit.disabled = val.length < 8
      } else if (strength === 2 || strength === 3) {
        passwordStrengthProgress.style.width = '66%'
        passwordStrengthProgress.classList.add('strength-medium')
        passwordStrengthText.textContent = 'Buena (añade más variedad para que sea fuerte)'
        passwordChangeSubmit.disabled = false
      } else {
        passwordStrengthProgress.style.width = '100%'
        passwordStrengthProgress.classList.add('strength-strong')
        passwordStrengthText.textContent = 'Fuerte'
        passwordChangeSubmit.disabled = false
      }
    }
  })

  passwordChangeForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!currentUser) return

    const formData = new FormData(passwordChangeForm)
    const newPassword = String(formData.get('new_password') ?? '')
    const confirmPassword = String(formData.get('confirm_password') ?? '')

    if (newPassword !== confirmPassword) {
      setStatus('password-change-status', 'Las contraseñas no coinciden', 'error')
      return
    }

    if (newPassword.length < 8) {
      setStatus('password-change-status', 'La contraseña debe tener al menos 8 caracteres', 'error')
      return
    }

    try {
      const result = await window.inventoryApi.changePassword({ userId: currentUser.id_usuario, newPasswordPlain: newPassword })
      if (result.success) {
        passwordChangeForm.reset()
        if (passwordStrengthProgress) passwordStrengthProgress.style.width = '0%'
        if (passwordStrengthText) passwordStrengthText.textContent = 'La contraseña debe tener al menos 8 caracteres'
        if (passwordChangeSubmit) passwordChangeSubmit.disabled = true
        document.getElementById('password-change-overlay')!.style.display = 'none'
        document.getElementById('main-app')!.style.display = 'block'
        setActiveTab('home')
        void bootstrap()
      } else {
        setStatus('password-change-status', result.message ?? 'Error al actualizar', 'error')
      }
    } catch (err) {
      setStatus('password-change-status', 'Error de conexión', 'error')
    }
  })

  document.getElementById('cancel-password-change')?.addEventListener('click', () => {
    currentUser = null
    passwordChangeForm?.reset()
    loginForm?.reset()
    document.getElementById('password-change-overlay')!.style.display = 'none'
    document.getElementById('login-overlay')!.style.display = 'flex'
  })

  const logoutBtn = document.getElementById('logout-btn')
  logoutBtn?.addEventListener('click', () => {
    currentUser = null
    if (clockInterval) {
      window.clearInterval(clockInterval)
      clockInterval = null
    }
    if (landingDismissTimer) {
      window.clearTimeout(landingDismissTimer)
      landingDismissTimer = null
    }
    document.querySelector<HTMLElement>('#session-welcome-banner')?.classList.remove('is-dismissed')
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null
    loginForm?.reset()
    document.getElementById('main-app')!.style.display = 'none'
    document.getElementById('password-change-overlay')!.style.display = 'none'
    document.getElementById('login-overlay')!.style.display = 'flex'
    sidebar?.classList.remove('is-collapsed')
  })
}

type ReportRangePreset = 'today' | 'week' | 'month'

function toDateInputValue(date: Date) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function setReportPresetActive(preset: ReportRangePreset | null) {
  document.querySelectorAll<HTMLButtonElement>('[data-report-range]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.reportRange === preset)
  })
}

function detectReportPreset(startDate: string, endDate: string): ReportRangePreset | null {
  const today = new Date()
  const todayValue = toDateInputValue(today)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - 6)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

  if (startDate === todayValue && endDate === todayValue) return 'today'
  if (startDate === toDateInputValue(weekStart) && endDate === todayValue) return 'week'
  if (startDate === toDateInputValue(monthStart) && endDate === todayValue) return 'month'
  return null
}

function syncReportPresetButtons() {
  const startDate = document.querySelector<HTMLInputElement>('#report-start-date')?.value ?? ''
  const endDate = document.querySelector<HTMLInputElement>('#report-end-date')?.value ?? ''
  setReportPresetActive(detectReportPreset(startDate, endDate))
}

function setReportDateRange(preset: ReportRangePreset, shouldLoad = true) {
  const startDateInput = document.querySelector<HTMLInputElement>('#report-start-date')
  const endDateInput = document.querySelector<HTMLInputElement>('#report-end-date')
  if (!startDateInput || !endDateInput) return

  const today = new Date()
  const startDate = new Date(today)

  if (preset === 'week') {
    startDate.setDate(today.getDate() - 6)
  } else if (preset === 'month') {
    startDate.setDate(1)
  }

  startDateInput.value = toDateInputValue(startDate)
  endDateInput.value = toDateInputValue(today)
  setReportPresetActive(preset)

  if (shouldLoad) {
    void loadSalesReportData()
  }
}

function initReportDates() {
  const startDateInput = document.querySelector<HTMLInputElement>('#report-start-date')
  const endDateInput = document.querySelector<HTMLInputElement>('#report-end-date')
  if (startDateInput && !startDateInput.value) {
    startDateInput.value = toDateInputValue(new Date())
  }
  if (endDateInput && !endDateInput.value) {
    endDateInput.value = toDateInputValue(new Date())
  }
  syncReportPresetButtons()
}

function readOptionalReportId(selector: string) {
  const value = document.querySelector<HTMLSelectElement>(selector)?.value
  if (!value) {
    return null
  }

  const numberValue = Number(value)
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : null
}

function setElementText(selector: string, text: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (element) {
    element.textContent = text
  }
}

function formatMoneyWithCurrency(value: number, currency = 'BOB') {
  const prefix = currency === 'BOB' ? 'Bs' : currency
  return `${prefix} ${formatCurrency(value)}`
}

function renderSalesReportCharts(reportData: SalesReportData) {
  renderBrandChart('brand-chart-container', reportData.charts.brands)
  renderShiftChart('shift-chart-container', reportData.charts.shifts)
  renderSellerChart('seller-chart-container', reportData.charts.sellers)
  renderDailyTrendChart('daily-chart-container', reportData.charts.daily)
}

function getStatusBadgeClass(status: string) {
  const normalized = status.toUpperCase()
  if (normalized === 'COMPLETADA') return 'badge--success'
  if (normalized === 'ANULADA') return 'badge--muted'
  return 'badge--soft'
}

async function loadSalesReportData() {
  const startDateInput = document.querySelector<HTMLInputElement>('#report-start-date')
  const endDateInput = document.querySelector<HTMLInputElement>('#report-end-date')
  if (!startDateInput || !endDateInput) return

  const startDate = startDateInput.value
  const endDate = endDateInput.value
  if (!startDate || !endDate) return
  syncReportPresetButtons()
  if (startDate > endDate) {
    setStatus('report-status', 'La fecha inicial no puede ser mayor que la fecha final.', 'error')
    return
  }

  const btn = document.querySelector<HTMLButtonElement>('#report-generate-btn')
  if (btn) {
    btn.disabled = true
    btn.innerHTML = '<i class="ti ti-loader-2"></i> Generando'
  }

  try {
    const estado = document.querySelector<HTMLSelectElement>('#report-estado-filter')?.value || null
    const payload: SalesReportInput = {
      startDate,
      endDate,
      vendedorId: readOptionalReportId('#report-vendedor-filter'),
      turnoId: readOptionalReportId('#report-turno-filter'),
      monedaId: readOptionalReportId('#report-moneda-filter'),
      estado,
    }
    const reportData = await window.inventoryApi.getSalesReport(payload)
    currentSalesReportData = reportData

    setStatus(
      'report-status',
      reportData.kpis.cantidadVentas > 0
        ? `Reporte generado para ${reportData.kpis.cantidadVentas} ventas.`
        : 'No hay ventas para los filtros seleccionados.',
      reportData.kpis.cantidadVentas > 0 ? 'success' : 'info',
    )

    setElementText('#kpi-total-vendido', formatMoneyWithCurrency(reportData.kpis.totalVendido))
    setElementText('#kpi-total-costo', formatMoneyWithCurrency(reportData.kpis.totalCosto))
    setElementText('#kpi-total-ganancia', formatMoneyWithCurrency(reportData.kpis.totalGanancia))
    setElementText('#kpi-total-cobrado', formatMoneyWithCurrency(reportData.kpis.totalCobrado))
    setElementText('#kpi-saldo-pendiente', formatMoneyWithCurrency(reportData.kpis.saldoPendiente))
    setElementText('#kpi-total-descuentos', formatMoneyWithCurrency(reportData.kpis.totalDescuentos))
    setElementText('#kpi-ticket-promedio', formatMoneyWithCurrency(reportData.kpis.ticketPromedio))
    setElementText('#kpi-margen-promedio', `${formatCurrency(reportData.kpis.margenPromedio)}%`)
    setElementText('#kpi-ventas-pendientes', String(reportData.kpis.ventasPendientes))
    setElementText('#report-sales-count', `${reportData.kpis.cantidadVentas} ventas`)
    setElementText('#report-cash-count', `${reportData.kpis.pagosRegistrados} pagos`)
    setElementText(
      '#report-best-sale',
      reportData.kpis.ventaMasRentable
        ? `Venta mas rentable: ${reportData.kpis.ventaMasRentable.label} (${formatMoneyWithCurrency(reportData.kpis.ventaMasRentable.value)})`
        : 'Venta mas rentable: sin datos',
    )
    setElementText(
      '#report-low-margin',
      reportData.kpis.margenMasBajo
        ? `Margen mas bajo: ${reportData.kpis.margenMasBajo.label} (${formatCurrency(reportData.kpis.margenMasBajo.value)}%)`
        : 'Margen mas bajo: sin datos',
    )
    setElementText(
      '#report-payment-count',
      `${reportData.kpis.pagosRegistrados} pagos en ${reportData.kpis.metodosPagoCount} metodos`,
    )

    const profitsBody = document.querySelector('#report-profits-table tbody')
    if (profitsBody) {
      if (reportData.profitReport.length === 0) {
        profitsBody.innerHTML = '<tr><td colspan="12" class="empty-state">No se registraron ventas con estos filtros.</td></tr>'
      } else {
        profitsBody.innerHTML = reportData.profitReport.map(row => `
          <tr>
            <td><strong>${escapeHtml(row.numero_factura)}</strong></td>
            <td>${escapeHtml(row.fecha_venta.slice(0, 16).replace('T', ' '))}</td>
            <td>${escapeHtml(row.vendedor)}</td>
            <td>${escapeHtml(row.turno)}</td>
            <td style="text-align: right;">${escapeHtml(formatCurrency(row.cantidad_total))}</td>
            <td style="text-align: right; font-weight: bold;">${escapeHtml(formatMoneyWithCurrency(row.total, row.moneda))}</td>
            <td style="text-align: right; color: var(--muted);">${escapeHtml(formatMoneyWithCurrency(row.costo, row.moneda))}</td>
            <td style="text-align: right; color: var(--success); font-weight: bold;">${escapeHtml(formatMoneyWithCurrency(row.ganancia, row.moneda))}</td>
            <td style="text-align: right; color: var(--accent); font-weight: bold;">${escapeHtml(formatCurrency(row.margen))}%</td>
            <td style="text-align: right;">${escapeHtml(formatMoneyWithCurrency(row.pagos_recibidos, row.moneda))}</td>
            <td style="text-align: center;"><span class="badge ${getStatusBadgeClass(row.estado)}">${escapeHtml(row.estado)}</span></td>
            <td style="text-align: center;"><button class="button button--small button--ghost" type="button" data-sale-detail-btn="${row.id_venta}"><i class="ti ti-eye"></i></button></td>
          </tr>
        `).join('')
      }
    }

    const cashflowBody = document.querySelector('#report-cashflow-table tbody')
    if (cashflowBody) {
      if (reportData.cashFlowReport.length === 0) {
        cashflowBody.innerHTML = '<tr><td colspan="6" class="empty-state">No se registraron cobros con estos filtros.</td></tr>'
      } else {
        cashflowBody.innerHTML = reportData.cashFlowReport.map(row => `
          <tr>
            <td><strong>${escapeHtml(row.metodo_pago)}</strong></td>
            <td>${escapeHtml(row.moneda)}</td>
            <td style="text-align: right; font-weight: bold; color: var(--success);">${escapeHtml(formatMoneyWithCurrency(row.total_recibido, row.moneda))}</td>
            <td style="text-align: center;">${escapeHtml(row.transacciones_count)}</td>
            <td style="text-align: center;">${escapeHtml(row.ventas_count)}</td>
            <td style="text-align: center;">${row.sin_referencia_count > 0 ? `<span class="badge badge--soft">${escapeHtml(row.sin_referencia_count)}</span>` : '0'}</td>
          </tr>
        `).join('')
      }
    }

    const cashflowSalesBody = document.querySelector('#report-cashflow-sales-table tbody')
    if (cashflowSalesBody) {
      if (reportData.cashFlowBySale.length === 0) {
        cashflowSalesBody.innerHTML = '<tr><td colspan="9" class="empty-state">No hay ventas para conciliar con estos filtros.</td></tr>'
      } else {
        cashflowSalesBody.innerHTML = reportData.cashFlowBySale.map(row => `
          <tr>
            <td><strong>${escapeHtml(row.numero_factura)}</strong></td>
            <td>${escapeHtml(row.cliente)}</td>
            <td>${escapeHtml(row.vendedor)}</td>
            <td style="text-align: right;">${escapeHtml(formatMoneyWithCurrency(row.total_vendido, row.moneda))}</td>
            <td style="text-align: right; color: var(--success); font-weight: 700;">${escapeHtml(formatMoneyWithCurrency(row.total_recibido, row.moneda))}</td>
            <td style="text-align: right; color: ${row.saldo_pendiente > 0 ? 'var(--danger)' : 'var(--muted)'};">${escapeHtml(formatMoneyWithCurrency(row.saldo_pendiente, row.moneda))}</td>
            <td style="text-align: right;">${escapeHtml(formatMoneyWithCurrency(row.cambio, row.moneda))}</td>
            <td>${escapeHtml(row.metodos_pago)}</td>
            <td style="text-align: center;"><span class="badge ${getStatusBadgeClass(row.estado)}">${escapeHtml(row.estado)}</span></td>
          </tr>
        `).join('')
      }
    }

    renderSalesReportCharts(reportData)

  } catch (error) {
    setStatus('report-status', getFriendlyErrorMessage(error, 'Error al generar el reporte.'), 'error')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.innerHTML = '<i class="ti ti-chart-bar"></i> Generar'
    }
  }
}

type HorizontalReportChartItem = {
  label: string
  total: number
  ganancia: number
  detail: string
}

function attachChartTooltip(container: HTMLElement, tooltipEl: HTMLElement) {
  container.querySelectorAll<SVGGElement>('.chart-group').forEach((group) => {
    group.addEventListener('mouseenter', () => {
      const label = group.getAttribute('data-label') ?? ''
      const value = group.getAttribute('data-value') ?? ''
      tooltipEl.innerHTML = `<strong>${escapeHtml(label)}</strong><br/>${escapeHtml(value)}`
      tooltipEl.style.opacity = '1'
    })
    group.addEventListener('mousemove', (event: MouseEvent) => {
      const rect = container.getBoundingClientRect()
      tooltipEl.style.left = `${event.clientX - rect.left}px`
      tooltipEl.style.top = `${event.clientY - rect.top}px`
    })
    group.addEventListener('mouseleave', () => {
      tooltipEl.style.opacity = '0'
    })
  })
}

function renderHorizontalReportChart(containerId: string, data: HorizontalReportChartItem[], emptyText: string) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!data || data.length === 0) {
    container.innerHTML = `<div class="empty-state">${escapeHtml(emptyText)}</div>`
    return
  }

  const width = container.clientWidth || 300
  const height = Math.max(210, data.length * 42 + 28)
  const paddingLeft = 112
  const paddingRight = 118
  const paddingTop = 10
  const paddingBottom = 10
  const rowHeight = (height - paddingTop - paddingBottom) / data.length
  const barMaxWidth = Math.max(width - paddingLeft - paddingRight, 80)
  const maxValue = Math.max(...data.map((item) => item.total), 1)

  let svgContent = `<svg class="chart-svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`

  let tooltipEl = container.querySelector('.chart-tooltip-el') as HTMLElement
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'chart-tooltip-el'
    container.appendChild(tooltipEl)
  }

  data.forEach((item, idx) => {
    const y = paddingTop + idx * rowHeight + (rowHeight - 24) / 2
    const salesWidth = Math.max((item.total / maxValue) * barMaxWidth, 4)
    const profitWidth = Math.max((Math.max(item.ganancia, 0) / maxValue) * barMaxWidth, item.ganancia > 0 ? 4 : 0)
    const shortLabel = item.label.length > 16 ? `${item.label.slice(0, 15)}...` : item.label

    svgContent += `
      <g class="chart-group" data-label="${escapeHtml(item.label)}" data-value="${escapeHtml(item.detail)}">
        <text class="chart-text" x="${paddingLeft - 10}" y="${y + 16}" text-anchor="end" style="font-weight: 700;">${escapeHtml(shortLabel)}</text>
        <rect x="${paddingLeft}" y="${y}" width="${barMaxWidth}" height="24" rx="4" fill="#f1f5f9" />
        <rect class="chart-bar" x="${paddingLeft}" y="${y}" width="${salesWidth}" height="24" rx="4" fill="url(#reportSalesGrad)" />
        <rect class="chart-bar chart-bar--profit" x="${paddingLeft}" y="${y + 15}" width="${profitWidth}" height="8" rx="4" fill="#16a34a" />
        <text class="chart-text" x="${paddingLeft + salesWidth + 8}" y="${y + 16}" style="font-weight: 800; fill: var(--text);">${escapeHtml(formatCurrency(item.total))}</text>
      </g>
    `
  })

  svgContent += `
    <defs>
      <linearGradient id="reportSalesGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0ea5a6" />
        <stop offset="100%" stop-color="#0f766e" />
      </linearGradient>
    </defs>
  `

  svgContent += '</svg>'
  container.innerHTML = svgContent
  container.appendChild(tooltipEl)
  attachChartTooltip(container, tooltipEl)
}

function renderBrandChart(containerId: string, data: SalesReportData['charts']['brands']) {
  renderHorizontalReportChart(
    containerId,
    data.map((item) => ({
      label: item.marca,
      total: item.total_vendido,
      ganancia: item.total_ganancia,
      detail: `Vendido: Bs ${formatCurrency(item.total_vendido)} | Ganancia: Bs ${formatCurrency(item.total_ganancia)} | Unidades: ${formatCurrency(item.unidades)} | Margen: ${formatCurrency(item.margen)}%`,
    })),
    'No hay datos de marcas.',
  )
}

function renderShiftChart(containerId: string, data: SalesReportData['charts']['shifts']) {
  renderHorizontalReportChart(
    containerId,
    data.map((item) => ({
      label: item.turno,
      total: item.total_vendido,
      ganancia: item.total_ganancia,
      detail: `Vendido: Bs ${formatCurrency(item.total_vendido)} | Ganancia: Bs ${formatCurrency(item.total_ganancia)} | Ventas: ${item.ventas_count} | Margen: ${formatCurrency(item.margen)}%`,
    })),
    'No hay datos de turnos.',
  )
}

function renderSellerChart(containerId: string, data: SalesReportData['charts']['sellers']) {
  renderHorizontalReportChart(
    containerId,
    data.map((item) => ({
      label: item.vendedor,
      total: item.total_vendido,
      ganancia: item.total_ganancia,
      detail: `Vendido: Bs ${formatCurrency(item.total_vendido)} | Ganancia: Bs ${formatCurrency(item.total_ganancia)} | Ventas: ${item.ventas_count} | Margen: ${formatCurrency(item.margen)}%`,
    })),
    'No hay datos de vendedores.',
  )
}

function renderDailyTrendChart(containerId: string, data: SalesReportData['charts']['daily']) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay datos de evolución diaria.</div>'
    return
  }

  const width = container.clientWidth || 600
  const height = 220
  const paddingLeft = 50
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 40

  const chartWidth = width - paddingLeft - paddingRight
  const chartHeight = height - paddingTop - paddingBottom

  const maxVal = Math.max(...data.map(d => Math.max(d.total_vendido, d.total_costo, d.total_ganancia)), 1)

  let svgContent = `<svg class="chart-svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}">`

  let tooltipEl = container.querySelector('.chart-tooltip-el') as HTMLElement
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'chart-tooltip-el'
    container.appendChild(tooltipEl)
  }

  const gridLinesCount = 4
  for (let i = 0; i <= gridLinesCount; i++) {
    const y = paddingTop + (chartHeight / gridLinesCount) * i
    const val = maxVal - (maxVal / gridLinesCount) * i
    svgContent += `
      <line class="chart-grid-line" x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" />
      <text class="chart-text" x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(Math.round(val))}</text>
    `
  }

  const totalPoints = data.length
  const stepX = totalPoints > 1 ? chartWidth / (totalPoints - 1) : chartWidth

  const salesPoints = data.map((d, i) => {
    const x = paddingLeft + i * stepX
    const y = height - paddingBottom - (d.total_vendido / maxVal) * chartHeight
    return { x, y, val: d.total_vendido, label: d.fecha }
  })

  const profitPoints = data.map((d, i) => {
    const x = paddingLeft + i * stepX
    const y = height - paddingBottom - (d.total_ganancia / maxVal) * chartHeight
    return { x, y, val: d.total_ganancia, label: d.fecha }
  })

  const costPoints = data.map((d, i) => {
    const x = paddingLeft + i * stepX
    const y = height - paddingBottom - (d.total_costo / maxVal) * chartHeight
    return { x, y, val: d.total_costo, label: d.fecha }
  })

  const getLinePath = (points: { x: number; y: number }[]) => {
    return points.reduce((path, p, i) => path + (i === 0 ? `M ${p.x} ${p.y}` : ` L ${p.x} ${p.y}`), '')
  }

  const getAreaPath = (points: { x: number; y: number }[]) => {
    if (points.length === 0) return ''
    const startX = points[0].x
    const endX = points[points.length - 1].x
    const yBase = height - paddingBottom
    return `${getLinePath(points)} L ${endX} ${yBase} L ${startX} ${yBase} Z`
  }

  svgContent += `<path class="chart-area" d="${getAreaPath(salesPoints)}" fill="#0284c7" />`
  svgContent += `<path class="chart-line" d="${getLinePath(salesPoints)}" stroke="#0284c7" stroke-width="3" />`

  svgContent += `<path class="chart-line" d="${getLinePath(costPoints)}" stroke="#ea580c" stroke-width="3" stroke-dasharray="6 5" />`

  svgContent += `<path class="chart-area" d="${getAreaPath(profitPoints)}" fill="#16a34a" />`
  svgContent += `<path class="chart-line" d="${getLinePath(profitPoints)}" stroke="#16a34a" stroke-width="3" />`

  salesPoints.forEach((p, i) => {
    const pr = profitPoints[i]
    const cost = costPoints[i]
    const showLabel = totalPoints <= 7 || i % Math.ceil(totalPoints / 7) === 0
    if (showLabel) {
      const dateParts = p.label.split('-')
      const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}` : p.label
      svgContent += `
        <text class="chart-text" x="${p.x}" y="${height - paddingBottom + 18}" text-anchor="middle" style="font-weight: 600;">${escapeHtml(formattedDate)}</text>
      `
    }

    svgContent += `
      <circle class="chart-dot chart-group" cx="${p.x}" cy="${p.y}" r="4" fill="#ffffff" stroke="#0284c7" stroke-width="2" 
        data-label="Vendido (${escapeHtml(p.label)})" data-value="Bs ${escapeHtml(formatCurrency(p.val))}" />
    `

    svgContent += `
      <circle class="chart-dot chart-group" cx="${pr.x}" cy="${pr.y}" r="4" fill="#ffffff" stroke="#16a34a" stroke-width="2" 
        data-label="Ganancia (${escapeHtml(pr.label)})" data-value="Bs ${escapeHtml(formatCurrency(pr.val))}" />
    `

    svgContent += `
      <circle class="chart-dot chart-group" cx="${cost.x}" cy="${cost.y}" r="4" fill="#ffffff" stroke="#ea580c" stroke-width="2"
        data-label="Costo (${escapeHtml(cost.label)})" data-value="Bs ${escapeHtml(formatCurrency(cost.val))}" />
    `
  })

  svgContent += '</svg>'
  container.innerHTML = svgContent
  container.appendChild(tooltipEl)

  container.querySelectorAll('.chart-group').forEach(group => {
    group.addEventListener('mouseenter', () => {
      const label = group.getAttribute('data-label')
      const val = group.getAttribute('data-value')
      tooltipEl.innerHTML = `<strong>${label}</strong><br/>${val}`
      tooltipEl.style.opacity = '1'
    })
    group.addEventListener('mousemove', (event) => {
      const e = event as MouseEvent
      const rect = container.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      tooltipEl.style.left = `${x}px`
      tooltipEl.style.top = `${y}px`
    })
    group.addEventListener('mouseleave', () => {
      tooltipEl.style.opacity = '0'
    })
  })
}

initTheme()
void initLogin()
