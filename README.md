# Fidelidad · Estudio de uñas

Aplicación web minimalista para crear tarjetas de fidelidad, registrar visitas con QR y consultar los registros de clientas.

## Ejecutar localmente

```bash
python3 -m http.server 4173
```

Después, abre `http://localhost:4173`.

## Conectar Supabase

1. En Supabase, abre **SQL Editor**, crea una consulta y ejecuta por completo [database.sql](database.sql).
2. En **Authentication > Users**, crea el usuario de correo/contraseña que utilizará el personal del estudio.
3. En **Project Settings > API**, copia el Project URL y la clave **Publishable** (o `anon`). Pégalos en [supabase-config.js](supabase-config.js).
4. Publica esos cambios en GitHub Pages.

La clave Publishable/anon es segura para incluirse en una web estática: las políticas y funciones SQL restringen las escrituras. No uses ni publiques la clave `service_role`.

Las tarjetas públicas consultan Supabase al abrirse. Solo personal con sesión iniciada puede crear tarjetas, leer registros o confirmar visitas. Cada QR incluye un token aleatorio y la visita requiere confirmación antes de guardarse.
