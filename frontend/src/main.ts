import './style.css'
import type { BootstrapData, MovementFormInput, ProductFormInput, ProductRow, SaleFormInput, SaleFullDetail, SaleDetailRow, SalePaymentRow } from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas'

type ProductFormState = {
  id_producto: number | null
}

const productFormState: ProductFormState = {
  id_producto: null,
}

const movementTypes = ['ENTRADA', 'SALIDA', 'AJUSTE_POS', 'AJUSTE_NEG', 'DEVOLUCION'] as const

let bootstrapData: BootstrapData | null = null
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

function setActiveTab(tabName: TabName) {
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => {
    const isActive = button.dataset.tab === tabName
    button.classList.toggle('is-active', isActive)
    button.setAttribute('aria-selected', String(isActive))
  })

  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.panel === tabName)
  })

  if (tabName === 'ventas') {
    setTimeout(() => {
      document.querySelector<HTMLInputElement>('#sale-product-search')?.focus()
    }, 50)
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
      saleForm.elements.namedItem('id_cliente') as HTMLSelectElement,
      [
        { id: 0, nombre: 'Consumidor final' },
        ...data.references.clientes
      ],
      false
    )
    
    // Map system worker ID 1 to 'Vendedor ficticio'
    const trabajadoresMapped = data.references.trabajadores.map((t) => {
      if (t.id === 1) {
        return { id: 1, nombre: 'Vendedor ficticio' }
      }
      return t
    })
    if (!trabajadoresMapped.some((t) => t.id === 1)) {
      trabajadoresMapped.unshift({ id: 1, nombre: 'Vendedor ficticio' })
    }

    renderSelectOptions(saleForm.elements.namedItem('id_vendedor') as HTMLSelectElement, trabajadoresMapped, false)
    renderSelectOptions(saleForm.elements.namedItem('id_turno') as HTMLSelectElement, data.references.turnos, true)
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
      vendedorSelect.value = '1'
    }
    const monedaSelect = saleForm.elements.namedItem('id_moneda') as HTMLSelectElement
    if (monedaSelect) {
      monedaSelect.value = '1'
    }
    updateSaleCurrencyRate()
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

    try {
      await window.inventoryApi.createSale(payload)
      setStatus('sale-status', 'Venta registrada correctamente.', 'success')
      saleCart.clear()
      salePayments.length = 0
      saleForm.reset()
      renderSalePayments()
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

  setupPaymentHandlers()
  setupModalCloseHandler()

  document.querySelector('#sale-form select[name="id_moneda"]')?.addEventListener('change', () => {
    updateSaleCurrencyRate()
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

void bootstrap()
