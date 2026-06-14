import './style.css'
import type {
  AttendanceFormInput,
  AttendanceInput,
  AuthInput,
  AuthResult,
  BootstrapData,
  InventoryAuditInput,
  MovementFormInput,
  ProductFormInput,
  ProductRow,
  RoleFormInput,
  SaleFormInput,
  WorkerFormInput,
} from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas' | 'turnos' | 'asistencias' | 'administracion'
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
let currentUser: { id_usuario: number; username: string; id_trabajador: number | null; nombres: string | null } | null = null
const saleCart = new Map<number, { product: ProductRow; cantidad: number }>()
let inventoryAuditMode = false
let inventoryAuditRows: InventoryAuditRowState[] = []
let appInfoSnapshot: { appName: string; version: string; databasePath: string } | null = null
let inventorySearchTerm = ''
let inventorySearchField: InventorySearchField = 'all'
let inventoryAuditSearchTerm = ''


function setActiveTab(tabName: TabName) {
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => {
    const isActive = button.dataset.tab === tabName
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-selected', String(isActive))
  })
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === tabName)
  })
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
    let roleName = 'Administrador'
    if (currentUser?.id_trabajador) {
      const worker = data.workers.find(w => w.id_trabajador === currentUser?.id_trabajador)
      if (worker && worker.id_rol) {
        const role = data.roles.find(r => r.id_rol === worker.id_rol)
        if (role) roleName = role.nombre
      } else {
        roleName = 'Sin rol asignado'
      }
    }
    navUserRole.textContent = roleName
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
      saleForm.elements.namedItem('id_producto') as HTMLSelectElement,
      productOptions,
      true,
    )
    renderSelectOptions(saleForm.elements.namedItem('id_metodo_pago') as HTMLSelectElement, data.references.metodosPago, true)
    renderSelectOptions(saleForm.elements.namedItem('id_moneda') as HTMLSelectElement, data.references.monedas, true)
  }

  if (attendanceForm) {
    renderSelectOptions(
      attendanceForm.elements.namedItem('id_trabajador') as HTMLSelectElement,
      data.references.trabajadores.map((worker) => ({
        id: worker.id_trabajador,
        nombre: `${worker.nombre_completo}${worker.cargo ? ` - ${worker.cargo}` : ''}`,
      })),
      true,
    )
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
              <button class="button button--small" type="button" data-product-edit="${product.id_producto}">Editar</button>
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
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Todavía no hay ventas registradas.</td></tr>'
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
        </tr>
      `,
    )
    .join('')
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
    count.textContent = `${data.attendances.length} registros`
  }

  if (data.attendances.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Todavia no hay entradas o salidas registradas.</td></tr>'
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
        <button class="button button--small" type="button" data-role-edit="${role.id_rol}">Editar</button>
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
        <button class="button button--small" type="button" data-worker-edit="${worker.id_trabajador}">Editar</button>
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

  saleCart.set(productId, { product, cantidad: nextQuantity })
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

function renderSaleCart() {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#sale-cart-table tbody')
  const discountInput = document.querySelector<HTMLInputElement>('#sale-form input[name="descuento_total"]')
  const subtotal = getSaleSubtotal()
  const discount = roundMoney(Number(discountInput?.value ?? 0))
  const validDiscount = Number.isFinite(discount) && discount >= 0 ? Math.min(discount, subtotal) : 0
  const total = roundMoney(subtotal - validDiscount)

  if (tableBody) {
    if (saleCart.size === 0) {
      tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Agrega productos para iniciar la venta.</td></tr>'
    } else {
      tableBody.innerHTML = Array.from(saleCart.values())
        .map((item) => {
          const subtotalLine = roundMoney(Number(item.product.precio_venta) * item.cantidad)

          return `
            <tr>
              <td>
                <strong>${escapeHtml(item.product.nombre)}</strong>
                <small>${escapeHtml(item.product.codigo)} · ${escapeHtml(item.product.marca_nombre)}</small>
              </td>
              <td>${escapeHtml(formatCurrency(Number(item.product.stock_actual)))}</td>
              <td>
                <input class="cart-quantity" type="number" step="0.01" min="0.01" max="${escapeHtml(
                  item.product.stock_actual,
                )}" value="${escapeHtml(item.cantidad)}" data-cart-quantity="${item.product.id_producto}" />
              </td>
              <td>${escapeHtml(formatCurrency(Number(item.product.precio_venta)))}</td>
              <td>${escapeHtml(formatCurrency(subtotalLine))}</td>
              <td>${escapeHtml(formatCurrency(subtotalLine))}</td>
              <td><button class="button button--small" type="button" data-cart-remove="${item.product.id_producto}">Eliminar</button></td>
            </tr>
          `
        })
        .join('')
    }

    tableBody.querySelectorAll<HTMLInputElement>('[data-cart-quantity]').forEach((input) => {
      input.addEventListener('change', () => {
        updateCartQuantity(Number(input.dataset.cartQuantity), Number(input.value))
      })
    })

    tableBody.querySelectorAll<HTMLButtonElement>('[data-cart-remove]').forEach((button) => {
      button.addEventListener('click', () => {
        saleCart.delete(Number(button.dataset.cartRemove))
        renderSaleCart()
      })
    })
  }

  document.querySelector<HTMLElement>('#sale-summary-products')!.textContent = String(saleCart.size)
  document.querySelector<HTMLElement>('#sale-summary-units')!.textContent = formatCurrency(
    Array.from(saleCart.values()).reduce((sum, item) => sum + item.cantidad, 0),
  )
  document.querySelector<HTMLElement>('#sale-summary-subtotal')!.textContent = formatCurrency(subtotal)
  document.querySelector<HTMLElement>('#sale-summary-discount')!.textContent = formatCurrency(validDiscount)
  document.querySelector<HTMLElement>('#sale-total-output')!.textContent = formatCurrency(total)
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
  renderProductFormOptions(bootstrapData)
  renderWorkerRoleSelect(bootstrapData)
  renderPermissionsCheckboxes(bootstrapData)
  renderProductsTable(bootstrapData)
  renderMovementsTable(bootstrapData)
  renderSalesTable(bootstrapData)
  renderAttendanceState(bootstrapData)
  renderAttendanceTable(bootstrapData)
  renderWorkHoursTable(bootstrapData)
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
    const formData = new FormData(saleForm)
    const subtotal = getSaleSubtotal()
    const discountTotal = String(formData.get('descuento_total') ?? '').trim()
      ? Number(formData.get('descuento_total'))
      : 0

    if (saleCart.size === 0) {
      setStatus('sale-status', 'Agrega al menos un producto antes de confirmar la venta.', 'error')
      return
    }

    if (!Number.isFinite(discountTotal) || discountTotal < 0) {
      setStatus('sale-status', 'El descuento no puede ser negativo.', 'error')
      return
    }

    if (discountTotal > subtotal) {
      setStatus('sale-status', 'El descuento no puede superar el subtotal.', 'error')
      return
    }

    const payload: SaleFormInput = {
      detalles: Array.from(saleCart.values()).map((item) => ({
        id_producto: item.product.id_producto,
        cantidad: item.cantidad,
      })),
      descuento_total: discountTotal,
      id_metodo_pago: Number(formData.get('id_metodo_pago') ?? 0),
      id_moneda: Number(formData.get('id_moneda') ?? 0),
      observacion: String(formData.get('observacion') ?? '').trim() || null,
    }
    try {
      await window.inventoryApi.createSale(payload)
      setStatus('sale-status', 'Venta registrada correctamente.', 'success')
      saleCart.clear()
      saleForm.reset()
      await refresh()
    } catch (error) {
      setStatus('sale-status', getFriendlyErrorMessage(error, 'No se pudo registrar la venta.'), 'error')
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

    try {
      const formData = new FormData(attendanceForm)
      const workerId = readRequiredId(formData, 'id_trabajador', 'El trabajador')
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

  document.querySelector<HTMLButtonElement>('#btn-entrada')?.addEventListener('click', async () => {
    try {
      await window.inventoryApi.recordAttendance({ tipo: 'ENTRADA' })
      setStatus('attendance-status', 'Entrada registrada exitosamente.', 'success')
    } catch (err) {
      setStatus('attendance-status', err instanceof Error ? err.message : 'Error al registrar', 'error')
    }
  })
  
  document.querySelector<HTMLButtonElement>('#btn-salida')?.addEventListener('click', async () => {
    try {
      await window.inventoryApi.recordAttendance({ tipo: 'SALIDA' })
      setStatus('attendance-status', 'Salida registrada exitosamente.', 'success')
    } catch (err) {
      setStatus('attendance-status', err instanceof Error ? err.message : 'Error al registrar', 'error')
    }
  })

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab as TabName | undefined
      if (tabName) setActiveTab(tabName)
    })
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
