import './style.css'
import type {
  BootstrapData,
  InventoryAuditInput,
  MovementFormInput,
  ProductFormInput,
  SaleFormInput,
} from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas'
type Semaforo = 'pendiente' | 'verde' | 'amarillo' | 'rojo'
type InventorySearchField = 'all' | 'codigo' | 'nombre'

type ProductFormState = {
  id_producto: number | null
}

type InventoryAuditRowState = {
  id_producto: number
  conteo_fisico: number
  precio_costo: number
  precio_venta: number
  revisado: boolean
}

const productFormState: ProductFormState = {
  id_producto: null,
}

let bootstrapData: BootstrapData | null = null
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
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

function setStatus(targetId: string, message: string, kind: 'info' | 'success' | 'error' = 'info') {
  const target = document.querySelector<HTMLElement>(`#${targetId}`)

  if (!target) {
    return
  }

  target.textContent = message
  target.dataset.kind = kind
}

function renderMetricCards(data: BootstrapData) {
  const metricsContainer = document.querySelector<HTMLDivElement>('#dashboard-metrics')
  const quickStats = document.querySelector<HTMLDivElement>('#quick-stats')

  const cards = [
    { label: 'Productos', value: data.metrics.totalProducts },
    { label: 'Stock total', value: formatNumber(data.metrics.totalStock) },
    { label: 'Movimientos', value: data.metrics.totalMovements },
    { label: 'Ventas', value: data.metrics.totalSales },
    { label: 'Stock bajo', value: data.metrics.lowStockProducts },
  ]

  const markup = cards
    .map(
      (card) => `
        <article class="summary-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
        </article>
      `,
    )
    .join('')

  if (metricsContainer) {
    metricsContainer.innerHTML = markup
  }

  if (quickStats) {
    quickStats.innerHTML = markup
  }
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
}

function renderSelectOptions(select: HTMLSelectElement, options: Array<{ id: number; nombre: string }>, includeEmpty = false) {
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

  if (productForm) {
    renderSelectOptions(productForm.elements.namedItem('id_marca') as HTMLSelectElement, data.references.marcas)
    renderSelectOptions(
      productForm.elements.namedItem('id_categoria') as HTMLSelectElement,
      data.references.categorias,
      true,
    )
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
}

function fillProductForm(product: BootstrapData['products'][number]) {
  const form = document.querySelector<HTMLFormElement>('#product-form')

  if (!form) {
    return
  }

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

  if (submitButton) {
    submitButton.textContent = 'Actualizar producto'
  }
}

function resetProductForm() {
  const form = document.querySelector<HTMLFormElement>('#product-form')

  if (!form) {
    return
  }

  productFormState.id_producto = null
  form.reset()
  ;(form.elements.namedItem('estado') as HTMLInputElement).checked = true
  ;(form.elements.namedItem('stock_minimo') as HTMLInputElement).value = '0'
  ;(form.elements.namedItem('stock_inicial') as HTMLInputElement).value = '0'

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')

  if (submitButton) {
    submitButton.textContent = 'Guardar producto'
  }
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
  const count = document.querySelector<HTMLSpanElement>('#movement-count')

  if (!tableBody) {
    return
  }

  if (count) {
    count.textContent = `${data.movements.length} movimientos`
  }

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
          <td>${escapeHtml(sale.producto_nombre)}</td>
          <td>${escapeHtml(formatNumber(Number(sale.cantidad)))}</td>
          <td>${escapeHtml(formatNumber(Number(sale.total)))}</td>
          <td>${escapeHtml(sale.metodo_pago)} · ${escapeHtml(sale.moneda)}</td>
          <td>${escapeHtml(sale.vendedor)}</td>
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

async function refresh() {
  bootstrapData = await window.inventoryApi.getBootstrapData()

  renderMetricCards(bootstrapData)
  renderAppInfo(bootstrapData)
  renderProductFormOptions(bootstrapData)
  renderProductsTable(bootstrapData)
  renderMovementsTable(bootstrapData)
  renderSalesTable(bootstrapData)

  if (!inventoryAuditMode) {
    resetInventoryAuditRows(bootstrapData)
  }

  renderInventoryChecklist(bootstrapData)
  renderInventoryComparison(bootstrapData)
  updateInventoryAuditStatus(bootstrapData)
}

function setupRealtimeRefresh() {
  setInterval(async () => {
    const inventarioActivo = document.querySelector<HTMLElement>('[data-panel="inventario"]')?.classList.contains('is-active')

    if (!inventarioActivo || inventoryAuditMode) {
      return
    }

    try {
      await refresh()
    } catch {
      // Ignore transient refresh errors in background interval.
    }
  }, 5000)
}

async function bootstrap() {
  appInfoSnapshot = await window.inventoryApi.getAppInfo()
  await refresh()
  setupRealtimeRefresh()

  const productForm = document.querySelector<HTMLFormElement>('#product-form')
  const movementForm = document.querySelector<HTMLFormElement>('#movement-form')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')

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

    if (!bootstrapData) {
      return
    }

    const formData = new FormData(productForm)
    const payload: ProductFormInput = {
      id_producto: productFormState.id_producto,
      codigo: String(formData.get('codigo') ?? ''),
      codigo_barra: String(formData.get('codigo_barra') ?? '').trim() || null,
      nombre: String(formData.get('nombre') ?? ''),
      id_marca: Number(formData.get('id_marca') ?? 0),
      id_categoria: formData.get('id_categoria') ? Number(formData.get('id_categoria')) : null,
      descripcion: String(formData.get('descripcion') ?? '').trim() || null,
      precio_costo: Number(formData.get('precio_costo') ?? 0),
      precio_venta: Number(formData.get('precio_venta') ?? 0),
      stock_minimo: Number(formData.get('stock_minimo') ?? 0),
      unidad_medida: String(formData.get('unidad_medida') ?? ''),
      estado: (formData.get('estado') as FormDataEntryValue | null) !== null,
      stock_inicial: Number(formData.get('stock_inicial') ?? 0),
    }

    try {
      await window.inventoryApi.saveProduct(payload)
      setStatus('inventory-status', 'Producto guardado correctamente.', 'success')
      resetProductForm()
      await refresh()
    } catch (error) {
      setStatus('inventory-status', error instanceof Error ? error.message : 'No se pudo guardar el producto.', 'error')
    }
  })

  movementForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const formData = new FormData(movementForm)
    const payload: MovementFormInput = {
      id_producto: Number(formData.get('id_producto') ?? 0),
      tipo_movimiento: String(formData.get('tipo_movimiento') ?? ''),
      cantidad: Number(formData.get('cantidad') ?? 0),
      costo_unitario: String(formData.get('costo_unitario') ?? '').trim() ? Number(formData.get('costo_unitario')) : null,
      motivo: String(formData.get('motivo') ?? '').trim() || null,
      referencia: String(formData.get('referencia') ?? '').trim() || null,
      observacion: String(formData.get('observacion') ?? '').trim() || null,
    }

    try {
      await window.inventoryApi.createMovement(payload)
      setStatus('movement-status', 'Movimiento registrado correctamente.', 'success')
      movementForm.reset()
      await refresh()
    } catch (error) {
      setStatus('movement-status', error instanceof Error ? error.message : 'No se pudo registrar el movimiento.', 'error')
    }
  })

  saleForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const formData = new FormData(saleForm)
    const payload: SaleFormInput = {
      id_producto: Number(formData.get('id_producto') ?? 0),
      cantidad: Number(formData.get('cantidad') ?? 0),
      descuento_total: String(formData.get('descuento_total') ?? '').trim() ? Number(formData.get('descuento_total')) : 0,
      id_metodo_pago: Number(formData.get('id_metodo_pago') ?? 0),
      id_moneda: Number(formData.get('id_moneda') ?? 0),
      observacion: String(formData.get('observacion') ?? '').trim() || null,
    }

    try {
      await window.inventoryApi.createSale(payload)
      setStatus('sale-status', 'Venta registrada correctamente.', 'success')
      saleForm.reset()
      await refresh()
    } catch (error) {
      setStatus('sale-status', error instanceof Error ? error.message : 'No se pudo registrar la venta.', 'error')
    }
  })

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab as TabName | undefined

      if (tabName) {
        setActiveTab(tabName)
      }
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

void bootstrap()
