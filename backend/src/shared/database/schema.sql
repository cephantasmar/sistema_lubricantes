-- 1. TABLAS INDEPENDIENTES (Sin llaves foráneas)

CREATE TABLE marcas (
    id_marca INT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255), -- N (Permite NULL)
    estado BOOLEAN NOT NULL
);

CREATE TABLE categorias_producto (
    id_categoria INT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255)
);

CREATE TABLE monedas (
    id_moneda INT PRIMARY KEY,
    codigo VARCHAR(10) NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    simbolo VARCHAR(10)
);

CREATE TABLE metodos_pago (
    id_metodo INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    estado BOOLEAN NOT NULL
);

CREATE TABLE roles (
    id_rol INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(255),
    estado BOOLEAN NOT NULL,
    creado_en TIMESTAMP NOT NULL,
    actualizado_en TIMESTAMP
);

CREATE TABLE permisos (
    id_permiso INT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255),
    modulo VARCHAR(50),
    creado_en TIMESTAMP NOT NULL
);

CREATE TABLE usuarios (
    id_usuario INT PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    email VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    requiere_cambio_password BOOLEAN NOT NULL DEFAULT 1,
    estado VARCHAR(20) NOT NULL,
    ultimo_acceso TIMESTAMP,
    creado_en TIMESTAMP NOT NULL,
    actualizado_en TIMESTAMP
);

CREATE TABLE clientes (
    id_cliente INT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    documento VARCHAR(50),
    telefono VARCHAR(30),
    direccion VARCHAR(255),
    email VARCHAR(120),
    creado_en TIMESTAMP NOT NULL
);

CREATE TABLE turnos (
    id_turno INT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    descripcion VARCHAR(255),
    estado BOOLEAN NOT NULL
);

CREATE TABLE descuentos (
    id_descuento INT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo VARCHAR(20) NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    fecha_inicio DATE,
    fecha_fin DATE,
    activo BOOLEAN NOT NULL
);

CREATE TABLE respaldos (
    id_respaldo INT PRIMARY KEY,
    fecha_respaldo TIMESTAMP NOT NULL,
    tipo VARCHAR(30) NOT NULL,
    ubicacion_archivo VARCHAR(255) NOT NULL,
    estado VARCHAR(20) NOT NULL,
    observacion VARCHAR(255)
);


-- 2. TABLAS DEPENDIENTES (Con llaves foráneas)

CREATE TABLE rol_permiso (
    id_rol INT NOT NULL,
    id_permiso INT NOT NULL,
    PRIMARY KEY (id_rol, id_permiso),
    FOREIGN KEY (id_rol) REFERENCES roles(id_rol),
    FOREIGN KEY (id_permiso) REFERENCES permisos(id_permiso)
);

CREATE TABLE usuario_rol (
    id_usuario INT NOT NULL,
    id_rol INT NOT NULL,
    PRIMARY KEY (id_usuario, id_rol),
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario),
    FOREIGN KEY (id_rol) REFERENCES roles(id_rol)
);

CREATE TABLE trabajadores (
    id_trabajador INT PRIMARY KEY,
    id_usuario INT, -- FK
    cedula VARCHAR(30),
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    telefono VARCHAR(30),
    direccion VARCHAR(255),
    fecha_ingreso DATE NOT NULL,
    fecha_salida DATE,
    cargo VARCHAR(80),
    salario_base DECIMAL(12,2),
    estado VARCHAR(20) NOT NULL,
    creado_en TIMESTAMP NOT NULL,
    actualizado_en TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE tipo_cambio (
    id_tipo_cambio INT PRIMARY KEY,
    id_moneda INT NOT NULL,
    fecha DATE NOT NULL,
    valor DECIMAL(18,6) NOT NULL,
    fuente VARCHAR(100),
    registrado_en TIMESTAMP NOT NULL,
    FOREIGN KEY (id_moneda) REFERENCES monedas(id_moneda)
);

CREATE TABLE productos (
    id_producto INT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL,
    codigo_barra VARCHAR(100),
    nombre VARCHAR(150) NOT NULL,
    id_marca INT NOT NULL,
    id_categoria INT,
    descripcion VARCHAR(255),
    precio_costo DECIMAL(12,2) NOT NULL,
    precio_venta DECIMAL(12,2) NOT NULL,
    stock_minimo DECIMAL(12,2) NOT NULL,
    unidad_medida VARCHAR(20) NOT NULL,
    estado BOOLEAN NOT NULL,
    creado_en TIMESTAMP NOT NULL,
    actualizado_en TIMESTAMP,
    FOREIGN KEY (id_marca) REFERENCES marcas(id_marca),
    FOREIGN KEY (id_categoria) REFERENCES categorias_producto(id_categoria)
);

CREATE TABLE auditoria_logs (
    id_log INT PRIMARY KEY,
    id_usuario INT NOT NULL,
    accion VARCHAR(50) NOT NULL,
    modulo VARCHAR(50) NOT NULL,
    tabla_afectada VARCHAR(50),
    id_registro VARCHAR(50),
    descripcion VARCHAR(255),
    valores_anterior TEXT,
    valores_nuevos TEXT,
    ip_origen VARCHAR(45),
    fecha_evento TIMESTAMP NOT NULL,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario)
);

CREATE TABLE asistencias (
    id_asistencia INT PRIMARY KEY,
    id_trabajador INT NOT NULL,
    id_turno INT NOT NULL,
    fecha DATE NOT NULL,
    hora_entrada TIMESTAMP,
    hora_salida TIMESTAMP,
    observacion VARCHAR(255),
    registrado_por INT,
    FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
    FOREIGN KEY (id_turno) REFERENCES turnos(id_turno),
    FOREIGN KEY (registrado_por) REFERENCES trabajadores(id_trabajador)
);

CREATE TABLE historial_turnos (
    id_historial_turno INT PRIMARY KEY,
    id_trabajador INT NOT NULL,
    id_turno INT NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE,
    observacion VARCHAR(255),
    asignado_por INT,
    FOREIGN KEY (id_trabajador) REFERENCES trabajadores(id_trabajador),
    FOREIGN KEY (id_turno) REFERENCES turnos(id_turno),
    FOREIGN KEY (asignado_por) REFERENCES trabajadores(id_trabajador)
);

CREATE TABLE inventario_movimientos (
    id_movimiento INT PRIMARY KEY,
    id_producto INT NOT NULL,
    tipo_movimiento VARCHAR(20) NOT NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    costo_unitario DECIMAL(12,2),
    motivo VARCHAR(100),
    referencia VARCHAR(100),
    observacion VARCHAR(255),
    realizado_por INT NOT NULL,
    fecha_movimiento TIMESTAMP NOT NULL,
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    FOREIGN KEY (realizado_por) REFERENCES trabajadores(id_trabajador)
);

CREATE TABLE ventas (
    id_venta INT PRIMARY KEY,
    numero_factura VARCHAR(50) NOT NULL,
    fecha_venta TIMESTAMP NOT NULL,
    id_cliente INT,
    id_vendedor INT NOT NULL,
    id_turno INT,
    subtotal DECIMAL(12,2) NOT NULL,
    descuento_total DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    id_moneda INT NOT NULL,
    tasa_cambio_aplicada DECIMAL(18,6),
    observacion VARCHAR(255),
    estado VARCHAR(20) NOT NULL,
    FOREIGN KEY (id_cliente) REFERENCES clientes(id_cliente),
    FOREIGN KEY (id_vendedor) REFERENCES trabajadores(id_trabajador),
    FOREIGN KEY (id_turno) REFERENCES turnos(id_turno),
    FOREIGN KEY (id_moneda) REFERENCES monedas(id_moneda)
);

CREATE TABLE venta_detalles (
    id_venta_detalle INT PRIMARY KEY,
    id_venta INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad DECIMAL(12,2) NOT NULL,
    precio_unitario DECIMAL(12,2) NOT NULL,
    precio_costo_unitario DECIMAL(12,2) NOT NULL,
    descuento_unitario DECIMAL(12,2) NOT NULL,
    subtotal_linea DECIMAL(12,2) NOT NULL,
    total_linea DECIMAL(12,2) NOT NULL,
    id_descuento INT,
    FOREIGN KEY (id_venta) REFERENCES ventas(id_venta),
    FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    FOREIGN KEY (id_descuento) REFERENCES descuentos(id_descuento)
);

CREATE TABLE pagos_venta (
    id_pago_venta INT PRIMARY KEY,
    id_venta INT NOT NULL,
    id_metodo_pago INT NOT NULL,
    id_moneda INT NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    referencia_pago VARCHAR(100),
    fecha_pago TIMESTAMP NOT NULL,
    FOREIGN KEY (id_venta) REFERENCES ventas(id_venta),
    FOREIGN KEY (id_metodo_pago) REFERENCES metodos_pago(id_metodo),
    FOREIGN KEY (id_moneda) REFERENCES monedas(id_moneda)
);
