# Manual de Usuario: Superproducción

## 1. Introducción

Bienvenido a Superproducción, su sistema de gestión de producción industrial. Esta aplicación le permite planificar, ejecutar y supervisar todo su proceso productivo, desde la gestión de materias primas y recetas hasta la creación de órdenes de producción y la generación de reportes.

Este manual le guiará a través de las funciones clave de la aplicación y le ayudará a sacar el máximo provecho de la herramienta.

## 2. Primeros Pasos

### 2.1. Inicio de Sesión

Para acceder a la aplicación, necesitará un correo electrónico y una contraseña proporcionados por un administrador. Simplemente ingrese sus credenciales en la pantalla de inicio de sesión para comenzar.

### 2.2. Roles de Usuario

La aplicación cuenta con dos roles de usuario, cada uno con diferentes niveles de acceso:

*   **`Administrator`**: Tiene acceso completo a todas las funciones de la aplicación. Los administradores pueden gestionar datos maestros (productos, materiales, recetas), configurar el sistema, gestionar usuarios y ver todos los reportes. Este rol está diseñado para la gerencia y el personal de TI.
*   **`Supervisor`**: Tiene acceso limitado, enfocado en las operaciones diarias. Los supervisores pueden crear y gestionar órdenes de producción, crear vales de materiales y consultar datos como recetas, materiales y reportes. No pueden modificar datos maestros ni acceder a la configuración del sistema.

## 3. Interfaz Principal

Una vez que inicie sesión, verá la interfaz principal, que se divide en dos áreas:

*   **Barra Lateral (Izquierda)**: Es su menú de navegación principal. Desde aquí puede acceder a las diferentes secciones de la aplicación, como el Dashboard, Órdenes, Productos, etc. Las secciones visibles dependerán de su rol de usuario.
*   **Área de Contenido (Derecha)**: Aquí es donde se muestra la información de la sección que haya seleccionado. Por defecto, al iniciar sesión, verá el Dashboard.

## 4. Tareas Principales

### 4.1. Órdenes de Producción

Esta es una de las secciones más importantes. Aquí puede ver todas las órdenes de producción.

*   **Crear una Orden:**
    1.  Haga clic en el botón "Crear Orden".
    2.  Complete el formulario en la ventana modal: seleccione el producto, la cantidad a producir, el equipo y el operador.
    3.  Haga clic en "Crear Orden". La nueva orden aparecerá en la lista con el estado "Pendiente".

*   **Crear un Vale de Materiales:**
    Desde la lista de órdenes, puede crear un vale para una orden específica que esté "Pendiente".
    1.  Haga clic en el icono de "Crear Vale" (`+`) en la fila de la orden deseada.
    2.  En la ventana modal, seleccione si es una "Salida" o "Devolución" de almacén.
    3.  Ingrese las cantidades de los materiales que necesita. Puede usar los materiales de la receta o agregar otros.
    4.  Haga clic en "Guardar y Descargar PDF". El costo de estos materiales se registrará como un costo extra en la orden de producción.

*   **Completar una Orden:**
    Una vez que una orden ha finalizado, debe completarla.
    1.  Haga clic en el icono de "Completar" (marca de verificación).
    2.  Ingrese la **cantidad real** de unidades que se produjeron.
    3.  Haga clic en "Confirmar y Cerrar Orden". El estado de la orden cambiará a "Completada" y el sistema calculará los costos finales y el sobrecosto.

### 4.2. Consultar Información (Supervisores y Admins)

Los Supervisores tienen acceso de solo lectura a las siguientes secciones:

*   **Materiales:** Pueden ver la lista de todos los materiales, sus existencias y costos. También pueden importar desde un archivo de Excel.
*   **Recetas:** Pueden ver las recetas de cada producto para saber qué materiales se necesitan.
*   **Reportes:** Pueden ver y filtrar todos los reportes de producción, costos y consumo.

## 5. Funciones Exclusivas de Administrador

### 5.1. Gestión de Datos Maestros (Productos, Materiales, Recetas)

Los administradores tienen control total sobre los datos maestros. En cada una de estas secciones (`Productos`, `Materiales`, `Recetas`), encontrará botones para:
*   **Añadir:** Crear un nuevo ítem.
*   **Editar** (icono de lápiz): Modificar un ítem existente.
*   **Eliminar** (icono de papelera): Borrar un ítem.
*   **Importar / Exportar:** Cargar o descargar datos de forma masiva usando archivos de Excel (.xlsx).

### 5.2. Configuración

La página de `Configuración` es exclusiva para Administradores y contiene herramientas críticas.

#### **5.2.1. Gestión de Usuarios (¡MUY IMPORTANTE!)**

Para que un nuevo usuario pueda acceder a la aplicación, un Administrador debe seguir **dos pasos**:

**Paso 1: Crear el usuario en Firebase Authentication**
1.  Abra la Consola de Firebase de su proyecto.
2.  Vaya a la sección de "Authentication".
3.  Haga clic en "Add user" (Añadir usuario).
4.  Ingrese el correo electrónico y una contraseña para el nuevo usuario.

**Paso 2: Asignar el Rol en la Aplicación Superproducción**
1.  Una vez creado el usuario en Firebase, vaya a la lista de usuarios en la misma consola de Authentication y **copie el UID** del nuevo usuario (es una cadena de letras y números).
2.  Regrese a la aplicación Superproducción y vaya a `Configuración` -> `Gestión de Usuarios`.
3.  Haga clic en el botón "+".
4.  En la ventana modal:
    *   **Pegue el UID** que copió de la consola de Firebase en el campo "User UID".
    *   Ingrese el mismo **correo electrónico**.
    *   Seleccione el **rol** (`Administrator` o `Supervisor`).
5.  Haga clic en "Guardar".

¡Listo! El nuevo usuario ya puede iniciar sesión con el rol que le ha asignado.

#### **5.2.2. Gestión de Operadores y Equipos**

En esta sección puede añadir, editar o eliminar los operadores y equipos que estarán disponibles para ser asignados a las órdenes de producción.

#### **5.2.3. Copia de Seguridad (Backup)**

Puede crear una copia de seguridad de todos los datos de la aplicación (productos, materiales, órdenes, etc.) en un solo archivo JSON.
*   **Crear Copia de Seguridad:** Haga clic en este botón para descargar el archivo a su computadora. Guárdelo en un lugar seguro.
*   **Restaurar Copia:** ¡Use esta función con mucho cuidado! Le permite sobreescribir todos los datos actuales de la aplicación con los datos de un archivo de backup que usted seleccione. **Esta acción no se puede deshacer.**

## 6. Guía Rápida para Supervisores

Como Supervisor, su rol se centra en la operación diaria. Aquí está un resumen de lo que puede hacer:

*   **Verá un menú simplificado:** Tendrá acceso a `Dashboard`, `Órdenes de Producción`, `Materiales`, `Recetas` y `Reportes`.
*   **Puede crear y gestionar Órdenes de Producción** y crear **Vales** de materiales para ellas.
*   **Puede importar** nuevos materiales desde un archivo de Excel.
*   **No puede** añadir manualmente, editar o eliminar productos, materiales o recetas. Su acceso a estas secciones es de **solo lectura** (a excepción de la importación de materiales).
*   **No puede** acceder a la página de `Configuración`, por lo que no puede gestionar usuarios, operadores, equipos ni hacer copias de seguridad.
