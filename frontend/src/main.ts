import './style.css'
import type { BootstrapData, MovementFormInput, ProductFormInput, SaleFormInput } from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas'

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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('es-EC', {
    dateStyle: 'medium',
    timeStyle: 'short',
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

  if (container) {
    container.innerHTML = `
      <div class="info-item"><span>Marca</span><strong>${escapeHtml(data.references.marcas.length)}</strong></div>
      <div class="info-item"><span>Categorías</span><strong>${escapeHtml(data.references.categorias.length)}</strong></div>
      <div class="info-item"><span>Métodos de pago</span><strong>${escapeHtml(data.references.metodosPago.length)}</strong></div>
      <div class="info-item"><span>Monedas</span><strong>${escapeHtml(data.references.monedas.length)}</strong></div>
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

async function refresh() {
  bootstrapData = await window.inventoryApi.getBootstrapData()

  renderMetricCards(bootstrapData)
  renderAppInfo(bootstrapData)
  renderProductFormOptions(bootstrapData)
  renderProductsTable(bootstrapData)
  renderMovementsTable(bootstrapData)
  renderSalesTable(bootstrapData)
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

  document.querySelector<HTMLButtonElement>('#product-form-reset')?.addEventListener('click', () => {
    resetProductForm()
    setStatus('inventory-status', 'Formulario listo para un nuevo producto.', 'info')
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
}

void bootstrap()
