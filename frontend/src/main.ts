import './style.css'
import type { BootstrapData, MovementFormInput, ProductFormInput, ProductRow, SaleFormInput } from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas'

type ProductFormState = {
  id_producto: number | null
}

const productFormState: ProductFormState = {
  id_producto: null,
}

const movementTypes = ['ENTRADA', 'SALIDA', 'AJUSTE_POS', 'AJUSTE_NEG', 'DEVOLUCION'] as const

let bootstrapData: BootstrapData | null = null
const saleCart = new Map<number, { product: ProductRow; cantidad: number }>()

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
    container.innerHTML = '<p class="empty-state">No hay productos disponibles para esa busqueda.</p>'
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
  renderProductSearchResults((document.querySelector<HTMLInputElement>('#sale-product-search')?.value ?? '').trim())
  renderSaleCart()
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
  const saleSearchInput = document.querySelector<HTMLInputElement>('#sale-product-search')
  const saleDiscountInput = document.querySelector<HTMLInputElement>('#sale-form input[name="descuento_total"]')

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
