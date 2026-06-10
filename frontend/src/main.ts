import './style.css'
import type { AttendanceFormInput, BootstrapData, MovementFormInput, ProductFormInput, SaleFormInput } from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas' | 'turnos'

type ProductFormState = {
  id_producto: number | null
}

const productFormState: ProductFormState = {
  id_producto: null,
}

const movementTypes = ['ENTRADA', 'SALIDA', 'AJUSTE_POS', 'AJUSTE_NEG', 'DEVOLUCION'] as const

let bootstrapData: BootstrapData | null = null

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

function formatCurrency(value: number) {
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

function renderMetricCards(data: BootstrapData) {
  const metricsContainer = document.querySelector<HTMLDivElement>('#dashboard-metrics')
  const quickStats = document.querySelector<HTMLDivElement>('#quick-stats')

  const cards = [
    { label: 'Productos', value: data.metrics.totalProducts },
    { label: 'Stock total', value: formatCurrency(data.metrics.totalStock) },
    { label: 'Movimientos', value: data.metrics.totalMovements },
    { label: 'Ventas', value: data.metrics.totalSales },
    { label: 'En turno', value: data.metrics.activeAttendances },
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

  if (container) {
    container.innerHTML = `
      <div class="info-item"><span>Marca</span><strong>${escapeHtml(data.references.marcas.length)}</strong></div>
      <div class="info-item"><span>Categorías</span><strong>${escapeHtml(data.references.categorias.length)}</strong></div>
      <div class="info-item"><span>Métodos de pago</span><strong>${escapeHtml(data.references.metodosPago.length)}</strong></div>
      <div class="info-item"><span>Trabajadores</span><strong>${escapeHtml(data.references.trabajadores.length)}</strong></div>
    `
  }
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
  const attendanceForm = document.querySelector<HTMLFormElement>('#attendance-form')

  if (productForm) {
    renderSelectOptions(productForm.elements.namedItem('id_marca') as HTMLSelectElement, data.references.marcas)
    renderSelectOptions(
      productForm.elements.namedItem('id_categoria') as HTMLSelectElement,
      data.references.categorias,
      true,
    )
  }

  if (movementForm) {
    renderSelectOptions(
      movementForm.elements.namedItem('id_producto') as HTMLSelectElement,
      data.products.map((product) => ({ id: product.id_producto, nombre: `${product.codigo} · ${product.nombre}` })),
      true,
    )
  }

  if (saleForm) {
    renderSelectOptions(
      saleForm.elements.namedItem('id_producto') as HTMLSelectElement,
      data.products.map((product) => ({ id: product.id_producto, nombre: `${product.codigo} · ${product.nombre}` })),
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

function renderProductsTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#products-table tbody')
  const count = document.querySelector<HTMLSpanElement>('#inventory-count')

  if (!tableBody) {
    return
  }

  if (count) {
    count.textContent = `${data.products.length} productos`
  }

  if (data.products.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Todavía no hay productos registrados.</td></tr>'
    return
  }

  tableBody.innerHTML = data.products
    .map((product) => {
      const stockState = product.stock_actual <= product.stock_minimo ? 'Bajo' : 'OK'

      return `
        <tr>
          <td>
            <strong>${escapeHtml(product.nombre)}</strong>
            <small>${escapeHtml(product.codigo)}</small>
          </td>
          <td>${escapeHtml(product.marca_nombre)}</td>
          <td>${escapeHtml(product.categoria_nombre ?? 'General')}</td>
          <td>
            <strong>${escapeHtml(formatCurrency(Number(product.stock_actual)))}</strong>
            <small>mínimo ${escapeHtml(formatCurrency(Number(product.stock_minimo)))}</small>
          </td>
          <td>${escapeHtml(formatCurrency(Number(product.precio_venta)))}</td>
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
          <td>${escapeHtml(formatCurrency(Number(movement.cantidad)))}</td>
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
          <td>${escapeHtml(formatCurrency(Number(sale.cantidad)))}</td>
          <td>${escapeHtml(formatCurrency(Number(sale.total)))}</td>
          <td>${escapeHtml(sale.metodo_pago)} · ${escapeHtml(sale.moneda)}</td>
          <td>${escapeHtml(sale.vendedor)}</td>
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
  ;(form.elements.namedItem('codigo') as HTMLInputElement).focus()

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')

  if (submitButton) {
    submitButton.textContent = 'Guardar producto'
  }
}

function setStatus(targetId: string, message: string, kind: 'info' | 'success' | 'error' = 'info') {
  const target = document.querySelector<HTMLElement>(`#${targetId}`)

  if (!target) {
    return
  }

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
  renderProductsTable(bootstrapData)
  renderMovementsTable(bootstrapData)
  renderSalesTable(bootstrapData)
  renderAttendanceState(bootstrapData)
  renderAttendanceTable(bootstrapData)
  renderWorkHoursTable(bootstrapData)
}

async function bootstrap() {
  const container = document.querySelector<HTMLDivElement>('#app-info')

  if (container) {
    const appInfo = await window.inventoryApi.getAppInfo()

    container.innerHTML = `
      <div class="info-item"><span>Aplicación</span><strong>${escapeHtml(appInfo.appName)}</strong></div>
      <div class="info-item"><span>Versión</span><strong>${escapeHtml(appInfo.version)}</strong></div>
      <div class="info-item"><span>Base de datos</span><strong>${escapeHtml(appInfo.databasePath)}</strong></div>
    `
  }

  await refresh()

  const productForm = document.querySelector<HTMLFormElement>('#product-form')
  const movementForm = document.querySelector<HTMLFormElement>('#movement-form')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  const attendanceForm = document.querySelector<HTMLFormElement>('#attendance-form')
  let attendanceAction: 'entry' | 'exit' = 'entry'

  document.querySelector<HTMLButtonElement>('#product-form-reset')?.addEventListener('click', () => {
    resetProductForm()
    setStatus('inventory-status', 'Formulario listo para un nuevo producto.', 'info')
  })

  productForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    if (!bootstrapData) {
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

  saleForm?.addEventListener('submit', async (event) => {
    event.preventDefault()

    try {
      const formData = new FormData(saleForm)
      const payload: SaleFormInput = {
        id_producto: readRequiredId(formData, 'id_producto', 'El producto'),
        cantidad: readRequiredNumber(formData, 'cantidad', 'La cantidad', { positive: true }),
        descuento_total: readOptionalNumber(formData, 'descuento_total', 'El descuento total') ?? 0,
        id_metodo_pago: readRequiredId(formData, 'id_metodo_pago', 'El metodo de pago'),
        id_moneda: readRequiredId(formData, 'id_moneda', 'La moneda'),
        observacion: String(formData.get('observacion') ?? '').trim() || null,
      }

      await window.inventoryApi.createSale(payload)
      setStatus('sale-status', 'Venta registrada correctamente.', 'success')
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

  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab as TabName | undefined

      if (tabName) {
        setActiveTab(tabName)
      }
    })
  })
}

void bootstrap()
