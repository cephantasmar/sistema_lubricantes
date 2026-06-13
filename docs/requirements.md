# Requerimientos del Sistema - Control de Venta y Gestión de Personal
Este es un sistema que funcionara como aplicacion de escritorio sin conexion a internet.
Este documento detalla las historias de usuario y requerimientos funcionales del **SISTEMA Lubricantes (Control de Venta y Gestión de Personal)**, alineándolas con el esquema de base de datos SQLite actual.

---

## 1. Módulos y Roles

El sistema cuenta con los siguientes roles definidos:
*   **Administrador de Sistema:** Gestión global de configuración, personal, roles y auditoría.
*   **Gerente / Administrador:** Monitoreo financiero, reportes, turnos y control de inventario.
*   **Administrador de Inventario:** Registro y edición de productos, stock y control de movimientos.
*   **Vendedor:** Registro de ventas, cobros y consulta de tipos de cambio.
*   **Trabajador:** Registro de asistencias y turnos.

---

## 2. Historias de Usuario y Mapeo de Datos

### 2.1. Gestión de Roles y Personal

#### US-01: Gestión de Roles (Prioridad: Alta)
> **Como** Administrador de Sistema,
> **quiero** crear, modificar y eliminar roles de usuario (e.g., Vendedor, Gerente, Administrador),
> **para** poder asignar permisos específicos a cada tipo de usuario.
*   **Tablas involucradas:** `roles`, `permisos`, `rol_permiso`
*   **Criterio de aceptación:**
    *   Los roles deben poder activarse/desactivarse (`estado`).
    *   Cada rol puede asociarse a múltiples permisos funcionales.

#### US-02: Gestión de Trabajadores (Prioridad: Alta)
> **Como** Administrador de Sistema,
> **quiero** gestionar la información de los trabajadores (altas, bajas, datos personales),
> **para** mantener un registro actualizado del personal.
*   **Tablas involucradas:** `trabajadores`, `usuarios`, `usuario_rol`
*   **Criterio de aceptación:**
    *   Un trabajador puede opcionalmente tener un usuario asociado (`id_usuario`) para ingresar al sistema.
    *   Se debe registrar su salario base, cargo, cédula y estado (activo/inactivo).

#### US-03: Control de Asistencia (Prioridad: Alta)
> **Como** Trabajador,
> **quiero** registrar mi entrada y salida de turno,
> **para** que la empresa tenga un control del horario de trabajo.
*   **Tablas involucradas:** `asistencias`, `turnos`
*   **Criterio de aceptación:**
    *   Se debe validar que el trabajador registre entrada y salida en la fecha actual.
    *   Se asocia la asistencia a un turno específico (`id_turno`).

#### US-04: Log de Auditoría (Prioridad: Alta)
> **Como** Gerente/Administrador,
> **quiero** acceder al log o registro de actividades (quién hizo qué y cuándo),
> **para** poder auditar las operaciones del sistema y detectar posibles irregularidades.
*   **Tablas involucradas:** `auditoria_logs`, `usuarios`
*   **Criterio de aceptación:**
    *   Cada operación crítica (modificación de precios, eliminación de registros, ventas, etc.) debe registrar un registro en `auditoria_logs`.
    *   Debe registrar el valor anterior (`valores_anterior`) y el nuevo (`valores_nuevos`).

#### US-05: Historial y Rotación de Turnos (Prioridad: Media)
> **Como** Gerente/Administrador,
> **quiero** ver el historial de turnos y la rotación del personal (mañana, tarde, noche),
> **para** facilitar la gestión de la planilla y pagos.
*   **Tablas involucradas:** `historial_turnos`, `turnos`, `trabajadores`
*   **Criterio de aceptación:**
    *   Debe mostrar la asignación histórica de turnos por trabajador indicando `fecha_inicio` y `fecha_fin`.

---

### 2.2. Gestión de Inventario y Productos (Lubricantes)

#### US-06: Registro de Lubricantes (Prioridad: Alta)
> **Como** Administrador de Inventario,
> **quiero** registrar nuevos productos lubricantes especificando código, nombre, marca y precio de costo,
> **para** mantener el inventario actualizado.
*   **Tablas involucradas:** `productos`, `marcas`, `categorias_producto`
*   **Criterio de aceptación:**
    *   El producto debe tener un código único, código de barras (opcional), marca y categoría.
    *   Se define el precio de costo, precio de venta, stock mínimo y la unidad de medida (e.g., Litro, Galón).

#### US-07: Edición de Inventario (Prioridad: Alta)
> **Como** Administrador de Inventario,
> **quiero** editar la información de inventario (cantidad, precio de costo, descripción),
> **para** corregir errores o actualizar precios según sea necesario.
*   **Tablas involucradas:** `productos`, `inventario_movimientos`
*   **Criterio de aceptación:**
    *   Cualquier alteración en la cantidad/stock físico debe justificarse y quedar guardada como un movimiento (`inventario_movimientos`) de tipo `ENTRADA`, `SALIDA`, `AJUSTE_POS` o `AJUSTE_NEG`.

#### US-08: Stock por Marca (Prioridad: Alta)
> **Como** Administrador de Inventario,
> **quiero** visualizar el stock actual por marca,
> **para** poder planificar pedidos y reabastecimiento.
*   **Tablas involucradas:** `productos`, `marcas`, `inventario_movimientos`
*   **Criterio de aceptación:**
    *   Debe calcular el stock neto por marca consolidando todos los movimientos de inventario de cada producto.

---

### 2.3. Gestión de Ventas y Finanzas

#### US-09: Registro de Ventas (Prioridad: Alta)
> **Como** Vendedor,
> **quiero** registrar una venta de lubricantes utilizando un lector de código de barras o búsqueda por nombre/código,
> **para** agilizar el proceso de cobro.
*   **Tablas involucradas:** `ventas`, `venta_detalles`, `pagos_venta`, `inventario_movimientos`
*   **Criterio de aceptación:**
    *   Se puede buscar el producto por `codigo_barra` o `nombre`/`codigo`.
    *   Al registrar la venta se debe descontar stock generando un movimiento `VENTA`.
    *   Se debe registrar el pago en `pagos_venta` indicando el método utilizado.

#### US-10: Aplicación de Descuentos (Prioridad: Alta)
> **Como** Vendedor,
> **quiero** aplicar descuentos a una venta,
> **para** fidelizar al cliente o gestionar promociones específicas.
*   **Tablas involucradas:** `descuentos`, `venta_detalles`, `ventas`
*   **Criterio de aceptación:**
    *   Se pueden aplicar descuentos por línea (`venta_detalles.descuento_unitario`) o generales (`ventas.descuento_total`).
    *   Debe comprobarse que el descuento esté activo (`activo = 1`) y dentro del rango de fechas válido.

#### US-11: Consulta de Tipo de Cambio (Prioridad: Alta)
> **Como** Vendedor,
> **quiero** consultar el tipo de cambio del día en tiempo real,
> **para** realizar transacciones en diferentes monedas si aplica.
*   **Tablas involucradas:** `tipo_cambio`, `monedas`
*   **Criterio de aceptación:**
    *   Debe permitir ver y aplicar la tasa de cambio vigente (`tipo_cambio.valor`) para la moneda elegida en la venta.

#### US-12: Reporte de Ganancia Diaria (Prioridad: Alta)
> **Como** Gerente/Administrador,
> **quiero** obtener el reporte de ganancia por venta del día (ganancia = precio de venta - precio de costo),
> **para** evaluar el rendimiento financiero diario.
*   **Tablas involucradas:** `ventas`, `venta_detalles`, `productos`
*   **Criterio de aceptación:**
    *   La ganancia se calcula restando el `precio_costo_unitario` al `precio_unitario` en cada línea de detalle, sumando la ganancia neta restando los descuentos.

#### US-13: Gráficos de Ventas (Prioridad: Media)
> **Como** Gerente/Administrador,
> **quiero** visualizar gráficos de ventas (e.g., ventas por marca, ventas por turno, ganancia diaria),
> **para** analizar tendencias y tomar decisiones estratégicas.
*   **Tablas involucradas:** `ventas`, `venta_detalles`, `productos`, `marcas`, `turnos`

#### US-14: Flujo de Caja y Proyección (Prioridad: Alta)
> **Como** Gerente/Administrador,
> **quiero** obtener un reporte de "cuánto se vende y cuánto entra" para el día siguiente,
> **para** estimar el flujo de caja diario.
*   **Tablas involucradas:** `ventas`, `pagos_venta`, `metodos_pago`
*   **Criterio de aceptación:**
    *   Muestra el acumulado de ingresos por método de pago y moneda para evaluar liquidez.
