import './style.css'
import type { BootstrapData, MovementFormInput, ProductFormInput, SaleFormInput } from '@shared/ipc/contracts'

type TabName = 'inventario' | 'movimientos' | 'ventas' | 'asistencias' | 'administracion'

type ProductFormState = { id_producto: number | null }
const productFormState: ProductFormState = { id_producto: null }

type RoleFormState = { id_rol: number | null }
const roleFormState: RoleFormState = { id_rol: null }

type WorkerFormState = { id_trabajador: number | null }
const workerFormState: WorkerFormState = { id_trabajador: null }

let bootstrapData: BootstrapData | null = null
let currentUser: { id_usuario: number; username: string; id_trabajador: number | null; nombres: string | null } | null = null

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
  if (container) {
    container.innerHTML = `
      <div class="info-item"><span>Marca</span><strong>${escapeHtml(data.references.marcas.length)}</strong></div>
      <div class="info-item"><span>Categorías</span><strong>${escapeHtml(data.references.categorias.length)}</strong></div>
      <div class="info-item"><span>Métodos de pago</span><strong>${escapeHtml(data.references.metodosPago.length)}</strong></div>
    `
  }

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
    renderSelectOptions(productForm.elements.namedItem('id_categoria') as HTMLSelectElement, data.references.categorias, true)
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
  if (!tableBody) return
  if (data.products.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Todavía no hay productos registrados.</td></tr>'
    return
  }
  tableBody.innerHTML = data.products.map(product => `
    <tr>
      <td><strong>${escapeHtml(product.nombre)}</strong><small>${escapeHtml(product.codigo)}</small></td>
      <td>${escapeHtml(product.marca_nombre)}</td>
      <td>${escapeHtml(product.categoria_nombre ?? 'General')}</td>
      <td><strong>${escapeHtml(formatCurrency(Number(product.stock_actual)))}</strong><small>mínimo ${escapeHtml(formatCurrency(Number(product.stock_minimo)))}</small></td>
      <td>${escapeHtml(formatCurrency(Number(product.precio_venta)))}</td>
      <td><span class="badge ${product.estado ? 'badge--success' : 'badge--muted'}">${product.estado ? 'Activo' : 'Inactivo'}</span></td>
      <td><div class="row-actions"><button class="button button--small" type="button" data-product-edit="${product.id_producto}">Editar</button></div></td>
    </tr>
  `).join('')
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
  tableBody.innerHTML = data.movements.map(movement => `
    <tr>
      <td>${escapeHtml(formatDateTime(movement.fecha_movimiento))}</td>
      <td><strong>${escapeHtml(movement.producto_nombre)}</strong><small>${escapeHtml(movement.producto_codigo)}</small></td>
      <td><span class="badge badge--soft">${escapeHtml(movement.tipo_movimiento)}</span></td>
      <td>${escapeHtml(formatCurrency(Number(movement.cantidad)))}</td>
      <td>${escapeHtml(movement.motivo ?? 'Sin motivo')}</td>
      <td>${escapeHtml(movement.referencia ?? 'Sin referencia')}</td>
    </tr>
  `).join('')
}

function renderSalesTable(data: BootstrapData) {
  const tableBody = document.querySelector<HTMLTableSectionElement>('#sales-table tbody')
  if (!tableBody) return
  if (data.sales.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Todavía no hay ventas registradas.</td></tr>'
    return
  }
  tableBody.innerHTML = data.sales.map(sale => `
    <tr>
      <td><strong>${escapeHtml(sale.numero_factura)}</strong></td>
      <td>${escapeHtml(formatDateTime(sale.fecha_venta))}</td>
      <td>${escapeHtml(sale.producto_nombre)}</td>
      <td>${escapeHtml(formatCurrency(Number(sale.cantidad)))}</td>
      <td>${escapeHtml(formatCurrency(Number(sale.total)))}</td>
      <td>${escapeHtml(sale.metodo_pago)} · ${escapeHtml(sale.moneda)}</td>
      <td>${escapeHtml(sale.vendedor)}</td>
    </tr>
  `).join('')
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
  renderRolesTable(bootstrapData)
  renderWorkersTable(bootstrapData)
  renderAuditTable(bootstrapData)
}

async function bootstrap() {
  await refresh()

  const productForm = document.querySelector<HTMLFormElement>('#product-form')
  const movementForm = document.querySelector<HTMLFormElement>('#movement-form')
  const saleForm = document.querySelector<HTMLFormElement>('#sale-form')
  const roleForm = document.querySelector<HTMLFormElement>('#role-form')
  const workerForm = document.querySelector<HTMLFormElement>('#worker-form')

  document.querySelector<HTMLButtonElement>('#product-form-reset')?.addEventListener('click', () => {
    resetProductForm()
    setStatus('inventory-status', 'Formulario listo para un nuevo producto.', 'info')
  })

  productForm?.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (!bootstrapData) return
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
