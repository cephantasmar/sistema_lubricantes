import './style.css'
import type {
  AttendanceFormInput,
  AuthInput,
  AuthResult,
  BootstrapData,
  InventoryAuditInput,
  MovementFormInput,
  ProductFormInput,
  ProductRow,
  RoleFormInput,
  SaleFormInput,
  SaleFullDetail,
  WorkerFormInput,
  SalesReportInput,
  SalesReportData,
} from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas' | 'turnos' | 'asistencias' | 'administracion' | 'reportes'
type Semaforo = 'pendiente' | 'verde' | 'amarillo' | 'rojo'
type InventorySearchField = 'all' | 'codigo' | 'nombre'


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

function hasPermission(permissionName: string) {
  return Boolean(currentUser?.isAdminLike || currentUser?.permissionNames.includes(permissionName))
}

function hasAnyPermission(permissionNames: string[]) {
  return permissionNames.some((permissionName) => hasPermission(permissionName))
}

function canAccessTab(tabName: TabName) {
  const accessByTab: Record<TabName, boolean> = {
    inventario: hasAnyPermission(['VER_INVENTARIO', 'GESTIONAR_INVENTARIO']),
    movimientos: hasAnyPermission(['VER_MOVIMIENTOS', 'REGISTRAR_MOVIMIENTOS']),
    ventas: hasAnyPermission(['VER_VENTAS', 'REGISTRAR_VENTAS']),
    turnos: hasAnyPermission(['VER_ASISTENCIAS', 'REGISTRAR_ASISTENCIAS']),
    asistencias: hasAnyPermission(['VER_ASISTENCIAS', 'REGISTRAR_ASISTENCIAS']),
    administracion: hasAnyPermission(['GESTIONAR_ROLES', 'GESTIONAR_TRABAJADORES']),
    reportes: hasAnyPermission(['VER_VENTAS', 'REGISTRAR_VENTAS']),
  }

  return accessByTab[tabName]
}

function getFirstAccessibleTab(): TabName {
  return (['inventario', 'movimientos', 'ventas', 'turnos', 'asistencias', 'administracion', 'reportes'] as TabName[]).find(canAccessTab) ?? 'inventario'
}


function setActiveTab(tabName: TabName) {
  const nextTab = canAccessTab(tabName) ? tabName : getFirstAccessibleTab()

  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => {
    const isActive = button.dataset.tab === nextTab
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-selected', String(isActive))
  })
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === nextTab)
  })

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
  const cards = [
    { label: 'Productos', value: data.metrics.totalProducts },
    { label: 'Stock total', value: formatNumber(data.metrics.totalStock) },
    { label: 'Movimientos', value: data.metrics.totalMovements },
    { label: 'Ventas', value: data.metrics.totalSales },
    { label: 'En turno', value: data.metrics.activeAttendances },
  ]
  const markup = cards.map(card => `
    <article class="summary-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
    </article>
  `).join('')
  if (metricsContainer) metricsContainer.innerHTML = markup
  if (quickStats) quickStats.innerHTML = markup
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

function setClosestCardHidden(selector: string, hidden: boolean) {
  document.querySelector<HTMLElement>(selector)?.closest<HTMLElement>('.module-card')?.toggleAttribute('hidden', hidden)
}

function applyAccessControl() {
  const accessByTab: Record<TabName, boolean> = {
    inventario: canAccessTab('inventario'),
    movimientos: canAccessTab('movimientos'),
    ventas: canAccessTab('ventas'),
    turnos: canAccessTab('turnos'),
    administracion: canAccessTab('administracion'),
  }

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    const tabName = button.dataset.tab as TabName | undefined
    const allowed = tabName ? accessByTab[tabName] : false
    button.hidden = !allowed
    button.disabled = !allowed
  })

  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    const tabName = panel.dataset.panel as TabName | undefined
    const allowed = tabName ? accessByTab[tabName] : false
    panel.hidden = !allowed
    if (!allowed) {
      panel.classList.remove('is-active')
    }
  })

  setClosestCardHidden('#product-form', !hasPermission('GESTIONAR_INVENTARIO'))
  document.querySelector<HTMLButtonElement>('#inventory-mode-toggle')?.toggleAttribute('hidden', !hasPermission('GESTIONAR_INVENTARIO'))
  if (!hasPermission('GESTIONAR_INVENTARIO') && inventoryAuditMode) {
    setInventoryAuditMode(false)
  }

  setClosestCardHidden('#movement-form', !hasPermission('REGISTRAR_MOVIMIENTOS'))
  setClosestCardHidden('#sale-form', !hasPermission('REGISTRAR_VENTAS'))
  const canManageAttendancePanel = Boolean(currentUser?.isAdminLike)
  setClosestCardHidden('#attendance-form', !hasPermission('REGISTRAR_ASISTENCIAS'))
  setClosestCardHidden('#attendance-table', !canManageAttendancePanel)
  setClosestCardHidden('#work-hours-table', !canManageAttendancePanel)
  setClosestCardHidden('#shift-rotation-table', !canManageAttendancePanel)
  setClosestCardHidden('#shift-history-table', !canAccessTab('turnos'))
  setClosestCardHidden('#role-form', !hasPermission('GESTIONAR_ROLES'))
  setClosestCardHidden('#worker-form', !hasPermission('GESTIONAR_TRABAJADORES'))
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
    renderSelectOptions(
      saleForm.elements.namedItem('id_cliente') as HTMLSelectElement,
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
    renderSelectOptions(
      saleForm.elements.namedItem('id_turno') as HTMLSelectElement,
      data.references.turnos.map((shift) => ({
        id: shift.id_turno,
        nombre: `${shift.nombre} (${shift.hora_inicio} - ${shift.hora_fin})`,
      })),
      true,
    )
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
    const clienteSelect = saleForm.elements.namedItem('id_cliente') as HTMLSelectElement
    if (clienteSelect) {
      clienteSelect.value = '0'
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
    renderSelectOptions(
      attendanceForm.elements.namedItem('id_turno') as HTMLSelectElement,
      data.references.turnos.map((shift) => ({
        id: shift.id_turno,
        nombre: `${shift.nombre} (${shift.hora_inicio} - ${shift.hora_fin})`,
      })),
      true,
    )
  }
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
    tableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Todavía no hay ventas registradas.</td></tr>'
    return
  }

  tableBody.innerHTML = data.sales
    .map(
      (sale) => `
        <tr>
          <td><strong>${escapeHtml(sale.numero_factura)}</strong></td>
          <td>${escapeHtml(formatDateTime(sale.fecha_venta))}</td>

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
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay trabajadores registrados.</td></tr>'
    return
  }
  tableBody.innerHTML = data.workers.map(worker => `
    <tr>
      <td><strong>${escapeHtml(worker.nombres)} ${escapeHtml(worker.apellidos)}</strong></td>
      <td>${escapeHtml(worker.cargo ?? 'No especificado')}</td>
      <td>${worker.id_usuario ? '<span class="badge badge--soft">Asignado</span>' : '<span class="badge badge--muted">Sin usuario</span>'}</td>
      <td><span class="badge ${worker.estado === 'activo' ? 'badge--success' : 'badge--muted'}">${escapeHtml(worker.estado)}</span></td>
      <td>
        ${hasPermission('GESTIONAR_TRABAJADORES') ? `<button class="button button--small" type="button" data-worker-edit="${worker.id_trabajador}">Editar</button>` : ''}
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
}

function renderAuditTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#audit-table tbody')
  if (!tableBody) return
  if (data.auditLogs.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" class="empty-state">No hay eventos registrados.</td></tr>'
    return
  }
  tableBody.innerHTML = data.auditLogs.map(log => `
    <tr>
      <td>${escapeHtml(formatDateTime(log.fecha_evento))}</td>
      <td>${escapeHtml(log.usuario)}</td>
      <td><span class="badge badge--soft">${escapeHtml(log.modulo)}</span></td>
      <td><strong>${escapeHtml(log.accion)}</strong></td>
      <td>${escapeHtml(log.descripcion ?? '')}</td>
    </tr>
  `).join('')
}

function renderProductSearchResults(query = '') {
  const container = document.querySelector<HTMLDivElement>('#sale-product-results')

  if (!container || !bootstrapData) {
    return
  }

  const normalizedQuery = normalizeSearch(query)
  const products = bootstrapData.products
    .filter((product) => isProductActive(product) && Number(product.stock_actual) > 0)
    .filter((product) => {
      if (!normalizedQuery) {
        return true
      }

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
  if (!vendedorSelect || !shiftSelect) return

  const workerId = Number(vendedorSelect.value)
  if (!workerId) {
    shiftSelect.value = ''
    return
  }

  const activeAttendance = bootstrapData.attendances.find(
    (att) => att.id_trabajador === workerId && att.estado === 'EN_TURNO'
  )

  if (activeAttendance) {
    shiftSelect.value = String(activeAttendance.id_turno)
  } else {
    shiftSelect.value = ''
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
  const discountInput = document.querySelector<HTMLInputElement>('#sale-form input[name="descuento_total"]')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  if (!saleForm) return

  const saleCurrencySelect = saleForm.elements.namedItem('id_moneda') as HTMLSelectElement
  const idMonedaSale = Number(saleCurrencySelect?.value ?? 1)
  const saleCurrencyObj = bootstrapData?.references.monedas.find(m => m.id === idMonedaSale)
  const saleCurrencyCode = saleCurrencyObj ? saleCurrencyObj.nombre.split(' - ')[0] : 'BOB'

  const subtotal = getSaleSubtotal()
  const discountManual = roundMoney(Number(discountInput?.value ?? 0))
  const discountLines = roundMoney(
    Array.from(saleCart.values()).reduce((sum, item) => sum + (item.descuento_unitario ?? 0) * item.cantidad, 0)
  )

  const discountTotal = roundMoney(discountLines + discountManual)
  const validDiscountTotal = Number.isFinite(discountTotal) && discountTotal >= 0 ? Math.min(discountTotal, subtotal) : 0
  const total = roundMoney(subtotal - validDiscountTotal)

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
    const minRows = 5
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
          <td class="excel-cell-input" style="padding: 0; vertical-align: middle;">
            <input class="cart-discount excel-input" type="number" step="0.01" min="0" max="${escapeHtml(
              item.product.precio_venta,
            )}" value="${escapeHtml(item.descuento_unitario ?? 0)}" data-cart-discount="${item.product.id_producto}" style="text-align: right; width: 100%; height: 100%; border: none; padding: 11px; background: transparent; outline: none;" />
          </td>
          <td style="text-align: right; vertical-align: middle;">${escapeHtml(formatCurrency(subtotalLine))}</td>
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

    tableBody.innerHTML = rowsToRender.join('')

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

  let totalPagadoInSaleCurrency = 0
  salePayments.forEach((pago) => {
    const rateP = getLocalCurrencyRate(pago.id_moneda)
    const rateS = getLocalCurrencyRate(idMonedaSale)
    const montoInSaleCurrency = roundMoney((pago.monto * rateP) / rateS)
    totalPagadoInSaleCurrency = roundMoney(totalPagadoInSaleCurrency + montoInSaleCurrency)
  })

  let saldoPendiente = 0
  let cambio = 0
  if (totalPagadoInSaleCurrency >= total) {
    cambio = roundMoney(totalPagadoInSaleCurrency - total)
  } else {
    saldoPendiente = roundMoney(total - totalPagadoInSaleCurrency)
  }

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

function setStatus(targetId: string, message: string, kind: 'info' | 'success' | 'error' = 'info') {
  const target = document.querySelector<HTMLElement>(`#${targetId}`)
  if (!target) return
  target.textContent = message
  target.dataset.kind = kind

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
  renderMetricCards(bootstrapData)
  renderAppInfo(bootstrapData)
  applyAccessControl()
  renderProductFormOptions(bootstrapData)
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

  await refresh()

  const productForm = document.querySelector<HTMLFormElement>('#product-form')
  const movementForm = document.querySelector<HTMLFormElement>('#movement-form')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  const attendanceForm = document.querySelector<HTMLFormElement>('#attendance-form')
  let attendanceAction: 'entry' | 'exit' = 'entry'
  const roleForm = document.querySelector<HTMLFormElement>('#role-form')
  const workerForm = document.querySelector<HTMLFormElement>('#worker-form')
  const saleSearchInput = document.querySelector<HTMLInputElement>('#sale-product-search')
  const saleDiscountInput = document.querySelector<HTMLInputElement>('#sale-form input[name="descuento_total"]')

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
    if (!hasPermission('REGISTRAR_MOVIMIENTOS')) {
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
    if (!hasPermission('REGISTRAR_VENTAS')) {
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

  document.querySelector<HTMLButtonElement>('#role-form-reset')?.addEventListener('click', () => {
    resetRoleForm()
    setStatus('role-status', 'Formulario listo para un nuevo rol.', 'info')
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
    } catch (error) {
      setStatus('role-status', error instanceof Error ? error.message : 'Error al guardar.', 'error')
    }
  })

  document.querySelector<HTMLButtonElement>('#worker-form-reset')?.addEventListener('click', () => {
    resetWorkerForm()
    setStatus('worker-status', 'Formulario listo para un nuevo trabajador.', 'info')
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
    } catch (error) {
      setStatus('worker-status', error instanceof Error ? error.message : 'Error al guardar.', 'error')
    }
  })

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab as TabName | undefined
      if (tabName) setActiveTab(tabName)
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
    alert(error instanceof Error ? error.message : 'No se pudo obtener el detalle de la venta.')
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
        document.getElementById('login-overlay')!.style.display = 'none'
        document.getElementById('main-app')!.style.display = 'block'
        void bootstrap()
      } else {
        setStatus('login-status', result.message ?? 'Credenciales incorrectas', 'error')
      }
    } catch (err) {
      setStatus('login-status', 'Error de conexión con el backend', 'error')
    }
  })
  const logoutBtn = document.getElementById('logout-btn')
  logoutBtn?.addEventListener('click', () => {
    currentUser = null
    const loginForm = document.getElementById('login-form') as HTMLFormElement | null
    loginForm?.reset()
    document.getElementById('main-app')!.style.display = 'none'
    document.getElementById('login-overlay')!.style.display = 'flex'
  })
}

void initLogin()

function initReportDates() {
  const startDateInput = document.querySelector<HTMLInputElement>('#report-start-date')
  const endDateInput = document.querySelector<HTMLInputElement>('#report-end-date')
  if (startDateInput && !startDateInput.value) {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    startDateInput.value = `${yyyy}-${mm}-${dd}`
  }
  if (endDateInput && !endDateInput.value) {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    endDateInput.value = `${yyyy}-${mm}-${dd}`
  }
}

async function loadSalesReportData() {
  const startDateInput = document.querySelector<HTMLInputElement>('#report-start-date')
  const endDateInput = document.querySelector<HTMLInputElement>('#report-end-date')
  if (!startDateInput || !endDateInput) return

  const startDate = startDateInput.value
  const endDate = endDateInput.value
  if (!startDate || !endDate) return

  const btn = document.querySelector<HTMLButtonElement>('#report-generate-btn')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Cargando...'
  }

  try {
    const reportData = await window.inventoryApi.getSalesReport({ startDate, endDate })

    // Render KPIs
    document.querySelector('#kpi-total-vendido')!.textContent = `Bs ${formatCurrency(reportData.kpis.totalVendido)}`
    document.querySelector('#kpi-total-costo')!.textContent = `Bs ${formatCurrency(reportData.kpis.totalCosto)}`
    document.querySelector('#kpi-total-ganancia')!.textContent = `Bs ${formatCurrency(reportData.kpis.totalGanancia)}`
    document.querySelector('#kpi-total-cobrado')!.textContent = `Bs ${formatCurrency(reportData.kpis.totalCobrado)}`
    document.querySelector('#kpi-saldo-pendiente')!.textContent = `Bs ${formatCurrency(reportData.kpis.saldoPendiente)}`

    // Update sales count badge
    document.querySelector('#report-sales-count')!.textContent = `${reportData.kpis.cantidadVentas} ventas`

    // Render Profits Table (SCRUM-16)
    const profitsBody = document.querySelector('#report-profits-table tbody')
    if (profitsBody) {
      if (reportData.profitReport.length === 0) {
        profitsBody.innerHTML = `<tr><td colspan="9" class="empty-state">No se registraron ventas en este rango de fechas.</td></tr>`
      } else {
        profitsBody.innerHTML = reportData.profitReport.map(row => `
          <tr>
            <td><strong>${escapeHtml(row.numero_factura)}</strong></td>
            <td>${escapeHtml(row.fecha_venta.slice(0, 16).replace('T', ' '))}</td>
            <td>${escapeHtml(row.vendedor)}</td>
            <td>${escapeHtml(row.cliente)}</td>
            <td style="text-align: right; font-weight: bold;">Bs ${escapeHtml(formatCurrency(row.total))}</td>
            <td style="text-align: right; color: var(--muted);">Bs ${escapeHtml(formatCurrency(row.costo))}</td>
            <td style="text-align: right; color: var(--success); font-weight: bold;">Bs ${escapeHtml(formatCurrency(row.ganancia))}</td>
            <td style="text-align: right; color: var(--accent); font-weight: bold;">${escapeHtml(formatCurrency(row.margen))}%</td>
            <td style="text-align: center;"><span class="status-badge ${row.estado.toLowerCase() === 'completada' ? 'status-badge--success' : 'status-badge--warning'}">${escapeHtml(row.estado)}</span></td>
          </tr>
        `).join('')
      }
    }

    // Render Cash Flow Table (SCRUM-18)
    const cashflowBody = document.querySelector('#report-cashflow-table tbody')
    if (cashflowBody) {
      if (reportData.cashFlowReport.length === 0) {
        cashflowBody.innerHTML = `<tr><td colspan="3" class="empty-state">No se registraron cobros en este rango de fechas.</td></tr>`
      } else {
        cashflowBody.innerHTML = reportData.cashFlowReport.map(row => `
          <tr>
            <td><strong>${escapeHtml(row.metodo_pago)}</strong></td>
            <td style="text-align: right; font-weight: bold; color: var(--success);">Bs ${escapeHtml(formatCurrency(row.total_recibido))}</td>
            <td style="text-align: center; color: var(--muted);">${escapeHtml(row.referencias_count)} transacciones</td>
          </tr>
        `).join('')
      }
    }

    // Render Charts (SCRUM-17)
    renderBrandChart('brand-chart-container', reportData.charts.brands)
    renderShiftChart('shift-chart-container', reportData.charts.shifts)
    renderDailyTrendChart('daily-chart-container', reportData.charts.daily)

  } catch (error) {
    alert(error instanceof Error ? error.message : 'Error al generar el reporte.')
  } finally {
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Generar Reporte'
    }
  }
}

function renderBrandChart(containerId: string, data: { marca: string; total_vendido: number }[]) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay datos de marcas.</div>'
    return
  }

  const width = container.clientWidth || 300
  const height = 200
  const paddingLeft = 90
  const paddingRight = 80
  const paddingTop = 10
  const paddingBottom = 10
  const rowHeight = (height - paddingTop - paddingBottom) / Math.max(data.length, 1)

  const maxValue = Math.max(...data.map(d => d.total_vendido), 1)

  let svgContent = `<svg class="chart-svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}">`

  let tooltipEl = container.querySelector('.chart-tooltip-el') as HTMLElement
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'chart-tooltip-el'
    container.appendChild(tooltipEl)
  }

  data.forEach((d, idx) => {
    const y = paddingTop + idx * rowHeight + (rowHeight - 24) / 2
    const barMaxWidth = width - paddingLeft - paddingRight
    const barWidth = Math.max((d.total_vendido / maxValue) * barMaxWidth, 4)

    svgContent += `
      <g class="chart-group" data-label="${escapeHtml(d.marca)}" data-value="Bs ${escapeHtml(formatCurrency(d.total_vendido))}">
        <text class="chart-text" x="${paddingLeft - 10}" y="${y + 16}" text-anchor="end" style="font-weight: 600;">${escapeHtml(d.marca)}</text>
        <rect x="${paddingLeft}" y="${y}" width="${barMaxWidth}" height="24" rx="4" fill="#f1f5f9" />
        <rect class="chart-bar" x="${paddingLeft}" y="${y}" width="${barWidth}" height="24" rx="4" fill="url(#brandGrad)" />
        <text class="chart-text" x="${paddingLeft + barWidth + 8}" y="${y + 16}" style="font-weight: 700; fill: var(--text);">${escapeHtml(formatCurrency(d.total_vendido))}</text>
      </g>
    `
  })

  svgContent += `
    <defs>
      <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#0ea5a6" />
        <stop offset="100%" stop-color="#0f766e" />
      </linearGradient>
    </defs>
  `

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
    group.addEventListener('mousemove', (e: any) => {
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

function renderShiftChart(containerId: string, data: { turno: string; total_vendido: number }[]) {
  const container = document.getElementById(containerId)
  if (!container) return
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay datos de turnos.</div>'
    return
  }

  const width = container.clientWidth || 300
  const height = 200
  const paddingLeft = 50
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 40

  const colWidth = (width - paddingLeft - paddingRight) / Math.max(data.length, 1)
  const maxValue = Math.max(...data.map(d => d.total_vendido), 1)

  let svgContent = `<svg class="chart-svg" width="100%" height="${height}" viewBox="0 0 ${width} ${height}">`

  let tooltipEl = container.querySelector('.chart-tooltip-el') as HTMLElement
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'chart-tooltip-el'
    container.appendChild(tooltipEl)
  }

  const gridLinesCount = 4
  const chartHeight = height - paddingTop - paddingBottom
  const chartWidth = width - paddingLeft - paddingRight

  for (let i = 0; i <= gridLinesCount; i++) {
    const y = paddingTop + (chartHeight / gridLinesCount) * i
    const val = maxValue - (maxValue / gridLinesCount) * i
    svgContent += `
      <line class="chart-grid-line" x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" />
      <text class="chart-text" x="${paddingLeft - 8}" y="${y + 4}" text-anchor="end">${escapeHtml(Math.round(val))}</text>
    `
  }

  data.forEach((d, idx) => {
    const barHeight = (d.total_vendido / maxValue) * chartHeight
    const x = paddingLeft + idx * colWidth + (colWidth - 36) / 2
    const y = height - paddingBottom - barHeight

    svgContent += `
      <g class="chart-group" data-label="${escapeHtml(d.turno)}" data-value="Bs ${escapeHtml(formatCurrency(d.total_vendido))}">
        <rect x="${x}" y="${paddingTop}" width="36" height="${chartHeight}" rx="4" fill="#f1f5f9" />
        <rect class="chart-bar" x="${x}" y="${y}" width="36" height="${barHeight}" rx="4" fill="url(#shiftGrad)" />
        <text class="chart-text" x="${x + 18}" y="${height - paddingBottom + 16}" text-anchor="middle" style="font-weight: 600;">${escapeHtml(d.turno)}</text>
      </g>
    `
  })

  svgContent += `
    <defs>
      <linearGradient id="shiftGrad" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#9333ea" />
        <stop offset="100%" stop-color="#7c3aed" />
      </linearGradient>
    </defs>
  `

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
    group.addEventListener('mousemove', (e: any) => {
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

function renderDailyTrendChart(containerId: string, data: { fecha: string; total_vendido: number; total_ganancia: number }[]) {
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

  const maxVal = Math.max(...data.map(d => Math.max(d.total_vendido, d.total_ganancia)), 1)

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

  svgContent += `<path class="chart-area" d="${getAreaPath(profitPoints)}" fill="#16a34a" />`
  svgContent += `<path class="chart-line" d="${getLinePath(profitPoints)}" stroke="#16a34a" stroke-width="3" />`

  salesPoints.forEach((p, i) => {
    const pr = profitPoints[i]
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
    group.addEventListener('mousemove', (e: any) => {
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

void initLogin()
